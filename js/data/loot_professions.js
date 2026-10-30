/**
 * ПРОФЕССИИ, ТРОФЕИ И БЕЗЫМЯННЫЙ СТАРТ — лут-баланс v2, часть 2.
 *
 * ПРОВЕРЕНО (задача К1): шесть профессий УЖЕ определены в js/ui/menu.js
 * (PROFESSIONS: telegraph, hunter, carpenter, cook, medic, convict) и
 * копируются в WS.Data.professions в его boot — ЗДЕСЬ НЕ ДУБЛИРУЮТСЯ.
 *
 * Этот файл добавляет то, чего нигде нет:
 *   1. WS.Data.trophies — трофейные таблицы особых смертей (вожак стаи,
 *      легендарный шатун, атаман бандитов) + их зеркало в WS.Data.loot
 *      (контракт looting.js: труп с kind K ищет таблицу K+'_body').
 *   2. Три новых предмета-трофея: alpha_pelt (шапка из шкуры вожака),
 *      bear_fang (клык шатуна), treasure_map (карта сокровищ атамана).
 *   3. WS.Data.startKits — наборы «безымянного прохождения»: случайный
 *      герой, три профиля сложности (богатый беженец / голый каторжник /
 *      середняк). Данные для меню «случайный герой» (интеграция — меню).
 *
 * Связи: ui/menu.js (профессии), systems/looting.js (трупы), content/
 * quests.js (вожак alpha_wolf, kind 'alpha_wolf' — таблица подхватится
 * сама), data/loot_tables2.js (WS.LootMerge для будущих правок).
 */
