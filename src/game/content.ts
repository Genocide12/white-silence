// ============================================================
// «БЕЛАЯ ТИШИНА: ТОПКА» — весь игровой контент в одном месте.
// Русский Север, 1917. Пароход придёт весной. Числа растут.
// ============================================================

export interface GeneratorDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number;   // стоимость первой единицы (в дровах)
  baseProd: number;   // дров/сек с одной единицы
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  kind: 'clickMult' | 'clickShare' | 'genMult' | 'globalMult';
  target?: number;    // индекс генератора для genMult
  value: number;      // множитель или доля (для clickShare — доля добычи/сек)
  req: { gens?: [number, number]; totalWood?: number; clicks?: number };
}

export interface MineDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number;   // в дровах
  baseProd: number;   // угля/сек
}

export interface TelegraphDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number;   // в дровах
  baseProd: number;   // депеш/сек
}

export interface InventionDef {
  id: string;
  name: string;
  desc: string;
  cost: number;       // депеш
}

export interface StarUpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;       // звёзд
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

// ------------------------------------------------------------
// Генераторы дров (10 эр: от топора до орбитальной лесопилки)
// ------------------------------------------------------------
export const GROWTH = 1.15;
export const MINE_GROWTH = 1.2;
export const TELEGRAPH_GROWTH = 1.25;

export const GENERATORS: GeneratorDef[] = [
  { id: 'axe', name: 'Топор «Зазубра»', desc: 'Он видел и лучшие дни, и худшие зимы. Как и ты.', baseCost: 15, baseProd: 0.1 },
  { id: 'saw', name: 'Лучковая пила', desc: 'Скрипит как митинг, а пилит как проклятая.', baseCost: 100, baseProd: 1 },
  { id: 'crew', name: 'Артель «Моржи»', desc: 'Рубят в телогрейках, в портянках и в полный голос.', baseCost: 1_100, baseProd: 8 },
  { id: 'sawmill', name: 'Паровая лесопилка', desc: 'Топим дровами завод, который делает дрова. Экономика!', baseCost: 12_000, baseProd: 47 },
  { id: 'frame', name: 'Пилорама «Гигант»', desc: 'Распиливает всё: лес, время, надежды на отпуск.', baseCost: 130_000, baseProd: 260 },
  { id: 'ermak', name: 'Лесовоз «Ермак»', desc: 'Ломает лёд плечом. Лёд это запомнил.', baseCost: 1_400_000, baseProd: 1_400 },
  { id: 'railway', name: 'Ветка «Тупиковая»', desc: 'Поезд уходит. Шпалы, увы, тоже — они из дров.', baseCost: 20_000_000, baseProd: 7_800 },
  { id: 'subsea', name: 'Подлёдная лесодобыча', desc: 'Подо льдом нашли лес. Учёные руками разводят, бригада — пилит.', baseCost: 330_000_000, baseProd: 44_000 },
  { id: 'reactor', name: 'Реактор «Мирный-1»', desc: 'Дрова теперь растут в радиации. Не спрашивай.', baseCost: 5_100_000_000, baseProd: 260_000 },
  { id: 'orbital', name: 'Орбитальная лесопилка «Заря»', desc: 'Луна не возражает. Проверяли.', baseCost: 75_000_000_000, baseProd: 1_600_000 },
];

