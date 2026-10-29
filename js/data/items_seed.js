/**
 * СХЕМА ПРЕДМЕТА + стартовый набор (контракт для всех датафайлов).
 *
 * WS.Data.items[id] = {
 *   id: 'bread',          // ключ
 *   cat: 'food',          // food|drink|med|tool|weapon|ranged|ammo|cloth|material|book|light|fuel|container|misc
 *   w: 0.3,               // вес кг
 *   stack: 10,            // максимальный стак (default 1)
 *   // еда:
 *   cal: 1200,            // ккал (восполняет hunger)
 *   thir: -10,            // изменение жажды (питьё: +30..+60)
 *   per: 5,               // дней до порчи (0 = не портится)
 *   cook: 'toast',        // во что превращается при готовке
 *   sick: 10,             // шанс отравления %, если не приготовлено/испорчено
 *   // оружие:
 *   dmg: 12, range: 1.2, atkSpd: 1.2, knock: 4, crit: 5, twoHand: false,
 *   // ranged:
 *   ranged: true, ammo: 'rifle_round', mag: 4, accuracy: 60, noise: 40,
 *   // одежда:
 *   slots: ['torso'],     // слоты экипировки
 *   warm: 35,             // теплоизоляция 0..100
 *   wind: 60,             // ветрозащита 0..100
 *   wet: 40,              // влагозащита
 *   def: 5,               // защита от урона
 *   // свет:
 *   light: 70,            // радиус света в тайлах
 *   fuelH: 4,             // часов горения на 1 ед. топлива
 *   fuel: 'kerosene',
 *   // теги:
 *   tags: ['perishable', 'edible']
 * }
 *
 * Локализация: item.<id>.name / item.<id>.desc.
 * Допустимые теги: perishable, edible, drinkable, cookable, heal, firestarter,
 * digging, chopping, cutting, sewing, fishing, bait, warm_when_wet, noise_scare,
 * wolf_bait, bandit_valuable, quest, fuel_wood, tinder, waterproof, container_loot.
 */
