// ============================================================
// engine.ts — игровой цикл, ввод, взаимодействия, бой, сохранение
// ============================================================
import { GameState, BuiltObject, Firepit } from './state';
import { Renderer, Camera } from './render';
import { Animal, updateAnimal, animalDrops, makeAnimal } from './entities';
import { World, Prop, T_ICE, canPlaceBuild } from './world';
import { ITEMS, RECIPES, NOTES, BUILDS, itemName } from './items';
import { clamp, lerp, dist, isoToWorld } from './core';
import { audio } from './audio';

export type Tool = 'none' | 'axe' | 'pick';

export interface HudSnapshot {
  hp: number; hunger: number; thirst: number; energy: number; warmth: number;
  sick: number; bleeding: boolean;
  day: number; timeStr: string; temp: number; weather: string;
  weight: number; maxWeight: number;
  sleep: boolean; dead: boolean; deathReason: string;
  rescued: boolean; rescueT: number; gameOver: boolean;
  nearHint: string;
  craftName: string | null; craftPct: number;
}

const KEYMAP_MOVE: Record<string, [number, number]> = {
  // экранные направления -> мировые вектора (изометрия)
  w: [-1, -1], ц: [-1, -1],
  s: [1, 1], ы: [1, 1],
  a: [-1, 1], ф: [-1, 1],
  d: [1, -1], в: [1, -1],
};

export class Engine {
  state: GameState;
  renderer: Renderer;
  cam: Camera = { x: 48, y: 62, zoom: 1, shake: 0 };
  keys = new Set<string>();
  mouseX = 0; mouseY = 0;
  hoverProp: Prop | null = null;
  running = false;
  lastT = 0;
  fps = 60; fpsAcc = 0; fpsN = 0; showFps = true;
  uiFocus = false; // открыт ли интерфейс (инвентарь и т.п.)
  footT = 0;
  saveTimer = 0;
  onUi: (() => void) | null = null;
  onNote: ((noteId: string) => void) | null = null;
  onDeath: (() => void) | null = null;
  onRescue: (() => void) | null = null;
  virtualMove: [number, number] = [0, 0];
  private rafId = 0;
  private hudT = 0;
  private minuteAcc = 0;
  nearHint = '';
  lightningT = 0;

  constructor(canvas: HTMLCanvasElement, seed: number, state?: GameState) {
    this.state = state ?? new GameState(seed);
    this.renderer = new Renderer(canvas);
    this.cam.x = this.state.player.x;
    this.cam.y = this.state.player.y;
    // синхронизируем firepit с постройками campfire (после загрузки)
    this.resyncFires();
    this.resize();
  }

