/**
 * ТАБЛИЦЫ ЛУТА. WS.Data.loot[tableId] = {rolls: [min, max], items: [{id, w, min, max}]}.
 * w — вес вероятности; min/max — количество за раз. Пустой результат возможен (шанс «ничего» = вес null-итема).
 * Все id сверены с items_seed.js + items_food.js + items_cloth.js.
 */
(function () {
  'use strict';

  function T(rolls, items) { return { rolls: rolls, items: items }; }
  // шорткаты для веса
  function C(id, w, min, max) { return { id: id, w: w, min: min || 1, max: max || min || 1 }; }
  function NOTHING(w) { return { id: null, w: w, min: 0, max: 0 }; }

  var loot = {};

  // ============================================================= КУХНЯ
  loot.kitchen_pech = T([2, 4], [
    C('firewood_bundle', 30, 1, 3),
    C('bread', 8, 1, 1), C('kasha', 6, 1, 1), C('potato', 14, 2, 6), C('onion', 10, 1, 4),
    C('cabbage', 8, 1, 2), C('turnip', 8, 2, 5), C('salt_bag', 6, 1, 1),
    C('cast_iron', 4, 1, 1), C('ladle', 5, 1, 1), C('candle_stump', 6, 1, 3),
    NOTHING(25)
  ]);
  loot.kitchen_table = T([2, 4], [
    C('bread', 10, 1, 2), C('rusk', 14, 2, 6), C('salt_fish', 6, 1, 2),
    C('pickles', 7, 1, 2), C('sauerkraut', 6, 1, 2), C('honey_jar', 3, 1, 1),
    C('spoon_wood', 12, 1, 3), C('bowl_wood', 10, 1, 2),
    C('knife', 5, 1, 1), C('newspaper_stack', 5, 1, 1), NOTHING(20)
  ]);
  loot.kitchen_cupboard = T([3, 5], [
    C('rusk', 16, 2, 8), C('dried_fish', 10, 1, 4), C('galley_biscuits', 8, 2, 5),
    C('semolina', 7, 1, 1), C('oat_flakes', 8, 1, 2), C('sugar_loaf', 6, 1, 1),
    C('tea_brick', 6, 1, 2), C('salt_bag', 8, 1, 1), C('jar_empty', 12, 1, 4),
    C('bottle_empty', 10, 1, 3),
    C('candle_stump', 7, 1, 2), NOTHING(12)
  ]);
  loot.kitchen_shelf = T([2, 4], [
    C('jar_empty', 14, 1, 4), C('bottle_empty', 12, 1, 3),
    C('dried_mushrooms', 8, 1, 3), C('birch_chaga', 6, 1, 2), C('fir_needles', 4, 1, 2),
    NOTHING(22)
  ]);

  // ============================================================= СПАЛЬНЯ
  loot.bedroom_chest = T([2, 4], [
    C('wool_scarf', 10, 1, 1), C('wool_socks', 12, 1, 2), C('wool_mittens', 10, 1, 1),
    C('linen_sheet', 12, 1, 2), C('sewing_kit', 8, 1, 1), C('scrap_metal', 6, 1, 4),
    C('matches', 10, 1, 2), C('candle_stump', 10, 1, 3), C('coin_purse', 4, 1, 1),
    C('harmonica', 2, 1, 1), C('deck_cards', 3, 1, 1), C('photo_family', 4, 1, 1),
    NOTHING(14)
  ]);
  loot.bedroom_wardrobe = T([3, 5], [
    C('ushanka', 8, 1, 1), C('coat_cloth', 10, 1, 1), C('wool_coat', 5, 1, 1),
    C('valenki', 8, 1, 1), C('wool_socks', 14, 1, 2), C('wool_scarf', 12, 1, 1),
    C('rabbit_fur_cap', 5, 1, 1), C('leather_boots', 5, 1, 1), C('child_valenki', 2, 1, 1),
    NOTHING(16)
  ]);
  loot.bedroom_bed = T([1, 2], [
    C('wool_socks', 8, 1, 1), C('letter_old', 10, 1, 1), C('watch_silver', 2, 1, 1),
    C('crucifix_wood', 6, 1, 1), C('matches', 8, 1, 1), C('coin_purse', 3, 1, 1),
    NOTHING(30)
  ]);

  // ============================================================= ГОСТИНАЯ
  loot.living_shelf = T([2, 4], [
    C('book_carpentry', 5, 1, 1), C('book_cook', 4, 1, 1), C('book_tailor', 3, 1, 1),
    C('book_survive', 2, 1, 1), C('book_track', 2, 1, 1), C('book_firearm', 2, 1, 1),
    C('newspaper_stack', 16, 1, 2), C('inkwell', 6, 1, 1), C('letter_old', 8, 1, 2),
    C('photo_family', 5, 1, 1), C('deck_cards', 5, 1, 1), NOTHING(18)
  ]);
  loot.living_crate = T([2, 3], [
    C('rope_coil', 8, 1, 1), C('nails', 20, 4, 20), C('scrap_metal', 14, 1, 6),
    C('hammer', 6, 1, 1), C('saw', 4, 1, 1), C('screwdriver', 6, 1, 1),
    C('pliers', 4, 1, 1), C('wax_block', 5, 1, 2), NOTHING(14)
  ]);
  loot.living_sofa = T([1, 2], [
    C('coin_purse', 4, 1, 1), C('harmonica', 2, 1, 1), C('tobacco_pouch', 6, 1, 1),
    C('matches', 8, 1, 1), NOTHING(35)
  ]);

  // ============================================================= АМБАР / СКЛАД
  loot.barn_hay = T([2, 3], [
    C('sickle', 5, 1, 1), C('scythe', 4, 1, 1), C('pitchfork', 5, 1, 1),
    C('rope_coil', 10, 1, 1), C('burlap_sack', 12, 1, 2),
    C('hay_bale', 20, 1, 3), C('salt_bag', 4, 1, 1), NOTHING(12)
  ]);
  loot.barn_tools = T([2, 4], [
    C('axe', 8, 1, 1), C('axe_small', 10, 1, 1), C('hatchet', 6, 1, 1),
    C('shovel', 8, 1, 1), C('crowbar', 6, 1, 1), C('saw', 7, 1, 1),
    C('nails', 16, 6, 24), C('hammer', 8, 1, 1), C('whetstone', 6, 1, 1),
    C('rope_coil', 8, 1, 2), C('snare_wire', 7, 1, 3), NOTHING(12)
  ]);
  loot.warehouse_crate = T([2, 4], [
    C('plank', 20, 2, 6), C('nails', 16, 6, 30), C('scrap_metal', 12, 2, 8),
    C('rope_coil', 8, 1, 2), C('tar_bucket', 5, 1, 1),
    C('window_glass', 4, 1, 2), C('hinge_iron', 6, 2, 6), NOTHING(12)
  ]);
  loot.warehouse_barrel = T([1, 3], [
    C('salt_bag', 12, 1, 1), C('cabbage', 10, 2, 5), C('pickles', 10, 1, 3),
    C('sauerkraut', 10, 1, 3), C('cranberries_jar', 6, 1, 2), NOTHING(14)
  ]);
  loot.warehouse_sack = T([2, 3], [
    C('semolina', 12, 1, 2), C('oat_flakes', 12, 1, 2), C('flour_bag', 14, 1, 1),
    C('sugar_loaf', 8, 1, 2), C('salt_bag', 8, 1, 1), C('dried_fish', 8, 1, 3),
    NOTHING(12)
  ]);

  // ============================================================= ЛАВКА
  loot.store_counter = T([2, 3], [
    C('coin_purse', 8, 1, 1), C('watch_silver', 2, 1, 1), C('tobacco_pouch', 10, 1, 2),
    C('matches', 14, 1, 3), C('candle_stump', 12, 1, 4), C('lamp_oil', 8, 1, 2),
    NOTHING(14)
  ]);
  loot.store_shelf_food = T([3, 5], [
    C('bread', 10, 1, 2), C('rusk', 14, 2, 6), C('galley_biscuits', 10, 2, 5),
    C('canned_fish', 8, 1, 3), C('salt_fish', 8, 1, 2), C('sugar_loaf', 8, 1, 2),
    C('tea_brick', 8, 1, 2), C('salt_bag', 10, 1, 1), C('semolina', 8, 1, 2),
    C('oat_flakes', 8, 1, 2), C('honey_jar', 4, 1, 1), NOTHING(10)
  ]);
  loot.store_shelf_tools = T([2, 4], [
    C('axe_small', 10, 1, 1), C('hatchet', 6, 1, 1), C('knife', 12, 1, 2),
    C('hunting_knife', 3, 1, 1), C('nails', 14, 8, 30), C('hammer', 8, 1, 1),
    C('saw', 6, 1, 1), C('file_metal', 6, 1, 1), C('screwdriver', 8, 1, 2),
    C('matches', 10, 1, 3), C('sewing_kit', 6, 1, 1), NOTHING(10)
  ]);
  loot.store_shelf_cloth = T([2, 4], [
    C('wool_scarf', 12, 1, 2), C('wool_socks', 14, 1, 2), C('wool_mittens', 12, 1, 1),
    C('ushanka', 8, 1, 1), C('coat_cloth', 6, 1, 1), C('valenki', 6, 1, 1),
    C('linen_sheet', 10, 1, 2), C('leather_boots', 4, 1, 1), NOTHING(12)
  ]);
  loot.store_storage = T([2, 4], [
    C('flour_bag', 14, 1, 2), C('sugar_loaf', 10, 1, 2), C('semolina', 10, 1, 2),
    C('canned_fish', 10, 1, 4), C('salt_bag', 10, 1, 2), C('kerosene', 6, 1, 2),
    C('lamp_oil', 8, 1, 2), C('candle_stump', 12, 2, 6), NOTHING(10)
  ]);

  // ============================================================= ЦЕРКОВЬ
  loot.church_altar = T([1, 2], [
    C('cross_silver', 6, 1, 1), C('candle_stump', 20, 2, 5),
    C('coin_purse', 4, 1, 1), NOTHING(28)
  ]);
  loot.church_candle = T([2, 3], [
    C('candle_stump', 30, 2, 6), C('matches', 10, 1, 2), NOTHING(20)
  ]);

  // ============================================================= ВРАЧ
  loot.doctor_cabinet = T([3, 5], [
    C('bandage_clean', 16, 1, 3), C('bandage', 14, 1, 3), C('iodine_tincture', 12, 1, 2),
    C('carbolic_acid', 10, 1, 2), C('aspirin', 10, 1, 2), C('quinine', 8, 1, 2),
    C('laudanum', 5, 1, 1), C('morphine', 2, 1, 1), C('scalpel', 6, 1, 1),
    C('plaster_cast', 6, 1, 1), C('medical_book', 4, 1, 1), C('vodka', 8, 1, 2),
    NOTHING(10)
  ]);
  loot.doctor_bed = T([1, 2], [
    C('bandage_clean', 12, 1, 2), C('letter_old', 8, 1, 1), C('watch_silver', 3, 1, 1), NOTHING(30)
  ]);

  // ============================================================= ШКОЛА
  loot.school_desk = T([1, 2], [
    C('inkwell', 8, 1, 1), C('newspaper_stack', 10, 1, 1),
    C('letter_old', 6, 1, 1), C('rusk', 8, 1, 2), NOTHING(34)
  ]);
  loot.school_shelf = T([2, 3], [
    C('book_carpentry', 4, 1, 1), C('book_cook', 4, 1, 1), C('book_tailor', 3, 1, 1),
    C('newspaper_stack', 16, 1, 3), C('inkwell', 8, 1, 2), NOTHING(24)
  ]);

  // ============================================================= ТРАКТИР
  loot.tavern_bar = T([2, 4], [
    C('vodka', 16, 1, 3), C('kvass_flask', 12, 1, 2),
    C('bottle_empty', 12, 1, 3), C('tobacco_pouch', 8, 1, 1), C('coin_purse', 5, 1, 1),
    C('harmonica', 3, 1, 1), NOTHING(26)
  ]);
  loot.tavern_table = T([1, 3], [
    C('bread', 10, 1, 2), C('salt_fish', 8, 1, 1), C('pickles', 8, 1, 2),
    C('vodka', 10, 1, 2), C('deck_cards', 4, 1, 1),
    C('tobacco_pouch', 6, 1, 1), NOTHING(28)
  ]);
  loot.tavern_cellar = T([3, 5], [
    C('vodka', 14, 2, 5), C('kvass_flask', 10, 1, 3), C('cabbage', 12, 2, 6),
    C('pickles', 12, 1, 4), C('sauerkraut', 10, 1, 3), C('salt_fish', 8, 1, 3),
    C('honey_jar', 5, 1, 2), C('cranberries_jar', 6, 1, 2), NOTHING(10)
  ]);

  // ============================================================= КУЗНИЦА / ПИЛОРАМА
  loot.smithy_anvil = T([1, 2], [
    C('scrap_metal', 20, 2, 6), C('nails', 14, 6, 20), C('hinge_iron', 8, 2, 4),
    C('horseshoe', 10, 1, 3), C('file_metal', 8, 1, 1), C('hammer', 6, 1, 1), NOTHING(16)
  ]);
  loot.smithy_shelf = T([2, 3], [
    C('scrap_metal', 16, 2, 8), C('nails', 12, 8, 30), C('pliers', 8, 1, 1),
    C('screwdriver', 8, 1, 1), C('whetstone', 8, 1, 1), C('file_metal', 8, 1, 1),
    C('gunpowder', 4, 1, 2), C('bullet_cast', 6, 4, 12), NOTHING(12)
  ]);
  loot.sawmill_workbench = T([2, 4], [
    C('plank', 22, 3, 8), C('saw', 10, 1, 1), C('nails', 14, 8, 30),
    C('hammer', 8, 1, 1), C('axe', 6, 1, 1), C('hatchet', 8, 1, 1),
    C('rope_coil', 8, 1, 1), C('wood_glue', 4, 1, 1), NOTHING(12)
  ]);

  // ============================================================= ЖИТНИЦА / КОНЮШНЯ
  loot.granary_sack = T([2, 4], [
    C('flour_bag', 16, 1, 2), C('semolina', 14, 1, 2), C('oat_flakes', 14, 1, 2),
    C('salt_bag', 6, 1, 1), NOTHING(10)
  ]);
  loot.stable_rack = T([2, 3], [
    C('rope_coil', 10, 1, 2), C('hay_bale', 16, 1, 3),
    C('horseshoe', 8, 1, 2), C('lantern', 4, 1, 1), C('kerosene', 6, 1, 1), NOTHING(22)
  ]);

  // ============================================================= ОКОЛОТОК / ВЫШКА
  loot.jail_locker = T([2, 3], [
    C('pistol_nagant', 3, 1, 1), C('rifle_round', 8, 3, 10), C('shell', 4, 2, 6),
    C('lantern', 6, 1, 1), C('vodka', 8, 1, 2),
    C('rusk', 8, 2, 4), C('nails', 8, 6, 16), NOTHING(18)
  ]);
  loot.guardtower_locker = T([2, 4], [
    C('rifle_mosin', 4, 1, 1), C('shotgun', 3, 1, 1), C('rifle_round', 12, 4, 12),
    C('shell', 6, 2, 8), C('lantern', 8, 1, 1), C('kerosene', 8, 1, 2),
    C('coat_fur', 6, 1, 1), C('mittens', 8, 1, 1), C('vodka', 8, 1, 2), NOTHING(12)
  ]);

  // ============================================================= ВОКЗАЛ / ДАЧА / ПРИСТАНЬ
  loot.telegraph_desk = T([2, 4], [
    C('letter_old', 16, 1, 3), C('newspaper_stack', 14, 1, 3), C('inkwell', 12, 1, 2),
    C('watch_silver', 3, 1, 1), C('map_old', 4, 1, 1),
    C('matches', 8, 1, 2), NOTHING(22)
  ]);
  loot.dacha_chest = T([2, 4], [
    C('wool_coat', 8, 1, 1), C('wool_scarf', 10, 1, 2),
    C('watch_silver', 3, 1, 1), C('photo_family', 6, 1, 1), C('harmonica', 3, 1, 1),
    C('tea_brick', 8, 1, 2), C('sugar_loaf', 8, 1, 1), C('vodka', 8, 1, 2), NOTHING(20)
  ]);
  loot.boat_supply = T([2, 4], [
    C('rope_coil', 14, 1, 2), C('hook_line', 12, 1, 3), C('fishing_rod', 6, 1, 1),
    C('tar_bucket', 8, 1, 1), C('fresh_fish', 10, 1, 3), C('salt_fish', 8, 1, 2),
    C('galley_biscuits', 8, 1, 3), C('kerosene', 8, 1, 2), C('lantern', 6, 1, 1), NOTHING(12)
  ]);
  loot.fishing_rack = T([2, 4], [
    C('fresh_fish', 14, 1, 3), C('salt_fish', 12, 1, 3), C('dried_fish', 12, 1, 3),
    C('hook_line', 12, 1, 3), C('rope_coil', 8, 1, 1), C('fishing_rod', 4, 1, 1),
    C('knife', 6, 1, 1), NOTHING(12)
  ]);

  // ============================================================= ПОГРЕБ / РУИНЫ / СХРОН
  loot.cellar_veg = T([3, 6], [
    C('potato', 22, 3, 10), C('cabbage', 16, 2, 5), C('turnip', 16, 3, 8),
    C('onion', 14, 2, 6), C('carrot', 14, 2, 6), C('pickles', 12, 1, 4),
    C('sauerkraut', 12, 1, 3), C('cranberries_jar', 8, 1, 3), C('honey_jar', 4, 1, 1),
    C('dried_mushrooms', 8, 1, 3), C('apple_dried', 8, 1, 3), NOTHING(8)
  ]);
  loot.ruined_debris = T([2, 4], [
    C('scrap_metal', 18, 2, 8), C('nails', 14, 6, 20), C('charcoal_bag', 10, 1, 2),
    C('plank', 12, 2, 5), C('bottle_empty', 10, 1, 3),
    C('cloth_rag', 12, 1, 4), C('rusk', 4, 1, 2), C('bone_old', 6, 1, 2), NOTHING(30)
  ]);
  loot.ranger_cache = T([3, 5], [
    C('rifle_mosin', 6, 1, 1), C('rifle_round', 16, 6, 20), C('hunting_knife', 10, 1, 1),
    C('snare_wire', 12, 2, 5), C('matches', 14, 2, 4), C('meat_cooked', 10, 1, 3),
    C('dried_fish', 10, 1, 3), C('bearskin_rug', 3, 1, 1), C('book_track', 6, 1, 1),
    C('book_survive', 6, 1, 1), C('tea_brick', 8, 1, 2), C('vodka', 8, 1, 2), NOTHING(10)
  ]);

  // ============================================================= ТРУПЫ
  loot.personal_body = T([2, 4], [
    C('coat_cloth', 14, 1, 1), C('ushanka', 10, 1, 1), C('valenki', 8, 1, 1),
    C('matches', 12, 1, 2), C('rusk', 12, 1, 3), C('vodka', 10, 1, 1),
    C('watch_silver', 3, 1, 1), C('letter_old', 8, 1, 2), C('coin_purse', 6, 1, 1),
    C('knife', 8, 1, 1), NOTHING(12)
  ]);
  loot.wolf_body = T([1, 2], [
    C('wolf_pelt', 22, 1, 1), C('fat', 18, 1, 2), C('meat_raw', 20, 1, 3),
    C('sinew', 16, 2, 4), C('bone_old', 12, 1, 3), NOTHING(6)
  ]);
  loot.bear_body = T([2, 3], [
    C('bear_pelt', 24, 1, 1), C('fat', 22, 2, 4), C('meat_raw', 22, 3, 8),
    C('sinew', 12, 2, 5), C('bone_old', 10, 2, 4), NOTHING(6)
  ]);
  loot.deer_body = T([1, 3], [
    C('deer_pelt', 22, 1, 1), C('meat_raw', 24, 2, 6), C('sinew', 16, 2, 4),
    C('fat', 10, 1, 2), C('bone_old', 12, 1, 3), NOTHING(6)
  ]);
  loot.hare_body = T([1, 1], [
    C('hare_pelt', 30, 1, 1), C('meat_raw', 30, 1, 1), C('sinew', 20, 1, 1), NOTHING(10)
  ]);
  loot.bandit_body = T([2, 4], [
    C('rifle_mosin', 8, 1, 1), C('pistol_nagant', 4, 1, 1), C('rifle_round', 14, 3, 10),
    C('shell', 6, 2, 5), C('knife', 10, 1, 1), C('vodka', 12, 1, 2),
    C('bread', 10, 1, 2), C('coat_cloth', 12, 1, 1), C('ushanka', 10, 1, 1),
    C('matches', 10, 1, 2), C('watch_silver', 3, 1, 1), C('letter_old', 6, 1, 1), NOTHING(8)
  ]);
  loot.crow_body = T([1, 1], [
    C('meat_raw', 40, 1, 1), C('feather_bunch', 30, 1, 2), NOTHING(30)
  ]);

  // ============================================================= ДОМ: ОБЩИЕ (запасные)
  loot.house_generic = T([2, 4], [
    C('cloth_rag', 16, 1, 4), C('matches', 12, 1, 2), C('candle_stump', 12, 1, 3),
    C('nails', 10, 4, 12), C('rusk', 10, 1, 3), C('bottle_empty', 10, 1, 2), NOTHING(12)
  ]);

  WS.boot(function () {
    WS.Data = WS.Data || {};
    WS.Data.loot = WS.Data.loot || {};
    for (var k in loot) WS.Data.loot[k] = loot[k];
  }, 'loot:tables');
})();