(function () {
  'use strict';

  var items = {};

  function def(o) {
    if (!o || !o.id) return;
    items[o.id] = o;
  }

  // ---- ЭДА И ПИТЬЁ (примеры контракта; полный набор — data/items_food.js) ----
  def({ id: 'bread', cat: 'food', w: 0.4, stack: 5, cal: 1300, thir: -8, per: 6, cook: 'toast', tags: ['perishable', 'edible', 'cookable'] });
  def({ id: 'toast', cat: 'food', w: 0.35, stack: 5, cal: 1100, thir: -10, per: 9, tags: ['edible'] });
  def({ id: 'rusk', cat: 'food', w: 0.12, stack: 20, cal: 400, thir: -14, per: 0, tags: ['edible'] });
  def({ id: 'water_flask', cat: 'drink', w: 0.9, stack: 1, thir: 55, per: 0, tags: ['drinkable'] });
  def({ id: 'canned_fish', cat: 'food', w: 0.35, stack: 10, cal: 900, thir: 5, per: 0, tags: ['edible'] });
  def({ id: 'salt_fish', cat: 'food', w: 0.5, stack: 5, cal: 800, thir: -25, per: 20, tags: ['perishable', 'edible'] });
  def({ id: 'fresh_fish', cat: 'food', w: 0.6, stack: 3, cal: 700, thir: -6, per: 3, cook: 'cooked_fish', sick: 35, tags: ['perishable', 'edible', 'cookable'] });
  def({ id: 'cooked_fish', cat: 'food', w: 0.5, stack: 5, cal: 850, thir: -4, per: 4, tags: ['edible'] });
  def({ id: 'dried_fish', cat: 'food', w: 0.25, stack: 12, cal: 600, thir: -15, per: 40, tags: ['edible'] });

  // ---- МАТЕРИАЛЫ ----
  def({ id: 'log', cat: 'material', w: 6.0, stack: 4, tags: ['fuel_wood'] });
  def({ id: 'plank', cat: 'material', w: 2.0, stack: 8, tags: ['fuel_wood', 'carpentry'] });
  def({ id: 'nails', cat: 'material', w: 0.01, stack: 100, tags: [] });
  def({ id: 'rope', cat: 'material', w: 0.8, stack: 4, tags: [] });
  def({ id: 'scrap_metal', cat: 'material', w: 0.4, stack: 30, tags: [] });
  def({ id: 'cloth_rag', cat: 'material', w: 0.15, stack: 12, tags: ['tinder'] });
  def({ id: 'sinew', cat: 'material', w: 0.05, stack: 20, tags: ['sewing'] });
  def({ id: 'wolf_pelt', cat: 'material', w: 2.5, stack: 3, tags: ['tailor'] });
  def({ id: 'bear_pelt', cat: 'material', w: 5.0, stack: 2, tags: ['tailor'] });
  def({ id: 'fat', cat: 'material', w: 0.5, stack: 8, tags: ['fuel_wood', 'cook_mat'] });
  def({ id: 'charcoal', cat: 'material', w: 0.3, stack: 20, tags: ['fuel_wood'] });

  // ---- ИНСТРУМЕНТЫ ----
  def({ id: 'axe', cat: 'tool', w: 2.2, stack: 1, dmg: 22, range: 1.3, atkSpd: 0.9, knock: 8, crit: 8, tags: ['chopping', 'weapon'] });
  def({ id: 'hatchet', cat: 'tool', w: 1.2, stack: 1, dmg: 15, range: 1.1, atkSpd: 1.2, knock: 5, crit: 6, tags: ['chopping', 'weapon'] });
  def({ id: 'hammer', cat: 'tool', w: 1.0, stack: 1, dmg: 12, range: 1.0, atkSpd: 1.1, knock: 9, crit: 4, tags: ['carpentry', 'weapon'] });
  def({ id: 'saw', cat: 'tool', w: 1.1, stack: 1, tags: ['carpentry'] });
  def({ id: 'knife', cat: 'tool', w: 0.3, stack: 1, dmg: 8, range: 0.8, atkSpd: 1.8, knock: 1, crit: 15, tags: ['cutting', 'weapon', 'cooking'] });
  def({ id: 'hunting_knife', cat: 'tool', w: 0.4, stack: 1, dmg: 12, range: 0.8, atkSpd: 1.6, knock: 2, crit: 20, tags: ['cutting', 'weapon', 'skinning'] });
  def({ id: 'matches', cat: 'tool', w: 0.05, stack: 30, tags: ['firestarter'] });
  def({ id: 'flint', cat: 'tool', w: 0.1, stack: 1, tags: ['firestarter'] });
  def({ id: 'sewing_kit', cat: 'tool', w: 0.2, stack: 1, uses: 50, tags: ['sewing'] });
  def({ id: 'shovel', cat: 'tool', w: 1.8, stack: 1, dmg: 10, range: 1.0, atkSpd: 0.8, knock: 6, tags: ['digging', 'weapon'] });
  def({ id: 'crowbar', cat: 'tool', w: 1.5, stack: 1, dmg: 14, range: 1.0, atkSpd: 1.0, knock: 10, crit: 3, tags: ['prying', 'weapon'] });
  def({ id: 'ice_pick', cat: 'tool', w: 1.0, stack: 1, tags: ['ice'] });
  def({ id: 'fishing_rod', cat: 'tool', w: 1.4, stack: 1, tags: ['fishing'] });

  // ---- ОРУЖИЕ ----
  def({ id: 'rifle_mosin', cat: 'ranged', w: 4.0, stack: 1, ranged: true, ammo: 'rifle_round', mag: 5, dmg: 70, accuracy: 62, noise: 100, twoHand: true, tags: ['weapon'] });
  def({ id: 'shotgun', cat: 'ranged', w: 3.5, stack: 1, ranged: true, ammo: 'shell', mag: 2, dmg: 55, accuracy: 48, noise: 110, twoHand: true, tags: ['weapon'] });
  def({ id: 'pistol_nagant', cat: 'ranged', w: 0.8, stack: 1, ranged: true, ammo: 'rifle_round', mag: 7, dmg: 32, accuracy: 55, noise: 85, tags: ['weapon'] });
  def({ id: 'rifle_round', cat: 'ammo', w: 0.02, stack: 60, tags: [] });
  def({ id: 'shell', cat: 'ammo', w: 0.05, stack: 24, tags: [] });
  def({ id: 'bow_hunting', cat: 'ranged', w: 1.0, stack: 1, ranged: true, ammo: 'arrow', mag: 1, dmg: 28, accuracy: 44, noise: 8, twoHand: true, tags: ['weapon'] });
  def({ id: 'arrow', cat: 'ammo', w: 0.04, stack: 20, tags: [] });
  def({ id: 'spear', cat: 'weapon', w: 2.5, stack: 1, dmg: 26, range: 1.9, atkSpd: 0.7, knock: 7, crit: 10, twoHand: true, tags: ['weapon'] });
  def({ id: 'torch', cat: 'light', w: 0.5, stack: 1, light: 55, fuelH: 1.5, fuel: 'log', dmg: 8, range: 1.0, atkSpd: 1.2, knock: 12, tags: ['weapon', 'light', 'noise_scare'] });
  def({ id: 'lantern', cat: 'light', w: 1.2, stack: 1, light: 85, fuelH: 6, fuel: 'kerosene', tags: ['light'] });
  def({ id: 'kerosene', cat: 'fuel', w: 0.4, stack: 5, tags: ['fuel'] });

  // ---- ОДЕЖДА (стартовая база; полная — data/items_cloth.js) ----
  def({ id: 'ushanka', cat: 'cloth', w: 0.4, stack: 1, slots: ['head'], warm: 30, wind: 55, wet: 40, def: 2, tags: [] });
  def({ id: 'coat_fur', cat: 'cloth', w: 3.0, stack: 1, slots: ['torso'], warm: 60, wind: 75, wet: 55, def: 8, tags: [] });
  def({ id: 'coat_cloth', cat: 'cloth', w: 2.0, stack: 1, slots: ['torso'], warm: 35, wind: 55, wet: 60, def: 3, tags: [] });
  def({ id: 'valenki', cat: 'cloth', w: 1.0, stack: 1, slots: ['feet'], warm: 35, wind: 40, wet: 20, def: 2, tags: [] });
  def({ id: 'mittens', cat: 'cloth', w: 0.2, stack: 1, slots: ['hands'], warm: 18, wind: 35, wet: 30, def: 1, tags: [] });

  // ---- МЕДИЦИНА ----
  def({ id: 'bandage', cat: 'med', w: 0.1, stack: 6, heal: 12, stopBleed: true, tags: ['heal'] });
  def({ id: 'vodka', cat: 'med', w: 0.7, stack: 3, thir: -30, cal: 200, painkill: 30, drunk: 20, tags: ['drinkable', 'disinfect'] });
  def({ id: 'aspirin', cat: 'med', w: 0.02, stack: 12, painkill: 25, tags: ['heal'] });
  def({ id: 'morphine', cat: 'med', w: 0.02, stack: 3, painkill: 90, tags: ['heal'] });

  // ---- КНИГИ ----
  def({ id: 'book_carpentry', cat: 'book', w: 0.8, stack: 1, skill: 'carpentry', pages: 30, tags: ['readable'] });
  def({ id: 'book_medic', cat: 'book', w: 0.8, stack: 1, skill: 'medic', pages: 30, tags: ['readable'] });
  def({ id: 'journal_page', cat: 'book', w: 0.02, stack: 1, note: true, tags: ['readable', 'quest'] });

  WS.boot(function () {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    for (var k in items) WS.Data.items[k] = items[k];
  }, 'items:seed');

  WS.def('DataItemsSeed', { def: def, seed: items });
})();
