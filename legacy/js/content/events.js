/**
 * СЛУЧАЙНЫЕ СОБЫТИЯ. WS.Events — реестр событийных сценариев:
 * условия появления, веса, одноразовость, эффекты. Проверка — раз в 5 сек.
 */
(function () {
  'use strict';

  var checkTimer = 0;
  var cooldown = 0;          // общий кулдаун между событиями (сек)
  var dog = null;            // сущность пса-компаньона
  var fedCount = 0;          // сколько раз покормили пса
  var aurora = null;         // активное сияние {t}

  function flags() { return WS.G && WS.G.story ? WS.G.story.flags : {}; }
  function once(key) { flags()['ev_' + key] = true; }
  function isOnce(key) { return !!flags()['ev_' + key]; }

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
    else if (WS.Fx && WS.G) WS.Fx.text(text, WS.G.player.x, WS.G.player.y - 1.2, { life: 2.5 });
  }

  function chron(text) {
    if (WS.G && WS.G.story) {
      if (!WS.G.story.chronicle) WS.G.story.chronicle = [];
      WS.G.story.chronicle.push({ day: WS.Time.day(), text: text });
      if (WS.G.story.chronicle.length > 120) WS.G.story.chronicle.shift();
    }
  }

  function playerInside() {
    return WS.World.isInside(WS.G.player.x, WS.G.player.y);
  }

  function hasItem(id) {
    return WS.Inv && WS.Inv.count ? WS.Inv.count(id) > 0 :
      (WS.Action && WS.Action.count ? WS.Action.count(id) > 0 : false);
  }

  function takeItem(id, n) {
    if (WS.Inv && WS.Inv.take) return WS.Inv.take(id, n || 1);
    if (WS.Action && WS.Action.consume) return WS.Action.consume(id, n || 1);
    return false;
  }

  // ================================================================ ПЁС
  function trySpawnDog() {
    if (isOnce('dog') || dog) return;
    if (WS.Time.day() < 5 || WS.Time.hour() < 9 || WS.Time.hour() > 17) return;
    // пёс приходит к дому игрока или к костру
    var px = WS.G.player.x, py = WS.G.player.y;
    var ang = Math.random() * Math.PI * 2;
    var dx = px + Math.cos(ang) * 8, dy = py + Math.sin(ang) * 8;
    dog = WS.World.addEnt({
      kind: 'dog', x: dx, y: dy,
      hp: 40, maxHp: 40, speed: 2.6,
      sprName: 'dog', sprFrame: 0, dir: 4,
      ally: false, tamed: false,
      shadowR: 0.3
    });
    once('dog');
    toast('Из леса вышел пёс. Тощий, но спокойный. Смотрит на вас.', 'info');
    chron('Из леса пришёл пёс');
  }

  function dogTick(dt) {
    if (!dog) return;
    var p = WS.G.player;
    var d = WS.M.dist(dog.x, dog.y, p.x, p.y);
    if (!dog.tamed) {
      // бродит неподалёку, ждёт корма
      if (d > 6) { moveTowards(dog, p.x + 3, p.y + 3, 1.2, dt); }
      if (d < 2.5 && hasItem('meat_raw')) {
        toast('Пёс смотрит на сырое мясо. [E] — покормить', 'info');
        if (WS.Input.hit('interact')) {
          takeItem('meat_raw', 1);
          fedCount++;
          WS.Fx.burst('spark', dog.x, dog.y, 5);
          WS.Snd.play('eat', { x: dog.x, y: dog.y });
          if (fedCount >= 3) {
            dog.tamed = true; dog.ally = true;
            toast('Пёс принял вас. Теперь вы не один.', 'good');
            WS.Snd.play('levelup');
            chron('Пёс стал companion');
          } else {
            toast('Пёс съел мясо. Кормить ещё ' + (3 - fedCount) + ' раз.', 'info');
          }
        }
      }
      // уходит через 2 игровых дня если не приручён
      if (WS.Time.day() > (flags().dog_day || (flags().dog_day = WS.Time.day())) + 2) {
        WS.World.removeEnt(dog); dog = null;
        toast('Пёс ушёл.', 'warn');
      }
    } else {
      // верный пёс: следует, охраняет
      if (d > 2.5) moveTowards(dog, p.x, p.y, dog.speed, dt);
      // лает на волков и бандитов
      var near = WS.World.entsNear(p.x, p.y, 7);
      for (var i = 0; i < near.length; i++) {
        var e = near[i];
        if (e !== dog && e !== p && (e.kind === 'wolf' || e.kind === 'bear' || e.kind === 'bandit')) {
          if (!dog._bark || performance.now() - dog._bark > 4000) {
            dog._bark = performance.now();
            WS.Snd.play('bandit_shout', { x: dog.x, y: dog.y, vol: 0.4 });
            toast('Пёс ощетинился и лает. Рядом хищник!', 'bad');
          }
          if (d < 4 && e.hp > 0) {
            // пёс дерётся
            if (!dog._atk || performance.now() - dog._atk > 1500) {
              dog._atk = performance.now();
              e.hp -= 8;
              WS.Fx.burst('blood', e.x, e.y, 3);
              if (e.hp <= 0) {
                WS.Ev.emit('ent:kill', { ent: e, by: dog });
                WS.World.removeEnt(e);
              }
            }
          }
        }
      }
    }
  }

  function moveTowards(e, tx, ty, speed, dt) {
    var dx = tx - e.x, dy = ty - e.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.05) return;
    var nx = e.x + (dx / d) * speed * dt;
    var ny = e.y + (dy / d) * speed * dt;
    if (!WS.World.isTileBlocked(Math.floor(nx), Math.floor(e.y))) e.x = nx;
    if (!WS.World.isTileBlocked(Math.floor(e.x), Math.floor(ny))) e.y = ny;
    e.dir = WS.M.dir8(dx, dy);
    e.sprFrame = Math.floor((e._wt = (e._wt || 0) + dt * 6)) % 4;
  }

  // ================================================================ СИЯНИЕ
  function tryAurora() {
    if (WS.Time.day() < 44) return;
    if (isOnce('aurora_shown') && Math.random() > 0.02) return;
    if (!WS.Weather || WS.Weather.current() && WS.Weather.current().id !== 'clear') return;
    if (WS.Time.hour() < 20 && WS.Time.hour() > 5) return;
    if (aurora) return;
    aurora = { t: 0, dur: 60 };
    once('aurora_shown');
    toast('Небо над севером загорелось зелёным.', 'good');
    chron('Небо горело зелёным — северное сияние');
    if (WS.G.player) {
      WS.G.player.needs.sanity = Math.min(100, WS.G.player.needs.sanity + 15);
    }
    WS.Snd.play('bell', { vol: 0.25 });
  }

  function auroraTick(dt) {
    if (!aurora) return;
    aurora.t += dt;
    if (aurora.t >= aurora.dur) { aurora = null; return; }
    // рисование — отдельный тик 75 (после мира)
  }

  function auroraDraw(ctx) {
    if (!aurora) return;
    var cv = ctx.canvas;
    var a = Math.sin(Math.min(1, aurora.t / 3) * Math.PI / 2) *   // появление
            Math.min(1, (aurora.dur - aurora.t) / 3);              // затухание
    ctx.save();
    ctx.globalAlpha = 0.25 * a;
    for (var band = 0; band < 4; band++) {
      var grad = ctx.createLinearGradient(0, cv.height * 0.1, 0, cv.height * 0.5);
      var hue = 140 + band * 25;
      grad.addColorStop(0, 'hsla(' + hue + ',70%,55%,0.6)');
      grad.addColorStop(1, 'hsla(' + (hue + 40) + ',60%,40%,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      var t = aurora.t * 0.4 + band * 1.7;
      ctx.moveTo(0, cv.height * 0.5);
      for (var x = 0; x <= cv.width; x += 40) {
        var y = cv.height * (0.18 + 0.12 * Math.sin(x / 300 + t) + 0.05 * Math.sin(x / 90 - t * 2));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cv.width, cv.height * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ================================================================ СНЕГ С КРЫШИ
  function tryRoofSnow() {
    if (!playerInside() && WS.Time.hour() >= 8 && WS.Time.hour() <= 18) {
      // рядом со зданием?
      var b = WS.World.buildingAt(Math.floor(WS.G.player.x), Math.floor(WS.G.player.y));
      if (!b) {
        // ищем ближайшее здание в 2 тайлах
        var near = WS.World.query(WS.G.player.x - 3, WS.G.player.y - 3, WS.G.player.x + 3, WS.G.player.y + 3);
        for (var i = 0; i < near.length; i++) {
          if (near[i].hp !== undefined) continue;
          b = WS.World.isInside(near[i].x, near[i].y);
          if (b) break;
        }
      }
      if (b && Math.random() < 0.25) {
        WS.Fx.burst('snow', WS.G.player.x, WS.G.player.y - 1, 14);
        WS.Snd.play('fall', { x: WS.G.player.x, y: WS.G.player.y, vol: 0.6 });
        if (Math.random() < 0.3) {
          // прямо на голову
          WS.Ev.emit('player:damage', { amount: 4, type: 'blunt', src: { kind: 'roof' } });
          toast('С крыши обвалился снег!', 'bad');
        } else {
          toast('С крыши соседнего дома ссыпался снег.', 'info');
        }
      }
    }
  }

  // ================================================================ ПУТНИК В МЕТЕЛЬ
  function tryKnocker() {
    if (!playerInside()) return;
    if (!WS.Weather || WS.Weather.current().id !== 'blizzard') return;
    if (WS.Time.hour() < 19 && WS.Time.hour() > 6) return;
    if (WS.Time.day() < 10) return;
    if (isOnce('knocker')) return;
    if (Math.random() > 0.3) return;
    once('knocker');
    var deal = Math.random() < 0.55;   // честный ли путник
    if (WS.Ui && WS.Ui.confirm) {
      WS.Ui.confirm('В дверь стучат. Сквозь метель виден силуэт. Впустить?', function (yes) {
        if (yes) {
          if (deal) {
            var gifts = [
              { id: 'bread', n: 2, txt: 'хлебца' },
              { id: 'rifle_round', n: 6, txt: 'патронов' },
              { id: 'vodka', n: 1, txt: 'водки' },
              { id: 'meat_cooked', n: 2, txt: 'вяленого мяса' },
              { id: 'matches', n: 12, txt: 'спичек' }
            ];
            var g = gifts[Math.floor(Math.random() * gifts.length)];
            if (WS.Inv && WS.Inv.give) WS.Inv.give(g.id, g.n);
            toast('Путник согрелся, оставил ' + g.txt + ' и ушёл до рассвета.', 'good');
            chron('Пустил путника в метель — получил ' + g.txt);
          } else {
            // вор
            if (WS.Inv && WS.Inv.snapshot) {
              var snap = WS.Inv.snapshot();
              if (snap.slots && snap.slots.length) {
                var victim = snap.slots[Math.floor(Math.random() * snap.slots.length)];
                if (victim && victim.id) {
                  WS.Inv.take(victim.id, 1);
                  toast('Утром вы обнаружили пропажу: гость ушёл, прихватив ' + victim.id + '.', 'bad');
                  chron('Ночью обокрали');
                  return;
                }
              }
            }
            toast('Ночной гость ушёл, не тронув ничего — вам повезло.', 'info');
          }
        } else {
          WS.G.player.needs.sanity = Math.max(0, WS.G.player.needs.sanity - 10);
          toast('Стук стих. Вы оставили стучавшего на морозе. Это не пройдёт бесследно.', 'warn');
          chron('Не открыл дверь в метель');
        }
      });
    } else {
      // без UI — авто-решение
      toast('Кто-то стучал в дверь, но ушёл, не дождавшись.', 'info');
    }
  }

  // ================================================================ ВОЛЧЬЯ ПОПОЙКА
  function tryFeedingGround() {
    if (WS.Time.day() < 6) return;
    if (isOnce('feeding1') && Math.random() > 0.15) return;
    if (WS.Time.hour() !== 7) return;    // утром
    if (Math.random() > 0.25) return;
    once('feeding1');
    // 2-3 оленя-трупа около леса
    var px = WS.G.player.x;
    var R = WS.RNG.mk(Date.now() & 0xffff);
    var n = R.int(2, 3);
    for (var i = 0; i < n; i++) {
      var fx = px + R.range(-25, 25);
      var fy = Math.max(6, Math.min(70, R.range(-25, 25) + WS.G.player.y));
      if (WS.World.isTileBlocked(Math.floor(fx), Math.floor(fy))) continue;
      if (WS.Loot && WS.Loot.makeCorpse) WS.Loot.makeCorpse(fx, fy, 'deer');
    }
    toast('Ночью здесь пировали волки. Утром — следы.', 'info');
    WS.Ev.emit('blood', { x: px, y: Math.max(6, WS.G.player.y - 20), r: 30 });
  }

  // ================================================================ ТРЕСК ЛЬДА
  function tryIceCrack() {
    var t = WS.World.tileAt(Math.floor(WS.G.player.x), Math.floor(WS.G.player.y));
    if (t !== WS.World.T.ICE) return;
    if (Math.random() > 0.02) return;
    WS.Snd.play('trap_snap', { x: WS.G.player.x, y: WS.G.player.y, vol: 0.5 });
    toast('Лёд под ногами тревожно трещит...', 'warn');
    if (Math.random() < 0.12) {
      WS.Ev.emit('player:fall_water', {});
      toast('Лёд проломился! Вы в ледяной воде!', 'bad');
    }
  }

  // ================================================================ КАРАВАН
  function tryCaravan() {
    if (WS.Time.day() < 20 || WS.Time.day() > 35) return;
    if (isOnce('caravan')) return;
    if (WS.Time.hour() < 11 || WS.Time.hour() > 15) return;
    if (Math.random() > 0.06) return;
    once('caravan');
    var offers = [
      { give: ['wolf_pelt', 2], get: ['meat_cooked', 3], label: '2 волчьих шкуры → 3 куска мяса' },
      { give: ['wolf_pelt', 1], get: ['rifle_round', 5], label: '1 волчья шкура → 5 патронов' },
      { give: ['bear_pelt', 1], get: ['rifle_mosin', 1], label: '1 медвежья шкура → винтовка' },
      { give: ['hare_pelt', 3], get: ['vodka', 2], label: '3 заячьи шкуры → 2 водки' },
      { give: ['deer_pelt', 1], get: ['flour_bag', 2], label: '1 оленья шкура → 2 муки' },
      { give: ['coin_purse', 1], get: ['canned_fish', 4], label: 'кошель → 4 банки рыбы' }
    ];
    if (WS.Events.openTrade) WS.Events.openTrade(offers);
    else toast('По дороге прошёл олений караван ненцев. Помахали вам.', 'info');
    chron('Мимо прошёл караван ненцев');
  }

  // ================================================================ ЗАМЁРЗШИЙ ПУТНИК
  function tryFrozenWanderer() {
    if (WS.Time.day() < 8) return;
    if (isOnce('frozen1') && Math.random() > 0.08) return;
    if (Math.random() > 0.05) return;
    // в лесу
    var px = WS.G.player.x, py = WS.G.player.y;
    if (py > 100) return;   // не в посёлке
    var fx = px + (Math.random() - 0.5) * 30;
    var fy = py + (Math.random() - 0.5) * 30;
    if (fy > 80) return;
    once('frozen1');
    var o = WS.World.addObject({
      x: fx, y: fy, sprName: 'corpse_bandit', solid: false,
      name: 'Замёрзший путник', container: 'personal_body', corpse: true
    });
    if (WS.Loot && WS.Loot.dropItem) WS.Loot.dropItem('letter_old', 1, fx + 0.5, fy);
    toast('В стороне, под ёлкой, — застывший силуэт.', 'info');
  }

  // ================================================================ ВАРОНЬЁ
  function tryCrows() {
    if (Math.random() > 0.04) return;
    // ищем трупы рядом
    var objs = WS.World.query(WS.G.player.x - 15, WS.G.player.y - 15, WS.G.player.x + 15, WS.G.player.y + 15);
    for (var i = 0; i < objs.length; i++) {
      if (objs[i].corpse) {
        var n = 2 + Math.floor(Math.random() * 3);
        for (var k = 0; k < n; k++) {
          if (WS.AI && WS.AI.spawn) {
            WS.AI.spawn('crow', objs[i].x + (Math.random() - 0.5) * 4, objs[i].y + (Math.random() - 0.5) * 4);
          }
        }
        return;
      }
    }
  }

  // ================================================================ ОТТЕПЕЛЬ / МОРОЗ
  function tryWeatherEvent() {
    if (isOnce('thaw') && WS.Time.day() >= 12 && WS.Time.day() <= 20 && !isOnce('thaw') && Math.random() < 0.2) {
      once('thaw');
      if (WS.Weather && WS.Weather.forceTemp) WS.Weather.forceTemp(8, 1);   // +8 на 1 день
      toast('Оттепель. Воздух влажный, снег тяжелеет.', 'info');
      chron('Оттепель');
    }
    if (WS.Time.day() >= 30 && !isOnce('deepfrost') && Math.random() < 0.12) {
      once('deepfrost');
      if (WS.Weather && WS.Weather.forceTemp) WS.Weather.forceTemp(-12, 2);  // -12 на 2 дня
      toast('На север пришёл лютый мороз. Будьте осторожны.', 'bad');
      chron('Лютый мороз ударил');
    }
  }

  // ================================================================ ЗАБЛУДИЛСЯ
  var lost = 0;
  function tryLostInBlizzard(dt) {
    var w = WS.Weather ? WS.Weather.current() : null;
    if (w && w.id === 'blizzard' && !playerInside()) {
      var anyBuilding = false;
      var near = WS.World.query(WS.G.player.x - 30, WS.G.player.y - 30, WS.G.player.x + 30, WS.G.player.y + 30);
      for (var i = 0; i < near.length; i++) {
        if (WS.World.isInside(near[i].x, near[i].y)) { anyBuilding = true; break; }
      }
      if (!anyBuilding) {
        lost += dt;
        if (lost > 40 && lost < 40.2) {
          toast('Метель сбивает с пути. Кажется, вы ходите кругами.', 'warn');
          WS.Cam.kick(3);
        }
        if (lost > 120) {
          WS.G.player.needs.sanity = Math.max(0, WS.G.player.needs.sanity - 8);
        }
      }
    } else {
      lost = 0;
    }
  }

  // ================================================================ ТАЙМЕР
  function eventsTick(dt) {
    if (!WS.G || !WS.G.running || !WS.G.player) return;
    if (WS.Ui && WS.Ui.modal && WS.Ui.modal()) return;
    cooldown -= dt;
    checkTimer += dt;
    if (checkTimer < 5) { dogTick(dt); auroraTick(dt); tryLostInBlizzard(dt); return; }
    checkTimer = 0;
    if (cooldown > 0) { dogTick(5); auroraTick(5); tryLostInBlizzard(5); return; }

    // выбор события по весам
    var day = WS.Time.day();
    var hour = WS.Time.hour();
    var night = hour >= 21 || hour < 6;

    var pool = [];
    pool.push({ fn: trySpawnDog, w: day >= 5 && !dog ? 1.5 : 0 });
    pool.push({ fn: tryAurora, w: day >= 44 && !night ? 0 : (day >= 44 && night ? 4 : 0) });
    pool.push({ fn: tryRoofSnow, w: 1.2 });
    pool.push({ fn: tryKnocker, w: 0.8 });
    pool.push({ fn: tryFeedingGround, w: night ? 0.5 : (hour === 7 ? 1.4 : 0) });
    pool.push({ fn: tryIceCrack, w: 0.6 });
    pool.push({ fn: tryCaravan, w: day >= 20 && day <= 35 && !night ? 1.6 : 0 });
    pool.push({ fn: tryFrozenWanderer, w: day >= 8 && WS.G.player.y < 90 ? 0.7 : 0 });
    pool.push({ fn: tryCrows, w: 0.5 });
    pool.push({ fn: tryWeatherEvent, w: 0.9 });

    var total = 0;
    for (var i = 0; i < pool.length; i++) total += pool[i].w;
    if (total <= 0) return;
    var r = Math.random() * total;
    for (var k = 0; k < pool.length; k++) {
      r -= pool[k].w;
      if (r <= 0) {
        pool[k].fn();
        cooldown = 600;   // общий кулдаун 10 минут
        break;
      }
    }
    dogTick(5);
    auroraTick(5);
  }

  // ================================================================ СПРАЙТ ПСА
  function defDogSprite() {
    var S = WS.Spr;
    S.def('dog', {
      w: 36, h: 24,
      draw: function (c, w, h, f, dir) {
        var bob = (f === 1 || f === 3) ? 1 : 0;
        // тело
        S.px(c, 8, 10 + bob, 18, 8, '#7d7468');
        S.px(c, 10, 8 + bob, 14, 3, '#8f8578');
        // голова
        S.px(c, 24, 8 + bob, 7, 6, '#7d7468');
        S.px(c, 29, 9 + bob, 3, 4, '#6a6258');
        S.px(c, 30, 9 + bob, 1, 1, '#1c1a16');   // нос
        // уши
        S.px(c, 24, 6 + bob, 2, 3, '#6a6258');
        // хвост бубликом
        S.ell(c, 7, 9 + bob, 3, 2, '#8f8578');
        // лапы
        var s1 = f === 1 ? 1 : 0, s2 = f === 3 ? 1 : 0;
        S.px(c, 10, 18, 2, 5 - s1, '#5d564c');
        S.px(c, 14, 18, 2, 5 - s2, '#5d564c');
        S.px(c, 20, 18, 2, 5 - s1, '#5d564c');
        S.px(c, 23, 18, 2, 5 - s2, '#5d564c');
      }
    });
  }

  WS.boot(function initEvents() {
    defDogSprite();
    WS.tick(45, function evTick(dt) { eventsTick(dt); }, 'events:tick');
    // сияние поверх мира, до HUD
    WS.tick(75, function auroraRender() {
      var ctx = WS.Gfx && WS.Gfx.c ? WS.Gfx.c() : null;
      if (ctx) auroraDraw(ctx);
    }, 'events:aurora');
    // слушатель падения в воду (снег, ледяная вода)
    WS.Ev.on('player:fall_water', function () {
      if (WS.Temp && WS.Temp.wetness) {
        // температура сама обработает — просто звук и эффект
        WS.Snd.play('splash', { vol: 0.9 });
        WS.Fx.burst('snow', WS.G.player.x, WS.G.player.y, 16);
        WS.Cam.kick(5);
      }
    });
  }, 'events:init');

  WS.def('Events', {
    // отладочный доступ
    spawnDog: trySpawnDog,
    aurora: function () { return aurora; },
    isLost: function () { return lost; },
    openTrade: function (offers) {
      if (WS.Ui && WS.Ui.confirm) {
        // упрощённая торговля: первый подходящий оффер по кнопке
        var txt = 'Караван ненцев останавливается. Предлагают обмен:\n';
        for (var i = 0; i < offers.length; i++) txt += '— ' + offers[i].label + '\n';
        txt += '\nОбменять всё возможное?';
        WS.Ui.confirm(txt, function (yes) {
          if (!yes) { toast('Вы отказались от торговли.', 'info'); return; }
          var done = 0;
          for (var j = 0; j < offers.length; j++) {
            var o = offers[j];
            var can = true;
            for (var q = 0; q < o.give.length; q += 2) {
              var have = WS.Inv && WS.Inv.count ? WS.Inv.count(o.give[q]) : 0;
              if (have < o.give[q + 1]) { can = false; break; }
            }
            if (!can) continue;
            for (var q2 = 0; q2 < o.give.length; q2 += 2) WS.Inv.take(o.give[q2], o.give[q2 + 1]);
            for (var q3 = 0; q3 < o.get.length; q3 += 2) WS.Inv.give(o.get[q3], o.get[q3 + 1]);
            done++;
          }
          toast(done > 0 ? ('Совершено обменов: ' + done) : 'Нечего предложить.', done > 0 ? 'good' : 'warn');
        });
      }
    }
  });
})();