// ------------------------------------------------------------
// Улучшения за дрова (разовые)
// ------------------------------------------------------------
export const UPGRADES: UpgradeDef[] = [
  // Линия клика
  { id: 'sharp_axe', name: 'Острый топор', desc: 'Точильный камень из Тобольска. Слышно за три версты.', cost: 100, kind: 'clickMult', value: 2, req: { clicks: 10 } },
  { id: 'sturdy_helve', name: 'Крепкая рукоять', desc: 'Обмотана изолентой века — берестой.', cost: 1_000, kind: 'clickMult', value: 2, req: { clicks: 50 } },
  { id: 'dual_grip', name: 'Двойной хват', desc: 'Два топора, ноль страха.', cost: 10_000, kind: 'clickMult', value: 2, req: { gens: [0, 10] } },
  { id: 'warm_mittens', name: 'Тёплые рукавицы', desc: 'Теперь каждый удар — с душой.', cost: 100_000, kind: 'clickShare', value: 0.01, req: { totalWood: 100_000 } },
  { id: 'kirza_boots', name: 'Кирзовые сапоги', desc: 'В снегу стоять удобнее, рубить веселее.', cost: 1_000_000, kind: 'clickShare', value: 0.02, req: { totalWood: 1_000_000 } },
  { id: 'waltz_rhythm', name: 'Ритм вальса', desc: 'Рубить под музыку — святое дело.', cost: 10_000_000, kind: 'clickMult', value: 2, req: { totalWood: 10_000_000 } },
  { id: 'bear_grip', name: 'Медвежья хватка', desc: 'Медведь сам подошёл и дал совет.', cost: 100_000_000, kind: 'clickShare', value: 0.04, req: { totalWood: 100_000_000 } },
  { id: 'furnace_fist', name: 'Кулак истопника', desc: 'Стучишь так, что печь сама подкидывает.', cost: 1_000_000_000, kind: 'clickMult', value: 3, req: { totalWood: 1_000_000_000 } },
  // Линии генераторов (×2 при 5 и 25 штуках)
  { id: 'steel_blades', name: 'Стальные лезвия', desc: 'Урал сточился, но не сдался.', cost: 500, kind: 'genMult', target: 0, value: 2, req: { gens: [0, 5] } },
  { id: 'two_watches', name: 'Смена в две вахты', desc: 'Пила не спит. Пила вообще никогда не спит.', cost: 2_500, kind: 'genMult', target: 1, value: 2, req: { gens: [1, 5] } },
  { id: 'hot_tea', name: 'Горячий чай артели', desc: 'С чаем — люди, без чая — брёвна.', cost: 27_500, kind: 'genMult', target: 2, value: 2, req: { gens: [2, 5] } },
  { id: 'dry_steam', name: 'Сухой пар', desc: 'Влажный пар жаловался. Сухой — молчит.', cost: 300_000, kind: 'genMult', target: 3, value: 2, req: { gens: [3, 5] } },
  { id: 'piter_knives', name: 'Клинки из Петрограда', desc: 'Заказ шёл полгода. Точность — божественная.', cost: 3_250_000, kind: 'genMult', target: 4, value: 2, req: { gens: [4, 5] } },
  { id: 'ice_recon', name: 'Ледовая разведка', desc: 'Теперь «Ермак» бьёт лёд не вслепую, а по расписанию.', cost: 35_000_000, kind: 'genMult', target: 5, value: 2, req: { gens: [5, 5] } },
  { id: 'timetable', name: 'График движения', desc: 'Опоздания отменены приказом. Приказ тоже дровами.', cost: 500_000_000, kind: 'genMult', target: 6, value: 2, req: { gens: [6, 5] } },
  { id: 'som_bathyscaphe', name: 'Батискаф «Сом»', desc: 'Рыбы подписали договор и держат слово.', cost: 8_250_000_000, kind: 'genMult', target: 7, value: 2, req: { gens: [7, 5] } },
  { id: 'uranium_logs', name: 'Урановые поленья', desc: 'Греют. Ещё как греют.', cost: 127_500_000_000, kind: 'genMult', target: 8, value: 2, req: { gens: [8, 5] } },
  { id: 'solar_sails', name: 'Солнечные паруса', desc: 'Ночь полярная? Для «Зари» — не аргумент.', cost: 1_875_000_000_000, kind: 'genMult', target: 9, value: 2, req: { gens: [9, 5] } },
  // Глобальные
  { id: 'kerosene', name: 'Керосиновые лампы', desc: 'Стало светлее. Работать, к сожалению, тоже.', cost: 250_000, kind: 'globalMult', value: 1.25, req: { totalWood: 250_000 } },
  { id: 'steam_boilers', name: 'Паровые котлы', desc: 'Шипят одобрительно.', cost: 37_500_000, kind: 'globalMult', value: 1.25, req: { totalWood: 37_500_000 } },
  { id: 'collected_works', name: 'Собрание сочинений', desc: 'Читают вслух по очереди, при свете печи.', cost: 6_250_000_000, kind: 'globalMult', value: 1.5, req: { totalWood: 6_250_000_000 } },
  { id: 'artel_banner', name: 'Знамя артели', desc: 'Флаг из мешковины, но с ним теплее.', cost: 1e12, kind: 'globalMult', value: 1.25, req: { totalWood: 1e12 } },
  { id: 'polar_order', name: 'Орден Полярной Звезды', desc: 'Носится на телогрейке. Телогрейка гордится.', cost: 1e14, kind: 'globalMult', value: 1.5, req: { totalWood: 1e14 } },
];

