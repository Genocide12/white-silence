/**
 * КАРТА ЗВУКОВ: предмет/действие → звук. Центральная таблица соответствий,
 * чтобы системы играли согласованно, а не каждая своё.
 */
(function () {
  'use strict';

  // ================================================================ ДЕЙСТВИЯ
  var ACTIONS = {
    'door.open': 'door',
    'door.close': 'door',
    'door.locked': 'door_locked',
    'door.break': 'window_break',
    'window.break': 'window_break',
    'loot.start': 'build',
    'loot.done': 'pickup',
    'item.pickup': 'pickup',
    'item.drop': 'drop',
    'item.eat': 'eat',
    'item.drink': 'drink',
    'item.read': 'craft',
    'craft.start': 'craft',
    'craft.done': 'levelup',
    'build.start': 'build',
    'build.done': 'build',
    'fire.light': 'match',
    'fire.out': 'fall',
    'fire.add_fuel': 'chop',
    'cook.start': 'splash',
    'cook.done': 'levelup',
    'attack.miss': 'fall',
    'attack.hit': 'hit_flesh',
    'attack.block': 'hit',
    'attack.crit': 'trap_snap',
    'gun.fire': 'gunshot',
    'gun.dry': 'click',
    'gun.reload': 'reload',
    'bow.fire': 'fall',
    'wolf.howl': 'howl',
    'wolf.growl': 'growl',
    'bear.roar': 'bear_roar',
    'animal.flee': 'snow_step_deep',
    'player.hurt': 'hit_flesh',
    'player.heal': 'drink',
    'player.die': 'death',
    'player.sleep': 'fall',
    'player.wake': 'eat',
    'trap.snap': 'trap_snap',
    'water.splash': 'splash',
    'water.freeze': 'trap_snap',
    'level.up': 'levelup',
    'quest.new': 'select',
    'quest.done': 'bell',
    'ui.click': 'click',
    'ui.select': 'select',
    'ui.error': 'error',
    'ui.open': 'select',
    'ui.close': 'click',
    'day.summary': 'bell',
    'night.fall': 'bell',
    'day.dawn': 'bird',
    'radio.on': 'radio_static',
    'radio.msg': 'radio_static',
    'radio.off': 'click'
  };

  // ================================================================ ПРЕДМЕТЫ
  var ITEMS = {
    'axe': 'chop',
    'hatchet': 'chop',
    'axe_small': 'chop',
    'hammer': 'mine',
    'hammer_locksmith': 'mine',
    'shovel': 'mine',
    'saw': 'craft',
    'knife': 'hit',
    'hunting_knife': 'hit',
    'scalpel': 'hit',
    'crowbar': 'mine',
    'crowbar_small': 'mine',
    'pickaxe': 'mine',
    'matches': 'match',
    'flint': 'match',
    'sewing_kit': 'craft',
    'bandage': 'craft',
    'harmonica': 'bell',
    'balalaika': 'bell',
    'radio_crystal': 'radio_static',
    'lantern': 'match',
    'torch': 'match',
    'candle_stump': 'match',
    'watch_silver': 'click',
    'compass_brass': 'click'
  };

  // ================================================================ ТАЙЛЫ/ХОДЬБА
  var TERRAIN = {
    'snow': 'step_snow',
    'snow_deep': 'snow_step_deep',
    'grass': 'step_snow',
    'grass2': 'step_snow',
    'dirt': 'step_snow',
    'road': 'step_snow',
    'road_side': 'step_snow',
    'sidewalk': 'step_wood',
    'gravel': 'step_snow',
    'floor_wood': 'step_wood',
    'floor_tile': 'step_wood',
    'floor_concrete': 'step_wood',
    'floor_dirt': 'step_snow',
    'bridge': 'step_wood',
    'porch': 'step_wood',
    'stairs': 'step_wood',
    'ice': 'step_wood',
    'water': 'splash',
    'mud': 'snow_step_deep'
  };

  /** Проиграть звук действия. */
  function act(action, o) {
    var name = ACTIONS[action];
    if (name && WS.Snd) WS.Snd.play(name, o || {});
    return name;
  }

  /** Звук для предмета. */
  function forItem(itemId, o) {
    var name = ITEMS[itemId];
    if (name && WS.Snd) WS.Snd.play(name, o || {});
    return name;
  }

  /** Звук шага по тайлу. */
  function forTerrain(tileId, o) {
    var T = WS.World && WS.World.T ? WS.World.T : null;
    if (!T) return null;
    var map = {
      10: 'step_snow', 11: 'snow_step_deep', 1: 'step_snow', 2: 'step_snow',
      3: 'step_snow', 4: 'step_snow', 5: 'step_snow', 6: 'step_wood',
      27: 'step_snow', 12: 'step_wood', 13: 'step_wood', 14: 'step_wood',
      15: 'step_snow', 25: 'step_wood', 23: 'step_wood', 22: 'step_wood',
      8: 'step_wood', 7: 'splash', 26: 'snow_step_deep'
    };
    var name = map[tileId];
    if (name && WS.Snd) WS.Snd.play(name, o || {});
    return name;
  }

  // ================================================================ СПРАВОЧНИК ИМЁН
  /** Все зарегистрированные имена звуков (для справки/опций). */
  var ALL_SOUNDS = [
    'click', 'select', 'step_snow', 'step_wood', 'chop', 'mine', 'build',
    'hit', 'hit_flesh', 'death', 'eat', 'drink', 'door', 'door_locked',
    'window_break', 'pickup', 'drop', 'error', 'craft', 'levelup',
    'gunshot', 'reload', 'howl', 'growl', 'bear_roar', 'bird', 'crow',
    'match', 'fall', 'heartbeat', 'victory', 'radio_static', 'bell',
    'splash', 'trap_snap', 'bandit_shout', 'snow_step_deep'
  ];

  WS.boot(function initSoundmap() {
    // перехват события sound:play — уже напрямую; карта для систем:
    // подписываемся на события, играем по карте
    var hooks = {
      'door:open': 'door.open',
      'door:locked': 'door.locked',
      'loot:searched': 'loot.done',
      'item:picked': 'item.pickup',
      'item:crafted': 'craft.done',
      'attack:hit': 'attack.hit',
      'player:levelup': 'level.up'
    };
    for (var ev in hooks) {
      (function (eventName, action) {
        WS.Ev.on(eventName, function (d) {
          // системы могут проиграть своё — карта запасная
          if (d && d._snd) return;
          act(action, d && d.x !== undefined ? d : {});
        });
      })(ev, hooks[ev]);
    }
  }, 'soundmap:init');

  WS.def('Soundmap', {
    act: act,
    forItem: forItem,
    forTerrain: forTerrain,
    ACTIONS: ACTIONS,
    ITEMS: ITEMS,
    TERRAIN: TERRAIN,
    ALL_SOUNDS: ALL_SOUNDS
  });
})();
