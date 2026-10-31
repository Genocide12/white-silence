/**
 * КАЧЕСТВО ЖИЗНИ: мелкие удобства интерфейса.
 * Подписи при наведении (имена объектов/сущностей), ярлыки взаимодействия,
 * быстрые действия на колесе, подсказки состояния рядом с полосами.
 */
(function () {
  'use strict';

  var labelEl = null;
  var hintEl = null;

  function ensureEls() {
    if (labelEl) return;
    var root = document.getElementById('ui-root');
    if (!root) return;
    labelEl = document.createElement('div');
    labelEl.id = 'ws-hover-label';
    labelEl.style.cssText =
      'position:fixed;z-index:350;pointer-events:none;display:none;' +
      'background:rgba(10,14,21,0.85);border:1px solid #2c3a4e;color:#d8dee9;' +
      'padding:3px 9px;font:13px "PT Serif",Georgia,serif;border-radius:2px;';
    root.appendChild(labelEl);

    hintEl = document.createElement('div');
    hintEl.id = 'ws-act-hint';
    hintEl.style.cssText =
      'position:fixed;z-index:349;pointer-events:none;display:none;' +
      'color:#d8a45c;font:13px "PT Serif",Georgia,serif;text-shadow:0 1px 3px rgba(0,0,0,0.9);';
    root.appendChild(hintEl);
  }

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
  }

  /** Что лежит под курсором: объект или сущность. */
  function targetUnderMouse() {
    var m = WS.Input && WS.Input.mouse ? WS.Input.mouse() : null;
    if (!m || !WS.G || !WS.G.running) return null;
    // объекты
    var objs = WS.World.objsAt(m.tx, m.ty);
    var best = null;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o.name) continue;
      if (!best || o.container || o.door) best = o;
    }
    if (best) return { kind: 'obj', o: best };
    // сущности
    var ents = WS.World.entsNear(m.wx, m.wy, 1.2);
    for (var e = 0; e < ents.length; e++) {
      var ent = ents[e];
      if (ent === WS.G.player) continue;
      if (ent.hp !== undefined) return { kind: 'ent', o: ent };
    }
    return null;
  }

  function nameOf(t) {
    if (!t) return '';
    if (t.kind === 'ent') {
      var names = { wolf: 'Волк', bear: 'Медведь-шатун', deer: 'Олень', hare: 'Заяц',
        crow: 'Ворона', bandit: 'Дезертир', dog: 'Пёс', hermit: 'Аким',
        semen: 'Семён', matrena: 'Матрёна', fedor: 'Фёдор' };
      var n = names[t.o.kind];
      if (n) {
        if (t.o.hp !== undefined && t.o.maxHp) {
          n += ' (' + Math.max(0, Math.round(t.o.hp)) + ')';
        }
        return n;
      }
      return t.o.kind || '';
    }
    var o = t.o;
    var s = o.name || '';
    if (o.container && o.looted) s += ' [обыскано]';
    if (o.door) s = o.door.open ? 'Дверь (открыта)' : (o.door.locked ? 'Дверь (заперта)' : 'Дверь');
    if (o.grave) s = 'Могила: ' + o.grave.n;
    if (o.corpse) s = 'Труп';
    return s;
  }

  /** Возможное действие. */
  function actionOf(t) {
    if (!t) return '';
    var m = WS.Input.mouse();
    if (t.kind === 'ent') {
      var d = WS.M.dist(m.wx, m.wy, t.o.x, t.o.y);
      if (d < 1.5) return '[ЛКМ] атаковать';
      return '';
    }
    var o = t.o;
    if (o.door) return '[E] открыть/закрыть';
    if (o.container) return '[E] обыскать';
    if (o.corpse) return '[E] обыскать';
    if (o.forage) return '[E] собрать';
    if (o.grave) return '[ПКМ] прочесть крест';
    return '';
  }

  // ================================================================ ТАЙМЕР
  var tick = 0;

  WS.boot(function initQoL() {
    ensureEls();
    WS.tick(82, function qolTick(dt) {
      if (!WS.G || !WS.G.running) {
        labelEl.style.display = 'none';
        hintEl.style.display = 'none';
        return;
      }
      // обновлять 10 раз/сек достаточно
      tick += dt;
      if (tick < 0.1) return;
      tick = 0;

      var m = WS.Input.mouse ? WS.Input.mouse() : null;
      if (!m || (WS.Ui && WS.Ui.modal && WS.Ui.modal())) {
        labelEl.style.display = 'none';
        hintEl.style.display = 'none';
        return;
      }
      var t = targetUnderMouse();
      var name = nameOf(t);
      if (name) {
        labelEl.textContent = name;
        labelEl.style.display = 'block';
        labelEl.style.left = (m.x + 16) + 'px';
        labelEl.style.top = (m.y + 18) + 'px';
        var act = actionOf(t);
        if (act) {
          hintEl.textContent = act;
          hintEl.style.display = 'block';
          hintEl.style.left = (m.x + 16) + 'px';
          hintEl.style.top = (m.y + 38) + 'px';
        } else {
          hintEl.style.display = 'none';
        }
      } else {
        labelEl.style.display = 'none';
        hintEl.style.display = 'none';
      }
    }, 'qol:hover');

    // ================================================================ БЫСТРЫЕ ДЕЙСТВИЯ
    // Alt+1..5 — быстрые «карманы»: съесть/выпить лучшее
    WS.tick(83, function quickUse() {
      if (!WS.G || !WS.G.running || !WS.G.player) return;
      if (!WS.Input || !WS.Input.keyIsDown) return;
      if (!WS.Input.keyIsDown('AltLeft') && !WS.Input.keyIsDown('AltRight')) return;
      var codes = ['Digit1', 'Digit2', 'Digit3'];
      var actions = ['eat', 'drink', 'heal'];
      for (var i = 0; i < codes.length; i++) {
        if (WS.Input.hitCode(codes[i])) {
          quickAction(actions[i]);
          return;
        }
      }
    }, 'qol:quick');

    // пословица по контексту изредка (если включены hints)
    WS.tick(84, function proverbTick(dt) {
      if (!WS.G || !WS.G.running) return;
      if (WS.Options && !WS.Options.get('hints')) return;
      if (Math.random() > dt / 120) return;   // раз в ~2 минуты в среднем
      var p = WS.Proverbs && WS.Proverbs.contextual ? WS.Proverbs.contextual() : '';
      if (p && WS.Ui && WS.Ui.toast) {
        WS.Ui.toast('«' + p + '»', 'info');
      }
    }, 'qol:proverb');
  }, 'qol:init');

  /** Быстрое действие: eat/drink/heal — лучшее из кармана. */
  function quickAction(kind) {
    var inv = WS.G.player.inv || [];
    var wants = kind === 'eat' ? { cat: 'food', tag: 'edible' } :
                kind === 'drink' ? { cat: 'drink', tag: 'drinkable' } :
                { cat: 'med', tag: 'heal' };
    var bestIdx = -1, bestScore = -1;
    for (var i = 0; i < inv.length; i++) {
      var spec = WS.Data.items ? WS.Data.items[inv[i].id] : null;
      if (!spec) continue;
      if (spec.cat !== wants.cat) continue;
      if (wants.tag && (!spec.tags || spec.tags.indexOf(wants.tag) < 0)) continue;
      // испорченное — не лучший выбор
      var score = (spec.cal || spec.heal || (spec.thir > 0 ? spec.thir : 10));
      if (inv[i].data && inv[i].data.spoiled) score = 1;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx < 0) {
      toast(kind === 'eat' ? 'Нет еды в кармане.' : kind === 'drink' ? 'Нечего пить.' : 'Нет лекарств.', 'warn');
      return;
    }
    var item = inv[bestIdx];
    // использовать
    if (kind === 'eat' && WS.Needs && WS.Needs.eat) {
      WS.Needs.eat(WS.Data.items[item.id]);
      if (WS.Inv && WS.Inv.take) WS.Inv.take(item.id, 1);
      toast('Вы съели: ' + (WS.I18N && WS.I18N.t ? WS.I18N.t('item.' + item.id + '.name') : item.id), 'good');
    } else if (kind === 'drink' && WS.Needs && WS.Needs.drink) {
      WS.Needs.drink(WS.Data.items[item.id]);
      if (WS.Inv && WS.Inv.take) WS.Inv.take(item.id, 1);
      toast('Выпито.', 'good');
    } else if (kind === 'heal' && WS.Health && WS.Health.useMed) {
      WS.Health.useMed(item.id);
    } else {
      toast('Это не к спеху.', 'warn');
    }
  }

  WS.def('QoL', {
    targetUnderMouse: targetUnderMouse,
    nameOf: nameOf,
    actionOf: actionOf,
    quickAction: quickAction
  });
})();
