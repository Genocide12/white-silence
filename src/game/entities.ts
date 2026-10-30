// ============================================================
// entities.ts — животные и ИИ
// v2: территории стай, отступление после укуса, страх огня
// ============================================================
import { World, T_ICE } from './world';
import { clamp, dist, dist2, lerp } from './core';

export type AnimalKind = 'wolf' | 'bear' | 'hare' | 'deer';

export interface Animal {
  id: number;
  kind: AnimalKind;
  x: number; y: number;
  vx: number; vy: number;
  ang: number;
  hp: number; maxHp: number;
  state: 'idle' | 'wander' | 'stalk' | 'chase' | 'attack' | 'flee' | 'dead' | 'circle';
  stateT: number; // сек в состоянии
  targetAng: number;
  speed: number;
  fleeFrom: number; // время бегства после урона
  packId: number;
  howlT: number; // таймер воя волка
  walkPhase: number;
  attackCd: number;
  hitFlash: number;
  scared: number; // испуг от огня/шума (сек)
  homeX: number; homeY: number; // центр территории
  territory: number; // радиус территории
  bites: number; // укусов подряд — после пары волк отступает
  howling: number; // анимация воя 0..1
  sleepDay: boolean;
}

let nextAnimalId = 1;

export function makeAnimal(kind: AnimalKind, x: number, y: number, packId = 0, home?: { x: number; y: number }): Animal {
  const base = {
    id: nextAnimalId++, x, y, vx: 0, vy: 0, ang: 0,
    state: 'wander' as Animal['state'], stateT: 0, targetAng: 0, fleeFrom: 0,
    howlT: Math.random() * 30, walkPhase: 0, attackCd: 0, hitFlash: 0, scared: 0,
    homeX: home?.x ?? x, homeY: home?.y ?? y, territory: 12,
    bites: 0, howling: 0, sleepDay: false,
  };
  switch (kind) {
    case 'wolf': return { ...base, kind, packId, hp: 55, maxHp: 55, speed: 3.4 };
    case 'bear': return { ...base, kind, packId, hp: 240, maxHp: 240, speed: 2.9, territory: 16 };
    case 'hare': return { ...base, kind, packId, hp: 12, maxHp: 12, speed: 4.6, territory: 8 };
    case 'deer': return { ...base, kind, packId, hp: 70, maxHp: 70, speed: 4.2, territory: 18 };
  }
}

export function spawnFauna(world: World): Animal[] {
  const list: Animal[] = [];
  let s = 42;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  // 4 волчьи стаи по 3-4 волка, каждая на своей территории
  const packSpots = [
    { x: 18, y: 28 }, { x: 90, y: 82 }, { x: 26, y: 94 }, { x: 94, y: 24 },
  ];
  let pack = 1;
  for (const spot of packSpots) {
    const n = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const x = spot.x + (rnd() - 0.5) * 6;
      const y = spot.y + (rnd() - 0.5) * 6;
      const open = world.nearestOpen(Math.round(x), Math.round(y));
      list.push(makeAnimal('wolf', open.x, open.y, pack, spot));
    }
    pack++;
  }
  // медведи: северные скалы и северо-запад
  const bearSpot = world.nearestOpen(56, 14);
  list.push(makeAnimal('bear', bearSpot.x, bearSpot.y, 90, { x: 56, y: 12 }));
  const bear2 = world.nearestOpen(18, 18);
  list.push(makeAnimal('bear', bear2.x, bear2.y, 91, { x: 18, y: 16 }));

  // зайцы
  for (let i = 0; i < 14; i++) {
    let x = 8 + rnd() * (world.w - 16), y = 8 + rnd() * (world.h - 16);
    if (world.tileAt(x, y) === T_ICE || world.isBlocked(x, y)) continue;
    list.push(makeAnimal('hare', x, y, 0));
  }
  // олени стадом на востоке
  for (let i = 0; i < 6; i++) {
    const x = 88 + (rnd() - 0.5) * 8, y = 52 + (rnd() - 0.5) * 10;
    if (world.tileAt(x, y) === T_ICE || world.isBlocked(x, y)) continue;
    list.push(makeAnimal('deer', x, y, 60, { x: 88, y: 52 }));
  }
  return list;
}