// ------------------------------------------------------------
// Уголь (открывается при 25K дров всего)
// ------------------------------------------------------------
export const COAL_UNLOCK = 25_000;
export const FURNACE_BASE_COST = 15;     // угля за 1-й уровень
export const FURNACE_GROWTH = 2.0;       // рост цены уровня: жара бесплатной не бывает
export const FURNACE_STEP = 1.25;        // ×к дровам за уровень (1.3 со «Двойной топкой»)

export const MINES: MineDef[] = [
  { id: 'adit', name: 'Угольная штольня', desc: 'Тёмный ход к чёрному золоту.', baseCost: 25_000, baseProd: 0.1 },
  { id: 'black_pit', name: 'Шахта «Чёрная»', desc: 'Название честное.', baseCost: 300_000, baseProd: 1 },
  { id: 'giant_cut', name: 'Разрез «Гигант»', desc: 'Ковш размером с избу.', baseCost: 4_000_000, baseProd: 8 },
  { id: 'spoil_plant', name: 'Террикон-комбинат', desc: 'Гора растёт сама. Красиво и удобно.', baseCost: 60_000_000, baseProd: 47 },
];

// ------------------------------------------------------------
// Телеграф (открывается при 20M дров всего)
// ------------------------------------------------------------
export const TELEGRAPH_UNLOCK = 20_000_000;

export const TELEGRAPHS: TelegraphDef[] = [
  { id: 'key', name: 'Телеграфный ключ', desc: 'Точка-тире — и депеши в кассе.', baseCost: 4_000_000, baseProd: 0.05 },
  { id: 'molniya', name: 'Радиостанция «Молния»', desc: 'Ловит Эйфелеву башню. Иногда.', baseCost: 60_000_000, baseProd: 0.5 },
  { id: 'institute', name: 'Институт полярной связи', desc: 'Штаб науки на краю мира.', baseCost: 900_000_000, baseProd: 4 },
];

// Изобретения (за депеши, переживают престиж)
export const INVENTIONS: InventionDef[] = [
  { id: 'autosharp', name: 'Автозаточка', desc: 'Автоклик 3 удара/сек. Пилит сама — ты почти не нужен.', cost: 10 },
  { id: 'autosharp2', name: 'Усилитель автозаточки', desc: 'Автоклик 10 ударов/сек. Теперь точно не нужен.', cost: 60 },
  { id: 'thermos', name: 'Термос', desc: 'Оффлайн-доход 100% вместо половины. Инженерный шедевр: тепло не выпускает.', cost: 25 },
  { id: 'chronometer', name: 'Хронометр', desc: 'Всё производство +15%. Секунды стали длиннее. Юридически.', cost: 80 },
  { id: 'blueprints', name: 'Секретные чертежи', desc: 'Все генераторы ×2. Прочитал в депеше — не спрашивай, чьи.', cost: 150 },
  { id: 'autoartel', name: 'Автоартель', desc: 'Автопокупка генераторов (тумблер у каждого). Нанят приказчик с бездонным карманом.', cost: 400 },
  { id: 'logistics', name: 'Логистика по-северному', desc: 'Генераторы дешевле на 5%. Прямой маршрут: окно → партия → печь.', cost: 600 },
  { id: 'hyperborean', name: 'Гиперборейская математика', desc: 'Каждая звезда даёт +6% вместо +4%. Считать научились только здесь.', cost: 1_500 },
  { id: 'perpetuum', name: 'Вечный двигатель (почти)', desc: 'Оффлайн-доход 200%. Работает, пока никто не смотрит.', cost: 5_000 },
];

