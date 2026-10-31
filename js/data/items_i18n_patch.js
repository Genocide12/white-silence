/**
 * items_i18n_patch.js — РУССКИЕ ИМЕНА для предметов, объявленных системами
 * без локализации (foraging, fishing, build, health, winter-rules, радио).
 *
 * Почему отдельным файлом: системы объявляют предметы «на месте», и их имена
 * доставались умному fallback'у («Pike raw», «Tin can») — аудит локализации
 * насчитал 41 такой предмет. Здесь — канонические имена (и краткие описания),
 * вливающиеся в ru-словарь по образцу items_cloth.js: boot + game:start.
 */
(function () {
  'use strict';

  var RU = {
    // — рукопашное и самодельное оружие (build/combat) —
    'item.knuckles_lead.name': 'Свинчатка',
    'item.knuckles_lead.desc': 'Кусок свинца в кулаке. Аргумент весомый, но короткий.',
    'item.club_nail.name': 'Дубина с гвоздями',
    'item.club_nail.desc': 'Доска, гвозди, злость. Порядок сборки значения не имеет.',
    'item.spear_fire.name': 'Пылающее копьё',
    'item.spear_fire.desc': 'Насаженная на шест горящая головня: светит и кусает.',
    'item.bow_war.name': 'Боевой лук',
    'item.bow_war.desc': 'Самодельный, но тетива натянута со злостью.',
    'item.arrow_fire.name': 'Зажигательная стрела',
    'item.arrow_fire.desc': 'Стрела с промасленной обмоткой. Подожги — и пусти.',

    // — походное снаряжение —
    'item.bedroll_poor.name': 'Худой спальник',
    'item.bedroll_poor.desc': 'Ватник, сшитый в чехол. Спать можно, сны — постные.',
    'item.snowshoes.name': 'Снегоступы',
    'item.snowshoes.desc': 'Плетёные «ракетки»: по рыхлому снегу — как по дороге.',
    'item.sled_hand.name': 'Ручные сани',
    'item.sled_hand.desc': 'Волокуши на полозьях: тяни, покуда сил хватает.',
    'item.backpack_frame.name': 'Рамочный рюкзак',
    'item.backpack_frame.desc': 'Пологие дуги и брезент — спина скажет спасибо.',
    'item.lamp_tin.name': 'Жестяная лампа',
    'item.lamp_tin.desc': 'Коптилка из консервной банки. Свет да чад.',
    'item.tin_can.name': 'Жестянка',
    'item.tin_can.desc': 'Пустая банка: воды нести, мелочь хранить, в гул играть.',

    // — рыбалка и ловушки —
    'item.bait_meat.name': 'Приманка из свежатины',
    'item.bait_meat.desc': 'Кусок мяса на крючок или в вершу.',
    'item.fish_trap.name': 'Верша',
    'item.fish_trap.desc': 'Плетёная ловушка: рыба входит, выхода не находит.',
    'item.fish_net.name': 'Сеть',
    'item.fish_net.desc': 'Ставная сетка. Считай отверстия по ячеям, а улов — по рыбам.',
    'item.pike_raw.name': 'Сырая щука',
    'item.pike_raw.desc': 'Зубастая. Жарить — обязательно.',
    'item.burbot_raw.name': 'Сырой налим',
    'item.burbot_raw.desc': 'Жирная речная рыба. Печень — деликатес.',

    // — строительство и ремонт —
    'item.window_plank.name': 'Ставень из досок',
    'item.window_plank.desc': 'Прибить к окну — ветер не воет, вор не лезет.',
    'item.floor_patch.name': 'Заплата на пол',
    'item.floor_patch.desc': 'Щели законопачены — сквозняк обходит стороною.',
    'item.crate_storage.name': 'Ящик-хранилище',
    'item.crate_storage.desc': 'Плотный ящик под припасы: мышь не пролезет.',
    'item.chain_short.name': 'Короткая цепь',
    'item.chain_short.desc': 'Звенья ржавые, но держат.',

    // — медицина —
    'item.poultice_chaga.name': 'Припарка из чаги',
    'item.poultice_chaga.desc': 'Грибной компресс: воспаление тянет, боль отпускает.',
    'item.splint_field.name': 'Полевая шина',
    'item.splint_field.desc': 'Доска да тряпьё: перелом едет в больницу, а пока — в шине.',

    // — материалы и химия —
    'item.ash_potash.name': 'Зольная щёлочь',
    'item.ash_potash.desc': 'Выщелоченная из печной золы. Мылится, ест руки.',
    'item.cloth_dirty.name': 'Грязная ветошь',
    'item.cloth_dirty.desc': 'Стирать некогда, выбрасывать жалко.',
    'item.tobacco_dry.name': 'Сушёный табак',
    'item.tobacco_dry.desc': 'Самосад. Крепкий, как январь.',
    'item.chaga_chunk.name': 'Кусок чаги',
    'item.chaga_chunk.desc': 'Берёзовый гриб-трутовик. Заваривается, лечит.',
    'item.pine_branch.name': 'Еловая лапка',
    'item.pine_branch.desc': 'Ветвь с хвоей: подстилка, дым, чай.',
    'item.dry_grass.name': 'Сухая трава',
    'item.dry_grass.desc': 'Растопка и подстилка. Огонь её любит.',
    'item.icicle_chunk.name': 'Сосулька',
    'item.icicle_chunk.desc': 'Лёд чистый — вода, если растопить.',
    'item.mouse_nest.name': 'Мышиное гнездо',
    'item.mouse_nest.desc': 'Тёплая труха. В хозяйстве пригодится.',
    'item.birch_bark.name': 'Береста',
    'item.birch_bark.desc': 'Горит даже мокрая. Дар леса.',
    'item.willow_twigs.name': 'Ивовые прутья',
    'item.willow_twigs.desc': 'Гнутся — плетись, что хочешь.',
    'item.angelica_root.name': 'Корень дягиля',
    'item.angelica_root.desc': 'Лекарственный корень с запахом мускуса.',

    // — еда/питьё —
    'item.bad_mushroom.name': 'Поганка',
    'item.bad_mushroom.desc': 'Есть не стоит. Совсем не стоит.',
    'item.snow_water.name': 'Талая вода',
    'item.snow_water.desc': 'Снег, ставший водой. Дальше — чай.',
    'item.meat_spoiled.name': 'Испорченное мясо',
    'item.meat_spoiled.desc': 'Пахнет так, что даже волк думает дважды.',

    // — «правила зимовки» (wr_*) —
    'item.wr_stonewort.name': 'Рдест',
    'item.wr_stonewort.desc': 'Водное растение из полыньи. Заваривается.',
    'item.wr_decoction_angelica.name': 'Отвар дягиля',
    'item.wr_decoction_angelica.desc': 'Горький, тёплый, полезный.',
    'item.wr_decoction_chaga.name': 'Отвар чаги',
    'item.wr_decoction_chaga.desc': 'Тёмный, как ночь, и полезный, как сон.',
    'item.wr_decoction_stonewort.name': 'Отвар рдеста',
    'item.wr_decoction_stonewort.desc': 'На любителя. Любитель выживет.',

    // — радио —
    'item.radio_crystal.name': 'Кристалл детекторного приёмника',
    'item.radio_crystal.desc': 'Гальена осколок: сквозь треск — весь мир.'
  };

  function applyRu() {
    try {
      WS.Data = WS.Data || {};
      WS.Data.locales = WS.Data.locales || {};
      var ru = WS.Data.locales.ru = WS.Data.locales.ru || {};
      for (var k in RU) {
        if (RU.hasOwnProperty(k) && !ru[k]) ru[k] = RU[k];
      }
    } catch (e) {
      WS.err('items_i18n_patch: не влито', e && e.message);
    }
  }

  WS.boot(function () {
    applyRu();
    // страховка от подмены словаря (и на новых партиях)
    if (WS.Ev && WS.Ev.on) {
      WS.Ev.on('game:start', applyRu);
      WS.Ev.on('game:load', applyRu);
    }
    if (WS.afterFirstFrame) WS.afterFirstFrame(applyRu);
    var n = 0;
    for (var k in RU) if (RU.hasOwnProperty(k)) n++;
    WS.log('items_i18n_patch: ' + n + ' строк влито в ru-словарь');
  }, 'items:i18n-patch');
})();
