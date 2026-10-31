/**
 * ИНСТРУМЕНТЫ И ХОЗЯЙСТВО 1917 ГОДА. 45+ предметов: ремесло, лес, дом, бумаги.
 * Регистрация в WS.Data.items + русские названия в словарь.
 */
(function () {
  'use strict';

  function build() {
    var it = {};
    function I(o) { it[o.id] = o; }

    // ============================== РЕМЕСЛО ==============================
    I({ id: 'needle_sewing', cat: 'tool', w: 0.02, stack: 4, tags: ['sewing'] });
    I({ id: 'thimble', cat: 'tool', w: 0.02, stack: 1, tags: ['sewing'] });
    I({ id: 'scissors_tailor', cat: 'tool', w: 0.15, stack: 1, tags: ['sewing'] });
    I({ id: 'file_steel', cat: 'tool', w: 0.25, stack: 1, tags: ['metalwork'] });
    I({ id: 'tongs_smith', cat: 'tool', w: 0.9, stack: 1, tags: ['metalwork', 'fire_proof'] });
    I({ id: 'hammer_locksmith', cat: 'tool', w: 0.7, stack: 1, dmg: 9, range: 0.9, atkSpd: 1.2, knock: 8, crit: 3, tags: ['weapon'] });
    I({ id: 'plane_smooth', cat: 'tool', w: 1.3, stack: 1, tags: ['carpentry'] });
    I({ id: 'chisel_wood', cat: 'tool', w: 0.2, stack: 1, tags: ['carpentry'] });
    I({ id: 'hand_drill', cat: 'tool', w: 0.5, stack: 1, tags: ['carpentry'] });
    I({ id: 'brace_bit', cat: 'tool', w: 0.8, stack: 1, tags: ['carpentry'] });
    I({ id: 'staple_iron', cat: 'material', w: 0.05, stack: 30, tags: ['carpentry'] });
    I({ id: 'crowbar_small', cat: 'tool', w: 0.9, stack: 1, dmg: 11, range: 1.0, atkSpd: 1.1, knock: 8, crit: 4, tags: ['prying', 'weapon'] });
    I({ id: 'axe_handle', cat: 'material', w: 0.7, stack: 3, tags: ['carpentry'] });
    I({ id: 'soldering_lamp', cat: 'tool', w: 1.1, stack: 1, tags: ['metalwork'], light: 30, fuel: 'kerosene', fuelH: 2 });

    // ============================== ЛЕС И ОХОТА ==============================
    I({ id: 'trap_wolf', cat: 'tool', w: 2.2, stack: 2, tags: ['trapping'] });
    I({ id: 'trap_hare', cat: 'tool', w: 0.6, stack: 4, tags: ['trapping'] });
    I({ id: 'snare_loop', cat: 'tool', w: 0.1, stack: 6, tags: ['trapping'] });
    I({ id: 'fish_vertushka', cat: 'tool', w: 1.5, stack: 1, tags: ['fishing'] });
    I({ id: 'net_fishing', cat: 'tool', w: 2.8, stack: 1, tags: ['fishing'] });
    I({ id: 'rifle_sawnoff', cat: 'ranged', w: 2.6, stack: 1, ranged: true, ammo: 'shell', mag: 2, dmg: 42, accuracy: 38, noise: 95, tags: ['weapon'] });
    I({ id: 'ramrod', cat: 'tool', w: 0.3, stack: 1, tags: ['gunsmith'] });
    I({ id: 'oil_can_gun', cat: 'tool', w: 0.4, stack: 1, uses: 40, tags: ['gunsmith'] });
    I({ id: 'gun_case', cat: 'container', w: 1.0, stack: 1, carry: 6, tags: [] });
    I({ id: 'skis_hunting', cat: 'tool', w: 4.5, stack: 1, tags: ['skis'] });
    I({ id: 'deer_call', cat: 'tool', w: 0.3, stack: 1, uses: 20, tags: ['hunting'] });
    I({ id: 'brush_marker', cat: 'tool', w: 0.1, stack: 3, uses: 30, tags: ['hunting'] });

    // ============================== ДОМ ==============================
    I({ id: 'yoke', cat: 'tool', w: 1.8, stack: 1, tags: ['carry'] });
    I({ id: 'peel_oven', cat: 'tool', w: 0.8, stack: 1, tags: ['cooking'] });
    I({ id: 'pot_cast', cat: 'tool', w: 2.4, stack: 1, tags: ['cooking'] });
    I({ id: 'pan_skillet', cat: 'tool', w: 1.2, stack: 1, tags: ['cooking'] });
    I({ id: 'samovar_brass', cat: 'tool', w: 3.5, stack: 1, sanity: 4, tags: ['cooking', 'valuable'] });
    I({ id: 'lamp_flashlight', cat: 'light', w: 0.6, stack: 1, light: 75, fuel: 'kerosene', fuelH: 8, tags: ['light'] });
    I({ id: 'glass_spare', cat: 'material', w: 0.3, stack: 4, tags: [] });
    I({ id: 'wicks_pack', cat: 'material', w: 0.1, stack: 8, tags: [] });
    I({ id: 'soap_lump', cat: 'misc', w: 0.3, stack: 4, sanity: 2, tags: [] });
    I({ id: 'washboard', cat: 'tool', w: 1.4, stack: 1, tags: [] });
    I({ id: 'iron_flat', cat: 'tool', w: 3.0, stack: 1, warm: 5, tags: [] });
    // грелка — не лекарство: useMed её честно отвергает (нет мед-эффектов),
    // это бытовая мелочь, греющая бок (warm работает только в постели)
    I({ id: 'hot_water_bottle', cat: 'misc', w: 0.7, stack: 1, warm: 10, tags: [] });

    // ============================== БУМАГИ ==============================
    I({ id: 'passport', cat: 'misc', w: 0.05, stack: 1, tags: ['document'] });
    I({ id: 'road_warrant', cat: 'misc', w: 0.05, stack: 1, tags: ['document', 'bandit_pass'] });
    I({ id: 'mandat_red', cat: 'misc', w: 0.05, stack: 1, tags: ['document', 'bandit_pass'] });
    I({ id: 'gramota_church', cat: 'misc', w: 0.05, stack: 1, tags: ['document'] });

    // ============================== УНИКАЛЬНЫЕ ==============================
    I({ id: 'barometer_timofeich', cat: 'tool', w: 1.0, stack: 1, tags: ['weather_sense', 'unique'] });
    I({ id: 'samovar_squeaky', cat: 'tool', w: 3.2, stack: 1, sanity: 8, tags: ['cooking', 'unique'] });
    I({ id: 'argunov_key', cat: 'misc', w: 0.05, stack: 1, tags: ['key', 'quest', 'unique'] });
    I({ id: 'balalaika', cat: 'misc', w: 1.4, stack: 1, sanity: 10, tags: ['instrument'] });
    I({ id: 'chess_set', cat: 'misc', w: 0.9, stack: 1, sanity: 7, tags: [] });
    I({ id: 'dominoes', cat: 'misc', w: 0.4, stack: 1, sanity: 5, tags: [] });
    I({ id: 'samogon_apparat', cat: 'tool', w: 5.5, stack: 1, tags: ['brewing'] });

    return it;
  }

  /** Русские названия. */
  function buildRu() {
    return {
      'item.needle_sewing.name': 'Игла швейная', 'item.needle_sewing.desc': 'Стальная игла для починки одежды.',
      'item.thimble.name': 'Напёрсток', 'item.thimble.desc': 'Медный напёрсток. Бережёт палец.',
      'item.scissors_tailor.name': 'Ножницы портновские', 'item.scissors_tailor.desc': 'Большие, тяжёлые, кроят сукно.',
      'item.file_steel.name': 'Напильник', 'item.file_steel.desc': 'Стальной напильник по металлу.',
      'item.tongs_smith.name': 'Клещи кузнечные', 'item.tongs_smith.desc': 'Держат раскалённое железо.',
      'item.hammer_locksmith.name': 'Молоток слесарный', 'item.hammer_locksmith.desc': 'Тяжёлый, удобный в руке.',
      'item.plane_smooth.name': 'Рубанок', 'item.plane_smooth.desc': 'Гладит дерево до блеска.',
      'item.chisel_wood.name': 'Стамеска', 'item.chisel_wood.desc': 'Долото плотника.',
      'item.hand_drill.name': 'Сверло ручное', 'item.hand_drill.desc': 'Коловорот с запасным пером.',
      'item.brace_bit.name': 'Коловорот', 'item.brace_bit.desc': 'Тяжёлый, надёжный.',
      'item.staple_iron.name': 'Скоба железная', 'item.staple_iron.desc': 'Для крепкой работы.',
      'item.crowbar_small.name': 'Ломик', 'item.crowbar_small.desc': 'Открывает двери, ящики и головы.',
      'item.axe_handle.name': 'Топорище', 'item.axe_handle.desc': 'Крепкое, из комля.',
      'item.soldering_lamp.name': 'Паяльная лампа', 'item.soldering_lamp.desc': 'Греет и паяет. Пахнет керосином.',
      'item.trap_wolf.name': 'Капкан волчий', 'item.trap_wolf.desc': 'Стальные челюсти. Ставить в рукавицах.',
      'item.trap_hare.name': 'Капкан заячий', 'item.trap_hare.desc': 'Малый капкан на дичь.',
      'item.snare_loop.name': 'Силки', 'item.snare_loop.desc': 'Проволочная петля на заячьей тропе.',
      'item.fish_vertushka.name': 'Верш', 'item.fish_vertushka.desc': 'Плетёная ловушка для рыбы.',
      'item.net_fishing.name': 'Бредень', 'item.net_fishing.desc': 'Старая сеть. Тяжёлая, но уловиста.',
      'item.rifle_sawnoff.name': 'Обрез', 'item.rifle_sawnoff.desc': 'Двуствольный обрез. В ближнем бою — гроза.',
      'item.ramrod.name': 'Шомпол', 'item.ramrod.desc': 'Чистит ствол.',
      'item.oil_can_gun.name': 'Маслёнка ружейная', 'item.oil_can_gun.desc': 'Смазка для механизма.',
      'item.gun_case.name': 'Чехол ружейный', 'item.gun_case.desc': 'Суконный, с ремнём.',
      'item.skis_hunting.name': 'Охотничьи лыжи', 'item.skis_hunting.desc': 'Подбитые камусом — по снегу как посуху.',
      'item.deer_call.name': 'Манок олений', 'item.deer_call.desc': 'Берестяная трубочка. Зовёт оленя.',
      'item.brush_marker.name': 'Барсучья кисть', 'item.brush_marker.desc': 'Метить стволы и ставить вехи.',
      'item.yoke.name': 'Коромысло', 'item.yoke.desc': 'Два ведра — одна палка.',
      'item.peel_oven.name': 'Ухват', 'item.peel_oven.desc': 'Держит чугунок в печи.',
      'item.pot_cast.name': 'Котелок чугунный', 'item.pot_cast.desc': 'Варить, топить снег, греться.',
      'item.pan_skillet.name': 'Сковорода', 'item.pan_skillet.desc': 'Чугунная, вечная.',
      'item.samovar_brass.name': 'Самовар медный', 'item.samovar_brass.desc': 'Топится щепой. Гордость избы.',
      'item.lamp_flashlight.name': 'Фонарь «летучая мышь»', 'item.lamp_flashlight.desc': 'Керосиновый, с толстым стеклом.',
      'item.glass_spare.name': 'Стекло запасное', 'item.glass_spare.desc': 'Для фонаря.',
      'item.wicks_pack.name': 'Фитили', 'item.wicks_pack.desc': 'Пучок пропитанных фитилей.',
      'item.soap_lump.name': 'Мыло хозяйственное', 'item.soap_lump.desc': 'Скрипучее, серое.',
      'item.washboard.name': 'Стиральная доска', 'item.washboard.desc': 'Рёбра дерева.',
      'item.iron_flat.name': 'Утюг чугунный', 'item.iron_flat.desc': 'Греется на печи. Ночью — грелка.',
      'item.hot_water_bottle.name': 'Грелка', 'item.hot_water_bottle.desc': 'Резиновая, с пробкой.',
      'item.passport.name': 'Паспорт', 'item.passport.desc': 'Прописка. Владелец уже не спросит.',
      'item.road_warrant.name': 'Подорожная', 'item.road_warrant.desc': 'Казённый проезд. Бандиты уважают бумагу.',
      'item.mandat_red.name': 'Мандат', 'item.mandat_red.desc': 'Бумага с печатью. Теперь пугает лучше штыка.',
      'item.gramota_church.name': 'Грамота церковная', 'item.gramota_church.desc': 'Прошение с печатью.',
      'item.barometer_timofeich.name': 'Барометр Тимофеича', 'item.barometer_timofeich.desc': 'Стрелка дрожит перед бурей. Не врёт.',
      'item.samovar_squeaky.name': 'Скрипучий самовар', 'item.samovar_squeaky.desc': 'Скрипит, но поёт. Чай из него — лекарство.',
      'item.argunov_key.name': 'Ключ Аргунова', 'item.argunov_key.desc': 'Тяжёлый, узорный. От склада у пилорамы.',
      'item.balalaika.name': 'Балалайка', 'item.balalaika.desc': 'Три струны и вся Русь.',
      'item.chess_set.name': 'Шахматы', 'item.chess_set.desc': 'Резные, домовые. Слон потёрт.',
      'item.dominoes.name': 'Домино', 'item.dominoes.desc': 'Костяшки в мешочке.',
      'item.samogon_apparat.name': 'Самогонный аппарат', 'item.samogon_apparat.desc': 'Кустарный змеевик. Держать от огня.'
    };
  }

  WS.boot(function () {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var items = build();
    for (var k in items) WS.Data.items[k] = items[k];
    WS.Data.locales = WS.Data.locales || {};
    WS.Data.locales.ru = WS.Data.locales.ru || {};
    var ru = buildRu();
    for (var key in ru) WS.Data.locales.ru[key] = ru[key];
  }, 'items:tools');
})();