// ------------------------------------------------------------
// Престиж: «Новая экспедиция»
// ------------------------------------------------------------
export const PRESTIGE_UNLOCK = 1_000_000_000; // runWood, при котором есть смысл
export const TELEGRAPH_RESET_KEEP = true;     // изобретения переживают сброс

export const STAR_UPGRADES: StarUpgradeDef[] = [
  { id: 'legacy', name: 'Наследие истопника', desc: 'Каждая экспедиция начинается с 1K дров. Сундуки прежних вахт.', cost: 3 },
  { id: 'capital', name: 'Начальный капитал', desc: 'Старт со 100K дров. Инвесторы Севера поверили.', cost: 10 },
  { id: 'rich_vein', name: 'Жила богаче', desc: 'Уголь добывается вдвое быстрее.', cost: 25 },
  { id: 'rulebook', name: 'Свод правил', desc: 'Улучшения за дрова дешевле на 20%. Бумага дешевле дерева.', cost: 50 },
  { id: 'furnace_clerk', name: 'Приказчик топки', desc: 'Уровни топки покупаются сами (тумблер в Шахте).', cost: 100 },
  { id: 'permafrost', name: 'Вечная мерзлота', desc: 'Оффлайн без лимита времени и с двойным доходом.', cost: 200 },
  { id: 'double_furnace', name: 'Двойная топка', desc: 'Уровень топки даёт ×1.3 вместо ×1.25.', cost: 500 },
  { id: 'aurora_amp', name: 'Сполохи', desc: 'Полярное сияние: ×10 вместо ×5 и вдвое чаще.', cost: 1_000 },
  { id: 'ship', name: 'Пароход «Святой Николай»', desc: 'Всё производство ×10 навсегда. Он пришёл. Ты дожил.', cost: 10_000 },
];

// Исторические вехи (по накопленным звёздам)
export const MILESTONES: Array<{ id: string; stars: number; title: string; text: string }> = [
  { id: 'm10', stars: 10, title: 'Старшина вахты', text: 'Звёзд десять. Артель снимает шапки, когда ты проходишь.' },
  { id: 'm100', stars: 100, title: 'Капитан топки', text: 'Сто звёзд. Огонь в твоей печи видно с сопок.' },
  { id: 'm1000', stars: 1000, title: 'Хозяин полярной ночи', text: 'Тысяча звёзд. Ночь делает скидки.' },
  { id: 'm10000', stars: 10000, title: 'Лоцман вечности', text: 'Десять тысяч. Пароход уже дымит за мысом.' },
];

