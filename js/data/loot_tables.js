/**
 * ТАБЛИЦЫ ЛУТА + НОВЫЕ ПРЕДМЕТЫ для обыска (модуль A2b).
 *
 * Часть 1 — предметы: ~50 новых id (еда Севера, одежда, ценности, медицина
 *   1917 года) регистрируются в WS.Data.items при boot — как items_seed.js.
 * Часть 2 — таблицы: WS.Data.loot['<container>'] = { rolls: [min, max],
 *   items: [{ id, w, min, max }] } — по ВСЕМ container id из interiors.js
 *   (kitchen_pech, bedroom_chest, store_shelf_food, ...), трупам зверей
 *   (wolf_body, ...) и местам (ranger_cache, boat_supply, ruins_debris).
 *
 * Честные вероятности: еда — редко, хлам — часто; в лавке — товары,
 * в кузнице — инструменты, у врача — медикаменты. Вес w — относительный
 * (сумма всех w таблицы = 100% на один «бросок»).
 *
 * Связь: systems/looting.js (генерация inv при первом обыске),
 * world/interiors.js (расстановка контейнеров), ai/bandit.js ('bandit_camp').
 */
(function () {
  'use strict';

  // ==================================================================
  //  ЧАСТЬ 1. НОВЫЕ ПРЕДМЕТЫ
  //  Схема полей — items_seed.js (cat/w/stack/cal/thir/per/cook/sick/
  //  slots/warm/wind/wet/def/light/fuelH/tags). Имена — через i18n
  //  item.<id>.name; пока словаря нет, отображается id.
  // ==================================================================

  var items = {};

  /** Регистрация предмета во временный словарь (в boot уйдёт в WS.Data.items). */
  function defItem(o) {
    if (!o || !o.id) return;
    items[o.id] = o;
  }

  // ---------------- ЕДА: МЯСО И СУБПРОДУКТЫ ----------------

  // Сырая дичина: оленина, зайчатина, медвежатина. Есть сырым —
  // рискованно (sick 30), лучше изжарить (cook -> meat_cooked).
  defItem({
    id: 'meat_raw', cat: 'food', w: 0.7, stack: 5,
    cal: 950, thir: -12, per: 2, cook: 'meat_cooked', sick: 30,
    tags: ['perishable', 'edible', 'cookable']
  });

  // Жареное мясо: сытно и безопасно, но портится так же быстро.
  defItem({
    id: 'meat_cooked', cat: 'food', w: 0.55, stack: 5,
    cal: 1200, thir: -8, per: 3,
    tags: ['edible']
  });

  // Свиное сало шпик: калорийней хлеба, месяцами не портится.
  defItem({
    id: 'lard_piece', cat: 'food', w: 0.4, stack: 6,
    cal: 2100, thir: -20, per: 40,
    tags: ['perishable', 'edible']
  });

  // Пельмени: зимой лежат в мешках прямо на морозе (поэтому per 6).
  defItem({
    id: 'pelmeni', cat: 'food', w: 0.6, stack: 6,
    cal: 1250, thir: -10, per: 6,
    tags: ['perishable', 'edible']
  });

  // ---------------- ЕДА: КРУПЫ, ВЫПЕЧКА, КОНСЕРВАЦИЯ ----------------

  // Манная крупа в холщовом мешочке: «мало каши ел» — варить некогда.
  defItem({
    id: 'semolina', cat: 'food', w: 0.8, stack: 6,
    cal: 700, thir: -14, per: 0,
    tags: ['edible']
  });

  // Овсяные хлопья «Геркулес» — северный стандарт завтрака.
  defItem({
    id: 'oat_flakes', cat: 'food', w: 0.7, stack: 6,
    cal: 800, thir: -14, per: 0,
    tags: ['edible']
  });

  // Морские сухари-галеты: плитки из обойной муки, не черствеют годами.
  defItem({
    id: 'galley_biscuits', cat: 'food', w: 0.2, stack: 15,
    cal: 550, thir: -16, per: 0,
    tags: ['edible']
  });

  // Квашеная капуста: главный источник витамина С зимой (от цинги).
  defItem({
    id: 'sauerkraut', cat: 'food', w: 0.6, stack: 4,
    cal: 350, thir: -5, per: 25,
    tags: ['perishable', 'edible']
  });

  // Солёные огурцы из кадушки: рассол тоже пьют.
  defItem({
    id: 'pickles', cat: 'food', w: 0.5, stack: 5,
    cal: 180, thir: 5, per: 30,
    tags: ['perishable', 'edible']
  });

  // Горшок мёда: калорийность как у сала, хранится вечно.
  defItem({
    id: 'honey_jar', cat: 'food', w: 0.9, stack: 2,
    cal: 1500, thir: -10, per: 0,
    tags: ['edible']
  });

  // Сушёные белые грибы на нитке — «мясо» бедняка.
  defItem({
    id: 'dried_mushrooms', cat: 'food', w: 0.15, stack: 10,
    cal: 500, thir: -8, per: 0,
    tags: ['edible']
  });

  // Сахарная голова: колют щипцами к чаю. Ломоть — почти чистые калории.
  defItem({
    id: 'sugar_loaf', cat: 'food', w: 1.0, stack: 2,
    cal: 1600, thir: -25, per: 0,
    tags: ['edible']
  });

  // Мешочек соли: не еда, но без неё дичь не сохранить.
  defItem({
    id: 'salt_bag', cat: 'misc', w: 0.5, stack: 4,
    tags: []
  });

  // ---------------- НАПИТКИ И «ЧАЙ» ----------------

  // Молоко в бутылке: скисает первым (per 1). Детям — обязательно.
  defItem({
    id: 'milk_bottle', cat: 'drink', w: 0.8, stack: 3,
    cal: 300, thir: 40, per: 1,
    tags: ['perishable', 'drinkable']
  });

  // Плиточный чай: кирпич спрессованной чайной пыли, режут ножом.
  defItem({
    id: 'tea_brick', cat: 'drink', w: 0.4, stack: 4,
    thir: 25, cal: 50, per: 0,
    tags: ['drinkable']
  });

  // Чага — берёзовый трутовик: заваривают вместо чая, «от всякой хвори».
  defItem({
    id: 'birch_chaga', cat: 'misc', w: 0.2, stack: 8,
    tags: []
  });

  // Хвоя пихты: витаминный отвар против цинги (будущий крафт).
  defItem({
    id: 'fir_needles', cat: 'misc', w: 0.1, stack: 12,
    tags: []
  });

  // ---------------- СВЕТ И ТОПЛИВО ----------------

  // Огарок свечи: в fingers — малый свет (22 тайла), сгорает за час.
  defItem({
    id: 'candle_stump', cat: 'light', w: 0.06, stack: 6,
    light: 22, fuelH: 1.2,
    tags: ['light', 'tinder']
  });

  // Бутыль лампадного масла: топливо для лампадки и «гром-лампы».
  defItem({
    id: 'lamp_oil', cat: 'fuel', w: 0.9, stack: 4,
    tags: ['fuel']
  });

  // Связка дров: три-четыре полена под с sparking верёвкой.
  defItem({
    id: 'firewood_bundle', cat: 'material', w: 3.0, stack: 3,
    tags: ['fuel_wood']
  });

  // Мешок древесного угля: топливо для жаровни и самовара.
  defItem({
    id: 'charcoal_bag', cat: 'material', w: 2.5, stack: 3,
    tags: ['fuel_wood']
  });

  // ---------------- МАТЕРИАЛЫ И ХОЗЯЙСТВО ----------------

  // Моток пеньковой верёвки: толще и прочнее обычной rope.
  defItem({
    id: 'rope_coil', cat: 'material', w: 1.2, stack: 2,
    tags: []
  });

  // Крючок на леске: снасть-полуфабрикат (удочка собирается на месте).
  defItem({
    id: 'hook_line', cat: 'tool', w: 0.05, stack: 6,
    tags: ['fishing']
  });

  // Калиброванная проволока: силки на зайца и починка сбруи.
  defItem({
    id: 'snare_wire', cat: 'tool', w: 0.08, stack: 8,
    tags: []
  });

  // Ведро дёгтя: смазка лыж, дёготь овчин, конская мазь. Тяжёлое.
  defItem({
    id: 'tar_bucket', cat: 'misc', w: 3.0, stack: 1,
    tags: []
  });

  // Простыня домотканая: разрезать на бинты и портянки.
  defItem({
    id: 'linen_sheet', cat: 'material', w: 0.4, stack: 4,
    tags: ['sewing', 'tinder']
  });

  // Стопка старых газет: «Архангельские губернские ведомости». Растопка.
  defItem({
    id: 'newspaper_stack', cat: 'material', w: 0.5, stack: 3,
    tags: ['tinder']
  });

  // ---------------- ОДЕЖДА ----------------

  // Шерстяные носки — бабушкина вязка. Сухие ноги — тёплые ноги.
  defItem({
    id: 'wool_socks', cat: 'cloth', w: 0.15, stack: 3,
    slots: ['feet'], warm: 12, wind: 15, wet: 25, def: 0,
    tags: []
  });

  // Варежки овечьи, стёганые: теплее простых mittens.
  defItem({
    id: 'wool_mittens', cat: 'cloth', w: 0.25, stack: 1,
    slots: ['hands'], warm: 25, wind: 45, wet: 35, def: 1,
    tags: []
  });

  // Заячья шапка-треух: дешёвый аналог ушанки.
  defItem({
    id: 'rabbit_fur_cap', cat: 'cloth', w: 0.3, stack: 1,
    slots: ['head'], warm: 26, wind: 45, wet: 30, def: 1,
    tags: []
  });

  // Полушалок шерстяной: на голову поверх платка, на шею — кому как.
  defItem({
    id: 'wool_scarf', cat: 'cloth', w: 0.2, stack: 1,
    slots: ['head'], warm: 14, wind: 30, wet: 30, def: 0,
    tags: []
  });

  // Шерстяное пальто «на рыбьем меху»: между тужуркой и шубой.
  defItem({
    id: 'wool_coat', cat: 'cloth', w: 2.6, stack: 1,
    slots: ['torso'], warm: 45, wind: 65, wet: 45, def: 4,
    tags: []
  });

  // Яловые сапоги: кожаные, до колена. В стужу — не хуже валенок,
  // если вложить сено.
  defItem({
    id: 'leather_boots', cat: 'cloth', w: 1.4, stack: 1,
    slots: ['feet'], warm: 15, wind: 50, wet: 70, def: 3,
    tags: []
  });

  // Детские валенки: мал мала меньше. Взрослому — только на растопку смеха.
  defItem({
    id: 'child_valenki', cat: 'cloth', w: 0.5, stack: 1,
    slots: ['feet'], warm: 20, wind: 30, wet: 15, def: 1,
    tags: []
  });

  // Медвежья полость: накидка на плечи или подстилка на сани.
  defItem({
    id: 'bearskin_rug', cat: 'cloth', w: 6.0, stack: 1,
    slots: ['back'], warm: 55, wind: 80, wet: 60, def: 5,
    tags: []
  });

  // ---------------- ЦЕННОСТИ И БЫТ ----------------

  // Серебряные часы на цепочке: тикают даже в стужу. Торгуются за хлеб.
  defItem({
    id: 'watch_silver', cat: 'misc', w: 0.05, stack: 1,
    tags: ['bandit_valuable']
  });

  // Кошелёк с медяками и двугривенным: звон есть, хлеба нет.
  defItem({
    id: 'coin_purse', cat: 'misc', w: 0.15, stack: 1,
    tags: ['bandit_valuable']
  });

  // Гармонь-хромка: в тундре весёлее, когда поют.
  defItem({
    id: 'harmonica', cat: 'misc', w: 0.4, stack: 1,
    tags: []
  });

  // Серебряный нательный крест: последняя ценность, с которой не расстаются.
  defItem({
    id: 'cross_silver', cat: 'misc', w: 0.02, stack: 1,
    tags: []
  });

  // Кисет с махоркой: самосад успокаивает нервы (будущая система).
  defItem({
    id: 'tobacco_pouch', cat: 'misc', w: 0.12, stack: 3,
    tags: []
  });

  // Трубка черешневая: без кисета — просто украшение.
  defItem({
    id: 'tobacco_pipe', cat: 'misc', w: 0.15, stack: 1,
    tags: []
  });

  // Колода карт: «в дурака» до полярной ночи. Грех, но скучно.
  defItem({
    id: 'deck_cards', cat: 'misc', w: 0.1, stack: 1,
    tags: []
  });

  // Медаль «За храбрость»: солдатская, с бантом.
  defItem({
    id: 'medal_bravery', cat: 'misc', w: 0.03, stack: 1,
    tags: ['bandit_valuable']
  });

  // Чернильница-невыпивайка: сапожное сало вместо сургуча.
  defItem({
    id: 'inkwell', cat: 'misc', w: 0.1, stack: 2,
    tags: []
  });

  // Старое письмо: почерк выцвел, бумага крошится. Прочесть бы...
  defItem({
    id: 'letter_old', cat: 'book', w: 0.02, stack: 1,
    note: true,
    tags: ['readable', 'quest']
  });

  // Семейная фотография: кабинетный снимок, все смотрят строго.
  defItem({
    id: 'photo_family', cat: 'book', w: 0.02, stack: 1,
    note: true,
    tags: ['readable']
  });

  // ---------------- МЕДИЦИНА (для больницы и фельдшеров) ----------------

  // Стерильный бинт: глаженный утюгом, крахмал держит форму.
  defItem({
    id: 'bandage_clean', cat: 'med', w: 0.08, stack: 10,
    heal: 20, stopBleed: true,
    tags: ['heal']
  });

  // Карболовая кислота: жжёт, но гангрену останавливает.
  defItem({
    id: 'carbolic_acid', cat: 'med', w: 0.25, stack: 4,
    heal: 5,
    tags: ['heal', 'disinfect']
  });

  // Йодная настойка: царапины, ссадины, «подсушить» рану.
  defItem({
    id: 'iodine_tincture', cat: 'med', w: 0.1, stack: 6,
    heal: 8,
    tags: ['heal', 'disinfect']
  });

  // Хинин: от «болотной лихорадки». Горький до звона в ушах.
  defItem({
    id: 'quinine', cat: 'med', w: 0.02, stack: 10,
    tags: ['heal']
  });

  // Лауданум: опийная настойка. Боль снимает, привычку оставляет.
  defItem({
    id: 'laudanum', cat: 'med', w: 0.1, stack: 5,
    painkill: 75, drunk: 35,
    tags: ['heal', 'drinkable']
  });

  // Гипсовая повязка: переломы — до весеннего парохода.
  defItem({
    id: 'plaster_cast', cat: 'med', w: 1.2, stack: 2,
    tags: ['heal']
  });

  // Скальпель хирургический: в умелых руках — жизнь, в сём — шесть урона.
  defItem({
    id: 'scalpel', cat: 'tool', w: 0.1, stack: 1,
    dmg: 6, range: 0.7, atkSpd: 2.0, knock: 1, crit: 18,
    tags: ['cutting', 'weapon']
  });

  // «Руководство к полевой хирургии»: читать — повышать навык «медицина».
  defItem({
    id: 'medical_book', cat: 'book', w: 0.8, stack: 1,
    skill: 'medic', pages: 50,
    tags: ['readable']
  });

  // ==================================================================
  //  ЧАСТЬ 2. ТАБЛИЦЫ ЛУТА
  //
  //  Формат: T(id, [rollsMin, rollsMax], [записи]) где запись =
  //  it(id предмета, вес, минимум штук, максимум штук).
  //  rolls = сколько раз крутится рулетка при первом обыске.
  //  Честность: дом = хлам вперемешку с редкой едой; лавка = товар;
  //  больница = медикаменты; склад/амбар = материалы и припасы.
  // ==================================================================

  var loot = {};

  /** Запись таблицы: предмет + вес вероятности + диапазон количества. */
  function it(id, w, min, max) {
    return { id: id, w: w, min: (min || 1), max: (max || min || 1) };
  }

  /** Регистрация таблицы. */
  function T(id, rolls, arr) {
    loot[id] = { rolls: rolls, items: arr };
  }

  /** Псевдоним: контейнер копирует содержимое другой таблицы. */
  function alias(id, src) {
    loot[id] = loot[src];
  }

  // ==================================================================
  //  ИЗБА: КУХНЯ
  // ==================================================================

  // Печь (подпечье): дрова, зола, забытый чугунок. Еда тут не хранится,
  // но спички в трубе и огарок на шестке — почти всегда.
  T('kitchen_pech', [1, 3], [
    it('charcoal',        12, 2, 6),   // вёдра углей и золы
    it('firewood_bundle', 10, 1, 1),   // охапка из подпечья
    it('matches',          6, 2, 8),   // коробок за заслонкой
    it('candle_stump',     5, 1, 2),   // огарок на шестке
    it('scrap_metal',      4, 1, 3),   // сломанная дверца
    it('bread',            4, 1, 1),   // недоеденный каравай
    it('lard_piece',       3, 1, 1),   // шкварки в чугунке
    it('knife',            2, 1, 1)    // кухонный нож в щели
  ]);

  // Стол кухонный: крошки, посуда, что осталось от ужина.
  T('kitchen_table', [1, 3], [
    it('rusk',             8, 2, 5),   // сухари в решете
    it('bread',            6, 1, 2),
    it('galley_biscuits',  5, 2, 6),
    it('knife',            5, 1, 1),
    it('matches',          4, 2, 6),
    it('tea_brick',        3, 1, 1),
    it('newspaper_stack',  3, 1, 1),   // газета вместо скатерти
    it('salt_fish',        3, 1, 2),
    it('water_flask',      3, 1, 1),
    it('pelmeni',          2, 1, 2)   // миска слепленных
  ]);

  // Буфет: посудный шкаф — главное место припасов избы. И всё же
  // половина полок занята посудой, а не едой.
  T('kitchen_cupboard', [2, 4], [
    it('rusk',            10, 2, 6),
    it('oat_flakes',       8, 1, 2),
    it('dried_fish',       8, 1, 3),
    it('sauerkraut',       7, 1, 2),
    it('pickles',          7, 1, 3),
    it('semolina',         6, 1, 2),
    it('salt_bag',         6, 1, 1),
    it('tea_brick',        5, 1, 1),
    it('lard_piece',       5, 1, 2),
    it('water_flask',      4, 1, 1),
    it('vodka',            3, 1, 1),   // «для аппетита»
    it('sugar_loaf',       3, 1, 1),
    it('honey_jar',        2, 1, 1),
    it('canned_fish',      2, 1, 2),
    it('milk_bottle',      2, 1, 1),
    it('cloth_rag',        4, 1, 3)   // полотенце-ветошь
  ]);

  // Полка кухонная: мелочь, специи, «аптека» домохозяйки.
  T('kitchen_shelf', [1, 3], [
    it('candle_stump',    8, 1, 3),
    it('matches',         7, 2, 8),
    it('dried_mushrooms', 5, 1, 3),   // нитка грибов
    it('salt_bag',        5, 1, 1),
    it('birch_chaga',     4, 1, 2),
    it('fir_needles',     3, 1, 2),
    it('lamp_oil',        3, 1, 1),
    it('sugar_loaf',      2, 1, 1),
    it('hook_line',       1, 1, 2)    // леска мотком
  ]);

  // ==================================================================
  //  ИЗБА: СПАЛЬНЯ
  // ==================================================================

  // Кровать: под подушкой и в перине. Чаще — пусто, реже — тайник.
  T('bedroom_bed', [0, 1], [
    it('wool_socks',      5, 1, 2),
    it('wool_mittens',    5, 1, 1),
    it('knife',           3, 1, 1),   // под подушкой, на всякий
    it('letter_old',      3, 1, 1),
    it('photo_family',    3, 1, 1),
    it('journal_page',    2, 1, 1),
    it('coin_purse',      2, 1, 1),
    it('cross_silver',    1, 1, 1),
    it('watch_silver',    1, 1, 1),
    it('harmonica',       1, 1, 1)
  ]);

  // Сундук крестьянский: приданое, одежда, ценности. Не гроб с золотом —
  // но шерсти и спичек наберёшь.
  T('bedroom_chest', [2, 4], [
    it('wool_socks',      7, 1, 2),
    it('wool_mittens',    6, 1, 2),
    it('linen_sheet',     6, 1, 3),
    it('wool_scarf',      6, 1, 1),
    it('matches',         5, 3, 10),
    it('candle_stump',    5, 1, 3),
    it('rabbit_fur_cap',  4, 1, 1),
    it('coin_purse',      3, 1, 1),
    it('child_valenki',   3, 1, 1),
    it('sewing_kit',      3, 1, 1),
    it('vodka',           3, 1, 2),
    it('deck_cards',      2, 1, 1),
    it('letter_old',      2, 1, 1),
    it('photo_family',    2, 1, 1),
    it('book_carpentry',  2, 1, 1),
    it('harmonica',       1, 1, 1),
    it('wool_coat',       1, 1, 1),
    it('medal_bravery',   1, 1, 1)
  ]);

  // Сундук дачи: ценнее крестьянского — деньги, городское платье, книги.
  T('dacha_chest', [3, 5], [
    it('coin_purse',      6, 1, 2),
    it('wool_coat',       5, 1, 1),
    it('leather_boots',   4, 1, 1),
    it('sugar_loaf',      4, 1, 2),
    it('vodka',           4, 1, 2),
    it('tea_brick',       4, 1, 2),
    it('candle_stump',    4, 2, 4),
    it('photo_family',    3, 1, 1),
    it('letter_old',      3, 1, 1),
    it('deck_cards',      3, 1, 1),
    it('watch_silver',    3, 1, 1),
    it('aspirin',         3, 2, 6),
    it('wool_scarf',      3, 1, 1),
    it('book_carpentry',  2, 1, 1),
    it('cross_silver',    2, 1, 1),
    it('harmonica',       2, 1, 1),
    it('medal_bravery',   2, 1, 1),
    it('book_medic',      1, 1, 1),
    it('morphine',        1, 1, 2),
    it('bearskin_rug',    1, 1, 1)
  ]);

  // Шкап (платяной): одежда вперемешку с молью.
  T('bedroom_wardrobe', [2, 4], [
    it('wool_socks',      8, 1, 3),
    it('wool_mittens',    8, 1, 2),
    it('wool_scarf',      8, 1, 2),
    it('linen_sheet',     7, 1, 2),
    it('cloth_rag',       6, 2, 4),
    it('child_valenki',   4, 1, 1),
    it('rabbit_fur_cap',  3, 1, 1),
    it('mittens',         3, 1, 1),
    it('coat_cloth',      3, 1, 1),
    it('wool_coat',       2, 1, 1),
    it('ushanka',         2, 1, 1),
    it('valenki',         2, 1, 1),
    it('leather_boots',   2, 1, 1)
  ]);

  // ==================================================================
  //  ИЗБА: ГОРНИЦА (ГОСТИНАЯ)
  // ==================================================================

  // Буфет/полка горницы: к чаю — посуда, к гостю — остатки угощения.
  T('living_shelf', [1, 3], [
    it('rusk',            7, 2, 5),
    it('candle_stump',    6, 1, 2),
    it('dried_fish',      5, 1, 2),
    it('vodka',           5, 1, 2),
    it('newspaper_stack', 5, 1, 2),
    it('sauerkraut',      4, 1, 2),
    it('tea_brick',       3, 1, 1),
    it('deck_cards',      2, 1, 1),
    it('photo_family',    2, 1, 1),
    it('honey_jar',       1, 1, 1)
  ]);

  // Ящик хозяйственный (сени/горница): гвозди, тряпьё, верёвка.
  T('living_crate', [1, 3], [
    it('nails',          10, 5, 20),
    it('scrap_metal',     9, 2, 5),
    it('cloth_rag',      8, 2, 4),
    it('plank',           6, 1, 3),
    it('firewood_bundle', 5, 1, 2),
    it('charcoal',        5, 2, 5),
    it('rope_coil',       4, 1, 1),
    it('snare_wire',      2, 1, 3),
    it('tar_bucket',      1, 1, 1)
  ]);

  // Тахта: за подушками — то, что не донесли до шкапа.
  T('living_sofa', [0, 1], [
    it('wool_scarf',      4, 1, 1),
    it('photo_family',    3, 1, 1),
    it('letter_old',      3, 1, 1),
    it('coin_purse',      2, 1, 1),
    it('deck_cards',      2, 1, 1),
    it('harmonica',       1, 1, 1)
  ]);

  // ==================================================================
  //  ШКОЛА
  // ==================================================================

  // Шкап с книгами: учебники, тетради, чернильницы.
  T('school_shelf', [2, 4], [
    it('newspaper_stack', 10, 1, 2),
    it('inkwell',         7, 1, 2),
    it('book_carpentry',  4, 1, 1),
    it('letter_old',      3, 1, 2),
    it('candle_stump',    3, 1, 2),
    it('matches',         3, 1, 4),
    it('medical_book',    2, 1, 1),
    it('book_medic',      2, 1, 1),
    it('deck_cards',      1, 1, 1)
  ]);

  // Парты: детская мелочь — перья, огрызки, гармошка у озорника.
  T('school_desk', [0, 2], [
    it('inkwell',         5, 1, 1),
    it('newspaper_stack', 4, 1, 1),
    it('deck_cards',      3, 1, 1),
    it('rusk',            3, 1, 2),
    it('letter_old',      2, 1, 1),
    it('galley_biscuits', 2, 1, 3),
    it('fir_needles',     2, 1, 2),   // гербарий
    it('harmonica',       1, 1, 1)
  ]);

  // ==================================================================
  //  АМБАР, ДВОР, БАНЯ
  // ==================================================================

  // Ящик инструментов (амбар/баня): топор может не быть — гвозди будут.
  T('barn_tools', [1, 3], [
    it('nails',          10, 8, 25),
    it('scrap_metal',     9, 2, 6),
    it('plank',           7, 2, 4),
    it('rope_coil',       6, 1, 1),
    it('hatchet',         4, 1, 1),
    it('saw',             4, 1, 1),
    it('shovel',          4, 1, 1),
    it('matches',         3, 2, 6),
    it('crowbar',         3, 1, 1),
    it('ice_pick',        3, 1, 1),
    it('snare_wire',      3, 2, 5),
    it('axe',             2, 1, 1),
    it('tar_bucket',      2, 1, 1),
    it('hook_line',       2, 1, 3)
  ]);

  // Сено: почти пусто — мыши да потерянная мелочь.
  T('barn_hay', [0, 1], [
    it('cloth_rag',      5, 1, 2),
    it('fir_needles',    4, 1, 3),
    it('hook_line',      2, 1, 1),
    it('snare_wire',     2, 1, 2),
    it('dried_mushrooms', 1, 1, 2),
    it('nails',          1, 2, 5)
  ]);

  // Стойка со сбруей (конюшня): упряжь, кожаные обрезки, дёготь.
  T('stable_rack', [2, 4], [
    it('rope_coil',      9, 1, 2),
    it('rope',           8, 1, 2),
    it('nails',          7, 5, 15),
    it('cloth_rag',      6, 2, 4),
    it('tar_bucket',      5, 1, 1),
    it('scrap_metal',     5, 2, 4),
    it('snare_wire',      5, 2, 4),
    it('leather_boots',   3, 1, 1),   // старая пара конюха
    it('knife',           2, 1, 1),
    it('hatchet',         2, 1, 1),
    it('water_flask',     2, 1, 1)
  ]);

  // ==================================================================
  //  РЫБНЫЙ ПРОМЫСЕЛ
  // ==================================================================

  // Снасти рыбака (рыбачья изба): крючки, лески, рыба.
  T('fishing_rack', [2, 4], [
    it('hook_line',      14, 2, 5),
    it('dried_fish',     10, 2, 4),
    it('salt_fish',       7, 1, 3),
    it('rope',            7, 1, 2),
    it('fresh_fish',      5, 1, 3),
    it('rope_coil',       5, 1, 1),
    it('knife',           4, 1, 1),
    it('ice_pick',        4, 1, 1),
    it('fishing_rod',     3, 1, 1),
    it('canned_fish',     3, 1, 2),
    it('matches',         2, 1, 4),
    it('lamp_oil',        2, 1, 1)
  ]);

  // ==================================================================
  //  ПОГРЕБ
  // ==================================================================

  // Закрома погреба: квашение, соленья, мешки. Самое сытное место
  // избы — но и его пустовали до прихода корабля снабжения.
  T('cellar_veg', [3, 5], [
    it('sauerkraut',     12, 1, 3),
    it('pickles',       12, 1, 3),
    it('pelmeni',        8, 1, 3),   // мешок на морозе
    it('lard_piece',     7, 1, 3),
    it('salt_fish',      6, 1, 3),
    it('dried_mushrooms', 6, 2, 4),
    it('salt_bag',        5, 1, 2),
    it('oat_flakes',      4, 1, 2),
    it('semolina',        4, 1, 2),
    it('honey_jar',       4, 1, 1),
    it('birch_chaga',     3, 1, 3),
    it('vodka',           3, 1, 2),
    it('fir_needles',     2, 1, 3)
  ]);

  // ==================================================================
  //  ЛАВКА (магазин)
  // ==================================================================

  // Прилавок: деньги из ящика, мелкий товар, счёты.
  T('store_counter', [2, 4], [
    it('coin_purse',      8, 1, 3),
    it('sugar_loaf',      6, 1, 2),
    it('tea_brick',       6, 1, 2),
    it('salt_bag',        6, 1, 2),
    it('matches',         6, 3, 10),
    it('candle_stump',    5, 1, 3),
    it('vodka',           4, 1, 2),
    it('tobacco_pouch',   4, 1, 2),
    it('inkwell',         3, 1, 1),
    it('letter_old',      2, 1, 1),   // счета и накладные
    it('watch_silver',    1, 1, 1),
    it('harmonica',       1, 1, 1)
  ]);

  // Полка бакалеи: товар — не хлам. Но и тут половина продана.
  T('store_shelf_food', [2, 4], [
    it('rusk',            10, 3, 8),
    it('semolina',         9, 1, 3),
    it('oat_flakes',       9, 1, 3),
    it('galley_biscuits',  9, 3, 8),
    it('salt_bag',         8, 1, 3),
    it('sugar_loaf',       7, 1, 2),
    it('tea_brick',        7, 1, 2),
    it('bread',            6, 1, 3),
    it('lard_piece',       6, 1, 3),
    it('pickles',          5, 1, 3),
    it('sauerkraut',       5, 1, 3),
    it('canned_fish',      5, 1, 3),
    it('milk_bottle',      4, 1, 2),
    it('honey_jar',        4, 1, 1),
    it('dried_mushrooms',  4, 2, 4),
    it('birch_chaga',      3, 1, 2)
  ]);

  // Полка скобяного товара: то, чем живут избы.
  T('store_shelf_tools', [2, 4], [
    it('nails',          12, 10, 30),
    it('rope',            8, 1, 3),
    it('rope_coil',       6, 1, 2),
    it('matches',         6, 4, 10),
    it('saw',             5, 1, 1),
    it('hammer',           5, 1, 1),
    it('hatchet',          4, 1, 1),
    it('ice_pick',        4, 1, 1),
    it('shovel',           4, 1, 1),
    it('scrap_metal',      6, 2, 5),
    it('snare_wire',       5, 2, 6),
    it('hook_line',        5, 2, 4),
    it('lamp_oil',         4, 1, 2),
    it('crowbar',          3, 1, 1),
    it('fishing_rod',      2, 1, 1),
    it('sewing_kit',       3, 1, 1),
    it('axe',              2, 1, 1),
    it('tar_bucket',       2, 1, 1)
  ]);

  // Полка мануфактуры: сукно, вязание, обувь.
  T('store_shelf_cloth', [2, 4], [
    it('wool_socks',      9, 1, 3),
    it('wool_mittens',    9, 1, 2),
    it('linen_sheet',     8, 1, 3),
    it('wool_scarf',      8, 1, 2),
    it('cloth_rag',        7, 2, 5),
    it('child_valenki',   5, 1, 2),
    it('valenki',          5, 1, 2),
    it('ushanka',          4, 1, 1),
    it('rabbit_fur_cap',  4, 1, 1),
    it('sewing_kit',       4, 1, 1),
    it('mittens',          4, 1, 2),
    it('wool_coat',        3, 1, 1),
    it('leather_boots',    3, 1, 1),
    it('bearskin_rug',     1, 1, 1)
  ]);

  // Подсобка лавки (задняя комната): нераспакованный товар.
  T('store_storage', [2, 4], [
    it('nails',           8, 10, 25),
    it('scrap_metal',     7, 2, 5),
    it('matches',         6, 4, 10),
    it('galley_biscuits', 5, 3, 6),
    it('candle_stump',    5, 2, 4),
    it('lamp_oil',        5, 1, 2),
    it('charcoal',         5, 3, 8),
    it('salt_bag',         5, 1, 3),
    it('sugar_loaf',       4, 1, 2),
    it('tea_brick',        4, 1, 2),
    it('semolina',         4, 1, 2),
    it('oat_flakes',       4, 1, 2),
    it('firewood_bundle', 4, 1, 2),
    it('rope_coil',       3, 1, 1),
    it('vodka',           3, 1, 2)
  ]);

  // ==================================================================
  //  ТРАКТИР
  // ==================================================================

  // Стойка трактира: выпивка, закусь, трубки посетителей.
  T('tavern_bar', [2, 4], [
    it('vodka',          12, 1, 3),
    it('rusk',            7, 2, 5),
    it('dried_fish',      6, 2, 4),
    it('pickles',         6, 2, 4),
    it('galley_biscuits', 5, 3, 6),
    it('sauerkraut',      5, 1, 3),
    it('tobacco_pouch',   4, 1, 2),
    it('matches',         4, 2, 6),
    it('tobacco_pipe',    3, 1, 2),
    it('candle_stump',    3, 1, 3),
    it('tea_brick',       2, 1, 1),
    it('deck_cards',      2, 1, 1),
    it('coin_purse',      2, 1, 1),
    it('harmonica',       1, 1, 1)
  ]);

  // Стол трактирный / подсвечник: что осталось от посетителей.
  T('tavern_table', [0, 2], [
    it('candle_stump',    10, 1, 2),
    it('matches',          5, 1, 4),
    it('rusk',            5, 1, 3),
    it('vodka',           4, 1, 1),
    it('tobacco_pouch',   3, 1, 1),
    it('deck_cards',      3, 1, 1),
    it('coin_purse',      1, 1, 1),
    it('harmonica',       1, 1, 1)
  ]);

  // Подклет трактира: бочки, ящики, припасы на зиму.
  T('tavern_cellar', [3, 5], [
    it('vodka',          12, 2, 4),
    it('sauerkraut',      9, 2, 4),
    it('pickles',         9, 2, 4),
    it('salt_fish',       7, 2, 4),
    it('dried_fish',      7, 2, 4),
    it('pelmeni',         6, 2, 4),
    it('galley_biscuits', 6, 4, 10),
    it('charcoal',        5, 3, 8),
    it('semolina',        5, 1, 3),
    it('oat_flakes',      5, 1, 3),
    it('lard_piece',      5, 1, 3),
    it('firewood_bundle', 4, 1, 2),
    it('honey_jar',       3, 1, 1),
    it('canned_fish',     2, 1, 3),
    it('lamp_oil',        2, 1, 2)
  ]);

  // ==================================================================
  //  ЦЕРКОВЬ
  // ==================================================================

  // Подсвечник храма: огарки — основная церковная «добыча».
  T('church_candle', [1, 2], [
    it('candle_stump',   20, 2, 5),
    it('matches',         2, 1, 3),
    it('coin_purse',      1, 1, 1),  // копеечка на свечку
    it('cross_silver',    1, 1, 1)
  ]);

  // Престол (алтарь): святое место — но и тут греют руки.
  T('church_altar', [1, 3], [
    it('candle_stump',    8, 2, 4),
    it('cross_silver',    3, 1, 1),
    it('water_flask',     3, 1, 1),  // святая вода
    it('letter_old',      2, 1, 1),  // записка о здравии
    it('coin_purse',      2, 1, 2),
    it('inkwell',         1, 1, 1),
    it('medal_bravery',   1, 1, 1)
  ]);

  // ==================================================================
  //  КОНТОРЫ И КАБИНЕТЫ
  // ==================================================================

  // Конторка телеграфа: бумаги, чернила, казённые мелочи.
  T('telegraph_desk', [2, 4], [
    it('newspaper_stack', 10, 1, 3),
    it('inkwell',         8, 1, 3),
    it('letter_old',      6, 1, 3),  // телеграммы-черновики
    it('candle_stump',    5, 1, 2),
    it('matches',         3, 1, 4),
    it('coin_purse',      2, 1, 1),
    it('deck_cards',      1, 1, 1),
    it('aspirin',         1, 1, 3),
    it('watch_silver',    1, 1, 1)
  ]);

  // Шкаф околотка (участкового): изъятое у пьяных и бродяг.
  T('jail_locker', [2, 4], [
    it('coin_purse',      7, 1, 3),
    it('vodka',           6, 1, 3),
    it('knife',           5, 1, 2),
    it('tobacco_pouch',   5, 1, 3),
    it('matches',         4, 2, 6),
    it('deck_cards',      4, 1, 2),
    it('letter_old',      3, 1, 2),
    it('rusk',            3, 1, 3),
    it('harmonica',       2, 1, 1),
    it('watch_silver',    2, 1, 1),
    it('crowbar',         1, 1, 1),
    it('morphine',        1, 1, 1)
  ]);

  // ==================================================================
  //  БОЛЬНИЦА (ДОКТОР)
  // ==================================================================

  // Кабинет врача: медикаменты 1917 года. Стерильное — дефицит,
  // карболка и йод — основа полевой медицины.
  T('doctor_cabinet', [3, 5], [
    it('bandage_clean',   12, 2, 6),
    it('bandage',         10, 2, 6),
    it('iodine_tincture',  9, 1, 4),
    it('carbolic_acid',   8, 1, 3),
    it('aspirin',          8, 3, 8),
    it('quinine',          5, 2, 6),
    it('laudanum',         4, 1, 3),
    it('vodka',            4, 1, 2),   // медицинский спирт
    it('morphine',         3, 1, 3),
    it('plaster_cast',     3, 1, 2),
    it('scalpel',          2, 1, 1),
    it('medical_book',     2, 1, 1),
    it('water_flask',      3, 1, 2),
    it('candle_stump',     2, 1, 2),
    it('lamp_oil',         1, 1, 1)
  ]);

  // Кушетка врача: под матрацем — то, что больной припрятал.
  T('doctor_bed', [0, 2], [
    it('bandage_clean',   5, 1, 2),
    it('linen_sheet',     4, 1, 2),
    it('coin_purse',      3, 1, 1),
    it('letter_old',      2, 1, 1),
    it('laudanum',        2, 1, 1),
    it('watch_silver',    1, 1, 1),
    it('morphine',        1, 1, 1)
  ]);

  // ==================================================================
  //  МАСТЕРСКИЕ: КУЗНИЦА И ПИЛОРАМА
  // ==================================================================

  // Наковальня (кузница): забытые заказы, подковы, скобянка.
  T('smithy_anvil', [1, 3], [
    it('scrap_metal',    12, 3, 8),
    it('nails',          10, 10, 30),
    it('charcoal',        7, 4, 10),
    it('hammer',          5, 1, 1),
    it('knife',           4, 1, 1),
    it('hatchet',         3, 1, 1),
    it('axe',             2, 1, 1),
    it('saw',             2, 1, 1),
    it('shovel',          2, 1, 1),
    it('crowbar',         2, 1, 1),
    it('hunting_knife',   2, 1, 1)
  ]);

  // Верстак кузницы: инструменты и материалы вперемешку.
  T('smithy_shelf', [2, 4], [
    it('nails',          10, 10, 30),
    it('scrap_metal',    10, 3, 8),
    it('charcoal',        7, 4, 10),
    it('rope',            6, 1, 3),
    it('cloth_rag',       5, 2, 4),
    it('hammer',          4, 1, 1),
    it('saw',             4, 1, 1),
    it('knife',           3, 1, 1),
    it('charcoal_bag',    3, 1, 1),
    it('matches',         3, 2, 6),
    it('crowbar',         2, 1, 1),
    it('ice_pick',        2, 1, 1),
    it('lamp_oil',        2, 1, 2),
    it('tar_bucket',      2, 1, 1)
  ]);

  // Верстак пилорамы: дерево, дерево и ещё раз дерево.
  T('sawmill_workbench', [2, 4], [
    it('plank',          14, 4, 10),
    it('nails',          10, 10, 30),
    it('rope',            6, 1, 3),
    it('saw',             5, 1, 1),
    it('hammer',          4, 1, 1),
    it('scrap_metal',     5, 2, 5),
    it('rope_coil',       4, 1, 2),
    it('hatchet',         3, 1, 1),
    it('axe',             2, 1, 1),
    it('crowbar',         2, 1, 1),
    it('matches',         3, 2, 6)
  ]);

  // ==================================================================
  //  СКЛАД И ПАКГАУЗ
  // ==================================================================

  // Ящик склада: смешанный груз снабжения.
  T('warehouse_crate', [2, 4], [
    it('nails',          10, 10, 30),
    it('plank',           9, 3, 8),
    it('scrap_metal',     8, 3, 7),
    it('charcoal',        6, 4, 10),
    it('matches',         5, 4, 10),
    it('rope_coil',       5, 1, 2),
    it('firewood_bundle', 5, 1, 2),
    it('galley_biscuits', 4, 4, 10),
    it('canned_fish',     4, 1, 4),
    it('salt_bag',        4, 1, 3),
    it('semolina',         3, 1, 3),
    it('oat_flakes',       3, 1, 3),
    it('tea_brick',       3, 1, 2),
    it('lamp_oil',        3, 1, 2),
    it('hatchet',         2, 1, 1),
    it('saw',             2, 1, 1),
    it('shovel',          2, 1, 1),
    it('crowbar',         2, 1, 1),
    it('axe',             1, 1, 1),
    it('sugar_loaf',      2, 1, 2)
  ]);

  // Бочка склада: рассольное, керосин, дёготь.
  T('warehouse_barrel', [1, 3], [
    it('sauerkraut',     10, 2, 5),
    it('pickles',        10, 2, 5),
    it('charcoal',        7, 4, 10),
    it('salt_fish',       6, 2, 4),
    it('dried_fish',      5, 2, 4),
    it('kerosene',        4, 1, 3),
    it('lamp_oil',        4, 1, 2),
    it('lard_piece',      4, 1, 3),
    it('tar_bucket',      3, 1, 1),
    it('water_flask',     3, 1, 2),
    it('vodka',           2, 1, 2),
    it('honey_jar',       1, 1, 1)
  ]);

  // Мешок склада: сыпучее — крупа, соль, сухари.
  T('warehouse_sack', [1, 3], [
    it('semolina',        8, 1, 3),
    it('oat_flakes',      8, 1, 3),
    it('rusk',             7, 3, 8),
    it('salt_bag',         6, 1, 3),
    it('galley_biscuits',  5, 3, 8),
    it('charcoal_bag',     4, 1, 1),
    it('dried_mushrooms',  4, 2, 4),
    it('fir_needles',      3, 1, 3),
    it('birch_chaga',      3, 1, 3),
    it('sugar_loaf',       2, 1, 1),
    it('nails',            2, 5, 15)
  ]);

  // Закрома (амбар зерна): зерно и то, что в нём заводится.
  T('granary_sack', [2, 4], [
    it('oat_flakes',     12, 2, 5),
    it('semolina',      10, 2, 5),
    it('rusk',            6, 3, 8),
    it('galley_biscuits', 4, 3, 8),
    it('cloth_rag',       3, 1, 3),
    it('fir_needles',     3, 1, 3),
    it('dried_mushrooms', 2, 1, 3),
    it('snare_wire',      1, 1, 2)   // мышеловка сломалась
  ]);

  // ==================================================================
  //  РАЗВАЛИНЫ
  // ==================================================================

  // Обугленный хлам в сгоревшем доме: угли, металл, редко — целое.
  T('ruined_debris', [1, 3], [
    it('scrap_metal',    12, 3, 8),
    it('charcoal',       10, 4, 12),
    it('nails',           8, 8, 25),
    it('plank',           5, 2, 5),   // обгорелые доски
    it('cloth_rag',       5, 1, 3),
    it('firewood_bundle', 3, 1, 1),
    it('candle_stump',    2, 1, 2),
    it('saw',             1, 1, 1),
    it('crowbar',         1, 1, 1),
    it('knife',           1, 1, 1),
    it('coin_purse',      1, 1, 1),   // сгоревший тайник
    it('matches',         1, 1, 3)
  ]);

  // Уличные развалины (для будущих локаций за посёлком): то же,
  // но ещё скуднее — растащили до нас.
  T('ruins_debris', [1, 2], [
    it('scrap_metal',    12, 2, 6),
    it('charcoal',        8, 3, 8),
    it('nails',           8, 5, 15),
    it('plank',           6, 2, 4),
    it('cloth_rag',       5, 1, 3),
    it('newspaper_stack', 3, 1, 1),   // промокшие листы
    it('rope_coil',       2, 1, 1),
    it('tar_bucket',      1, 1, 1),
    it('lamp_oil',        1, 1, 1),
    it('coin_purse',      1, 1, 1)
  ]);

  // ==================================================================
  //  ЛИЧНЫЕ ВЕЩИ (гроб в алтаре, камера околотка)
  // ==================================================================

  // Личные вещи: у каждого покойника и заключённого был карман.
  T('personal_body', [2, 4], [
    it('coin_purse',      7, 1, 3),
    it('letter_old',      6, 1, 2),
    it('photo_family',    5, 1, 1),
    it('tobacco_pouch',   5, 1, 2),
    it('wool_scarf',      4, 1, 1),
    it('knife',           4, 1, 1),
    it('rusk',            4, 1, 3),
    it('vodka',           3, 1, 2),
    it('cross_silver',    3, 1, 1),
    it('watch_silver',    2, 1, 1),
    it('medal_bravery',   1, 1, 1),
    it('harmonica',       1, 1, 1),
    it('morphine',        1, 1, 1)
  ]);

  // ==================================================================
  //  ДОЗОРНАЯ ВЫШКА
  // ==================================================================

  // Ларь дозорного: казённое снабжение — патроны, сухари, тёплое.
  T('guardtower_locker', [3, 5], [
    it('rifle_round',     9, 4, 12),
    it('rusk',            8, 3, 8),
    it('matches',         7, 4, 10),
    it('galley_biscuits', 6, 4, 10),
    it('candle_stump',    5, 2, 4),
    it('wool_socks',      4, 1, 2),
    it('wool_mittens',    4, 1, 2),
    it('vodka',           4, 1, 2),
    it('shell',           4, 2, 5),
    it('canned_fish',     4, 1, 3),
    it('bandage',         4, 2, 4),
    it('tobacco_pouch',   3, 1, 2),
    it('firewood_bundle', 3, 1, 2),
    it('kerosene',        3, 1, 2),
    it('hatchet',         2, 1, 1),
    it('lantern',         1, 1, 1),
    it('axe',             1, 1, 1),
    it('harmonica',       1, 1, 1)
  ]);

  // ==================================================================
  //  БАНДИТЫ
  // ==================================================================

  // Ящик бандитского лагеря (ai/bandit.js): награбленное и выпитое.
  T('bandit_camp', [2, 4], [
    it('vodka',           8, 1, 3),
    it('rusk',            7, 2, 6),
    it('rifle_round',     7, 3, 10),
    it('galley_biscuits', 5, 3, 8),
    it('salt_fish',       5, 1, 3),
    it('dried_fish',      5, 2, 4),
    it('tobacco_pouch',   5, 1, 3),
    it('coin_purse',      4, 1, 3),   // чужие кошельки
    it('lard_piece',      4, 1, 3),
    it('matches',         4, 2, 8),
    it('bandage',         3, 1, 3),
    it('knife',           3, 1, 2),
    it('wool_scarf',      3, 1, 2),
    it('shell',           3, 2, 4),
    it('deck_cards',      2, 1, 1),
    it('letter_old',      2, 1, 1),
    it('hatchet',         2, 1, 1),
    it('harmonica',       1, 1, 1),
    it('watch_silver',    1, 1, 1),
    it('morphine',        1, 1, 1),
    it('pistol_nagant',   1, 1, 1)
  ]);

  // ==================================================================
  //  МЕСТА НА КАРТЕ
  // ==================================================================

  // Схрон егеря: охотник готовился к худшему. Лучший «джекпот»
  // для выживания, но спрятан у леса — где волки.
  T('ranger_cache', [3, 5], [
    it('rifle_round',     8, 5, 15),
    it('rusk',            8, 4, 10),
    it('snare_wire',      8, 4, 10),
    it('galley_biscuits', 6, 4, 10),
    it('matches',         6, 4, 12),
    it('lard_piece',      5, 1, 3),
    it('rope_coil',       5, 1, 2),
    it('tea_brick',       4, 1, 2),
    it('dried_mushrooms', 4, 2, 5),
    it('birch_chaga',     4, 1, 3),
    it('candle_stump',    4, 2, 4),
    it('shell',           4, 2, 6),
    it('wool_socks',      3, 1, 2),
    it('wool_mittens',    3, 1, 2),
    it('bandage',         4, 2, 5),
    it('vodka',           3, 1, 2),
    it('firewood_bundle', 3, 1, 2),
    it('hunting_knife',   3, 1, 1),
    it('hatchet',         2, 1, 1),
    it('bearskin_rug',    1, 1, 1),
    it('harmonica',       1, 1, 1)
  ]);

  // Вмёрзшая лодка со снастями (пристань): рыбацкий скарб.
  T('boat_supply', [2, 4], [
    it('hook_line',      12, 2, 5),
    it('dried_fish',      7, 2, 5),
    it('rope_coil',       6, 1, 2),
    it('salt_fish',       5, 1, 3),
    it('fresh_fish',      5, 1, 3),   // замёрзла в садке
    it('matches',         4, 2, 6),
    it('cloth_rag',       4, 2, 4),   // парусина
    it('canned_fish',     3, 1, 3),
    it('knife',           3, 1, 1),
    it('ice_pick',        3, 1, 1),
    it('lamp_oil',        3, 1, 1),
    it('tar_bucket',      2, 1, 1),   // смолили дно
    it('birch_chaga',     2, 1, 2),
    it('fishing_rod',     2, 1, 1)
  ]);

  // ==================================================================
  //  БУДУЩИЕ ЛОКАЦИИ (контейнеров в interiors.js пока нет, но таблицы
  //  готовы: звериные логова, ризница, лунка рыбака, сани в сугробе).
  //  Если генератор поздних волн поставит объект с таким container —
  //  лут уже размечен по тем же правилам честности.
  // ==================================================================

  // Полок бани: веник запарен, мыло заныкано. Уголок чистоты.
  T('banya_shelf', [1, 3], [
    it('cloth_rag',       8, 2, 4),   // запаренные веники-тряпки
    it('charcoal',        6, 3, 8),   // каменка топилась
    it('matches',         5, 2, 6),
    it('birch_chaga',     4, 1, 3),
    it('fir_needles',     4, 2, 5),   // хвойный веник
    it('linen_sheet',     3, 1, 2),   // полотенце
    it('water_flask',     3, 1, 1),
    it('tar_bucket',      2, 1, 1),   // берёзовый дёготь от бани
    it('vodka',           2, 1, 1)    // «после парной»
  ]);

  // Ризница церкви (future 'church_vestry'): церковная утварь.
  T('church_vestry', [2, 4], [
    it('candle_stump',    9, 2, 6),
    it('linen_sheet',     6, 1, 3),   // ризы и полотенца
    it('cross_silver',    3, 1, 2),
    it('letter_old',      3, 1, 3),   // требы и поминания
    it('inkwell',         2, 1, 1),
    it('coin_purse',      2, 1, 2),   // свечной ящик
    it('watch_silver',    1, 1, 1),
    it('book_medic',      1, 1, 1)    // старопечатное
  ]);

  // Ящик рыбака у лунки (future 'ice_fishing_box'): поймал — сложил.
  T('ice_fishing_box', [1, 3], [
    it('fresh_fish',      9, 2, 5),
    it('hook_line',       7, 2, 4),
    it('dried_fish',      5, 2, 4),
    it('matches',         4, 2, 6),
    it('vodka',           4, 1, 2),   // «для сугреву»
    it('ice_pick',        3, 1, 1),
    it('rusk',            3, 2, 5),
    it('fishing_rod',     2, 1, 1),
    it('tobacco_pouch',   2, 1, 1)
  ]);

  // Разбитые сани в сугробе (future 'sledge_crashed'): груз дороге.
  T('sledge_crashed', [1, 3], [
    it('rope_coil',       7, 1, 2),
    it('firewood_bundle', 6, 1, 2),
    it('plank',           6, 2, 5),   // полозья пополам
    it('scrap_metal',     5, 2, 5),   // подковы и скобы
    it('galley_biscuits', 4, 3, 8),   // ящик груза
    it('cloth_rag',       4, 2, 4),   // рогожа
    it('lard_piece',      3, 1, 2),
    it('coin_purse',      1, 1, 1),
    it('tar_bucket',      2, 1, 1)
  ]);

  // Логово волчьей стаи (future 'wolf_den'): обглоданные кости.
  T('wolf_den', [1, 2], [
    it('sinew',           7, 2, 5),
    it('cloth_rag',       5, 1, 3),   // обрывки одежды...
    it('fat',             4, 1, 2),
    it('wolf_pelt',       2, 1, 1),   // выпоротая шкура щенка
    it('watch_silver',    1, 1, 1)    // пропавший без вести
  ]);

  // Берлога медведя (future 'bear_den'): запасы на спячку.
  T('bear_den', [2, 3], [
    it('meat_raw',        8, 1, 4),   // недоеденная падаль
    it('dried_mushrooms', 4, 2, 5),
    it('sinew',           4, 2, 4),
    it('birch_chaga',     3, 1, 3),   // медведь чагу не ест, но принёс
    it('honey_jar',       3, 1, 1),   // разорённый улей
    it('bear_pelt',       2, 1, 1),
    it('coin_purse',      1, 1, 1)    // плохая концовка грибника
  ]);

  // Нычка отшельника (future 'hermit_stash'): жил в лесу — припас в дупле.
  T('hermit_stash', [2, 4], [
    it('dried_mushrooms', 8, 3, 6),
    it('birch_chaga',     7, 2, 5),
    it('rusk',            6, 3, 8),
    it('matches',         6, 3, 8),
    it('fir_needles',     5, 2, 6),   // чай от цинги
    it('hook_line',       4, 1, 3),
    it('snare_wire',      4, 2, 6),
    it('salt_fish',       4, 1, 3),
    it('letter_old',      3, 1, 2),
    it('harmonica',       1, 1, 1),
    it('photo_family',    2, 1, 1)
  ]);

  // Старый склеп на погосте (future 'crypt_old'): то, что не унесли.
  T('crypt_old', [1, 3], [
    it('candle_stump',    7, 1, 3),
    it('linen_sheet',     5, 1, 2),   // истлевший саван
    it('scrap_metal',     5, 2, 5),   // крестики и оклады
    it('cross_silver',    3, 1, 1),
    it('coin_purse',      2, 1, 2),   // «на тот свет» положили
    it('watch_silver',    1, 1, 1),
    it('letter_old',      3, 1, 2),
    it('medal_bravery',   1, 1, 1)
  ]);

  // ==================================================================
  //  ТРУПЫ ЗВЕРЕЙ (снимается шкура и мясо)
  // ==================================================================

  // Волк: шкура — товар, мясо — корм для ловушек (собаки.evaluate).
  T('wolf_body', [2, 3], [
    it('wolf_pelt', 10, 1, 1),
    it('meat_raw', 10, 1, 3),
    it('fat',       6, 1, 2),
    it('sinew',     5, 2, 5)
  ]);

  // Медведь: добыча на неделю — если донесёшь.
  T('bear_body', [2, 4], [
    it('bear_pelt', 10, 1, 1),
    it('meat_raw', 12, 2, 5),
    it('fat',       8, 1, 3),
    it('sinew',     4, 2, 4)
  ]);

  // Олень: мясо деликатесное, из сухожилий — тетива.
  T('deer_body', [2, 3], [
    it('meat_raw', 12, 2, 4),
    it('sinew',     8, 3, 6),
    it('fat',       6, 1, 2)
  ]);

  // Заяц: мал, но в суп годится.
  T('hare_body', [1, 2], [
    it('meat_raw',  8, 1, 2),
    it('sinew',     5, 1, 3)
  ]);

  // Ворона: перья да когти. Есть можно, но зачем.
  T('crow_body', [0, 1], [
    it('meat_raw', 2, 1, 1),
    it('sinew',    1, 1, 1)
  ]);

  // Бандит: оружие, патроны, награбленное.
  T('bandit_body', [2, 4], [
    it('rifle_round',     8, 3, 10),
    it('coin_purse',      7, 1, 3),
    it('knife',           5, 1, 1),
    it('vodka',           4, 1, 2),
    it('tobacco_pouch',   4, 1, 2),
    it('shell',           4, 2, 5),
    it('matches',         4, 2, 6),
    it('rusk',            4, 1, 3),
    it('bandage',         3, 1, 2),
    it('wool_scarf',      3, 1, 1),
    it('letter_old',      2, 1, 1),
    it('hatchet',         2, 1, 1),
    it('harmonica',       1, 1, 1),
    it('watch_silver',    1, 1, 1),
    it('morphine',        1, 1, 1),
    it('pistol_nagant',   1, 1, 1)
  ]);

  // Неопознанный труп (зверь без таблицы / старик-отшельник).
  T('corpse_generic', [1, 3], [
    it('coin_purse',     5, 1, 2),
    it('letter_old',     4, 1, 1),
    it('matches',        4, 2, 5),
    it('rusk',           4, 1, 2),
    it('knife',          3, 1, 1),
    it('tobacco_pouch',  3, 1, 1),
    it('photo_family',   3, 1, 1),
    it('vodka',          3, 1, 1),
    it('wool_scarf',     3, 1, 1),
    it('cross_silver',   2, 1, 1),
    it('watch_silver',   1, 1, 1),
    it('harmonica',      1, 1, 1)
  ]);

  // Отшельник: жил бедно, но цел от мира.
  alias('hermit_body', 'corpse_generic');

  // ==================================================================
  //  ПСЕВДОНИМЫ 'corpse_<kind>' — формат контейнеров-трупов из
  //  entities/actions.js (fallback без ИИ кладёт именно такие).
  //  Дублируют таблицы *_body, чтобы оба пути обыска работали.
  // ==================================================================

  alias('corpse_wolf', 'wolf_body');
  alias('corpse_bear', 'bear_body');
  alias('corpse_deer', 'deer_body');
  alias('corpse_hare', 'hare_body');
  alias('corpse_crow', 'crow_body');
  alias('corpse_bandit', 'bandit_body');
  alias('corpse_hermit', 'corpse_generic');

  // ==================================================================
  //  BOOT: регистрация предметов и таблиц + самопроверка данных
  // ==================================================================

  /**
   * Проверка таблиц: у каждого предмета должно быть определение
   * (в новых или уже зарегистрированных), веса положительны,
   * min <= max. Ошибки — в WS.warn одним списком.
   */
  function validate(itemsReg) {
    var bad = [];
    var k, i, tbl, ent;
    for (k in loot) {
      if (!loot.hasOwnProperty(k)) continue;
      tbl = loot[k];
      if (!tbl || !tbl.items || !tbl.items.length) {
        bad.push(k + ': пустая таблица');
        continue;
      }
      if (!tbl.rolls || tbl.rolls.length < 2 || tbl.rolls[0] > tbl.rolls[1]) {
        bad.push(k + ': кривой rolls');
      }
      for (i = 0; i < tbl.items.length; i++) {
        ent = tbl.items[i];
        if (!ent.id || !itemsReg[ent.id]) {
          bad.push(k + ': предмет "' + ent.id + '" не определён');
        }
        if (!(ent.w > 0)) {
          bad.push(k + ': у "' + ent.id + '" вес <= 0');
        }
        if (ent.min > ent.max) {
          bad.push(k + ': у "' + ent.id + '" min > max');
        }
      }
    }
    if (bad.length) WS.warn('[loot_tables] проблемы таблиц:', bad.join('; '));
    return bad.length === 0;
  }

  WS.boot(function initLootTables() {
    var k;

    // 1) предметы: не затираем чужие определения (items_seed/items_food
    //    и будущие датафайлы владеют своими id первыми)
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    for (k in items) {
      if (items.hasOwnProperty(k) && !WS.Data.items[k]) {
        WS.Data.items[k] = items[k];
      }
    }

    // 2) таблицы лута
    WS.Data.loot = WS.Data.loot || {};
    for (k in loot) {
      if (loot.hasOwnProperty(k)) WS.Data.loot[k] = loot[k];
    }

    // 3) самопроверка (после регистрации — чтобы видеть и чужие id)
    validate(WS.Data.items);
    WS.log('[loot_tables] предметов: +' + countKeys(items) +
           ', таблиц: ' + countKeys(loot));
  }, 'items:loot');

  /** Количество собственных ключей объекта (для лога). */
  function countKeys(o) {
    var n = 0;
    for (var k in o) if (o.hasOwnProperty(k)) n++;
    return n;
  }

  WS.def('DataLootTables', {
    tables: loot,          // для тестов/инструментов: {id -> таблица}
    items: items,          // новые предметы этого файла
    validate: validate
  });

  // ==================================================================
  //  СПРАВКА ПОКРЫТИЯ (для других агентов, не код).
  //
  //  Все container id, реально расставляемые world/interiors.js,
  //  и их таблицы (сверено grep'ом по файлу):
  //
  //    kitchen_pech ............ печь (изба, дача, rich)
  //    kitchen_table ........... стол кухни
  //    kitchen_cupboard ........ буфет кухни
  //    kitchen_shelf ........... полка кухни
  //    bedroom_bed ............. кровать
  //    bedroom_chest ........... сундук избы
  //    dacha_chest ............. сундук дачи/богатого дома
  //    bedroom_wardrobe ........ шкап
  //    living_shelf ............ буфет/полка/книжный шкап горницы
  //    living_crate ............ ящик (сени, горница)
  //    living_sofa ............ тахта (rich/dacha)
  //    school_shelf ............ шкап школы и контор
  //    school_desk ............. парты
  //    barn_tools .............. ящик инструментов (амбар, баня)
  //    barn_hay ................ сено (амбар, конюшня)
  //    granary_sack ............ закрома/мешки зерна
  //    stable_rack ............. стойка сбруи
  //    fishing_rack ............ снасти рыбачьей избы
  //    cellar_veg .............. кадки/мешки/закром погреба
  //    ruined_debris ........... обугленный хлам
  //    tavern_bar .............. стойка трактира
  //    tavern_table ............ стол/подсвечник трактира
  //    tavern_cellar ........... подклет трактира
  //    store_counter ........... прилавок лавки
  //    store_shelf_food ....... полка бакалеи
  //    store_shelf_tools ...... полка скобяного
  //    store_shelf_cloth ...... полка мануфактуры
  //    store_storage .......... подсобка лавки
  //    warehouse_crate ......... ящики склада/вокзала
  //    warehouse_barrel ........ бочки
  //    warehouse_sack .......... мешки
  //    telegraph_desk .......... конторка (телеграф, вокзал)
  //    jail_locker ............. шкап околотка
  //    doctor_cabinet .......... шкап/конторка врача
  //    doctor_bed ............. кушетка
  //    church_candle ........... подсвечники храма
  //    church_altar ............ престол
  //    personal_body ........... гроб в алтаре, ящик камеры
  //    smithy_anvil ............ наковальня кузни
  //    smithy_shelf ........... верстак кузни
  //    sawmill_workbench ....... верстак пилорамы
  //    guardtower_locker ....... ларь дозорного
  //    ranger_cache ............ тайник егеря (снежный бугор)
  //    boat_supply ............. вмёрзшая лодка
  //
  //  Из ai/bandit.js: bandit_camp (ящик у костра — включается только
  //  когда таблица существует, см. spawnCamp).
  //
  //  Таблицы трупов: wolf_body / bear_body / deer_body / hare_body /
  //  crow_body / bandit_body / corpse_generic (+ алиасы corpse_<kind>
  //  для fallback-трупов из entities/actions.js и hermit_body).
  //
  //  Баланс вероятностей (кратко):
  //   * дома: rolls 0-4, еда < 25% веса, хлам/одежда остальное;
  //   * лавка: rolls 2-4, товар по профилю полки (еда/скобяное/сукно);
  //   * больница: rolls 3-5, медикаменты всех сортов;
  //   * склад/амбар: материалы (nails/scrap/plank) — «жирно»;
  //   * развалины: угли и металл, живое — редкость;
  //   * звери: шкура+мясо гарантированно (rolls >= 2), у вороны — почти ничего;
  //   * ranger_cache — топ-лут за риск похода к лесу.
  // ==================================================================

})();