(function () {
  'use strict';

  // ====================================================================
  //  ХЕЛПЕРЫ (формат лут-записей — как в loot_tables.js)
  // ====================================================================

  function C(id, w, min, max) {
    return { id: id, w: w, min: min || 1, max: max || min || 1 };
  }
  function NOTHING(w) { return { id: null, w: w, min: 0, max: 0 }; }
  function T(rolls, items) { return { rolls: rolls, items: items }; }

  // ====================================================================
  //  ЧАСТЬ 1. НОВЫЕ ПРЕДМЕТЫ-ТРОФЕИ.
  //
  //  Три вещи, которых нет ни в одном data-файле — они существуют только
  //  как награда за особую смерть. Регистрируем через WS.Data.items
  //  (guard от дублей, паттерн items_cloth.js), русские имена — в
  //  WS.Data.locales.ru с защитой от подмены словаря i18n/ru.js (его
  //  boot перезаписывает locales.ru ЦЕЛИКОМ, поэтому перекладываем ключи
  //  заново на game:start / game:load / после первого кадра).
  // ====================================================================

  var NEW_ITEMS = {

    // -------- ШАПКА ИЗ ВОЖАКА (alpha_pelt) --------
    // Серая с проседью шкура вожака — «как метель над рекой». Кто снял
    // её, тот зимой больше не мёрзнет по-настоящему. Баланс: лучший
    // головной убор игры (warm 38 против 30 ушанки), цена — убить вожака
    // (hp 90, ночь, обходит огонь — quests.js, квест 3 «Волчий вожак»).
    alpha_pelt: {
      id: 'alpha_pelt', cat: 'cloth', w: 0.6, stack: 1,
      slots: ['head'], warm: 38, wind: 60, wet: 45, def: 3,
      sanity: 4,
      tags: ['unique', 'trophy']
    },

    // -------- КЛЫК ШАТУНА (bear_fang) --------
    // Медведь не спит зимой — значит, ему нечего терять. Клык седьмого
    // пальца длиной, в медной оправе-гайке. Носят на шее: «от злой
    // смерти». Рассудку — спокойнее (+6 sanity, пассивно).
    bear_fang: {
      id: 'bear_fang', cat: 'misc', w: 0.12, stack: 1,
      sanity: 6,
      tags: ['unique', 'trophy']
    },

    // -------- КАРТА СОКРОВИЩ (treasure_map) --------
    // Атаманская schemа на обёрточной бумаге: три излучины, поросль,
    // сухая осина, крестик. Верить ей или нет — дело восьмое; бумага
    // дороже золота, потому что золото без крестика не найти.
    treasure_map: {
      id: 'treasure_map', cat: 'book', w: 0.12, stack: 1,
      tags: ['readable', 'quest', 'unique', 'trophy']
    }
  };

  /** Русские имена новых предметов (ключи — как в items_tools.js). */
  var RU = {
    'item.alpha_pelt.name': 'Шапка из вожака',
    'item.alpha_pelt.desc': 'Сшита из шкуры волчьего вожака — серая с проседью, как метель над рекой. В такой больше не мёрзнешь.',
    'item.bear_fang.name': 'Клык шатуна',
    'item.bear_fang.desc': 'Палец длиной, в медной оправе. Такого носят на шее — от злой смерти. Шатун зимой не спит и ничего не боится.',
    'item.treasure_map.name': 'Карта сокровищ',
    'item.treasure_map.desc': 'Атаман рисовал её обгрызенным карандашом: три излучины, сухая осина, крестик. Бумага дороже золота — золото без неё не найти.'
  };

  // ====================================================================
  //  ЧАСТЬ 2. ТРОФЕЙНЫЕ ТАБЛИЦЫ ОСОБЫХ СМЕРТЕЙ — WS.Data.trophies.
  //
  //  Контракт systems/looting.js: makeCorpse(x, y, kind) ищет контейнер
  //  kind + '_body' в WS.Data.loot. Значит, зеркалим каждую трофейную
  //  таблицу в WS.Data.loot под тем же id — и труп вожака (kind
  //  'alpha_wolf' из quests.js, квест 3) получит её АВТОМАТИЧЕСКИ,
  //  без единой правки чужих файлов. Для legendary_bear и bandit_leader
  //  сущностей пока нет — таблицы готовы к их появлению.
  // ====================================================================

  var TROPHIES = {

    // ------------------------------------------------ ВОЛЧИЙ ВОЖАК (alpha_wolf)
    //  Чёрный против шерсти, крупный (scale 1.42, hp 90, dmg 18 —
    //  quests.js). Трофей: alpha_pelt — та самая шапка (w 22: почти
    //  гарантирована, «вожак не раз отлеживал эту шкуру в драках»).
    //  Остальное — как с матёрого волка, только жирнее: шкуры, мясо,
    //  сало, сухожилия, кости.
    alpha_wolf_body: T([2, 3], [
      C('alpha_pelt', 22, 1, 1),
      C('wolf_pelt', 14, 1, 2),
      C('meat_raw', 16, 2, 5),
      C('fat', 12, 1, 3),
      C('sinew', 12, 2, 4),
      C('bone_old', 10, 1, 3),
      NOTHING(4)
    ]),

    // ------------------------------------------- ЛЕГЕНДАРНЫЙ ШАТУН (legendary_bear)
    //  Медведь с меткой (у будущего AI: kind 'legendary_bear'). Зверь
    //  старый: седая грива, шкура в старых шрамах, в лапе — свинец
    //  прошлой зимы. Трофей: bear_fang (w 16) — клык, ради которого
    //  ходят в лес с одной двустволкой. Мяса и жира — как с трёх
    //  обычных (rolls [2,4] и количества жирнее).
    legendary_bear_body: T([2, 4], [
      C('bear_fang', 16, 1, 1),
      C('bear_pelt', 20, 1, 1),
      C('meat_raw', 22, 3, 8),
      C('fat', 18, 2, 5),
      C('sinew', 10, 2, 5),
      C('bone_old', 12, 2, 4),
      NOTHING(5)
    ]),

    // ------------------------------------------- АТАМАН (bandit_leader_body)
    //  Вожак банды (у будущего AI: kind 'bandit_leader'). При нём —
    //  вся банда в деньгах: КАРТА СОКРОВИЩ (treasure_map, w 10 —
    //  «атаман не всё носит с собой»), ключ Аргунова (argunov_key,
    //  w 5 — надёжнее телеграфного сейфа), оружие отборное, мандат,
    //  подорожная, часы, кошельки, медаль (снята с убитого), шинель,
    //  бекешь, кирзачи. Пить-курить любил: водка, табак.
    //  Баланс: трофейная витрина, rolls [3,5] — пустым не уйдёшь,
    //  но за каждый предмет придётся драться всерьёз.
    bandit_leader_body: T([3, 5], [
      C('treasure_map', 10, 1, 1),
      C('rifle_mosin', 8, 1, 1),
      C('rifle_sawnoff', 6, 1, 1),
      C('pistol_nagant', 6, 1, 1),
      C('rifle_round', 12, 5, 15),
      C('shell', 6, 2, 6),
      C('argunov_key', 5, 1, 1),
      C('coin_purse', 12, 1, 3),
      C('watch_silver', 5, 1, 1),
      C('mandat_red', 5, 1, 1),
      C('road_warrant', 4, 1, 1),
      C('shinel', 8, 1, 1),
      C('bekesha', 5, 1, 1),
      C('sapogi_kirzovye', 6, 1, 1),
      C('knife', 8, 1, 1),
      C('medal_bravery', 4, 1, 1),
      C('vodka', 10, 1, 2),
      C('tobacco_pouch', 8, 1, 1),
      NOTHING(6)
    ])
  };

  // ====================================================================
  //  ЧАСТЬ 3. СТАРТОВЫЕ НАБОРЫ «БЕЗЫМЯННОГО ПРОХОЖДЕНИЯ».
  //
  //  Для режима «случайный герой» (кнопка в меню — интеграция на
  //  стороне ui/menu.js): три профиля сложности. Профессиональных
  //  стартов это НЕ заменяет — это ОСОБОЕ прохождение, где герой не
  //  выбирал, кем ему быть. Профессии живут в menu.js и не тронуты.
  //
  //  Формат набора — как у профессии menu.js (items[{id,n}], skills{}),
  //  плюс поля: name, desc, difficulty ('easy'|'hard'|'normal') —
  //  чтобы карточка в меню могла подсветить профиль без догадок.
  // ====================================================================

  var START_KITS = {

    // ------------------------------------------------ БОГАТЫЙ БЕЖЕНЕНЦ
    //  «Из Петрограда, с двумя чемоданами и без адреса». Городское
    //  пальто, шляпа, брюки, яловые сапоги, кожаные перчатки, шаль
    //  (жены? уже не спросить). Документы в порядке: паспорт и
    //  подорожная. Часы, кошельки, сахар, чай, хлеб, спички, водка
    //  «для храбрости», бинты. НО: навыков НОЛЬ — эти руки держали
    //  перо, а не топор. Мороз съест его за неделю, если не научится.
    //  Баланс: вещей — на 12+ кг, скиллов — 0. Сложность: старт easy,
    //  середина игры — норм: всё придётся выучить с нуля.
    rich_refugee: {
      id: 'rich_refugee',
      name: 'Богатый беженец',
      difficulty: 'easy',
      desc: 'Из Петрограда с двумя чемоданами и без адреса. Документы, ' +
            'деньги, тёплое пальто — и ни одного умения, кроме чистописания.',
      items: [
        { id: 'palto_drapovoe', n: 1 },
        { id: 'shlyapa_fetrovaya', n: 1 },
        { id: 'bryuki_gorodskie', n: 1 },
        { id: 'sapogi_yalovye', n: 1 },
        { id: 'perchatki_kozhanye', n: 1 },
        { id: 'wool_scarf', n: 1 },
        { id: 'passport', n: 1 },
        { id: 'road_warrant', n: 1 },
        { id: 'watch_silver', n: 1 },
        { id: 'coin_purse', n: 2 },
        { id: 'bread', n: 2 },
        { id: 'sugar_loaf', n: 1 },
        { id: 'tea_brick', n: 2 },
        { id: 'matches', n: 10 },
        { id: 'vodka', n: 2 },
        { id: 'bandage', n: 2 },
        { id: 'water_flask', n: 1 }
      ],
      skills: {}
    },

    // ------------------------------------------------ ГОЛЫЙ КАТОРЖНИК
    //  «Номер на спине, клеймо на душе». Сбежал с рудника: что дали
    //  добрые люди — исподняя рубаха да портянки. Зато ЗАКОН ТАЙГИ
    //  знает лучше грамоты: кулаки (melee 2), бег (run 2), тишайший
    //  шаг (sneak 1). Первая ночь — самая страшная: ни спичек, ни
    //  ножа. Дальше — его лес, его правила.
    //  Баланс: вещей почти нет (2 шт), скиллы — как у профессии
    //  «Беглый каторжник» из menu.js (не сменили, ибо верно), но
    //  без её проф-описания — просто человек тайги. Сложность: hard.
    convict_bare: {
      id: 'convict_bare',
      name: 'Голый каторжник',
      difficulty: 'hard',
      desc: 'Сбежал с рудника: номер на спине, клеймо на душе. Ни ножа, ' +
            'ни спичек — только кулаки и знание тайги.',
      items: [
        { id: 'rubakha_natelnaya', n: 1 },
        { id: 'portyanki', n: 1 }
      ],
      skills: { melee: 2, run: 2, sneak: 1 }
    },

    // ------------------------------------------------ СЕРЕДНЯК
    //  «Из сорока дворов — двадцать третий». Обычный житель
    //  Пристани-Тихой: ушанка, суконная одежда, валенки, рукавицы,
    //  маленький топорик, спички, сухари, фляга. Кое-что умеет —
    //  выживание и печка (survive 1, cook 1) — но Specialist из него
    //  не вышел. Классический «нормальный» старт: и не банкет, и не
    //  пропасть.
    //  Баланс: вещи — базовый зимний минимум, скиллы — 2 по единице.
    //  Сложность: normal.
    srednyak: {
      id: 'srednyak',
      name: 'Середняк',
      difficulty: 'normal',
      desc: 'Из сорока дворов — двадцать третий. Ушанка, валенки, ' +
            'топорик и пара спичек. Ни богат, ни гол, как все.',
      items: [
        { id: 'ushanka', n: 1 },
        { id: 'coat_cloth', n: 1 },
        { id: 'valenki', n: 1 },
        { id: 'wool_mittens', n: 1 },
        { id: 'axe_small', n: 1 },
        { id: 'matches', n: 6 },
        { id: 'rusk', n: 4 },
        { id: 'bread', n: 1 },
        { id: 'water_flask', n: 1 },
        { id: 'candle_stump', n: 2 }
      ],
      skills: { survive: 1, cook: 1 }
    }
  };

  // порядок для «случайного героя» (равные шансы)
  var KIT_ORDER = ['rich_refugee', 'convict_bare', 'srednyak'];

  // ====================================================================
  //  ЧАСТЬ 4. BOOT: регистрация предметов, словаря, таблиц; API; тест.
  // ====================================================================

  /** Влить русский словарь (не трогая чужих ключей). */
  function applyRu() {
    try {
      WS.Data = WS.Data || {};
      WS.Data.locales = WS.Data.locales || {};
      var ru = WS.Data.locales.ru = WS.Data.locales.ru || {};
      for (var k in RU) {
        if (RU.hasOwnProperty(k) && !ru[k]) ru[k] = RU[k];
      }
    } catch (e) {
      WS.err('loot:professions: локализация не влита', e && e.message);
    }
  }

  /**
   * Самопроверка (после первого кадра): предметы зарегистрированы,
   * все id в таблицах существуют, наборы ссылаются на живые предметы.
   */
  function selfTest() {
    var bad = [];
    var items = (WS.Data && WS.Data.items) || {};
    var loot = (WS.Data && WS.Data.loot) || {};
    var trophies = (WS.Data && WS.Data.trophies) || {};
    var kits = (WS.Data && WS.Data.startKits) || {};

    // предметы-трофеи
    var k;
    for (k in NEW_ITEMS) {
      if (!NEW_ITEMS.hasOwnProperty(k)) continue;
      if (!items[k]) bad.push('предмет не зарегистрирован: ' + k);
    }

    // трофейные таблицы: в WS.Data.trophies И зеркально в WS.Data.loot
    for (k in TROPHIES) {
      if (!TROPHIES.hasOwnProperty(k)) continue;
      if (!trophies[k]) bad.push('трофеи: нет таблицы ' + k);
      if (!loot[k]) bad.push('трофеи: нет зеркала в loot ' + k);
      var t = TROPHIES[k];
      for (var i = 0; i < t.items.length; i++) {
        var it = t.items[i];
        if (!it || it.id === null) continue;
        if (!items[it.id]) bad.push(k + ': нет предмета ' + it.id);
      }
    }

    // стартовые наборы
    for (k in START_KITS) {
      if (!START_KITS.hasOwnProperty(k)) continue;
      var kit = START_KITS[k];
      if (!kits[k]) bad.push('наборы: не зарегистрирован ' + k);
      for (var j = 0; j < kit.items.length; j++) {
        if (!items[kit.items[j].id]) bad.push(k + ': нет предмета ' + kit.items[j].id);
        if (!kit.items[j].n || kit.items[j].n < 1) bad.push(k + ': n<1 у ' + kit.items[j].id);
      }
    }

    if (bad.length) {
      WS.warn('loot:professions self-test: ' + bad.length + ' проблем: ' + bad.join('; '));
    } else {
      WS.log('loot:professions self-test: OK');
    }
    return bad.length === 0;
  }

  WS.boot(function initLootProfessions() {
    WS.Data = WS.Data || {};

    // --- 1) предметы-трофеи (guard: чужие id не трогаем) ---
    WS.Data.items = WS.Data.items || {};
    var n = 0, skipped = 0;
    for (var k in NEW_ITEMS) {
      if (!NEW_ITEMS.hasOwnProperty(k)) continue;
      if (WS.Data.items[k]) { skipped++; continue; }
      WS.Data.items[k] = NEW_ITEMS[k];
      n++;
    }
    if (skipped) WS.warn('loot:professions: id уже заняты, пропущено: ' + skipped);

    // --- 2) русский словарь + защита от подмены i18n/ru.js ---
    applyRu();
    if (WS.Ev && WS.Ev.on) {
      WS.Ev.on('game:start', applyRu);
      WS.Ev.on('game:load', applyRu);
    }
    if (WS.afterFirstFrame) WS.afterFirstFrame(applyRu);

    // --- 3) трофейные таблицы: WS.Data.trophies + зеркало в loot ---
    WS.Data.trophies = WS.Data.trophies || {};
    WS.Data.loot = WS.Data.loot || {};
    var mirrored = 0;
    for (var t in TROPHIES) {
      if (!TROPHIES.hasOwnProperty(t)) continue;
      WS.Data.trophies[t] = TROPHIES[t];
      if (!WS.Data.loot[t]) {          // чужое не перезаписываем
        WS.Data.loot[t] = TROPHIES[t];
        mirrored++;
      } else {
        WS.warn('loot:professions: в loot уже есть ' + t + ' — зеркало не ставлю');
      }
    }

    // --- 4) стартовые наборы ---
    WS.Data.startKits = WS.Data.startKits || {};
    for (var s in START_KITS) {
      if (START_KITS.hasOwnProperty(s) && !WS.Data.startKits[s]) {
        WS.Data.startKits[s] = START_KITS[s];
      }
    }

    // --- 5) самопроверка после первого кадра ---
    if (WS.afterFirstFrame) WS.afterFirstFrame(selfTest);

    WS.log('loot:professions — предметов-трофеев: ' + n +
      ', трофейных таблиц: ' + mirrored + ' (+зеркала в loot)' +
      ', стартовых наборов: ' + KIT_ORDER.length +
      ' («случайный герой»)');
  }, 'loot:professions');

  // ====================================================================
  //  API ДЛЯ МЕНЮ «СЛУЧАЙНЫЙ ГЕРОЙ» (интеграция — на стороне ui,
  //  здесь только данные и один метод выбора).
  // ====================================================================

  /** Набор по id (или null). */
  function byId(id) {
    return (WS.Data && WS.Data.startKits && WS.Data.startKits[id]) || null;
  }

  /**
   * Случайный набор. R — генератор с методом f() (WS.RNG.mk), иначе
   * Math.random. Возвращает {id, name, desc, difficulty, items, skills}
   * или null, если наборов нет.
   */
  function pick(R) {
    if (!KIT_ORDER.length) return null;
    var r = (R && typeof R.f === 'function') ? R.f() : Math.random();
    var i = Math.floor(r * KIT_ORDER.length);
    if (i < 0) i = 0;
    if (i >= KIT_ORDER.length) i = KIT_ORDER.length - 1;
    return byId(KIT_ORDER[i]);
  }

  /** Список id наборов в стабильном порядке. */
  function ids() { return KIT_ORDER.slice(); }

  WS.def('StartKits', {
    byId: byId,
    pick: pick,
    ids: ids
  });

  // служебный доступ для тестов
  WS.def('LootProfessions', {
    NEW_ITEMS: NEW_ITEMS, RU: RU, TROPHIES: TROPHIES, START_KITS: START_KITS,
    selfTest: selfTest
  });
})();