// ------------------------------------------------------------
// Достижения (каждое +1% ко всему производству)
// ------------------------------------------------------------
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a_click1', name: 'Первая щепка', desc: 'Один удар. Начало великой поленницы.' },
  { id: 'a_click100', name: 'Сто ударов', desc: 'Рука помнит каждый.' },
  { id: 'a_click1k', name: 'Тысяча ударов', desc: 'Соседи жалуются на дятла. Дятла нет.' },
  { id: 'a_click10k', name: 'Мозоли', desc: 'Твои ладони теперь как береста.' },
  { id: 'a_gen1', name: 'Первая смена', desc: 'Куплен первый генератор. Он уже пыхтит.' },
  { id: 'a_gen10', name: 'Артельщик', desc: 'Десять единиц техники и людей.' },
  { id: 'a_gen100', name: 'Промышленник', desc: 'Сто единиц. Снег вокруг убран.' },
  { id: 'a_gen1000', name: 'Магнат', desc: 'Тысяча единиц. Это уже не лесопилка, а держава.' },
  { id: 'a_w1k', name: 'Поленница', desc: '1K дров добыто.' },
  { id: 'a_w1m', name: 'Склад', desc: 'Миллион дров. Крыша прогнулась.' },
  { id: 'a_w1b', name: 'Миллиардер поневоле', desc: 'Миллиард дров. Счётная комиссия в шоке.' },
  { id: 'a_w1t', name: 'Триллион', desc: 'Триллион дров. Слово уже не помещается в квитанцию.' },
  { id: 'a_w1e15', name: 'Квадриллионер', desc: 'Дров столько, что ими можно вымостить путь до Луны. Дважды.' },
  { id: 'a_w1e30', name: 'Астроном', desc: '1e30 дров. Астрономы переучивают константы.' },
  { id: 'a_w1e60', name: 'Космогония', desc: '1e60 дров. Физики написали письмо с извинениями.' },
  { id: 'a_w1e100', name: 'Инженерная запись', desc: '1e100 дров. Гугол. Дальше — только легенды.' },
  { id: 'a_coal1k', name: 'Чёрное золото', desc: '1K угля добыто.' },
  { id: 'a_coal1m', name: 'Террикон', desc: 'Миллион угля. Гора выросла за окном.' },
  { id: 'a_dep100', name: 'Точка-тире', desc: 'Сто депеш принято.' },
  { id: 'a_dep10k', name: 'Радиовеха', desc: 'Десять тысяч депеш. Провода звенят от гордости.' },
  { id: 'a_fur10', name: 'Топка разгорается', desc: 'Десятый уровень печи.' },
  { id: 'a_fur20', name: 'Огонь батарей', desc: 'Двадцатый уровень печи. За окном зима, у печи — весна.' },
  { id: 'a_fur30', name: 'Сердце станции', desc: 'Тридцатый уровень печи. Тепло слышно в радиоприёмнике.' },
  { id: 'a_pr1', name: 'Новая экспедиция', desc: 'Первый престиж. Снова с щепки — но с опытом.' },
  { id: 'a_pr5', name: 'Ветеран льдов', desc: 'Пять экспедиций.' },
  { id: 'a_pr25', name: 'Легенда Севера', desc: 'Двадцать пять экспедиций.' },
  { id: 'a_pr100', name: 'Хозяин ночи', desc: 'Сто экспедиций. Тысяча щепок тебя помнят.' },
  { id: 'a_st10', name: 'Звёздочка', desc: 'Десять полярных звёзд.' },
  { id: 'a_st100', name: 'Созвездие', desc: 'Сто звёзд над станцией.' },
  { id: 'a_st1k', name: 'Млечный путь', desc: 'Тысяча звёзд. Небо стало тесным.' },
  { id: 'a_st10k', name: 'Пароход встречен', desc: 'Десять тысяч звёзд. «Святой Николай» подаёт гудок.' },
  { id: 'a_time1h', name: 'Полярная выдержка', desc: 'Час у печи.' },
  { id: 'a_time10h', name: 'Смена', desc: 'Десять часов. Вахта длинная, ночь полярная.' },
  { id: 'a_time100h', name: 'Полярная ночь', desc: 'Сто часов. Ты и печь — уже семья.' },
  { id: 'a_off1h', name: 'Сон истопника', desc: 'Час оффлайн-дохода за один раз. Артель не спала.' },
  { id: 'a_aurora10', name: 'Северное сияние', desc: 'Десять сияний поймано. Небо тоже играет.' },
];