  resyncFires() {
    // при загрузке сейва восстановления списков
    const g = this.state;
    for (const b of g.builds) {
      if (b.kind === 'campfire' && !g.fires.some(f => f.x === b.x && f.y === b.y)) {
        g.fires.push({ id: Date.now() % 100000 + b.id, x: b.x, y: b.y, fuel: b.fuel ?? 0, lit: !!b.lit });
      }
    }
  }

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.running = true;
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  detach() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
  }

  onResize = () => this.resize();

  resize() {
    const c = this.renderer.canvas.parentElement;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight;
    this.renderer.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
  }

  onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.key === 'Tab') e.preventDefault();
    this.keys.add(k);
    audio.resume();
    const g = this.state;

    if (g.player.dead) return;

    switch (k) {
      case 'escape':
        if (this.uiFocus) { this.uiFocus = false; this.onUi?.(); }
        break;
      case ' ':
        if (!this.uiFocus) { e.preventDefault(); this.playerAttack(); }
        break;
      case 'f': case 'а':
        if (!this.uiFocus) this.toggleFire();
        break;
      case '1': this.cam.zoom = 0.7; break;
      case '2': this.cam.zoom = 1; break;
      case '3': this.cam.zoom = 1.45; break;
      case '+': case '=': this.cam.zoom = clamp(this.cam.zoom * 1.15, 0.55, 2); break;
      case '-': case '_': this.cam.zoom = clamp(this.cam.zoom / 1.15, 0.55, 2); break;
      case 'e': case 'у':
        if (!this.uiFocus) this.interact();
        break;
    }
  };

  onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  // ============================================================
  // ЦИКЛ
  // ============================================================
  loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    // Правило skill'а: одна ошибка в редко достигаемом состоянии
    // НЕ должна убивать игровой цикл навсегда. Логируем и живём дальше.
    try {
      this.update(dt);
      this.render(dt, now / 1000);
    } catch (err) {
      if (!this._loopErrLogged) {
        this._loopErrLogged = true;
        console.error('[Engine] loop error (suppressed, loop continues):', err);
      }
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private _loopErrLogged = false;

  update(dt: number) {
    const g = this.state;
    const p = g.player;

    // FPS
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0; this.fpsN = 0;
    }

    if (g.gameOver && g.rescued) {
      // вертолёт прилетел — финальный экран рисует React
    }

    if (p.dead) {
      this.renderer.updateEffects(dt, g.weather);
      return;
    }

    // ---- время: 1 реальная секунда = 1 игровая минута ----
    const dtMin = dt;
    const prevMin = g.stats.min;
    g.stats.min += dtMin;
    if (Math.floor(g.stats.min / 1440) + 1 > g.stats.day) {
      g.stats.day = Math.floor(g.stats.min / 1440) + 1;
      g.toast(`День ${g.stats.day}. Ты всё ещё жив`, 'info');
    }
    if (Math.floor(prevMin / 60) < Math.floor(g.stats.min / 60)) {
      audio.setWeather(g.weather.kind, g.weather.intensity);
    }

    // ---- сон ----
    if (p.sleepT > 0) {
      // спим: время ускорено, статы восстанавливаются
      const sleepMin = dtMin * 60;
      p.sleepT -= dtMin * 4;
      g.stats.min += sleepMin;
      p.energy = clamp(p.energy + sleepMin * 0.15, 0, 100);
      g.survivalTick(sleepMin);
      // спим до 7 утра если проспали
      const hour = (g.stats.min / 60) % 24;
      if (p.energy >= 100 || (hour >= 7 && hour < 7.1)) {
        this.wakeUp();
      }
      this.updateCamera(dt);
      this.renderer.updateEffects(dt, g.weather);
      return;
    }

    // ---- работа/рыбалка ----
    if (p.craftRecipe) {
      if (p.craftRecipe === '__fish') {
        this.tickFish(dtMin);
      } else {
        const r = RECIPES.find(q => q.id === p.craftRecipe);
        if (r) {
          p.craftT += dtMin;
          if (p.craftT >= r.minutes) {
            g.finishCraft();
            audio.craft();
          }
        } else {
          p.craftRecipe = null;
        }
      }
    }

    // ---- движение игрока ----
    if (!this.uiFocus) {
      let dx = 0, dy = 0;
      for (const k of this.keys) {
        const m = KEYMAP_MOVE[k];
        if (m) { dx += m[0]; dy += m[1]; }
      }
      dx += this.virtualMove[0];
      dy += this.virtualMove[1];
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        dx /= len; dy /= len;
        p.moving = true;
        p.sprint = (this.keys.has('shift') || this.keys.has('⇧')) && p.energy > 5;
        const encumbrance = clamp(1.15 - p.weight / g.maxWeight() * 0.4, 0.55, 1.15);
        const speed = (p.sprint ? 4.6 : 3.1) * encumbrance * (p.hunger < 15 || p.thirst < 15 ? 0.75 : 1);
        const step = speed * dt;
        const nx = p.x + dx * step;
        const ny = p.y + dy * step;
        this.movePlayer(nx, p.y);
        this.movePlayer(p.x, ny);
        p.ang = Math.atan2(dy, dx);
        p.walkPhase += dt * (p.sprint ? 13 : 9.5);
        g.stats.distance += step;
        // следы и шаги
        this.footT -= dt;
        if (this.footT <= 0) {
          this.footT = p.sprint ? 0.28 : 0.42;
          if (g.world.tileAt(p.x, p.y) !== T_ICE) {
            g.world.addFootprint(p.x, p.y, p.ang);
          }
          if (Math.random() < 0.6) audio.step();
        }
      } else {
        p.moving = false;
        p.sprint = false;
      }
    } else {
      p.moving = false;
    }

    // ---- атаки/анимации ----
    if (p.attackT > 0) p.attackT -= dt;
    if (p.attackAnim > 0) p.attackAnim -= dt * 3.2;
    if (p.hitFlash > 0) p.hitFlash -= dt * 2;

    // ---- животные ----
    const hour = (g.stats.min / 60) % 24;
    const ctxAi = {
      world: g.world,
      px: p.x, py: p.y,
      playerAlive: !p.dead && !this.uiFocus,
      playerWarmth: p.warmth,
      playerHasTorch: g.inv.some(s => s.id === 'torch'),
      hasFireNear: (x: number, y: number) => {
        return g.fires.some(f => f.lit && dist(f.x, f.y, x, y) < 4.5);
      },
      onPlayerBitten: (dmg: number, kind: string) => this.playerBitten(dmg, kind),
      onHowl: (x: number, y: number) => {
        const d = dist(x, y, p.x, p.y);
        if (d < 40) audio.howl(d);
      },
      hour,
    };
    for (const a of g.animals) {
      if (a.state === 'dead') continue;
      updateAnimal(a, ctxAi, dt);
    }

    // ---- выживание и погода ----
    g.survivalTick(dtMin);
    g.weatherTick(dtMin);

    // ---- случайные события ----
    if (Math.random() < dtMin * 0.004) {
      const evts = [
        'На горизонте мелькнули огни… нет, показалось',
        'Ветер принёс запах дыма со стороны станции',
        'Где-то вдали треснул лёд',
      ];
      g.toast(evts[Math.floor(Math.random() * evts.length)], 'info');
    }

    // автосейв каждые 30 игровых минут
    this.saveTimer += dtMin;
    if (this.saveTimer > 30) {
      this.saveTimer = 0;
      this.save();
    }

    this.updateCamera(dt);
    this.renderer.updateEffects(dt, g.weather);
  }

  movePlayer(nx: number, ny: number) {
    const p = this.state.player;
    const world = this.state.world;
    const r = 0.32;
    if (nx !== p.x) {
      const cx = Math.floor(nx + Math.sign(nx - p.x) * r);
      if (!world.isBlocked(cx, Math.floor(p.y)) && !world.isBlocked(cx, Math.floor(p.y - r + 0.05)) && !world.isBlocked(cx, Math.floor(p.y + r - 0.05))) {
        p.x = nx;
      }
    }
    if (ny !== p.y) {
      const cy = Math.floor(ny + Math.sign(ny - p.y) * r);
      if (!world.isBlocked(Math.floor(p.x), cy) && !world.isBlocked(Math.floor(p.x - r + 0.05), cy) && !world.isBlocked(Math.floor(p.x + r - 0.05), cy)) {
        p.y = ny;
      }
    }
  }

  updateCamera(dt: number) {
    const p = this.state.player;
    const k = 1 - Math.exp(-6 * dt);
    this.cam.x = lerp(this.cam.x, p.x, k);
    this.cam.y = lerp(this.cam.y, p.y, k);
  }

  // ============================================================
  // БОЙ
  // ============================================================
  playerAttack() {
    const g = this.state;
    const p = g.player;
    if (p.dead || p.attackT > 0 || p.craftRecipe) return;
    const wpn = g.bestWeapon();
    p.attackT = wpn.speed;
    p.attackAnim = 1;
    audio.swing();

    // урон животному
    let target: Animal | null = null;
    let bestD = wpn.reach + 0.3;
    for (const a of g.animals) {
      if (a.state === 'dead') continue;
      const d = dist(a.x, a.y, p.x, p.y);
      if (d < bestD) { bestD = d; target = a; }
    }
    if (target) {
      const crit = Math.random() < 0.12 + g.skills.hunt.lvl * 0.02;
      let dmg = wpn.dmg * (0.85 + Math.random() * 0.3);
      if (crit) dmg *= 1.8;
      if (wpn.id === 'fists') dmg *= 0.6;
      target.hp -= dmg;
      target.hitFlash = 1;
      target.fleeFrom = target.kind === 'wolf' ? 2.5 + Math.random() * 2 : target.kind === 'bear' ? (Math.random() < 0.35 ? 3 : 0) : 5;
      target.scared = 1;
      target.state = 'flee';
      this.renderer.addFloat(target.x, target.y, `-${Math.round(dmg)}${crit ? '!' : ''}`, crit ? 'crit' : 'dmg');
      this.renderer.addBlood(target.x, target.y);
      audio.hitFlesh();
      this.cam.shake = Math.min(0.6, this.cam.shake + (crit ? 0.35 : 0.18));
      if (target.hp <= 0) {
        target.state = 'dead';
        // дроп
        const drops = animalDrops(target.kind, g.skills.hunt.lvl);
        for (const d of drops) g.world.addGroundItem(target.x, target.y, d.id, d.n);
        this.renderer.addFloat(target.x, target.y, target.kind === 'wolf' ? 'Волк повержен' : target.kind === 'bear' ? 'Медведь повержен!' : 'Добыча!', 'xp');
        g.stats.killed++;
        g.addXp('hunt', target.kind === 'bear' ? 40 : target.kind === 'wolf' ? 18 : 8);
        g.toast(`${itemName(drops[0]?.id || 'rawMeat')} и ещё кое-что на снегу`, 'good');
      }
    } else {
      // нет зверя рядом — может, рубим/добываем ближайший объект
      let prop = this.hoverProp;
      const canHarvest = (pr: Prop | null): pr is Prop => {
        if (!pr) return false;
        if (pr.kind === 'tree' && !pr.felled && g.hasTool('chop')) return true;
        if (pr.kind === 'rock' && g.hasTool('mine')) return true;
        return false;
      };
      if (!canHarvest(prop)) {
        let bd = 1.9;
        prop = null as unknown as Prop;
        for (const pr of g.world.props) {
          if (!canHarvest(pr)) continue;
          const d = dist(pr.x, pr.y, p.x, p.y);
          if (d < bd) { bd = d; prop = pr; }
        }
      }
      if (prop && this.tryHarvestProp(prop)) return;
    }
  }

  playerBitten(dmg: number, kind: string) {
    const g = this.state;
    const p = g.player;
    if (p.dead) return;
    // одежда защищает
    const armor = g.equip.torso === 'wolfCloak' ? 0.55 : g.equip.torso === 'furParka' ? 0.7 : 1;
    const final = dmg * armor * (0.85 + Math.random() * 0.3);
    p.hp = clamp(p.hp - final, 0, 100);
    p.hitFlash = 1;
    this.cam.shake = Math.min(1, this.cam.shake + 0.5);
    this.renderer.addFloat(p.x, p.y, `-${Math.round(final)}`, 'dmg');
    this.renderer.addBlood(p.x, p.y);
    audio.playerHurt();
    if (kind === 'wolf' && Math.random() < 0.35) {
      p.bleeding = true;
      p.bleedingT = 8;
      g.toast('Ты ранен! Кровотечение — нужен бинт (E → инвентарь)', 'bad');
    }
    if (kind === 'bear') {
      p.bleeding = true;
      p.bleedingT = 20;
      g.toast('Медведь располосовал тебя! Срочно бинтуй!', 'bad');
    }
    if (p.hp <= 0) {
      g.kill(kind === 'bear' ? 'Медведь оказался быстрее.' : 'Волчья стая взяла своё.');
      audio.death();
      this.onDeath?.();
    }
  }

  // ============================================================
  // ВЗАИМОДЕЙСТВИЕ (E / ЛКМ)
  // ============================================================
  interact() {
    const g = this.state;
    const p = g.player;
    if (p.dead) return;
    // прервать работу/рыбалку
    if (p.craftRecipe) {
      const nm = p.craftRecipe === '__fish' ? 'рыбалку' : 'работу';
      p.craftRecipe = null; p.craftT = 0;
      g.toast(`Прервал ${nm}`, 'info');
      return;
    }

    // 1) предметы на земле
    let gi = null as any;
    let gd = 1.6;
    for (const item of g.world.groundItems) {
      const d = dist(item.x, item.y, p.x, p.y);
      if (d < gd) { gd = d; gi = item; }
    }
    if (gi) {
      const def = ITEMS[gi.item];
      if (g.addItem(gi.item, gi.n)) {
        g.world.removeGroundItem(gi.id);
        audio.pickup();
        this.renderer.addFloat(p.x, p.y, `+${gi.n} ${itemName(gi.item)}`, 'xp');
      }
      return;
    }

    // 2) мебель: ящики, кровати, печки, радио
    const near = g.world.furnitureNear(p.x, p.y, 1.7);
    if (near) {
      this.useFurniture(near.f, near.b);
      return;
    }

    // 3) пропы: деревья, камни, кусты, полыньи
    const prop = g.world.propAt(p.x, p.y, 1.6);
    if (prop) {
      if (this.tryHarvestProp(prop)) return;
    }

    // 4) постройки игрока
    const b = g.buildNear(p.x, p.y, 1.6);
    if (b) {
      this.useBuild(b);
      return;
    }

    g.toast('Рядом ничего нет', 'info');
  }

  tryHarvestProp(prop: Prop): boolean {
    const g = this.state;
    const p = g.player;
    if (prop.kind === 'tree' && !prop.felled) {
      const tool = g.hasTool('chop');
      if (!tool) {
        g.toast('Нужен топор, чтобы рубить дерево', 'bad');
        audio.ui();
        return true;
      }
      // удар по дереву
      p.attackAnim = 1;
      p.attackT = 0.5;
      audio.chop();
      prop.hp -= (tool.power || 1) * (26 + g.skills.woodcut.lvl * 4);
      this.cam.shake = Math.min(0.3, this.cam.shake + 0.1);
      if (prop.hp <= 0) {
        prop.felled = true;
        prop.felledAngle = Math.atan2(p.y - prop.y, p.x - prop.x) + Math.PI / 2;
        g.world.setBlocked(prop.x, prop.y, false);
        g.toast('Дерево повалено! Разделай его (E)', 'good');
        g.addXp('woodcut', 12);
        g.stats.chopped++;
        this.renderer.addFloat(prop.x, prop.y, 'Дерево повалено', 'xp');
      } else {
        this.renderer.addFloat(prop.x, prop.y, 'Тук!', 'dmg');
      }
      return true;
    }
    if (prop.kind === 'tree' && prop.felled) {
      // разделка бревна
      g.world.addGroundItem(prop.x + 0.3, prop.y + 0.3, 'log', 1);
      if (Math.random() < 0.7) g.world.addGroundItem(prop.x - 0.2, prop.y - 0.2, 'wood', 2);
      g.world.removeProp(prop.id);
      // пенёк
      g.world.props.push({ id: Math.floor(Math.random() * 1000000) + 900, kind: 'stump', x: prop.x, y: prop.y, hp: 1, maxHp: 1, seed: prop.seed });
      audio.chop();
      g.addXp('woodcut', 5);
      g.toast('Бревно и ветки на снегу', 'good');
      return true;
    }
    if (prop.kind === 'rock') {
      const tool = g.hasTool('mine');
      if (!tool) {
        g.toast('Нужна кирка, чтобы добыть камень', 'bad');
        return true;
      }
      p.attackAnim = 1;
      p.attackT = 0.5;
      audio.mine();
      prop.hp -= (tool.power || 1) * (30 + g.skills.mining.lvl * 5);
      this.renderer.addFloat(prop.x, prop.y, 'Дзынь!', 'dmg');
      if (prop.hp <= 0) {
        const n = 3 + Math.floor(Math.random() * 3) + g.skills.mining.lvl;
        g.world.addGroundItem(prop.x, prop.y, 'stone', n);
        if (Math.random() < 0.3) g.world.addGroundItem(prop.x, prop.y, 'scrap', 1);
        g.world.removeProp(prop.id);
        g.addXp('mining', 10);
        g.toast(`Добыто ${n} камней`, 'good');
      }
      return true;
    }
    if (prop.kind === 'berryBush') {
      const grown = (prop.regrowAt ?? 0) <= 0;
      if (!grown) {
        g.toast('Ягоды ещё не созрели', 'info');
        return true;
      }
      const n = 2 + Math.floor(Math.random() * 3);
      g.addItem('berries', n);
      prop.regrowAt = g.stats.min + 1440; // сутки
      audio.pickup();
      this.renderer.addFloat(prop.x, prop.y, `+${n} морошки`, 'xp');
      g.addXp('survival', 3);
      return true;
    }
    if (prop.kind === 'polynya') {
      // рыбалка
      if (!g.invCount('fishingRod')) {
        g.toast('Нужна удочка. Смастери её (крафт)', 'bad');
        return true;
      }
      if (p.craftRecipe) return true;
      p.craftRecipe = '__fish';
      p.craftT = 0;
      g.toast('Забросил удочку… жди поклёвки', 'info');
      return true;
    }
    if (prop.kind === 'sled') {
      g.toast('Старые сани экспедиции. Мороз их уже не тронет', 'info');
      return true;
    }
    if (prop.kind === 'antennaWreck') {
      g.toast('Сломанная антенна станции. Радио молчит… но это можно исправить (крафт → сигнал)', 'info');
      return true;
    }
    return false;
  }

  useFurniture(f: any, b: any) {
    const g = this.state;
    const p = g.player;
    switch (f.kind) {
      case 'crate': case 'locker': case 'shelf': {
        if (f.opened) {
          g.toast('Уже пусто', 'info');
          return;
        }
        f.opened = true;
        audio.pickup();
        let got = 0;
        if (f.loot) {
          for (const e of f.loot) {
            if (Math.random() < e.ch) {
              g.addItem(e.id, e.n);
              this.renderer.addFloat(p.x, p.y, `+${e.n} ${itemName(e.id)}`, 'xp');
              got++;
            }
          }
        }
        if (got === 0) g.toast('Пусто… кто-то уже был здесь', 'info');
        else g.toast(`Найдено предметов: ${got}`, 'good');
        g.addXp('survival', 4);
        // записка
        if (f.noteId && !g.notesFound.includes(f.noteId)) {
          g.notesFound.push(f.noteId);
          audio.notePickup();
          this.onNote?.(f.noteId);
        }
        return;
      }
      case 'bed': {
        // сон
        const hour = (g.stats.min / 60) % 24;
        if (p.energy > 92) {
          g.toast('Спать не хочется', 'info');
          return;
        }
        p.sleepT = 20; // ~до утра
        g.toast('Ты ложишься спать…', 'info');
        if (f.noteId && !g.notesFound.includes(f.noteId)) {
          g.notesFound.push(f.noteId);
          this.onNote?.(f.noteId);
        }
        return;
      }
      case 'stove': {
        // печка: затопить
        if (f.used) {
          g.toast('Печка топится. Тепло!', 'info');
          return;
        }
        if (g.invCount('wood') >= 2) {
          g.removeItem('wood', 2);
          f.used = true;
          b.lightsOn = true;
          audio.fireUp();
          g.toast('Печка затоплена. В модуле теплеет', 'good');
        } else {
          g.toast('Нужно 2 древесины, чтобы затопить печь', 'bad');
        }
        return;
      }
      case 'radio': {
        // финальный квест: сигнал
        if (g.rescued) {
          g.toast(`Вертолёт в пути. Оставайся у мачты! (${Math.ceil(g.rescueT)} мин)`, 'info');
          return;
        }
        if (g.radioBuilt) {
          // проверка деталей
          if (g.invCount('battery') >= 1) {
            g.removeItem('battery', 1);
            g.rescued = true;
            g.rescueT = 90;
            audio.rescue();
            g.toast('СИГНАЛ ПОДАН! Вертолёт вылетел. Держись у мачты ~90 минут!', 'good');
            this.onRescue?.();
          } else {
            g.toast('Радиомачта стоит, но нужна батарея! Ищи на складе', 'bad');
          }
        } else {
          g.toast('Передатчик мёртв. Сначала построй радиомачту (крафт → сигнал)', 'info');
          if (f.noteId && !g.notesFound.includes(f.noteId)) {
            g.notesFound.push(f.noteId);
            this.onNote?.(f.noteId);
          }
        }
        return;
      }
      case 'table': {
        if (f.noteId && !g.notesFound.includes(f.noteId)) {
          g.notesFound.push(f.noteId);
          this.onNote?.(f.noteId);
        } else {
          g.toast('Стол завален бумагами', 'info');
        }
        return;
      }
      default:
        return;
    }
  }

  useBuild(b: BuiltObject) {
    const g = this.state;
    const p = g.player;
    switch (b.kind) {
      case 'campfire': {
        this.toggleFireAt(b);
        return;
      }
      case 'igloo': case 'bedroll': {
        if (p.energy > 92) {
          g.toast('Спать не хочется', 'info');
          return;
        }
        p.sleepT = 20;
        g.toast('Ты ложишься спать…', 'info');
        return;
      }
      case 'dryrack': {
        if (g.invCount('rawMeat') >= 1) {
          g.removeItem('rawMeat', 1);
          g.addItem('driedMeat', 1);
          g.toast('Мясо провялилось', 'good');
          g.addXp('cook', 6);
        } else {
          g.toast('Нужно сырое мясо для вяления', 'bad');
        }
        return;
      }
      case 'crate': {
        g.toast('Ящик для хранения. Складывай вещи через инвентарь (скоро)', 'info');
        return;
      }
      default:
        return;
    }
  }

  toggleFire() {
    const g = this.state;
    const b = g.buildNear(g.player.x, g.player.y, 2.2, ['campfire']);
    if (b) { this.toggleFireAt(b); return; }
    g.toast('Рядом нет кострища', 'info');
  }

  toggleFireAt(b: BuiltObject) {
    const g = this.state;
    const p = g.player;
    if (b.lit) {
      b.lit = false;
      const f = g.fires.find(f => f.x === b.x && f.y === b.y);
      if (f) f.lit = false;
      g.toast('Костёр погашен', 'info');
      return;
    }
    // подкинуть топлива
    const addWood = () => {
      if (g.invCount('wood') >= 2) {
        g.removeItem('wood', 2);
        b.fuel = (b.fuel || 0) + 26;
        b.lit = true;
        audio.fireUp();
        g.toast('Костёр разожжён! Тепло и свет', 'good');
        g.addXp('survival', 5);
        const f = g.fires.find(f => f.x === b.x && f.y === b.y);
        if (f) { f.lit = true; f.fuel = b.fuel; }
      } else if (g.invCount('log') >= 1) {
        g.removeItem('log', 1);
        b.fuel = (b.fuel || 0) + 84;
        b.lit = true;
        audio.fireUp();
        g.toast('Бревно занялось! Надолго хватит', 'good');
        const f = g.fires.find(f => f.x === b.x && f.y === b.y);
        if (f) { f.lit = true; f.fuel = b.fuel; }
      } else {
        g.toast('Нужно 2 древесины или бревно для костра', 'bad');
      }
    };
    addWood();
  }

  wakeUp() {
    const g = this.state;
    g.player.sleepT = 0;
    const hour = (g.stats.min / 60) % 24;
    g.toast(`Утро. ${hour < 12 ? 'Полярная ночь за окном' : 'Светло как днём… почти'}`, 'info');
  }

  // ============================================================
  // РЕНДЕР
  // ============================================================
  render(dt: number, t: number) {
    const g = this.state;
    const p = g.player;

    // ховер пропа под мышью
    this.hoverProp = null;
    if (!this.uiFocus) {
      const rect = (this.renderer.canvas as HTMLCanvasElement).getBoundingClientRect();
      const mx = (this.mouseX - rect.left - rect.width / 2) / this.cam.zoom;
      const my = (this.mouseY - rect.top - rect.height / 2) / this.cam.zoom;
      const wx = this.cam.x + (mx / 32 + my / 16) / 2;
      const wy = this.cam.y + (my / 16 - mx / 32) / 2;
      const hp = g.world.propAt(wx, wy, 1.2);
      this.hoverProp = hp;
    }

    // подсказка взаимодействия
    this.nearHint = this.computeHint();

    this.renderer.drawFrame(g, this.cam, t, dt, this.showFps ? this.fps : null, this.hoverProp);
  }

  computeHint(): string {
    const g = this.state;
    const p = g.player;
    if (p.dead) return '';
    if (p.sleepT > 0) return 'Спим… (энергия восстановится к утру)';
    if (p.craftRecipe) {
      if (p.craftRecipe === '__fish') return 'Рыбачим… (E — прервать)';
      const r = RECIPES.find(q => q.id === p.craftRecipe);
      if (r) return `Работа: ${r.name}`;
    }
    // предметы на земле
    for (const gi of g.world.groundItems) {
      if (dist(gi.x, gi.y, p.x, p.y) < 1.6) return `[E] Поднять: ${itemName(gi.item)} ×${gi.n}`;
    }
    const near = g.world.furnitureNear(p.x, p.y, 1.7);
    if (near) {
      const f = near.f;
      if (f.kind === 'crate' || f.kind === 'locker' || f.kind === 'shelf') return `[E] Обыскать: ${f.kind === 'locker' ? 'шкаф' : f.kind === 'shelf' ? 'стеллаж' : 'ящик'}`;
      if (f.kind === 'bed') return '[E] Спать';
      if (f.kind === 'stove') return f.used ? 'Печка горит' : '[E] Затопить печь (2 древесины)';
      if (f.kind === 'radio') return '[E] Радио: подать сигнал бедствия';
      if (f.kind === 'table') return '[E] Осмотреть';
    }
    const prop = g.world.propAt(p.x, p.y, 1.6);
    if (prop) {
      if (prop.kind === 'tree' && !prop.felled) return g.hasTool('chop') ? '[ЛКМ/E] Рубить дерево' : 'Дерево. Нужен топор';
      if (prop.kind === 'tree' && prop.felled) return '[E] Разделать бревно';
      if (prop.kind === 'rock') return g.hasTool('mine') ? '[ЛКМ/E] Добывать камень' : 'Камень. Нужна кирка';
      if (prop.kind === 'berryBush') return (prop.regrowAt ?? 0) <= 0 ? '[E] Собрать морошку' : 'Куст морошки (ягод нет)';
      if (prop.kind === 'polynya') return g.invCount('fishingRod') ? '[E] Рыбачить' : 'Полынья. Нужна удочка';
      if (prop.kind === 'antennaWreck') return 'Обломок антенны станции';
    }
    const b = g.buildNear(p.x, p.y, 1.6);
    if (b) {
      if (b.kind === 'campfire') return b.lit ? '[F] Загасить костёр' : '[F/E] Разжечь костёр (2 древесины)';
      if (b.kind === 'igloo') return '[E] Спать в иглу';
      if (b.kind === 'bedroll') return '[E] Спать';
      if (b.kind === 'dryrack') return '[E] Вялить мясо';
    }
    const nearBuild = g.buildNear(p.x, p.y, 2.2, ['campfire']);
    if (nearBuild) return nearBuild.lit ? '[F] Загасить костёр' : '[F] Разжечь костёр';
    return '';
  }

  // ============================================================
  // HUD
  // ============================================================
  getHud(): HudSnapshot {
    const g = this.state;
    const p = g.player;
    const hour = (g.stats.min / 60) % 24;
    const hh = Math.floor(hour), mm = Math.floor((hour % 1) * 60);
    const wName = { clear: 'Ясно', overcast: 'Пасмурно', snowfall: 'Снегопад', blizzard: 'Метель' }[g.weather.kind] || '';
    return {
      hp: p.hp, hunger: p.hunger, thirst: p.thirst, energy: p.energy, warmth: p.warmth,
      sick: p.sick, bleeding: p.bleeding,
      day: g.stats.day,
      timeStr: `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`,
      temp: g.airTemp(),
      weather: wName,
      weight: Math.round(p.weight * 10) / 10,
      maxWeight: g.maxWeight(),
      sleep: p.sleepT > 0,
      dead: p.dead,
      deathReason: p.deathReason,
      rescued: g.rescued,
      rescueT: g.rescueT,
      gameOver: g.gameOver,
      nearHint: this.nearHint,
      craftName: p.craftRecipe === '__fish' ? 'Рыбалка' : p.craftRecipe ? (RECIPES.find(r => r.id === p.craftRecipe)?.name || '…') : null,
      craftPct: p.craftRecipe ? clamp(p.craftT / (p.craftRecipe === '__fish' ? 40 : RECIPES.find(r => r.id === p.craftRecipe)?.minutes || 1), 0, 1) : 0,
    };
  }

  // рыбалка — отдельный таймер
  tickFish(dtMin: number) {
    const g = this.state;
    const p = g.player;
    if (p.craftRecipe === '__fish') {
      p.craftT += dtMin;
      if (p.craftT >= 28) {
        p.craftRecipe = null; p.craftT = 0;
        const chance = 0.45 + g.skills.fish.lvl * 0.08;
        if (Math.random() < chance) {
          g.addItem('rawFish', 1 + Math.floor(Math.random() * 2));
          g.toast('Есть клёв! Рыба в рюкзаке', 'good');
          g.addXp('fish', 12);
          g.stats.caught++;
        } else {
          g.toast('Пустой заброс… рыба ушла', 'info');
          g.addXp('fish', 4);
        }
      }
    }
  }

  // ============================================================
  // СЕЙВ
  // ============================================================
  save() {
    try {
      const g = this.state;
      const data = {
        v: 2,
        seed: g.seed,
        stats: g.stats,
        player: g.player,
        inv: g.inv,
        equip: g.equip,
        skills: g.skills,
        weather: g.weather,
        builds: g.builds,
        fires: g.fires,
        notesFound: g.notesFound,
        radioBuilt: g.radioBuilt,
        rescued: g.rescued,
        rescueT: g.rescueT,
        gameOver: g.gameOver,
        groundItems: g.world.groundItems,
        // выжившие животные
        animals: g.animals.filter(a => a.state !== 'dead').map(a => ({ ...a })),
        // изменения мира: вырубленные/уничтоженные пропы и их состояние
        propsDiff: g.world.props.map(p => ({ id: p.id, hp: p.hp, felled: !!p.felled, regrowAt: p.regrowAt ?? null, gone: false })),
        openedFurniture: g.world.buildings.flatMap(b => b.furniture.filter(f => f.opened).map(f => ({ bx: b.x, by: b.y, fx: f.x, fy: f.y }))),
        usedStoves: g.world.buildings.flatMap(b => b.furniture.filter(f => f.used).map(f => ({ bx: b.x, by: b.y, fx: f.x, fy: f.y }))),
        lightsOn: g.world.buildings.map(b => b.lightsOn),
      };
      localStorage.setItem('belaya_tishina_save', JSON.stringify(data));
    } catch (e) {
      // сейв может не влезть — молча
    }
  }

  static load(): GameState | null {
    try {
      const raw = localStorage.getItem('belaya_tishina_save');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.v !== 2) return null;
      const g = new GameState(data.seed);
      g.stats = data.stats;
      g.player = data.player;
      g.inv = data.inv;
      g.equip = data.equip;
      g.skills = data.skills;
      g.weather = data.weather;
      g.builds = data.builds;
      g.fires = data.fires;
      g.notesFound = data.notesFound;
      g.radioBuilt = data.radioBuilt;
      g.rescued = data.rescued;
      g.rescueT = data.rescueT;
      g.gameOver = data.gameOver;
      g.world.groundItems = data.groundItems || [];
      // пропы: применяем сохранённые состояния
      const byId = new Map<number, any>();
      for (const pd of data.propsDiff || []) byId.set(pd.id, pd);
      const savedIds = new Set(byId.keys());
      g.world.props = g.world.props.filter(p => {
        const pd = byId.get(p.id);
        if (!pd) return true; // новый проп (не было в сейве) — оставляем
        if (pd.felled) { p.felled = true; p.hp = pd.hp; }
        else if (pd.hp < p.maxHp) p.hp = pd.hp;
        if (pd.regrowAt !== null && pd.regrowAt !== undefined) p.regrowAt = pd.regrowAt;
        return true;
      });
      // удалённые пропы (например, разделённые брёвна) — удаляем те, кого нет в сейве
      g.world.props = g.world.props.filter(p => {
        if (p.id < 900000) return savedIds.has(p.id) || p.kind === 'stump';
        return true;
      });
      for (const f of data.openedFurniture || []) {
        const b = g.world.buildings.find(b => b.x === f.bx && b.y === f.by);
        if (b) {
          const fu = b.furniture.find(x => x.x === f.fx && x.y === f.fy);
          if (fu) fu.opened = true;
        }
      }
      for (const f of data.usedStoves || []) {
        const b = g.world.buildings.find(b => b.x === f.bx && b.y === f.by);
        if (b) {
          const fu = b.furniture.find(x => x.x === f.fx && x.y === f.fy);
          if (fu) fu.used = true;
        }
      }
      (g.world.buildings as any[]).forEach((b, i) => { if (data.lightsOn?.[i] !== undefined) b.lightsOn = data.lightsOn[i]; });
      g.animals = data.animals || g.animals;
      // пересчитать блокировки для поваленных деревьев
      for (const p of g.world.props) {
        if (p.felled) g.world.setBlocked(p.x, p.y, false);
      }
      return g;
    } catch (e) {
      return null;
    }
  }

  static hasSave(): boolean {
    try {
      return !!localStorage.getItem('belaya_tishina_save');
    } catch {
      return false;
    }
  }

  static clearSave() {
    try {
      localStorage.removeItem('belaya_tishina_save');
    } catch {}
  }
}
