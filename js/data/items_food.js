/**
 * ПРЕДМЕТЫ: еда, напитки, медикаменты, материалы, одежда, разное — расширение items_seed.js.
 * Регистрация в WS.Data.items внутри boot (тот же паттерн, что в items_seed.js).
 */
(function () {
  'use strict';

  function def(items, o) { items[o.id] = o; }

  function build() {
    var it = {};

    // ===== ЕДА (мясо и приготовленное) =====
    def(it, { id: 'meat_raw', cat: 'food', w: 0.45, stack: 6, cal: 700, thir: -10, per: 3, cook: 'meat_cooked', sick: 30, tags: ['perishable', 'edible', 'cookable', 'wolf_bait'] });
    def(it, { id: 'meat_cooked', cat: 'food', w: 0.4, stack: 6, cal: 900, thir: -8, per: 4, tags: ['edible'] });
    def(it, { id: 'lard_piece', cat: 'food', w: 0.3, stack: 5, cal: 1800, thir: -12, per: 30, tags: ['perishable', 'edible'] });
    def(it, { id: 'pelmeni', cat: 'food', w: 0.5, stack: 4, cal: 1100, thir: -8, per: 5, cook: null, tags: ['perishable', 'edible', 'cookable'] });
    def(it, { id: 'sauerkraut', cat: 'food', w: 0.5, stack: 4, cal: 300, thir: -5, per: 60, tags: ['edible'] });
    def(it, { id: 'pickles', cat: 'food', w: 0.4, stack: 4, cal: 200, thir: -15, per: 90, tags: ['edible'] });
    def(it, { id: 'honey_jar', cat: 'food', w: 0.4, stack: 3, cal: 1200, thir: -5, per: 0, tags: ['edible'] });
    def(it, { id: 'dried_mushrooms', cat: 'food', w: 0.05, stack: 10, cal: 350, thir: -10, per: 0, tags: ['edible'] });
    def(it, { id: 'birch_chaga', cat: 'food', w: 0.1, stack: 8, cal: 50, thir: 5, per: 0, tags: ['edible'], heal: 3 });
    def(it, { id: 'semolina', cat: 'food', w: 0.9, stack: 3, cal: 1300, thir: -20, per: 120, cook: 'kasha', tags: ['edible', 'cookable'] });
    def(it, { id: 'kasha', cat: 'food', w: 0.8, stack: 3, cal: 1400, thir: -10, per: 2, tags: ['perishable', 'edible'] });
    def(it, { id: 'oat_flakes', cat: 'food', w: 0.6, stack: 4, cal: 1100, thir: -18, per: 150, cook: 'kasha', tags: ['edible', 'cookable'] });
    def(it, { id: 'salt_bag', cat: 'food', w: 0.8, stack: 3, cal: 0, thir: 30, per: 0, tags: [] });
    def(it, { id: 'sugar_loaf', cat: 'food', w: 0.7, stack: 4, cal: 1600, thir: -25, per: 0, tags: ['edible'] });
    def(it, { id: 'tea_brick', cat: 'food', w: 0.3, stack: 6, cal: 0, thir: 35, per: 0, sanity: 8, tags: ['drinkable'] });
    def(it, { id: 'milk_bottle', cat: 'drink', w: 0.9, stack: 2, cal: 600, thir: 40, per: 2, tags: ['perishable', 'drinkable'] });
    def(it, { id: 'kvass_flask', cat: 'drink', w: 1.0, stack: 1, cal: 300, thir: 50, per: 8, tags: ['perishable', 'drinkable'] });
    def(it, { id: 'galley_biscuits', cat: 'food', w: 0.2, stack: 8, cal: 500, thir: -16, per: 0, tags: ['edible'] });
    def(it, { id: 'butter_wheel', cat: 'food', w: 0.5, stack: 3, cal: 1600, thir: -8, per: 10, tags: ['perishable', 'edible'] });

    // ===== Табак и мелочи =====
    def(it, { id: 'tobacco_pouch', cat: 'misc', w: 0.15, stack: 4, sanity: 6, uses: 10, tags: [] });
    def(it, { id: 'tobacco_pipe', cat: 'misc', w: 0.2, stack: 1, tags: [] });
    def(it, { id: 'deck_cards', cat: 'misc', w: 0.15, stack: 1, sanity: 4, tags: [] });
    def(it, { id: 'harmonica', cat: 'misc', w: 0.25, stack: 1, sanity: 12, tags: [] });
    def(it, { id: 'newspaper_stack', cat: 'misc', w: 0.4, stack: 3, tags: ['tinder', 'readable'] });
    def(it, { id: 'letter_old', cat: 'book', w: 0.02, stack: 1, note: true, tags: ['readable', 'quest'] });
    def(it, { id: 'photo_family', cat: 'book', w: 0.02, stack: 1, note: true, sanity: 5, tags: ['readable'] });
    def(it, { id: 'medal_bravery', cat: 'misc', w: 0.05, stack: 1, tags: [] });
    def(it, { id: 'cross_silver', cat: 'misc', w: 0.05, stack: 1, sanity: 10, tags: [] });
    def(it, { id: 'crucifix_wood', cat: 'misc', w: 0.1, stack: 1, sanity: 6, tags: [] });
    def(it, { id: 'watch_silver', cat: 'misc', w: 0.08, stack: 1, tags: [] });
    def(it, { id: 'coin_purse', cat: 'misc', w: 0.15, stack: 1, tags: ['bandit_valuable'] });

    // ===== Инструменты и материалы =====
    def(it, { id: 'rope_coil', cat: 'material', w: 1.2, stack: 2, tags: [] });
    def(it, { id: 'hook_line', cat: 'tool', w: 0.1, stack: 4, tags: ['fishing'] });
    def(it, { id: 'snare_wire', cat: 'tool', w: 0.15, stack: 6, tags: ['trapping'] });
    def(it, { id: 'tar_bucket', cat: 'material', w: 2.0, stack: 2, tags: [] });
    def(it, { id: 'linen_sheet', cat: 'material', w: 0.4, stack: 4, tags: ['sewing'] });
    def(it, { id: 'firewood_bundle', cat: 'fuel', w: 3.0, stack: 6, tags: ['fuel_wood'] });
    def(it, { id: 'charcoal_bag', cat: 'fuel', w: 1.5, stack: 4, tags: ['fuel_wood'] });
    def(it, { id: 'lamp_oil', cat: 'fuel', w: 0.8, stack: 4, tags: ['fuel'] });
    def(it, { id: 'candle_stump', cat: 'light', w: 0.08, stack: 6, light: 28, fuelH: 3, tags: ['light'] });
    def(it, { id: 'inkwell', cat: 'misc', w: 0.15, stack: 2, tags: [] });
    def(it, { id: 'fir_needles', cat: 'material', w: 0.1, stack: 10, tags: ['tea_mat'] });

    // ===== Одежда =====
    def(it, { id: 'wool_scarf', cat: 'cloth', w: 0.2, stack: 1, slots: ['head'], warm: 12, wind: 25, wet: 50, def: 1, tags: [] });
    def(it, { id: 'wool_socks', cat: 'cloth', w: 0.1, stack: 2, slots: ['feet'], warm: 10, wind: 10, wet: 40, def: 0, tags: [] });
    def(it, { id: 'wool_mittens', cat: 'cloth', w: 0.15, stack: 1, slots: ['hands'], warm: 15, wind: 30, wet: 45, def: 1, tags: [] });
    def(it, { id: 'rabbit_fur_cap', cat: 'cloth', w: 0.25, stack: 1, slots: ['head'], warm: 25, wind: 45, wet: 35, def: 2, tags: [] });
    def(it, { id: 'wool_coat', cat: 'cloth', w: 2.5, stack: 1, slots: ['torso'], warm: 45, wind: 65, wet: 55, def: 5, tags: [] });
    def(it, { id: 'leather_boots', cat: 'cloth', w: 1.2, stack: 1, slots: ['feet'], warm: 15, wind: 35, wet: 70, def: 3, tags: [] });
    def(it, { id: 'bearskin_rug', cat: 'cloth', w: 4.0, stack: 1, warm: 30, wind: 0, wet: 20, def: 0, tags: [] });
    def(it, { id: 'child_valenki', cat: 'cloth', w: 0.4, stack: 1, warm: 15, wind: 20, wet: 15, def: 0, tags: ['quest'] });

    // ===== Медикаменты (врач, аптека) =====
    def(it, { id: 'bandage_clean', cat: 'med', w: 0.1, stack: 8, heal: 20, stopBleed: true, tags: ['heal'] });
    def(it, { id: 'carbolic_acid', cat: 'med', w: 0.2, stack: 3, disinfect: 40, tags: ['heal'] });
    def(it, { id: 'iodine_tincture', cat: 'med', w: 0.1, stack: 4, disinfect: 55, tags: ['heal'] });
    def(it, { id: 'quinine', cat: 'med', w: 0.03, stack: 8, cures: 'fever', tags: ['heal'] });
    def(it, { id: 'laudanum', cat: 'med', w: 0.05, stack: 5, painkill: 60, sanity: 10, tags: ['heal'] });
    def(it, { id: 'plaster_cast', cat: 'med', w: 0.6, stack: 2, cures: 'fracture', tags: ['heal'] });
    def(it, { id: 'scalpel', cat: 'tool', w: 0.15, stack: 1, dmg: 6, range: 0.7, atkSpd: 1.9, crit: 22, tags: ['cutting', 'surgery', 'weapon'] });
    def(it, { id: 'medical_book', cat: 'book', w: 1.0, stack: 1, skill: 'medic', pages: 40, tags: ['readable'] });

    // ===== Книги навыков =====
    def(it, { id: 'book_cook', cat: 'book', w: 0.8, stack: 1, skill: 'cook', pages: 25, tags: ['readable'] });
    def(it, { id: 'book_tailor', cat: 'book', w: 0.8, stack: 1, skill: 'tailor', pages: 25, tags: ['readable'] });
    def(it, { id: 'book_survive', cat: 'book', w: 0.8, stack: 1, skill: 'survive', pages: 35, tags: ['readable'] });
    def(it, { id: 'book_track', cat: 'book', w: 0.8, stack: 1, skill: 'track', pages: 20, tags: ['readable'] });
    def(it, { id: 'book_firearm', cat: 'book', w: 0.8, stack: 1, skill: 'firearm', pages: 20, tags: ['readable'] });

    // ===== Патроны россыпью, детали =====
    def(it, { id: 'gunpowder', cat: 'material', w: 0.3, stack: 6, tags: [] });
    def(it, { id: 'bullet_cast', cat: 'material', w: 0.02, stack: 60, tags: [] });
    def(it, { id: 'wadding', cat: 'material', w: 0.02, stack: 40, tags: ['tinder'] });
    def(it, { id: 'sledge', cat: 'tool', w: 8.0, stack: 1, carry: 40, tags: ['sledge'] });
    def(it, { id: 'skis', cat: 'tool', w: 4.0, stack: 1, tags: ['skis'] });
    def(it, { id: ' compass_brass', cat: 'misc', w: 0.1, stack: 1, tags: [] });
    def(it, { id: 'compass_brass', cat: 'misc', w: 0.1, stack: 1, tags: [] });
    def(it, { id: 'map_old', cat: 'book', w: 0.1, stack: 1, tags: ['readable', 'quest'] });
    def(it, { id: 'axe_small', cat: 'tool', w: 0.9, stack: 1, dmg: 12, range: 1.0, atkSpd: 1.3, knock: 4, crit: 6, tags: ['chopping', 'weapon'] });
    def(it, { id: 'pitchfork', cat: 'weapon', w: 2.2, stack: 1, dmg: 18, range: 1.7, atkSpd: 0.9, knock: 6, crit: 8, twoHand: true, tags: ['weapon'] });
    def(it, { id: 'whetstone', cat: 'tool', w: 0.3, stack: 1, tags: ['sharpen'] });
    def(it, { id: 'file_metal', cat: 'tool', w: 0.3, stack: 1, tags: ['metalwork'] });
    def(it, { id: 'pliers', cat: 'tool', w: 0.4, stack: 1, tags: ['metalwork'] });
    def(it, { id: 'screwdriver', cat: 'tool', w: 0.2, stack: 1, dmg: 4, range: 0.6, atkSpd: 2.0, crit: 10, tags: ['weapon'] });

    return it;
  }

  WS.boot(function () {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var items = build();
    for (var k in items) WS.Data.items[k] = items[k];
  }, 'items:food2');
})();
