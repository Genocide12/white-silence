/**
 * ДОПОЛНИТЕЛЬНЫЕ РЕЦЕПТЫ: самодельное оружие, походные приспособления,
 * строительные детали, медикаменты из подручного. Расширяет recipes.js.
 */
(function () {
  'use strict';

  function R(o) { return o; }

  var RECIPES = [
    // ================================================================ ОРУЖИЕ САМОДЕЛЬНОЕ
    // cat — только из списка CONTRACT.md (survival/carpentry/cook/tailor/
    // ammo/misc): вкладки UI крафта не знают «weapon»/«med», рецепты с ними
    // были невидимы в меню (Craft.categories() их не считал).
    R({ id: 'knuckles_lead', name: 'Свинчатка', out: [{ id: 'knuckles_lead', n: 1 }], cat: 'carpentry',
      req: [{ id: 'scrap_metal', n: 2 }, { id: 'cloth_rag', n: 1 }], tools: ['file_metal'],
      station: 'anvil', time: 60, skill: { id: 'carpentry', lv: 2 },
      desc: 'Свинчатка: кулак тяжелеет втрое' }),
    R({ id: 'club_nail', name: 'Дубина с гвоздями', out: [{ id: 'club_nail', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 1 }, { id: 'nails', n: 6 }], tools: ['hammer'],
      station: 'workbench', time: 45,
      desc: 'Дубина с гвоздями' }),
    R({ id: 'spear_fire', name: 'Огненное копьё', out: [{ id: 'spear_fire', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 2 }, { id: 'fat', n: 1 }, { id: 'cloth_rag', n: 2 }],
      tools: [], station: null, time: 30, skill: { id: 'survive', lv: 1 },
      desc: 'Копьё с горящим концом: свет и урон' }),
    R({ id: 'bow_war', name: 'Боевой лук', out: [{ id: 'bow_war', n: 1 }], cat: 'carpentry',
      req: [{ id: 'willow_twigs', n: 3 }, { id: 'rope_coil', n: 1 }, { id: 'sinew', n: 2 }],
      tools: ['knife'], station: null, time: 120, skill: { id: 'survive', lv: 3 },
      desc: 'Крепкий боевой лук' }),
    R({ id: 'arrow_hunt', name: 'Охотничьи стрелы', out: [{ id: 'arrow', n: 5 }], cat: 'ammo',
      req: [{ id: 'plank', n: 1 }, { id: 'nails', n: 5 }, { id: 'cloth_rag', n: 1 }, { id: 'sinew', n: 1 }],
      tools: ['knife'], station: null, time: 40, skill: { id: 'survive', lv: 1 },
      desc: 'Пять стрел с железными наконечниками' }),
    R({ id: 'arrow_fire', name: 'Зажигательные стрелы', out: [{ id: 'arrow_fire', n: 3 }], cat: 'ammo',
      req: [{ id: 'arrow', n: 3 }, { id: 'fat', n: 1 }, { id: 'cloth_rag', n: 1 }],
      tools: [], station: null, time: 20, skill: { id: 'survive', lv: 2 },
      desc: 'Зажигательные стрелы: свет и страх зверя' }),
    R({ id: 'bullets_cast', name: 'Литые патроны', out: [{ id: 'rifle_round', n: 10 }], cat: 'ammo',
      req: [{ id: 'gunpowder', n: 1 }, { id: 'bullet_cast', n: 10 }, { id: 'wadding', n: 10 }],
      tools: ['file_metal'], station: 'anvil', time: 90, skill: { id: 'survive', lv: 3 },
      desc: 'Отлить и снарядить десяток патронов' }),
    R({ id: 'shell_reload', name: 'Перезарядка гильз', out: [{ id: 'shell', n: 6 }], cat: 'ammo',
      req: [{ id: 'gunpowder', n: 1 }, { id: 'scrap_metal', n: 2 }, { id: 'wadding', n: 6 }],
      tools: ['file_metal'], station: 'anvil', time: 100, skill: { id: 'survive', lv: 4 },
      desc: 'Перезарядка дробовых гильз' }),

    // ================================================================ СНАРЯЖЕНИЕ ПОХОДНОЕ
    R({ id: 'bedroll', name: 'Спальник', out: [{ id: 'bedroll', n: 1 }], cat: 'survival',
      req: [{ id: 'bearskin_rug', n: 1 }, { id: 'linen_sheet', n: 2 }, { id: 'rope_coil', n: 1 }],
      tools: ['needle_sewing'], station: null, time: 150, skill: { id: 'tailor', lv: 3 },
      desc: 'Спальник: сон в тепле где угодно' }),
    R({ id: 'bedroll_poor', name: 'Худой спальник', out: [{ id: 'bedroll_poor', n: 1 }], cat: 'survival',
      req: [{ id: 'linen_sheet', n: 2 }, { id: 'dry_grass', n: 4 }, { id: 'mouse_nest', n: 1 }],
      tools: ['needle_sewing'], station: null, time: 90,
      desc: 'Тонкий спальник: лучше, чем снег' }),
    R({ id: 'skis_make', name: 'Охотничьи лыжи', out: [{ id: 'skis_hunting', n: 1 }], cat: 'survival',
      req: [{ id: 'plank', n: 4 }, { id: 'rope_coil', n: 1 }, { id: 'birch_bark', n: 2 }],
      tools: ['knife'], station: 'workbench', time: 180, skill: { id: 'carpentry', lv: 3 },
      desc: 'Охотничьи лыжи с камусом' }),
    R({ id: 'snowshoes', name: 'Снегоступы', out: [{ id: 'snowshoes', n: 1 }], cat: 'survival',
      req: [{ id: 'willow_twigs', n: 4 }, { id: 'rope_coil', n: 1 }, { id: 'sinew', n: 2 }],
      tools: ['knife'], station: null, time: 60, skill: { id: 'survive', lv: 1 },
      desc: 'Снегоступы «медвежья лапа»: не тонуть в сугробах' }),
    R({ id: 'sled_hand', name: 'Ручные сани', out: [{ id: 'sled_hand', n: 1 }], cat: 'survival',
      req: [{ id: 'plank', n: 3 }, { id: 'nails', n: 8 }, { id: 'rope_coil', n: 1 }],
      tools: ['hammer'], station: 'workbench', time: 120, skill: { id: 'carpentry', lv: 2 },
      desc: 'Ручные санки: тащите вдвое больше' }),
    R({ id: 'backpack_frame', name: 'Каркасный рюкзак', out: [{ id: 'backpack_frame', n: 1 }], cat: 'survival',
      req: [{ id: 'plank', n: 2 }, { id: 'rope_coil', n: 1 }, { id: 'cloth_rag', n: 2 }],
      tools: ['knife'], station: null, time: 80, skill: { id: 'survive', lv: 2 },
      desc: 'Плетёный короб за спину' }),

    // ================================================================ КОСТЁР И СВЕТ
    R({ id: 'torch_make', name: 'Пара факелов', out: [{ id: 'torch', n: 2 }], cat: 'survival',
      req: [{ id: 'plank', n: 1 }, { id: 'fat', n: 1 }, { id: 'cloth_rag', n: 2 }],
      tools: [], station: null, time: 30,
      desc: 'Два факела: свет и страх волка' }),
    R({ id: 'candles_dip', name: 'Маканые свечи', out: [{ id: 'candle_stump', n: 6 }], cat: 'survival',
      req: [{ id: 'fat', n: 2 }, { id: 'wicks_pack', n: 1 }],
      tools: [], station: 'fire', time: 90, skill: { id: 'cook', lv: 1 },
      desc: 'Маканые свечи: шесть огарков' }),
    R({ id: 'lamp_tin', name: 'Жестяная коптилка', out: [{ id: 'lamp_tin', n: 1 }], cat: 'survival',
      req: [{ id: 'tin_can', n: 1 }, { id: 'wicks_pack', n: 1 }, { id: 'lamp_oil', n: 1 }],
      tools: [], station: null, time: 40, skill: { id: 'survive', lv: 1 },
      desc: 'Жестяная коптилка' }),
    R({ id: 'lantern_refit', name: 'Починка фонаря', out: [{ id: 'lantern', n: 1 }], cat: 'survival',
      req: [{ id: 'glass_spare', n: 1 }, { id: 'scrap_metal', n: 1 }, { id: 'wicks_pack', n: 1 }],
      tools: ['pliers'], station: 'workbench', time: 60, skill: { id: 'carpentry', lv: 2 },
      desc: 'Починить фонарь «летучую мышь»' }),

    // ================================================================ ЛОВУШКИ
    R({ id: 'snare_make', name: 'Силки', out: [{ id: 'snare_loop', n: 2 }], cat: 'survival',
      req: [{ id: 'snare_wire', n: 1 }, { id: 'willow_twigs', n: 1 }],
      tools: ['pliers'], station: null, time: 25, skill: { id: 'track', lv: 1 },
      desc: 'Две петли на заячьей тропе' }),
    R({ id: 'trap_hare_make', name: 'Заячий капкан', out: [{ id: 'trap_hare', n: 1 }], cat: 'survival',
      req: [{ id: 'scrap_metal', n: 1 }, { id: 'plank', n: 1 }, { id: 'rope_coil', n: 1 }],
      tools: ['file_metal'], station: 'workbench', time: 70, skill: { id: 'track', lv: 2 },
      desc: 'Малый капкан' }),
    R({ id: 'trap_wolf_make', name: 'Волчий капкан', out: [{ id: 'trap_wolf', n: 1 }], cat: 'survival',
      req: [{ id: 'scrap_metal', n: 3 }, { id: 'staple_iron', n: 2 }, { id: 'chain_short', n: 1 }],
      tools: ['tongs_smith'], station: 'anvil', time: 140, skill: { id: 'track', lv: 4 },
      desc: 'Волчий капкан: челюсти и якорь' }),
    R({ id: 'vertushka_make', name: 'Верш для проруби', out: [{ id: 'fish_vertushka', n: 1 }], cat: 'survival',
      req: [{ id: 'willow_twigs', n: 4 }, { id: 'rope_coil', n: 1 }],
      tools: ['knife'], station: null, time: 60, skill: { id: 'forage', lv: 1 },
      desc: 'Верш для проруби' }),
    R({ id: 'bait_meat', name: 'Мясная приманка', out: [{ id: 'bait_meat', n: 1 }], cat: 'survival',
      req: [{ id: 'meat_raw', n: 1 }],
      tools: [], station: null, time: 10, skill: { id: 'track', lv: 1 },
      desc: 'Приманка из свежатины' }),

    // ================================================================ СТРОЙКА
    R({ id: 'barricade_plank', out: [{ id: 'barricade_plank', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 6 }],
      tools: ['hammer'], station: null, time: 30, skill: { id: 'carpentry', lv: 0 },
      desc: 'Забаррикадировать проём' }),
    R({ id: 'window_plank', name: 'Зашивка окна', out: [{ id: 'window_plank', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 1 }, { id: 'nails', n: 4 }],
      tools: ['hammer'], station: null, time: 20,
      desc: 'Заколотить окно' }),
    R({ id: 'floor_patch', name: 'Заплата на пол', out: [{ id: 'floor_patch', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 1 }, { id: 'nails', n: 4 }],
      tools: ['hammer'], station: null, time: 25, skill: { id: 'carpentry', lv: 1 },
      desc: 'Заплатка пола' }),
    R({ id: 'stretcher', out: [{ id: 'stretcher', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 2 }, { id: 'linen_sheet', n: 2 }, { id: 'rope_coil', n: 1 }],
      tools: ['hammer'], station: 'workbench', time: 90, skill: { id: 'carpentry', lv: 2 },
      desc: 'Носилки: тащить раненого или груз' }),
    R({ id: 'crate_storage', name: 'Рундук', out: [{ id: 'crate_storage', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 3 }, { id: 'nails', n: 8 }],
      tools: ['hammer', 'saw'], station: 'workbench', time: 100, skill: { id: 'carpentry', lv: 1 },
      desc: 'Складной ящик для базы' }),

    // ================================================================ МЕДИЦИНА
    // cat только из CONTRACT.md: бинты (тряпьё) — портняжье, примочки и
    // настойки — misc, шина (доски) — столярное дело.
    R({ id: 'bandage_rip', name: 'Бинты из полотна', out: [{ id: 'bandage', n: 2 }], cat: 'tailor',
      req: [{ id: 'linen_sheet', n: 1 }],
      tools: ['scissors_tailor'], station: null, time: 20,
      desc: 'Разорвать полотно на бинты' }),
    R({ id: 'poultice_chaga', name: 'Примочка из чаги', out: [{ id: 'poultice_chaga', n: 2 }], cat: 'misc',
      req: [{ id: 'chaga_chunk', n: 1 }, { id: 'cloth_rag', n: 1 }, { id: 'vodka', n: 1 }],
      tools: [], station: 'fire', time: 40, skill: { id: 'medic', lv: 1 },
      desc: 'Примочка из чаги: раны и воспаления' }),
    R({ id: 'tincture_iodine', name: 'Йодная настойка', out: [{ id: 'iodine_tincture', n: 2 }], cat: 'misc',
      req: [{ id: 'bottle_empty', n: 2 }, { id: 'vodka', n: 1 }, { id: 'ash_potash', n: 1 }],
      tools: [], station: 'fire', time: 60, skill: { id: 'medic', lv: 2 },
      desc: 'Йодная настойка на золе' }),
    R({ id: 'splint_field', name: 'Полевая шина', out: [{ id: 'splint_field', n: 1 }], cat: 'carpentry',
      req: [{ id: 'plank', n: 1 }, { id: 'cloth_rag', n: 2 }, { id: 'rope_coil', n: 1 }],
      tools: [], station: null, time: 25, skill: { id: 'medic', lv: 1 },
      desc: 'Полевой лубок для перелома' }),
    R({ id: 'tobacco_pipe_fill', name: 'Кисет табака', out: [{ id: 'tobacco_pouch', n: 1 }], cat: 'misc',
      req: [{ id: 'tobacco_dry', n: 1 }, { id: 'newspaper_stack', n: 1 }],
      tools: [], station: null, time: 10,
      desc: 'Кисет табаку' }),

    // ================================================================ БЫТ
    R({ id: 'soap_boil', name: 'Хозяйственное мыло', out: [{ id: 'soap_lump', n: 2 }], cat: 'misc',
      req: [{ id: 'fat', n: 1 }, { id: 'ash_potash', n: 1 }],
      tools: [], station: 'fire', time: 80, skill: { id: 'cook', lv: 2 },
      desc: 'Варка хозяйственного мыла' }),
    R({ id: 'rag_wash', name: 'Стирка ветоши', out: [{ id: 'cloth_rag', n: 1 }], cat: 'misc',
      req: [{ id: 'cloth_dirty', n: 1 }, { id: 'soap_lump', n: 1 }],
      tools: ['washboard'], station: null, time: 30,
      desc: 'Отстирать ветошь (мыло обязательно)' }),
    R({ id: 'charcoal_burn', out: [{ id: 'charcoal_bag', n: 1 }], cat: 'survival',
      req: [{ id: 'log', n: 2 }, { id: 'birch_bark', n: 2 }],
      tools: [], station: 'fire', time: 240, skill: { id: 'survive', lv: 2 },
      desc: 'Выжечь уголь в яме' }),
    R({ id: 'pitch_boil', name: 'Гонка смолы', out: [{ id: 'tar_bucket', n: 1 }], cat: 'survival',
      req: [{ id: 'birch_bark', n: 6 }, { id: 'fat', n: 1 }],
      tools: [], station: 'fire', time: 150, skill: { id: 'survive', lv: 2 },
      desc: 'Гнать берестяную смолу' }),

    // ================================================================ ПРОМЫСЕЛ (канон)
    // Верша и манок: канонические объявления ЗДЕСЬ (ранняя регистрация),
    // как flask_empty в items_seed.js. fishing.js и hunting.js добавляют
    // свои версии только «если нет» — их копии с skill:{lv:0} больше не
    // попадают в реестр (lv=0 трактуется как 1 и врёт игроку).
    R({ id: 'fish_trap', name: 'Верша', out: [{ id: 'fish_trap', n: 1 }], cat: 'survival',
      req: [{ id: 'pine_branch', n: 5 }, { id: 'rope', n: 1 }],
      tools: ['knife'], station: null, time: 6,
      desc: 'Верша из еловых лапок для проруби' }),
    R({ id: 'deer_call', name: 'Манок на оленя', out: [{ id: 'deer_call', n: 1 }], cat: 'survival',
      req: [{ id: 'birch_bark', n: 2 }],
      tools: ['knife'], station: null, time: 4,
      desc: 'Берестяной манок: зовёт оленя' })
  ];

  /** Предметы, на которые ссылаются рецепты и которых может не быть. */
  function ensureItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    var I = function (o) { if (!WS.Data.items[o.id]) WS.Data.items[o.id] = o; };
    // stack обязателен: без него инвентарь считает предмет одинарным
    // (не стакуется) — у стрел, приманок и досок это мучение.
    I({ id: 'knuckles_lead', cat: 'weapon', w: 0.5, stack: 5, dmg: 9, range: 0.6, atkSpd: 2.2, knock: 2, crit: 8, tags: ['weapon'] });
    I({ id: 'club_nail', cat: 'weapon', w: 2.0, stack: 5, dmg: 16, range: 1.1, atkSpd: 1.0, knock: 9, crit: 5, tags: ['weapon'] });
    I({ id: 'spear_fire', cat: 'weapon', w: 2.8, stack: 5, dmg: 24, range: 1.9, atkSpd: 0.8, knock: 8, crit: 12, twoHand: true, light: 35, tags: ['weapon', 'light', 'noise_scare'] });
    I({ id: 'bow_war', cat: 'ranged', w: 1.1, stack: 5, ranged: true, ammo: 'arrow', mag: 1, dmg: 34, accuracy: 50, noise: 6, twoHand: true, tags: ['weapon'] });
    I({ id: 'arrow_fire', cat: 'ammo', w: 0.05, stack: 30, fire: true, tags: [] });
    I({ id: 'bedroll', cat: 'tool', w: 3.5, stack: 1, warm: 25, tags: ['bedding'] });
    I({ id: 'bedroll_poor', cat: 'tool', w: 2.0, stack: 3, warm: 12, tags: ['bedding'] });
    I({ id: 'snowshoes', cat: 'tool', w: 1.2, stack: 5, tags: ['skis'] });
    I({ id: 'sled_hand', cat: 'tool', w: 4.0, stack: 3, carry: 25, tags: [] });
    I({ id: 'backpack_frame', cat: 'container', w: 1.5, stack: 5, carry: 15, tags: [] });
    I({ id: 'lamp_tin', cat: 'light', w: 0.4, stack: 5, light: 40, fuel: 'lamp_oil', fuelH: 3, tags: ['light'] });
    I({ id: 'bait_meat', cat: 'tool', w: 0.3, stack: 5, tags: ['wolf_bait'] });
    I({ id: 'barricade_plank', cat: 'material', w: 2.5, stack: 4, tags: ['build'] });
    I({ id: 'window_plank', cat: 'material', w: 1.5, stack: 10, tags: ['build'] });
    I({ id: 'floor_patch', cat: 'material', w: 1.5, stack: 10, tags: ['build'] });
    I({ id: 'stretcher', cat: 'tool', w: 3.0, stack: 1, tags: ['carry'] });
    I({ id: 'crate_storage', cat: 'container', w: 4.0, stack: 3, carry: 20, tags: [] });
    I({ id: 'poultice_chaga', cat: 'med', w: 0.15, stack: 6, heal: 8, disinfect: 30, tags: ['heal'] });
    I({ id: 'splint_field', cat: 'med', w: 0.4, stack: 5, cures: 'fracture', tags: ['heal'] });
    I({ id: 'tin_can', cat: 'material', w: 0.1, stack: 6, tags: [] });
    I({ id: 'chain_short', cat: 'material', w: 1.8, stack: 5, tags: [] });
    I({ id: 'ash_potash', cat: 'material', w: 0.5, stack: 4, tags: [] });
    I({ id: 'cloth_dirty', cat: 'material', w: 0.15, stack: 10, tags: [] });
    I({ id: 'tobacco_dry', cat: 'material', w: 0.1, stack: 6, tags: [] });
    I({ id: 'bottle_empty', cat: 'material', w: 0.3, stack: 5, tags: [] });
  }

  // Локализация предметов recipes_extra (тест-сьют S2 нашёл 22 предмета
  // без имён — в тултипах показывался сырой id: «club_nail», «sled_hand»…)
  var NAMES_RU = {
    compass_brass: 'Латунный компас', knuckles_lead: 'Свинчатка', club_nail: 'Гвоздобой',
    spear_fire: 'Горящее копьё', bow_war: 'Боевой лук', arrow_fire: 'Зажигательная стрела',
    bedroll: 'Спальный тюфяк', bedroll_poor: 'Худой тюфяк', snowshoes: 'Снегоступы',
    sled_hand: 'Ручные сани', backpack_frame: 'Каркасный рюкзак', lamp_tin: 'Жестяной фонарь',
    bait_meat: 'Мясная приманка', barricade_plank: 'Заборная доска', window_plank: 'Зашивная доска',
    floor_patch: 'Заплата на пол', stretcher: 'Носилки', crate_storage: 'Рундук',
    poultice_chaga: 'Распар берёзовой губки', splint_field: 'Полевая шина',
    tin_can: 'Жестянка', chain_short: 'Обрывок цепи', ash_potash: 'Зольный поташ',
    cloth_dirty: 'Грязная ветошь', tobacco_dry: 'Сушёный табак', bottle_empty: 'Пустая бутылка',
    // ингредиенты промысла, жившие без имён (тултипы показывали сырой id)
    chaga_chunk: 'Кусок чаги', dry_grass: 'Сухая трава', mouse_nest: 'Мышиное гнездо',
    birch_bark: 'Береста', willow_twigs: 'Вербы прутья', pine_branch: 'Еловая лапка',
    icicle_chunk: 'Сосулька', angelica_root: 'Корень дягиля', bad_mushroom: 'Поганка',
    snow_water: 'Снеговая вода', meat_spoiled: 'Тухлое мясо', sinew: 'Сухожилие',
    radio_crystal: 'Радиокристалл', wr_stonewort: 'Зверобой (пучок)',
    wr_decoction_angelica: 'Отвар дягиля', wr_decoction_chaga: 'Отвар чаги',
    wr_decoction_stonewort: 'Отвар зверобоя', fat: 'Сало (топлёное)'
  };
  var NAMES_EN = {
    compass_brass: 'Brass Compass', knuckles_lead: 'Lead Knuckles', club_nail: 'Nail Club',
    spear_fire: 'Fire Spear', bow_war: 'War Bow', arrow_fire: 'Fire Arrow',
    bedroll: 'Bedroll', bedroll_poor: 'Meagre Bedroll', snowshoes: 'Snowshoes',
    sled_hand: 'Hand Sled', backpack_frame: 'Framed Backpack', lamp_tin: 'Tin Lantern',
    bait_meat: 'Meat Bait', barricade_plank: 'Barricade Plank', window_plank: 'Window Plank',
    floor_patch: 'Floor Patch', stretcher: 'Stretcher', crate_storage: 'Storage Crate',
    poultice_chaga: 'Steamed Chaga Poultice', splint_field: 'Field Splint',
    tin_can: 'Tin Can', chain_short: 'Short Chain', ash_potash: 'Potash Ash',
    cloth_dirty: 'Dirty Rags', tobacco_dry: 'Dried Tobacco', bottle_empty: 'Empty Bottle',
    chaga_chunk: 'Chaga Chunk', dry_grass: 'Dry Grass', mouse_nest: 'Mouse Nest',
    birch_bark: 'Birch Bark', willow_twigs: 'Willow Twigs', pine_branch: 'Pine Branch',
    icicle_chunk: 'Icicle', angelica_root: 'Angelica Root', bad_mushroom: 'Toadstool',
    snow_water: 'Snow Melt', meat_spoiled: 'Spoiled Meat', sinew: 'Sinew',
    radio_crystal: 'Radio Crystal', wr_stonewort: 'St John\u2019s Wort Bunch',
    wr_decoction_angelica: 'Angelica Decoction', wr_decoction_chaga: 'Chaga Decoction',
    wr_decoction_stonewort: 'Wort Decoction', fat: 'Rendered Fat'
  };

  WS.boot(function () {
    ensureItems();
    WS.Data = WS.Data || {};
    if (!WS.Data.recipes) WS.Data.recipes = [];
    // recipesById — рабочий индекс систем Craft/Cook (recipe() ищет только
    // здесь). Раньше эти 37 рецептов были видны в меню, но не выполнялись
    // («нет такого рецепта») — тест-сьют S3 это поймал.
    WS.Data.recipesById = WS.Data.recipesById || {};
    for (var i = 0; i < RECIPES.length; i++) {
      // не дублировать
      var exists = false;
      for (var k = 0; k < WS.Data.recipes.length; k++) {
        if (WS.Data.recipes[k].id === RECIPES[i].id) { exists = true; break; }
      }
      if (!exists) {
        WS.Data.recipes.push(RECIPES[i]);
        // recipesById заполняем ТОЛЬКО для новых: при дубле id каноничен
        // recipes.js (иначе меню показывает один рецепт, а крафт исполняет
        // другой с иными ингредиентами — тест-сьют S3 это поймал на
        // stretcher/charcoal_burn/barricade_plank)
        WS.Data.recipesById[RECIPES[i].id] = RECIPES[i];
      }
    }
    // имена предметов (RU/EN) — после сбора Data.locales
    WS.Data.locales = WS.Data.locales || {};
    WS.Data.locales.ru = WS.Data.locales.ru || {};
    WS.Data.locales.en = WS.Data.locales.en || {};
    for (var nk in NAMES_RU) {
      if (!WS.Data.locales.ru['item.' + nk + '.name']) WS.Data.locales.ru['item.' + nk + '.name'] = NAMES_RU[nk];
      if (!WS.Data.locales.en['item.' + nk + '.name']) WS.Data.locales.en['item.' + nk + '.name'] = NAMES_EN[nk] || NAMES_RU[nk];
    }
  }, 'recipes:extra');
})();