/** попытка шага с коллизией по осям */
export function moveAnimal(world: World, a: Animal, dx: number, dy: number): boolean {
  let moved = false;
  const r = a.kind === 'bear' ? 0.42 : a.kind === 'deer' ? 0.38 : 0.3;
  if (dx !== 0) {
    const nx = a.x + dx;
    const cxb = Math.floor(nx + Math.sign(dx) * r), cyb = Math.floor(a.y);
    if (!world.isBlocked(cxb, cyb) && !world.isBlocked(cxb, Math.floor(a.y + r)) && !world.isBlocked(cxb, Math.floor(a.y - r))) {
      a.x = nx; moved = true;
    }
  }
  if (dy !== 0) {
    const ny = a.y + dy;
    const cyb = Math.floor(ny + Math.sign(dy) * r), cxb = Math.floor(a.x);
    if (!world.isBlocked(cxb, cyb) && !world.isBlocked(Math.floor(a.x + r), cyb) && !world.isBlocked(Math.floor(a.x - r), cyb)) {
      a.y = ny; moved = true;
    }
  }
  // если застрял в заблокированной клетке (спавн/сдвиг мира) — разрешаем выйти (правило skill'а)
  if (!moved && world.isBlocked(a.x, a.y)) {
    a.x += dx * 2; a.y += dy * 2; moved = true;
  }
  return moved;
}

export interface AiContext {
  world: World;
  px: number; py: number;
  playerAlive: boolean;
  playerWarmth: number;
  playerHasTorch: boolean;
  hasFireNear: (x: number, y: number) => boolean;
  onPlayerBitten: (dmg: number, kind: AnimalKind) => void;
  onHowl: (x: number, y: number) => void;
  hour: number;
}

export function updateAnimal(a: Animal, ctx: AiContext, dt: number) {
  if (a.state === 'dead') return;
  a.stateT += dt;
  a.attackCd = Math.max(0, a.attackCd - dt);
  a.hitFlash = Math.max(0, a.hitFlash - dt * 2.5);
  a.scared = Math.max(0, a.scared - dt);
  if (a.howling > 0) a.howling = Math.max(0, a.howling - dt * 0.8);

  const d2p = dist2(a.x, a.y, ctx.px, ctx.py);
  const dP = Math.sqrt(d2p);
  const night = ctx.hour >= 19 || ctx.hour <= 6;

  switch (a.kind) {
    // ================= ВОЛК =================
    case 'wolf': {
      a.howlT -= dt;
      if (a.howlT <= 0 && a.state === 'wander') {
        a.howlT = 25 + Math.random() * 40;
        if (Math.random() < 0.5) { a.howling = 1.6; ctx.onHowl(a.x, a.y); }
      }

      const fireNear = ctx.hasFireNear(a.x, a.y) || (ctx.playerHasTorch && dP < 5);
      // агрессивность: ночью вся стая, днём — при близком контакте
      const aggroRange = (night ? 10 : 6.5) * (a.state === 'chase' ? 1.5 : 1);
      const giveUp = night ? 16 : 12;

      if (a.fleeFrom > 0) {
        a.fleeFrom -= dt;
        a.state = 'flee';
        const ang = Math.atan2(a.y - ctx.py, a.x - ctx.px) + Math.sin(a.stateT * 3) * 0.3;
        a.targetAng = ang;
        const sp = a.speed * 1.4;
        const moved = moveAnimal(ctx.world, a, -Math.cos(ang) * sp * dt, -Math.sin(ang) * sp * dt);
        if (!moved) a.targetAng += Math.PI / 2;
        a.ang = lerp(a.ang, a.targetAng, 0.15);
        a.walkPhase += dt * 12;
        if (a.fleeFrom <= 0) a.state = 'wander';
      } else if (fireNear && dP < 6.5) {
        // огонь отпугивает: кружит поодаль
        a.state = 'circle';
        const ang = Math.atan2(a.y - ctx.py, a.x - ctx.px);
        const tang = ang + Math.PI / 2 * (a.packId % 2 === 0 ? 1 : -1);
        const sp = a.speed * 0.6;
        moveAnimal(ctx.world, a, Math.cos(tang) * sp * dt - Math.cos(ang) * sp * 0.4 * dt, Math.sin(tang) * sp * dt - Math.sin(ang) * sp * 0.4 * dt);
        a.ang = lerp(a.ang, tang, 0.1);
        a.walkPhase += dt * 8;
      } else if (ctx.playerAlive && dP < aggroRange) {
        if (dP > 1.25) {
          a.state = 'chase';
          a.targetAng = Math.atan2(ctx.py - a.y, ctx.px - a.x);
          const sp = a.speed;
          const moved = moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt);
          if (!moved) {
            a.targetAng += Math.PI / 3;
            moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt);
          }
          a.ang = lerp(a.ang, a.targetAng, 0.2);
          a.walkPhase += dt * 11;
        } else {
          a.state = 'attack';
          if (a.attackCd <= 0) {
            a.attackCd = 1.35;
            a.bites++;
            ctx.onPlayerBitten(5 + Math.random() * 4, 'wolf');
            // стайная тактика: после пары укусов волк отступает и заходит заново
            if (a.bites >= 2 + Math.floor(Math.random() * 2)) {
              a.bites = 0;
              a.fleeFrom = 2.5 + Math.random() * 2;
            }
          }
        }
      } else if (a.state === 'chase' && dP < giveUp && !fireNear) {
        // продолжаем погоню чуть за пределом агро
        a.targetAng = Math.atan2(ctx.py - a.y, ctx.px - a.x);
        const sp = a.speed;
        moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt);
        a.ang = lerp(a.ang, a.targetAng, 0.2);
        a.walkPhase += dt * 11;
      } else {
        // бродит по своей территории медленно
        a.state = 'wander';
        const dHome = dist(a.x, a.y, a.homeX, a.homeY);
        if (dHome > a.territory) {
          // возвращение домой
          a.targetAng = Math.atan2(a.homeY - a.y, a.homeX - a.x);
        } else if (a.stateT > 2.5) {
          if (Math.random() < dt * 0.5) {
            a.targetAng = Math.random() * Math.PI * 2;
            a.stateT = 0;
          }
        }
        const sp = a.speed * 0.16; // ~0.55 тайла/сек — обычная рысь
        const moved = moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt);
        if (!moved && a.stateT > 1) { a.targetAng = Math.random() * Math.PI * 2; a.stateT = 0; }
        a.ang = lerp(a.ang, a.targetAng, 0.06);
        a.walkPhase += dt * 3;
      }
      break;
    }
    // ================= МЕДВЕДЬ =================
    case 'bear': {
      if (a.fleeFrom > 0) a.fleeFrom -= dt;
      const aggroRange = night ? 8 : 5.5;
      if (a.scared > 0 || a.fleeFrom > 0) {
        a.state = 'flee';
        const ang = Math.atan2(a.y - ctx.py, a.x - ctx.px);
        const sp = a.speed * 1.2;
        moveAnimal(ctx.world, a, Math.cos(ang) * sp * dt, Math.sin(ang) * sp * dt);
        a.ang = lerp(a.ang, ang, 0.1);
        a.walkPhase += dt * 9;
      } else if (ctx.playerAlive && dP < aggroRange) {
        if (dP > 1.5) {
          a.state = 'chase';
          a.targetAng = Math.atan2(ctx.py - a.y, ctx.px - a.x);
          moveAnimal(ctx.world, a, Math.cos(a.targetAng) * a.speed * dt, Math.sin(a.targetAng) * a.speed * dt);
          a.ang = lerp(a.ang, a.targetAng, 0.15);
          a.walkPhase += dt * 8;
        } else {
          a.state = 'attack';
          if (a.attackCd <= 0) {
            a.attackCd = 2;
            ctx.onPlayerBitten(16 + Math.random() * 8, 'bear');
          }
        }
      } else if (a.state === 'chase' && dP < 12) {
        a.targetAng = Math.atan2(ctx.py - a.y, ctx.px - a.x);
        moveAnimal(ctx.world, a, Math.cos(a.targetAng) * a.speed * dt, Math.sin(a.targetAng) * a.speed * dt);
        a.ang = lerp(a.ang, a.targetAng, 0.15);
        a.walkPhase += dt * 8;
      } else {
        a.state = 'wander';
        const dHome = dist(a.x, a.y, a.homeX, a.homeY);
        if (dHome > a.territory) {
          a.targetAng = Math.atan2(a.homeY - a.y, a.homeX - a.x);
        } else if (Math.random() < dt * 0.2) a.targetAng = Math.random() * Math.PI * 2;
        const sp = a.speed * 0.12; // медведь неспешен
        const moved = moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt);
        if (!moved) a.targetAng = Math.random() * Math.PI * 2;
        a.ang = lerp(a.ang, a.targetAng, 0.05);
        a.walkPhase += dt * 3;
      }
      break;
    }
    // ================= ЗАЯЦ =================
    case 'hare': {
      if (ctx.playerAlive && dP < 6) {
        a.state = 'flee';
        const ang = Math.atan2(a.y - ctx.py, a.x - ctx.px);
        const sp = a.speed;
        const zig = Math.sin(a.stateT * 9) * 0.5;
        const ea = ang + zig;
        const moved = moveAnimal(ctx.world, a, Math.cos(ea) * sp * dt, Math.sin(ea) * sp * dt);
        if (!moved) { a.targetAng = ang + Math.PI / 2; moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt); }
        a.ang = lerp(a.ang, ea, 0.25);
        a.walkPhase += dt * 16;
      } else {
        a.state = 'wander';
        if (Math.random() < dt * 0.4) a.targetAng = Math.random() * Math.PI * 2;
        const sp = a.speed * 0.08;
        const moved = moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt);
        if (!moved) a.targetAng = Math.random() * Math.PI * 2;
        a.ang = lerp(a.ang, a.targetAng, 0.1);
        a.walkPhase += dt * 4;
      }
      break;
    }
    // ================= ОЛЕНЬ =================
    case 'deer': {
      if (a.fleeFrom > 0) a.state = 'flee';
      if (ctx.playerAlive && dP < 8) {
        a.fleeFrom = Math.max(a.fleeFrom, 4);
        a.state = 'flee';
        const ang = Math.atan2(a.y - ctx.py, a.x - ctx.px);
        const sp = a.speed * 1.15;
        const moved = moveAnimal(ctx.world, a, Math.cos(ang) * sp * dt, Math.sin(ang) * sp * dt);
        if (!moved) { a.targetAng = ang + Math.PI / 2; moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt); }
        a.ang = lerp(a.ang, ang, 0.15);
        a.walkPhase += dt * 12;
      } else {
        a.state = 'wander';
        const dHome = dist(a.x, a.y, a.homeX, a.homeY);
        if (dHome > a.territory) {
          a.targetAng = Math.atan2(a.homeY - a.y, a.homeX - a.x);
        } else if (Math.random() < dt * 0.25) a.targetAng = Math.random() * Math.PI * 2;
        const sp = a.speed * 0.1;
        const moved = moveAnimal(ctx.world, a, Math.cos(a.targetAng) * sp * dt, Math.sin(a.targetAng) * sp * dt);
        if (!moved) a.targetAng = Math.random() * Math.PI * 2;
        a.ang = lerp(a.ang, a.targetAng, 0.08);
        a.walkPhase += dt * 4;
      }
      break;
    }
  }

  // держим в границах карты
  a.x = clamp(a.x, 3, ctx.world.w - 4);
  a.y = clamp(a.y, 3, ctx.world.h - 4);
}

/** дроп с убитого зверя */
export function animalDrops(kind: AnimalKind, huntLvl: number): { id: string; n: number }[] {
  const out: { id: string; n: number }[] = [];
  const bonus = 1 + huntLvl * 0.12;
  switch (kind) {
    case 'wolf':
      out.push({ id: 'rawMeat', n: Math.max(1, Math.round(2 * bonus)) });
      out.push({ id: 'hide', n: Math.max(1, Math.round(1 * bonus)) });
      if (Math.random() < 0.4) out.push({ id: 'bone', n: 2 });
      if (Math.random() < 0.25) out.push({ id: 'fat', n: 1 });
      break;
    case 'bear':
      out.push({ id: 'rawMeat', n: Math.max(4, Math.round(8 * bonus)) });
      out.push({ id: 'hide', n: Math.max(2, Math.round(3 * bonus)) });
      out.push({ id: 'fat', n: 3 });
      if (Math.random() < 0.7) out.push({ id: 'bone', n: 4 });
      break;
    case 'hare':
      out.push({ id: 'rawMeat', n: 1 });
      if (Math.random() < 0.6) out.push({ id: 'hide', n: 1 });
      break;
    case 'deer':
      out.push({ id: 'rawMeat', n: Math.max(2, Math.round(5 * bonus)) });
      out.push({ id: 'hide', n: Math.max(1, Math.round(2 * bonus)) });
      if (Math.random() < 0.5) out.push({ id: 'bone', n: 2 });
      break;
  }
  return out;
}
