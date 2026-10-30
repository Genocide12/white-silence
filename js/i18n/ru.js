/**
 * ЛОКАЛИЗАЦИЯ: русский словарь «Белого Безмолвия» + движок WS.I18N.
 *
 * Формат: плоские ключи 'item.bread.name' — именительный падеж, честные
 * атмосферные названия. Словарь регистрируется в WS.Data.locales.ru
 * (контракт), движок I18N остаётся один на все языки: t(key, fallback).
 * Fallback при отсутствии ключа — последний сегмент ключа (item.bread.name
 * -> "name"), либо литерал, переданный вторым аргументом.
 *
 * Связи: все модули UI зовут WS.I18N.t(key); файлы данных (items_*,
 * recipes) держат русские литералы как страховку, пока i18n не подгрузился.
 */
(function () {
  'use strict';

  // ====================================================================
  //  СЛОВАРЬ
  // ====================================================================
  var RU = {

    // ----------------------------------------------------------------
    //  ОБЩИЙ ИНТЕРФЕЙС
    // ----------------------------------------------------------------
    'ui.app_name': 'БЕЛОЕ БЕЗМОЛВИЕ',
    'ui.app_sub': 'Безумный Дед · 60 дней до тарелки · автор DirtyG',
    'ui.menu.foot': '60 дней до тарелки. Не проспи, дед!',

    'ui.continue': 'Продолжить',
    'ui.new_game': 'Новая игра',
    'ui.about': 'Об игре',
    'ui.about.title': 'ОБ ИГРЕ',
    'ui.about.p1': 'Сумасшедший дед живёт один в лесу: ест грибы, видит мультяшные галлюцинации и «изгоняет» зверей лодошкой и вантузом. В еде и воде не нуждается — чекнутый. Но его ХП тает с каждым днём: не успеет за 60 дней разжечь Магический Огонь — уснёт навсегда.',
    'ui.about.p2': 'Собирай грибную энергию, качай Древо Мудрости (T), изгоняй мультяшек в подарки, кури косяк для полного ХП. «Смерть» — просто прикорнуть на месте с половиной здоровья. Автор игры — DirtyG.',
    'ui.back': 'Назад',
    'ui.menu': 'Меню',
    'ui.to_menu': 'В меню',
    'ui.close': 'Закрыть',
    'ui.cancel': 'Отмена',
    'ui.yes': 'Да',
    'ui.no': 'Нет',
    'ui.apply': 'Применить',
    'ui.confirm.title': 'Подтверждение',

    'ui.pause.word': 'ПАУЗА',
    'ui.pause.hint': 'Пробел — продолжить · Esc — окна',
    'ui.speed.hint': 'Пробел — пауза и скорость времени',
    'ui.ship.left': 'до парохода',
    'ui.year': '1917 года',

    // названия экранов (горячие клавиши D2/D3)
    'ui.inventory': 'Инвентарь',
    'ui.craft': 'Крафт',
    'ui.map': 'Карта',
    'ui.journal': 'Журнал',
    'ui.skills': 'Навыки',
    'ui.health': 'Здоровье',
    'ui.build': 'Строительство',

    // действия с предметами
    'ui.take': 'Взять',
    'ui.take_all': 'Забрать всё',
    'ui.drop': 'Выбросить',
    'ui.equip': 'Надеть',
    'ui.unequip': 'Снять',
    'ui.eat': 'Съесть',
    'ui.drink': 'Выпить',
    'ui.read': 'Читать',
    'ui.use': 'Использовать',
    'ui.reload': 'Перезарядить',
    'ui.cook': 'Приготовить',
    'ui.repair': 'Починить',

    // подписи инвентаря
    'ui.weight': 'Вес',
    'ui.day': 'День',
    'ui.level': 'уровень',
    'ui.xp': 'опыт',
    'ui.empty': 'пусто',
    'ui.condition': 'состояние',
    'ui.slot.free': 'свободно',

    // слоты экипировки
    'ui.slot.head': 'Голова',
    'ui.slot.torso': 'Торс',
    'ui.slot.legs': 'Ноги',
    'ui.slot.feet': 'Обувь',
    'ui.slot.hands': 'Руки',
    'ui.slot.back': 'Спина',
    'ui.slot.hand1': 'Правая рука',
    'ui.slot.hand2': 'Левая рука',

    // категории предметов
    'ui.cat.food': 'Еда',
    'ui.cat.drink': 'Питьё',
    'ui.cat.med': 'Медицина',
    'ui.cat.tool': 'Инструменты',
    'ui.cat.weapon': 'Оружие',
    'ui.cat.ranged': 'Огнестрел',
    'ui.cat.ammo': 'Патроны',
    'ui.cat.cloth': 'Одежда',
    'ui.cat.material': 'Материалы',
    'ui.cat.book': 'Книги',
    'ui.cat.light': 'Свет',
    'ui.cat.fuel': 'Топливо',
    'ui.cat.container': 'Ёмкости',
    'ui.cat.misc': 'Разное',

    // строки статистики финальных экранов
    'ui.stats.days': 'Прожито',
    'ui.stats.left': 'Дней в запасе',
    'ui.stats.wolves': 'Волков убито',
    'ui.stats.bears': 'Медведей убито',
    'ui.stats.bandits': 'Разбойников убито',
    'ui.stats.hunted': 'Дичи добыто',
    'ui.stats.fish': 'Рыбы поймано',
    'ui.stats.looted': 'Укрытий обыскано',
    'ui.stats.crafted': 'Вещей изготовлено',
    'ui.stats.cooked': 'Еды сварено',
    'ui.stats.slept': 'Ночей в тепле',
    'ui.stats.notes': 'Записок прочтено',
    'ui.stats.coldest': 'Холод пережит',
    'ui.stats.closest': 'На волосок от смерти',
    'ui.stats.hp': 'HP',
    'ui.stats.kills': 'Убито всего',

    // экран смерти
    'ui.death.kicker': 'Белое Безмолвие · зима 1917',
    'ui.death.title': 'ВОТ ТАК ВЫ ПОГИБЛИ',
    'ui.death.restart': 'Начать заново',
    'ui.death.to_menu': 'В меню',

    // экран победы
    'ui.victory.kicker': 'Белое Безмолвие · зима 1917',
    'ui.victory.title': 'ПАРОХОД ПРИШЁЛ',
    'ui.victory.sub': 'Вы выжили. Белое безмолвие отступило.',
    'ui.victory.restart': 'Новая зимовка',
    'ui.victory.to_menu': 'В меню',

    // управление (окно «Об игре»)
    'ui.keys.title': 'УПРАВЛЕНИЕ',
    'ui.keys.move': 'движение',
    'ui.keys.sprint': 'бег',
    'ui.keys.sneak': 'красться',
    'ui.keys.interact': 'действие: обыск, двери, подъём',
    'ui.keys.inventory': 'инвентарь',
    'ui.keys.craft': 'крафт',
    'ui.keys.map': 'карта',
    'ui.keys.journal': 'журнал и записки',
    'ui.keys.skills': 'навыки',
    'ui.keys.health': 'здоровье',
    'ui.keys.build': 'строительство и баррикады',
    'ui.keys.light': 'зажечь/убрать источник света',
    'ui.keys.sleep': 'спать (на кровати или спальнике)',
    'ui.keys.drop': 'выбросить предмет',
    'ui.keys.reload': 'перезарядка',
    'ui.keys.speed': 'пауза / скорость ×1 ×2 ×3',
    'ui.keys.esc': 'закрыть окно / пауза',
    'ui.keys.zoom': 'приближение камеры',

    // ----------------------------------------------------------------
    //  НУЖДЫ И СОСТОЯНИЯ (подписи HUD/окна здоровья)
    // ----------------------------------------------------------------
    'need.hunger': 'Голод',
    'need.thirst': 'Жажда',
    'need.fatigue': 'Усталость',
    'need.sanity': 'Рассудок',
    'need.warmth': 'Тепло',
    'need.temp': 'Температура тела',
    'need.hp': 'Здоровье',
    'need.pain': 'Боль',
    'need.bleed': 'Кровотечение',
    'need.frostbite': 'Обморожение',
    'need.infection': 'Заражение',
    'need.fracture': 'Перелом',

    // ----------------------------------------------------------------
    //  ПОГОДА (7 типов из world/weather.js)
    // ----------------------------------------------------------------
    'weather.clear': 'Ясно',
    'weather.clear.desc': 'Небо чистое: звёзды да морозы.',
    'weather.overcast': 'Пасмурно',
    'weather.overcast.desc': 'Низкие серые тучи, снег обещали.',
    'weather.snow': 'Снег',
    'weather.snow.desc': 'Мягкий, глухой снегопад.',
    'weather.snowstorm': 'Снежная буря',
    'weather.snowstorm.desc': 'Ветер со снегом: в трёх шагах не видно.',
    'weather.blizzard': 'Метель',
    'weather.blizzard.desc': 'Стена снега и визга. Из дому не выходить.',
    'weather.fog': 'Туман',
    'weather.fog.desc': 'Сырая молочная мгла над рекой.',
    'weather.hard_frost': 'Лютый мороз',
    'weather.hard_frost.desc': 'Воздух звенит, металл липнет к коже.',

    // ----------------------------------------------------------------
    //  НАВЫКИ (12 из core/state.js)
    // ----------------------------------------------------------------
    'skill.axe.name': 'Работа топором',
    'skill.axe.desc': 'Рубка дерева, колка дров и удары топором в бою.',
    'skill.melee.name': 'Ближний бой',
    'skill.melee.desc': 'Кулаки, древко, приклад: драться чем придётся.',
    'skill.firearm.name': 'Стрельба',
    'skill.firearm.desc': 'Винтовка и револьвер: меткость, перезарядка.',
    'skill.sneak.name': 'Скрытность',
    'skill.sneak.desc': 'Тихий шаг и умение не попадаться на глаза.',
    'skill.run.name': 'Бег',
    'skill.run.desc': 'Скорость и выносливость ног.',
    'skill.cook.name': 'Стряпня',
    'skill.cook.desc': 'Печи да котелки: сытная еда из ничего.',
    'skill.carpentry.name': 'Плотницкое дело',
    'skill.carpentry.desc': 'Доски, гвозди, постройки и ремонт.',
    'skill.tailor.name': 'Шитьё',
    'skill.tailor.desc': 'Игла да шкуры: одежда и починка.',
    'skill.medic.name': 'Медицина',
    'skill.medic.desc': 'Перевязки, снадобья, анатомия.',
    'skill.forage.name': 'Поиск пищи',
    'skill.forage.desc': 'Чага, хвоя, припрятанное чужое добро.',
    'skill.track.name': 'Следопытство',
    'skill.track.desc': 'Чтение следов на снегу, поиск зверя.',
    'skill.survive.name': 'Выживание',
    'skill.survive.desc': 'Северные премудрости: огонь, кров, тепло.',

    // ----------------------------------------------------------------
    // ----------------------------------------------------------------
    'prof.telegraph.name': 'Телеграфист',
    'prof.telegraph.desc': 'Образованный человек со шкатулкой чернил: грамотен, повидан, с бумагами дружен.',
    'prof.hunter.name': 'Охотник',
    'prof.hunter.desc': 'Жизнь в лесу: капканы, винтовка, заячьи тропы наизусть.',
    'prof.carpenter.name': 'Плотник',
    'prof.carpenter.desc': 'Топор и рубанок кормят: строит, чинит, не мёрзнет в мастерской.',
    'prof.blacksmith.name': 'Кузнец',
    'prof.blacksmith.desc': 'Молот и наковальня: кует гвозди, точит железо.',
    'prof.peasant.name': 'Крестьянин',
    'prof.peasant.desc': 'Привычен к тяжести и запасам: мешки, погреб, терпение.',
    'prof.fisherman.name': 'Рыбак',
    'prof.fisherman.desc': 'Прорубь да невод: рыба и в декабре клюёт.',
    'prof.tailor.name': 'Портной',
    'prof.tailor.desc': 'Игла быстрее слов: кроит, шьёт, латает всё.',
    'prof.doctor.name': 'Врач',
    'prof.doctor.desc': 'Фельдшерская сумка и знание анатомии: лечит и лечится сам.',
    'prof.convict.name': 'Ссыльный',
    'prof.convict.desc': 'Каторга закалила: терпит боль, холод и несправедливость.',
    'prof.soldier.name': 'Солдат',
    'prof.soldier.desc': 'Отставной с винтовкой: марши, окопы, дисциплина.',
    'prof.sailor.name': 'Матрос',
    'prof.sailor.desc': 'Плавал на ладьях белого моря: узлы, снасти, хладнокровие.',
    'prof.hermit.name': 'Отшельник',
    'prof.hermit.desc': 'Годами один в избушке: безлюдье не страшит, зато рассудок шаток.',

    // ----------------------------------------------------------------
    //  ЧЕРТЫ ХАРАКТЕРА (меню D1)
    // ----------------------------------------------------------------
    'trait.sturdy.name': 'Крепкий',
    'trait.sturdy.desc': 'Здоровье выше: +20 к запасу жизни.',
    'trait.frail.name': 'Хилый',
    'trait.frail.desc': 'Тело слабее обычного: −20 к запасу жизни.',
    'trait.iron_gut.name': 'Железный желудок',
    'trait.iron_gut.desc': 'Отравления проходят стороной.',
    'trait.weak_stomach.name': 'Слабый желудок',
    'trait.weak_stomach.desc': 'Сырое и испорченное — скорая беда.',
    'trait.brave.name': 'Отважный',
    'trait.brave.desc': 'Рассудок тает медленнее.',
    'trait.fearful.name': 'Трус',
    'trait.fearful.desc': 'Страхи и голоса одолевают быстрее.',
    'trait.swift.name': 'Быстроногий',
    'trait.swift.desc': 'Бег на 15% резвее.',
    'trait.slowpoke.name': 'Медлительный',
    'trait.slowpoke.desc': 'Ход на 10% медленнее.',
    'trait.eagle_eye.name': 'Острый глаз',
    'trait.eagle_eye.desc': 'Стрельба точнее.',
    'trait.short_sighted.name': 'Близорукий',
    'trait.short_sighted.desc': 'Дальний бой хромает.',
    'trait.night_owl.name': 'Сова',
    'trait.night_owl.desc': 'Ночью бодрее, рассвет встречаете тяжело.',
    'trait.early_bird.name': 'Жаворонок',
    'trait.early_bird.desc': 'На рассвете полны сил.',
    'trait.thick_blood.name': 'Густая кровь',
    'trait.thick_blood.desc': 'Кровотечения не так страшны.',
    'trait.hemophiliac.name': 'Гемофилик',
    'trait.hemophiliac.desc': 'Любая рана может стать последней.',
    'trait.lucky.name': 'Удачливый',
    'trait.lucky.desc': 'Мелочи чаще складываются в вашу пользу.',
    'trait.unlucky.name': 'Неудачливый',
    'trait.unlucky.desc': 'Судьба любит подшутить над вами.',

    // ----------------------------------------------------------------
    //  ТИПЫ ЗДАНИЙ (мир D3: карта/журнал)
    // ----------------------------------------------------------------
    'building.izba': 'Изба',
    'building.izba_rich': 'Дом лесопромышленника',
    'building.barn': 'Амбар',
    'building.banya': 'Баня',
    'building.church': 'Церковь',
    'building.store': 'Лавка',
    'building.warehouse': 'Склад',
    'building.telegraph': 'Вокзал (телеграф)',
    'building.sawmill': 'Пилорама',
    'building.granary': 'Житница',
    'building.stable': 'Конюшня',
    'building.smithy': 'Кузница',
    'building.doctor': 'Флигель врача',
    'building.school': 'Школа',
    'building.tavern': 'Трактир',
    'building.jail': 'Околоток',
    'building.guardtower': 'Дозорная вышка',
    'building.fishing_hut': 'Рыбацкая избушка',
    'building.dacha': 'Дача',
    'building.cellar': 'Погреб',
    'building.ruined': 'Погорелый дом',

    // ----------------------------------------------------------------
    //  СУЩЕСТВА
    // ----------------------------------------------------------------
    'ent.wolf.name': 'Волк',
    'ent.wolf.desc': 'Серый хозяин зимы. Голоден как никогда.',
    'ent.bear.name': 'Медведь-шатун',
    'ent.bear.desc': 'Не залёг в берлогу. Убойная сила на четырёх лапах.',
    'ent.deer.name': 'Северный олень',
    'ent.deer.desc': 'Тихий, пугливый, вкусный.',
    'ent.hare.name': 'Заяц-беляк',
    'ent.hare.desc': 'Белый, как снег. Быстр и незаметен.',
    'ent.crow.name': 'Ворона',
    'ent.crow.desc': 'Наблюдает. Всегда наблюдает.',
    'ent.bandit.name': 'Разбойник',
    'ent.bandit.desc': 'Дезертир с тульской винтовкой и пустым желудком.',
    'ent.hermit.name': 'Отшельник',
    'ent.hermit.desc': 'Живёт в лесу давно. Разговор короткий.',
    'ent.fish.name': 'Рыба',
    'ent.fish.desc': 'Плещется в проруби.',

    // ----------------------------------------------------------------
    //  СООБЩЕНИЯ: смерти (канонические причины)
    // ----------------------------------------------------------------
    'msg.death.wolves': 'Вас загрызли волки',
    'msg.death.bear': 'Вас задрал медведь-шатун',
    'msg.death.bandit': 'Вас убили разбойники',
    'msg.death.shot': 'Вас застрелили',
    'msg.death.blade': 'Вас зарезал дезертир',
    'msg.death.blunt': 'Вас забили насмерть',
    'msg.death.frozen': 'Вы замёрзли насмерть',
    'msg.death.starve': 'Вы умерли от голода',
    'msg.death.thirst': 'Вы умерли от жажды',
    'msg.death.exhaust': 'Вы умерли от изнеможения',
    'msg.death.bleed': 'Вы истекли кровью',
    'msg.death.gangrene': 'Вы умерли от гангрены',
    'msg.death.fall': 'Вы разбились при падении',
    'msg.death.drown': 'Вы ушли под лёд',
    'msg.death.burn': 'Вы сгорели заживо',
    'msg.death.poison': 'Отравление победило вас',
    'msg.death.insanity': 'Рассудок покинул вас — и тело тоже',
    'msg.death.unknown': 'Погибли',

    // ----------------------------------------------------------------
    //  СООБЩЕНИЯ: системные
    // ----------------------------------------------------------------
    'msg.start': 'До весеннего парохода — {days} дней. Держитесь.',
    'msg.saved': 'Игра сохранена',
    'msg.loaded': 'Игра загружена',
    'msg.load_failed': 'Не удалось загрузить сохранение',
    'msg.new_try': 'Новая попытка. Север всё тот же.',
    'msg.overweight': 'Ноша слишком тяжела',
    'msg.too_dark': 'Слишком темно',
    'msg.door_locked': 'Заперто',
    'msg.no_space': 'В карманах больше нет места',
    'msg.need_tool': 'Не хватает инструмента',

    // ----------------------------------------------------------------
    //  СООБЩЕНИЯ: события мира
    // ----------------------------------------------------------------
    'msg.night_fall': 'Темнеет. Волки просыпаются.',
    'msg.dawn': 'Рассвет. Ещё один день.',
    'msg.weather.blizzard': 'Надвигается метель — искать укрытие!',
    'msg.weather.snowstorm': 'Крепчает снежная буря',
    'msg.weather.frost': 'Крепчает мороз. Берегите пальцы.',
    'msg.weather.snow': 'Пошёл снег',
    'msg.weather.clear': 'Прояснилось',
    'msg.weather.fog': 'Опустился туман',
    'msg.wolf_howl': 'Вой волков за рекой…',
    'msg.bear_roar': 'Рёв медведя где-то рядом!',
    'msg.levelup': 'Навык вырос',
    'msg.hungry': 'Урчит в животе',
    'msg.starving': 'Вы умираете с голоду',
    'msg.thirsty': 'Пересохло во рту',
    'msg.dehydrated': 'Мучает жажда',
    'msg.cold': 'Холод пробирает до костей',
    'msg.freezing': 'Вы замерзаете!',
    'msg.tired': 'Веки тяжелеют',
    'msg.exhausted': 'Вы валитесь с ног',
    'msg.sanity_bad': 'Стены будто дышат',
    'msg.bleeding': 'Кровь не остановить',
    'msg.infected': 'Рана воспалилась',
    'msg.sick': 'Вас знобит',
    'msg.fire_lit': 'Огонь разгорается',
    'msg.fire_out': 'Костёр погас',
    'msg.polar_night': 'Полярная ночь: солнце не встанет до весны',

    // ----------------------------------------------------------------
    //  СООБЩЕНИЯ: подсказки взаимодействия ([E] …)
    // ----------------------------------------------------------------
    'msg.hint.search': 'Обыскать',
    'msg.hint.open': 'Открыть',
    'msg.hint.close': 'Закрыть',
    'msg.hint.pick': 'Поднять',
    'msg.hint.read': 'Прочитать',
    'msg.hint.sit': 'Сесть',
    'msg.hint.sleep': 'Лечь спать',
    'msg.hint.stoke': 'Подкинуть дров',
    'msg.hint.extinguish': 'Затушить',
    'msg.hint.harvest': 'Собрать',
    'msg.hint.water': 'Зачерпнуть воды',
    'msg.hint.fish': 'Ловить рыбу',
    'msg.hint.dig': 'Копать',
    'msg.hint.chop': 'Рубить',

    // ----------------------------------------------------------------
    //  СООБЩЕНИЯ: обучение (первые шаги)
    // ----------------------------------------------------------------
    'msg.tut.first': 'Осмотритесь: E — обыскать, I — инвентарь, C — крафт.',
    'msg.tut.warm': 'Найдите печь: холод убивает быстрее голода.',
    'msg.tut.night': 'Ночью не выходите без огня.',
    'msg.tut.blizzard': 'В метель не видно собственной руки — сидите в избе.',
    'msg.tut.wolves': 'Волки боятся огня и шума.',
    'msg.tut.bandits': 'Чужаки в лесу. Ценное лучше припрятать.',
    'msg.tut.save': 'Игра сохраняется каждый час.',
    'msg.tut.ship': 'Пароход придёт через {days} дней. Держитесь.',
    'msg.tut.polar': 'Полярная ночь близко. Считайте спички.',
    'msg.tut.craft': 'Из щепы и жира выходит факел — свет это жизнь.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: еда и питьё
    // ----------------------------------------------------------------
    'item.bread.name': 'Ржаной хлеб',
    'item.bread.desc': 'Чёрный, кислый, на кориандре — как пекла хозяйка.',
    'item.toast.name': 'Гренки',
    'item.toast.desc': 'Подсушенный хлеб: меньше места, дольше живёт.',
    'item.rusk.name': 'Сухари',
    'item.rusk.desc': 'Сухарная крошка в мешке переживёт и вас.',
    'item.water_flask.name': 'Фляга с водой',
    'item.water_flask.desc': 'Армейская фляга: вода ещё не ледяная.',
    'item.flask_empty.name': 'Пустая фляга',
    'item.flask_empty.desc': 'Ждёт воды или чего покрепче.',
    'item.pot.name': 'Котелок',
    'item.pot.desc': 'В нём и каша, и похлёбка. Кузнечная работа.',
    'item.frozen_berries.name': 'Мороженая брусника',
    'item.frozen_berries.desc': 'Под снегом — как из погреба.',
    'item.frozen_mushroom.name': 'Замёрзший гриб',
    'item.frozen_mushroom.desc': 'Оттает в котле — станет едой.',
    'item.canned_fish.name': 'Рыбные консервы',
    'item.canned_fish.desc': 'Жестянка с клеймом архангельского завода. Не портится.',
    'item.salt_fish.name': 'Солёная рыба',
    'item.salt_fish.desc': 'Сельдь крепкого посола.',
    'item.fresh_fish.name': 'Свежая рыба',
    'item.fresh_fish.desc': 'Ещё бьётся. Лучше сперва приготовить.',
    'item.cooked_fish.name': 'Печёная рыба',
    'item.cooked_fish.desc': 'С реки на сковороду.',
    'item.dried_fish.name': 'Вяленая рыба',
    'item.dried_fish.desc': 'Твёрдая, как подмётка, зато хранится долго.',
    'item.meat_raw.name': 'Сырое мясо',
    'item.meat_raw.desc': 'Есть сырым — рискнуть животом.',
    'item.meat_cooked.name': 'Жареное мясо',
    'item.meat_cooked.desc': 'Шипит на лучине, пахнет на весь лес.',
    'item.meat_dried.name': 'Вяленое мясо',
    'item.meat_dried.desc': 'Тёмные полоски: провиант дальних переходов.',
    'item.lard_piece.name': 'Шмат сала',
    'item.lard_piece.desc': 'Калорийный кусок счастья.',
    'item.pelmeni.name': 'Пельмени',
    'item.pelmeni.desc': 'Сибирская хитрость: мясо в тесте.',
    'item.sauerkraut.name': 'Квашеная капуста',
    'item.sauerkraut.desc': 'Кислая, хрусткая, в бочке доживёт до весны.',
    'item.pickles.name': 'Солёные огурцы',
    'item.pickles.desc': 'Мочёные из кадушки, с чесноком.',
    'item.honey_jar.name': 'Горшок мёда',
    'item.honey_jar.desc': 'Сладость на чёрный день.',
    'item.dried_mushrooms.name': 'Сушёные грибы',
    'item.dried_mushrooms.desc': 'Пахнут прошлым летом.',
    'item.birch_chaga.name': 'Берёзовая чага',
    'item.birch_chaga.desc': 'Горький северный чай.',
    'item.semolina.name': 'Манная крупа',
    'item.semolina.desc': 'Каша из детства.',
    'item.kasha.name': 'Каша',
    'item.kasha.desc': 'Горячая; с маслом, если повезёт.',
    'item.oat_flakes.name': 'Овсяные хлопья',
    'item.oat_flakes.desc': 'Геркулес: каша за пять минут.',
    'item.salt_bag.name': 'Мешочек соли',
    'item.salt_bag.desc': 'Соль — валюта зимы.',
    'item.sugar_loaf.name': 'Сахарная голова',
    'item.sugar_loaf.desc': 'Отколоть кусок — и к чаю.',
    'item.tea_brick.name': 'Прессованный чай',
    'item.tea_brick.desc': 'Кирпич чая — хватит на всю зиму.',
    'item.milk_bottle.name': 'Бутыль молока',
    'item.milk_bottle.desc': 'Парного уже не найти.',
    'item.kvass_flask.name': 'Бутыль кваса',
    'item.kvass_flask.desc': 'Кисленький, шипучий.',
    'item.galley_biscuits.name': 'Галеты',
    'item.galley_biscuits.desc': 'Сухое печенье мореходов.',
    'item.butter_wheel.name': 'Круг масла',
    'item.butter_wheel.desc': 'Крестьянское, сбитое.',
    'item.potato.name': 'Картошка',
    'item.potato.desc': 'Второй хлеб.',
    'item.onion.name': 'Лук',
    'item.onion.desc': 'От семи недуг.',
    'item.cabbage.name': 'Капуста',
    'item.cabbage.desc': 'Кочан на щи.',
    'item.turnip.name': 'Репа',
    'item.turnip.desc': 'Проще пареной репы.',
    'item.carrot.name': 'Морковь',
    'item.carrot.desc': 'Сладкий корень из погреба.',
    'item.apple_dried.name': 'Сушёные яблоки',
    'item.apple_dried.desc': 'Летний дух в зимний день.',
    'item.flour_bag.name': 'Мешок муки',
    'item.flour_bag.desc': 'Основа всякого хлеба.',
    'item.cranberries_jar.name': 'Брусника в банке',
    'item.cranberries_jar.desc': 'Северный лимон: горечь и витамины.',
    'item.soup_meat.name': 'Мясная похлёбка',
    'item.soup_meat.desc': 'Наваристая, с перцем.',
    'item.soup_veg.name': 'Постная похлёбка',
    'item.soup_veg.desc': 'Овощи да крупа.',
    'item.soup_mushroom.name': 'Грибной суп',
    'item.soup_mushroom.desc': 'Из белых, если повезло.',
    'item.ukha.name': 'Уха',
    'item.ukha.desc': 'Рыбацкая: с дымком и перцем.',
    'item.compote.name': 'Компот',
    'item.compote.desc': 'Сладкий взвар из сухофруктов.',
    'item.dough.name': 'Тесто',
    'item.dough.desc': 'Ждёт печи.',
    'item.kulebyaka.name': 'Кулебяка',
    'item.kulebyaka.desc': 'Пирог с рыбой и кашей.',
    'item.forest_tea.name': 'Лесной чай',
    'item.forest_tea.desc': 'Хвоя, чага, шиповник.',
    'item.potato_fried.name': 'Жареная картошка',
    'item.potato_fried.desc': 'С луком, на сале.',
    'item.potato_boiled.name': 'Варёная картошка',
    'item.potato_boiled.desc': 'В мундире, с солью.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: медицина
    // ----------------------------------------------------------------
    'item.bandage.name': 'Бинт',
    'item.bandage.desc': 'Остановит кровь.',
    'item.bandage_clean.name': 'Чистые бинты',
    'item.bandage_clean.desc': 'Стерильная перевязь.',
    'item.bandage_rag.name': 'Бинт из тряпья',
    'item.bandage_rag.desc': 'Грязнее, чем кажется.',
    'item.bandage_linen.name': 'Льняные бинты',
    'item.bandage_linen.desc': 'Чистое льняное полотно.',
    'item.aspirin.name': 'Аспирин',
    'item.aspirin.desc': 'Сбивает жар и боль.',
    'item.morphine.name': 'Морфий',
    'item.morphine.desc': 'Убирает боль. И не только её.',
    'item.carbolic_acid.name': 'Карболовая кислота',
    'item.carbolic_acid.desc': 'Жжёт, зато рану чистит.',
    'item.iodine_tincture.name': 'Настойка йода',
    'item.iodine_tincture.desc': 'Коричневая, противная, нужная.',
    'item.quinine.name': 'Хинин',
    'item.quinine.desc': 'Против лихорадки.',
    'item.laudanum.name': 'Лауданум',
    'item.laudanum.desc': 'Опиат на спирту.',
    'item.plaster_cast.name': 'Гипсовая повязка',
    'item.plaster_cast.desc': 'Для сломанных костей.',
    'item.splint.name': 'Лубок',
    'item.splint.desc': 'Фиксирует перелом.',
    'item.splint_plank.name': 'Дощатый лубок',
    'item.splint_plank.desc': 'Доска и тряпьё — тоже лекарь.',
    'item.scalpel.name': 'Скальпель',
    'item.scalpel.desc': 'Хирургическая точность.',
    'item.vodka.name': 'Водка',
    'item.vodka.desc': 'И лекарство, и беда.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: материалы
    // ----------------------------------------------------------------
    'item.log.name': 'Бревно',
    'item.log.desc': 'Тяжёлое дерево.',
    'item.plank.name': 'Доска',
    'item.plank.desc': 'Пиленая, сухая.',
    'item.nails.name': 'Гвозди',
    'item.nails.desc': 'Строительная валюта.',
    'item.rope.name': 'Верёвка',
    'item.rope.desc': 'Пеньковая, крепкая.',
    'item.rope_coil.name': 'Моток верёвок',
    'item.rope_coil.desc': 'Несколько саженей сразу.',
    'item.rope_linen.name': 'Льняная верёвка',
    'item.rope_linen.desc': 'Витая, изо льна.',
    'item.rag_rope.name': 'Верёвка из тряпья',
    'item.rag_rope.desc': 'Скрученные лохмотья.',
    'item.scrap_metal.name': 'Металлолом',
    'item.scrap_metal.desc': 'Куски железа на переплавку.',
    'item.cloth_rag.name': 'Тряпьё',
    'item.cloth_rag.desc': 'Лоскуты и обрывки.',
    'item.sinew.name': 'Сухожилия',
    'item.sinew.desc': 'Нитки от самой природы.',
    'item.wolf_pelt.name': 'Волчья шкура',
    'item.wolf_pelt.desc': 'Серая и тёплая.',
    'item.bear_pelt.name': 'Медвежья шкура',
    'item.bear_pelt.desc': 'Тяжёлая, как её хозяин.',
    'item.deer_pelt.name': 'Оленья шкура',
    'item.deer_pelt.desc': 'Мягкий северный мех.',
    'item.hare_pelt.name': 'Заячья шкура',
    'item.hare_pelt.desc': 'Белая, зимняя.',
    'item.fat.name': 'Жир',
    'item.fat.desc': 'Топлёное тепло.',
    'item.charcoal.name': 'Древесный уголь',
    'item.charcoal.desc': 'Для кузни и очага.',
    'item.charcoal_bag.name': 'Мешок угля',
    'item.charcoal_bag.desc': 'Запас на неделю.',
    'item.tar_bucket.name': 'Бадья дёгтя',
    'item.tar_bucket.desc': 'Смоляная, липкая.',
    'item.linen_sheet.name': 'Льняная простыня',
    'item.linen_sheet.desc': 'На бинты и бельё.',
    'item.fir_needles.name': 'Хвоя',
    'item.fir_needles.desc': 'Лапник ели.',
    'item.gunpowder.name': 'Порох',
    'item.gunpowder.desc': 'Чёрный, сыпучий.',
    'item.bullet_cast.name': 'Литые пули',
    'item.bullet_cast.desc': 'Свинцовые капли.',
    'item.wadding.name': 'Пыжи',
    'item.wadding.desc': 'Картонные прокладки патрона.',
    'item.bone_old.name': 'Старая кость',
    'item.bone_old.desc': 'Белая, трухлявая.',
    'item.feather_bunch.name': 'Пучок перьев',
    'item.feather_bunch.desc': 'Для стрел и подушек.',
    'item.wax_block.name': 'Кусок воска',
    'item.wax_block.desc': 'Свечи и вощение ниток.',
    'item.hay_bale.name': 'Сноп сена',
    'item.hay_bale.desc': 'Корм и подстилка.',
    'item.hinge_iron.name': 'Кованые петли',
    'item.hinge_iron.desc': 'Скрипучие, надёжные.',
    'item.wood_glue.name': 'Столярный клей',
    'item.wood_glue.desc': 'Казеиновый, вонючий.',
    'item.horseshoe.name': 'Подкова',
    'item.horseshoe.desc': 'И на счастье тоже.',
    'item.window_glass.name': 'Оконное стекло',
    'item.window_glass.desc': 'Хрупкое, драгоценное.',
    'item.brick_broken.name': 'Битый кирпич',
    'item.brick_broken.desc': 'Строительный мусор.',
    'item.brick_stack.name': 'Штабель кирпича',
    'item.brick_stack.desc': 'Целый, годится в печь.',
    'item.coal_lump.name': 'Кусковой уголь',
    'item.coal_lump.desc': 'Жарко горит.',
    'item.ash_bucket.name': 'Ведро золы',
    'item.ash_bucket.desc': 'Щёлочь для мыла.',
    'item.brine_barrel.name': 'Бочка рассола',
    'item.brine_barrel.desc': 'Кислый, от солений.',
    'item.herring_barrel.name': 'Бочка селёдки',
    'item.herring_barrel.desc': 'Солёный урожай моря.',
    'item.spice_nutmeg.name': 'Мускатный орех',
    'item.spice_nutmeg.desc': 'Заморская пряность.',
    'item.pepper_peas.name': 'Перец горошком',
    'item.pepper_peas.desc': 'Чихнёшь — и согреешься.',
    'item.burlap_sack.name': 'Мешковина',
    'item.burlap_sack.desc': 'Грубый джутовый мешок.',
    'item.sack_rag.name': 'Мешок из тряпья',
    'item.sack_rag.desc': 'Самодельный, но держит.',
    'item.tinder.name': 'Трут',
    'item.tinder.desc': 'Высушенная трухлявая гниль.',
    'item.wadding_pack.desc': 'Пачка пыжей.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: инструменты и утварь
    // ----------------------------------------------------------------
    'item.axe.name': 'Топор',
    'item.axe.desc': 'Плотницкий, с добрым топорищем.',
    'item.hatchet.name': 'Топорик',
    'item.hatchet.desc': 'Маленький, на пояс.',
    'item.axe_small.name': 'Колунок',
    'item.axe_small.desc': 'Для щепы и лучины.',
    'item.hammer.name': 'Молоток',
    'item.hammer.desc': 'Гвоздь да удар в одном.',
    'item.saw.name': 'Пила',
    'item.saw.desc': 'Мелкозубка, для досок.',
    'item.knife.name': 'Нож',
    'item.knife.desc': 'Кухонный — но и оружие.',
    'item.hunting_knife.name': 'Охотничий нож',
    'item.hunting_knife.desc': 'Клинок для снятия шкур.',
    'item.matches.name': 'Спички',
    'item.matches.desc': 'Шведские, в промасленной бумаге.',
    'item.flint.name': 'Огниво',
    'item.flint.desc': 'Кресало и кремень: сырость не страшна.',
    'item.sewing_kit.name': 'Швейный набор',
    'item.sewing_kit.desc': 'Иглы, нитки, напёрсток.',
    'item.shovel.name': 'Лопата',
    'item.shovel.desc': 'Снег здесь — стихия.',
    'item.crowbar.name': 'Лом',
    'item.crowbar.desc': 'Открывает всё, что заперто.',
    'item.ice_pick.name': 'Пешня',
    'item.ice_pick.desc': 'Ломать лёд и наледь.',
    'item.fishing_rod.name': 'Удочка',
    'item.fishing_rod.desc': 'Ореховое удилище.',
    'item.fishing_line.name': 'Леска',
    'item.fishing_line.desc': 'Жильная нитка с крючком.',
    'item.hook_line.name': 'Крючки с леской',
    'item.hook_line.desc': 'Наживи — и в прорубь.',
    'item.hook_nail.name': 'Крючки из гвоздей',
    'item.hook_nail.desc': 'Изогнул гвоздь — и готово.',
    'item.hook_bone.name': 'Костяные крючки',
    'item.hook_bone.desc': 'Выструганы из кости.',
    'item.snare_wire.name': 'Проволока на силки',
    'item.snare_wire.desc': 'Петля на зайца.',
    'item.trap_snare.name': 'Силок',
    'item.trap_snare.desc': 'Заячья напасть.',
    'item.trap_snare_wire.name': 'Проволочный силок',
    'item.trap_snare_wire.desc': 'Прочнее верёвочного.',
    'item.whetstone.name': 'Точильный камень',
    'item.whetstone.desc': 'Брусок для лезвий.',
    'item.file_metal.name': 'Напильник',
    'item.file_metal.desc': 'Драчёвый, по металлу.',
    'item.pliers.name': 'Плоскогубцы',
    'item.pliers.desc': 'Зубы кузнеца.',
    'item.screwdriver.name': 'Отвёртка',
    'item.screwdriver.desc': 'Винты закручивать да в щели лазить.',
    'item.sickle.name': 'Серп',
    'item.sickle.desc': 'Зубастый полумесяц.',
    'item.scythe.name': 'Коса',
    'item.scythe.desc': 'И траву скосить, и от зверя отмахнуться.',
    'item.pitchfork.name': 'Вилы',
    'item.pitchfork.desc': 'Крестьянская пика.',
    'item.sledge.name': 'Нарты',
    'item.sledge.desc': 'Волокуши для тяжкого груза.',
    'item.skis.name': 'Лыжи',
    'item.skis.desc': 'Северные, подбитые камусом.',
    'item.compass_brass.name': 'Латунный компас',
    'item.compass_brass.desc': 'Стрелка дрожит, но север знает.',
    'item.fire_hook.name': 'Костровой крюк',
    'item.fire_hook.desc': 'Подвесить котелок над огнём.',
    'item.cast_iron.name': 'Чугунок',
    'item.cast_iron.desc': 'Тяжёлый и вечный.',
    'item.ladle.name': 'Черпак',
    'item.ladle.desc': 'Разливает по мискам.',
    'item.mug_wood.name': 'Деревянные кружки',
    'item.mug_wood.desc': 'Резные, на всю семью.',
    'item.mug_tin.name': 'Жестяная кружка',
    'item.mug_tin.desc': 'Гремит на морозе.',
    'item.bowl_wood.name': 'Деревянные миски',
    'item.bowl_wood.desc': 'Из липы, ложкой не скребут — гудят.',
    'item.cup_clay.name': 'Глиняная кружка',
    'item.cup_clay.desc': 'Пузатая, глазурованная.',
    'item.plate_tin.name': 'Жестяная миска',
    'item.plate_tin.desc': 'Походная, звякающая.',
    'item.spoon_wood.name': 'Деревянные ложки',
    'item.spoon_wood.desc': 'Большая ложка к обеду.',
    'item.bottle_empty.name': 'Пустая бутылка',
    'item.bottle_empty.desc': 'Стеклянная, из-под казёнки.',
    'item.jar_empty.name': 'Пустая банка',
    'item.jar_empty.desc': 'Под соленья и грибы.',
    'item.stretcher.name': 'Носилки',
    'item.stretcher.desc': 'Для раненых и брёвен.',
    'item.snow_fence.name': 'Снегозадержатель',
    'item.snow_fence.desc': 'Щит против сугробов.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: оружие и патроны
    // ----------------------------------------------------------------
    'item.rifle_mosin.name': 'Винтовка Мосина',
    'item.rifle_mosin.desc': 'Трёхлинейка образца 1891 года.',
    'item.shotgun.name': 'Дробовое ружьё',
    'item.shotgun.desc': 'Двуствольная «коломбина».',
    'item.pistol_nagant.name': 'Револьвер Нагана',
    'item.pistol_nagant.desc': 'Офицерский, семизарядный.',
    'item.rifle_round.name': 'Винтовочный патрон',
    'item.rifle_round.desc': 'Три линии калибра.',
    'item.shell.name': 'Картечный патрон',
    'item.shell.desc': 'Заряжен дробью.',
    'item.bow_hunting.name': 'Охотничий лук',
    'item.bow_hunting.desc': 'Калёная древесина да жила.',
    'item.bow.name': 'Лук',
    'item.bow.desc': 'Простая дуга с тетивой.',
    'item.arrow.name': 'Стрела',
    'item.arrow.desc': 'Оперённая, с железным жалом.',
    'item.arrow_hunting.name': 'Добротная стрела',
    'item.arrow_hunting.desc': 'Тяжёлый наконечник.',
    'item.arrow_bone.name': 'Костяная стрела',
    'item.arrow_bone.desc': 'Жало из кости.',
    'item.spear.name': 'Копьё',
    'item.spear.desc': 'Древко с вбитым ножом.',
    'item.torch.name': 'Факел',
    'item.torch.desc': 'Доска с горящим жиром.',
    'item.torch_oil.name': 'Масляный факел',
    'item.torch_oil.desc': 'Меньше чада, больше света.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: свет и топливо
    // ----------------------------------------------------------------
    'item.lantern.name': 'Фонарь',
    'item.lantern.desc': 'Стеклянный, «летучая мышь».',
    'item.kerosene.name': 'Керосин',
    'item.kerosene.desc': 'Вонючий огонь.',
    'item.lamp_oil.name': 'Лампадное масло',
    'item.lamp_oil.desc': 'Чистое, для света.',
    'item.candle_stump.name': 'Огарок свечи',
    'item.candle_stump.desc': 'Последний пальчик воска.',
    'item.candle_wax.name': 'Восковые свечи',
    'item.candle_wax.desc': 'Ровное пламя без копоти.',
    'item.candle_fat.name': 'Жировые свечи',
    'item.candle_fat.desc': 'Коптят, но светят.',
    'item.firewood_bundle.name': 'Вязанка хвороста',
    'item.firewood_bundle.desc': 'Поленья под мышкой.',
    'item.bedroll.name': 'Спальник',
    'item.bedroll.desc': 'Стёганый мешок для сна.',
    'item.bedroll_fur.name': 'Спальник (шкура)',
    'item.bedroll_fur.desc': 'Мех внутрь — тепло наружу.',
    'item.bedroll_hay.name': 'Спальник (сено)',
    'item.bedroll_hay.desc': 'Пахнет лугом.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: одежда
    // ----------------------------------------------------------------
    'item.ushanka.name': 'Ушанка',
    'item.ushanka.desc': 'Меховая шапка с завязками.',
    'item.coat_fur.name': 'Тулуп',
    'item.coat_fur.desc': 'Овчинный, до пят.',
    'item.coat_fur_bear.name': 'Тулуп (медвежий)',
    'item.coat_fur_bear.desc': 'Шкура шатуна на плечах.',
    'item.coat_fur_wolf.name': 'Тулуп (волчий)',
    'item.coat_fur_wolf.desc': 'Серое тепло.',
    'item.coat_cloth.name': 'Шинель',
    'item.coat_cloth.desc': 'Солдатское сукно.',
    'item.wool_coat.name': 'Шерстяное пальто',
    'item.wool_coat.desc': 'Городское, не для метели.',
    'item.valenki.name': 'Валенки',
    'item.valenki.desc': 'Войлочные: сухие только в мороз.',
    'item.child_valenki.name': 'Детские валенки',
    'item.child_valenki.desc': 'Крошечные, с вышивкой.',
    'item.mittens.name': 'Рукавицы',
    'item.mittens.desc': 'Кожаные ладони, меховой тыл.',
    'item.wool_mittens.name': 'Шерстяные рукавицы',
    'item.wool_mittens.desc': 'Вязаные деревенской шерстью.',
    'item.mittens_hare.name': 'Заячьи рукавицы',
    'item.mittens_hare.desc': 'Мехом внутрь.',
    'item.mittens_linen.name': 'Льняные рукавицы',
    'item.mittens_linen.desc': 'Рабочие, летние.',
    'item.wool_scarf.name': 'Шерстяной шарф',
    'item.wool_scarf.desc': 'Дважды обмотать — и никакой ветер.',
    'item.wool_socks.name': 'Шерстяные носки',
    'item.wool_socks.desc': 'Связаны у печки.',
    'item.rabbit_fur_cap.name': 'Заячья шапка',
    'item.rabbit_fur_cap.desc': 'Из зимнего меха беляка.',
    'item.leather_boots.name': 'Кожаные сапоги',
    'item.leather_boots.desc': 'Со скрипом и гвоздями.',
    'item.bearskin_rug.name': 'Медвежья полость',
    'item.bearskin_rug.desc': 'Постелить на нары.',
    'item.portyanki.name': 'Портянки',
    'item.portyanki.desc': 'Суконные обмотки ног.',
    'item.blanket.name': 'Одеяло',
    'item.blanket.desc': 'Стёганое, ватное.',
    'item.horse_harness.name': 'Конская упряжь',
    'item.horse_harness.desc': 'Хомут да чересседельник.',

    // ----------------------------------------------------------------
    //  ПРЕДМЕТЫ: книги, бумаги, реликвии
    // ----------------------------------------------------------------
    'item.book_carpentry.name': '«Плотницкое дело»',
    'item.book_carpentry.desc': 'Учебник с таблицами сопряжений.',
    'item.book_medic.name': '«Анатомия»',
    'item.book_medic.desc': 'Учебник с таблицами.',
    'item.medical_book.name': '«Справочник врача»',
    'item.medical_book.desc': 'Карманный, по симптомам.',
    'item.book_cook.name': '«Поваренная книга»',
    'item.book_cook.desc': 'Рецепты постных и скоромных дней.',
    'item.book_tailor.name': '«Кройка и шитьё»',
    'item.book_tailor.desc': 'Выкройки и стежки.',
    'item.book_survive.name': '«Выживание на Севере»',
    'item.book_survive.desc': 'Опыт полярных экспедиций.',
    'item.book_track.name': '«Следопытство»',
    'item.book_track.desc': 'О следах и повадках зверя.',
    'item.book_firearm.name': '«Наставление по стрельбе»',
    'item.book_firearm.desc': 'Стрелковый устав.',
    'item.bible_old.name': 'Библия',
    'item.bible_old.desc': 'В кожаном переплёте с застёжкой.',
    'item.journal_page.name': 'Страница дневника',
    'item.journal_page.desc': 'Чужой почерк, замёрзшие чернила.',
    'item.letter_old.name': 'Старое письмо',
    'item.letter_old.desc': 'Дрожащий почерк: писали на войну.',
    'item.photo_family.name': 'Семейная фотография',
    'item.photo_family.desc': 'Снимок на память: все ещё живы.',
    'item.map_old.name': 'Старая карта',
    'item.map_old.desc': 'Потёртая на сгибах.',
    'item.newspaper_stack.name': 'Пачка газет',
    'item.newspaper_stack.desc': '«Архангельские губернские ведомости».',
    'item.telegraph_form.name': 'Бланк телеграммы',
    'item.telegraph_form.desc': 'Строки для аппарата Морзе.',
    'item.account_book.name': 'Гроссбух',
    'item.account_book.desc': 'Учёт за семь лет.',
    'item.tobacco_pouch.name': 'Кисет с табаком',
    'item.tobacco_pouch.desc': 'Махорка и обрывок газеты.',
    'item.tobacco_pipe.name': 'Трубка',
    'item.tobacco_pipe.desc': 'Черешневая, обкуренная.',
    'item.deck_cards.name': 'Карты',
    'item.deck_cards.desc': '«Дурак» на двоих — тоже развлечение.',
    'item.harmonica.name': 'Гармонь',
    'item.harmonica.desc': 'Тульская, двухрядка.',
    'item.medal_bravery.name': 'Медаль «За храбрость»',
    'item.medal_bravery.desc': 'Георгиевская лента выцвела.',
    'item.cross_silver.name': 'Серебряный крест',
    'item.cross_silver.desc': 'Нательный, тяжёлый.',
    'item.crucifix_wood.name': 'Деревянный крестик',
    'item.crucifix_wood.desc': 'Вырезан ножом.',
    'item.crucifix.name': 'Крест нательный',
    'item.crucifix.desc': 'Стружка ещё пахнет елью.',
    'item.watch_silver.name': 'Серебряные часы',
    'item.watch_silver.desc': '«Павел Буре». Тикают.',
    'item.coin_purse.name': 'Кошель с монетами',
    'item.coin_purse.desc': 'Звонкая тяжесть.',
    'item.silver_spoon.name': 'Серебряная ложка',
    'item.silver_spoon.desc': 'Довоенная, с монограммой.',
    'item.scales_brass.name': 'Латунные весы',
    'item.scales_brass.desc': 'Для честной лавки.',
    'item.inkwell.name': 'Чернильница',
    'item.inkwell.desc': 'С пером и непроливайкой.',
    'item.pencil_stump.name': 'Огрызок карандаша',
    'item.pencil_stump.desc': 'Пишет едва.',
    'item.chalk_box.name': 'Коробка мела',
    'item.chalk_box.desc': 'Школьная.',
    'item.globe_dusty.name': 'Пыльный глобус',
    'item.globe_dusty.desc': 'Мир, который больше не нужен.',
    'item.incense.name': 'Ладан',
    'item.incense.desc': 'Церковный, душистый.',
    'item.handcuffs.name': 'Кандалы',
    'item.handcuffs.desc': 'Околоточная пара.',
    'item.door_wood.name': 'Дверь',
    'item.door_wood.desc': 'Съёмная: навесить на петли.',
    'item.barricade_plank.name': 'Баррикадная доска',
    'item.barricade_plank.desc': 'Прибить к косяку.',
    'item.bed_frame.name': 'Кровать',
    'item.bed_frame.desc': 'Каркас с сеткой.',
    'item.chest_wood.name': 'Сундук',
    'item.chest_wood.desc': 'С кладью и амбарным замком.',
    'item.crate_wood.name': 'Ящик',
    'item.crate_wood.desc': 'Тарный, крепкий.',
    'item.stool_wood.name': 'Табурет',
    'item.stool_wood.desc': 'Три ноги — одна суть.',
    'item.bench_wood.name': 'Лавка',
    'item.bench_wood.desc': 'На всю семью.',
    'item.table_wood.name': 'Стол',
    'item.table_wood.desc': 'Столярная гордость.',
    'item.shelf_wood.name': 'Полка',
    'item.shelf_wood.desc': 'Для припасов.',
    'item.coffin_wood.name': 'Гроб',
    'item.coffin_wood.desc': 'Плотницкая работа; лучше не спешить.',

    // ----------------------------------------------------------------
    //  РЕЦЕПТЫ (названия крафта; ключи = recipes.js)
    // ----------------------------------------------------------------
    'recipe.torch.name': 'Факел',
    'recipe.torch_oil.name': 'Масляный факел',
    'recipe.firewood_chop.name': 'Поленья',
    'recipe.firewood_saw.name': 'Чурки',
    'recipe.firewood_plank.name': 'Хворост из досок',
    'recipe.charcoal_burn.name': 'Уголёк',
    'recipe.charcoal_bundle.name': 'Уголь из хвороста',
    'recipe.charcoal_bag.name': 'Мешок угля',
    'recipe.skis.name': 'Лыжи',
    'recipe.bedroll_fur.name': 'Спальник (шкура)',
    'recipe.bedroll_hay.name': 'Спальник (сено)',
    'recipe.trap_snare.name': 'Силок',
    'recipe.trap_snare_wire.name': 'Силок (проволока)',
    'recipe.fishing_line.name': 'Леска',
    'recipe.fishing_line_wire.name': 'Леска (проволока)',
    'recipe.hook_nail.name': 'Крючки (гвозди)',
    'recipe.hook_bone.name': 'Крючки (кость)',
    'recipe.fishing_rod.name': 'Удочка',
    'recipe.fire_hook.name': 'Костровой крюк',
    'recipe.spear.name': 'Копьё',
    'recipe.wadding.name': 'Пыжи',
    'recipe.tinder.name': 'Трут из газет',
    'recipe.candle_wax.name': 'Свечи (воск)',
    'recipe.candle_fat.name': 'Свечи (жир)',
    'recipe.lamp_oil_render.name': 'Масло (вытопка)',
    'recipe.rope_linen.name': 'Верёвка (лён)',
    'recipe.rag_rope.name': 'Верёвка (тряпьё)',
    'recipe.rope_coil.name': 'Моток верёвок',
    'recipe.burlap_sack.name': 'Мешок',
    'recipe.sledge.name': 'Нарты',
    'recipe.stretcher.name': 'Носилки',
    'recipe.snow_fence.name': 'Снегозадержатель',
    'recipe.sewing_kit_bone.name': 'Швейный набор (кость)',
    'recipe.kasha_water.name': 'Каша на воде',
    'recipe.kasha_oat.name': 'Овсяная каша',
    'recipe.kasha_milk.name': 'Каша на молоке',
    'recipe.porridge_milk.name': 'Манная каша',
    'recipe.toast.name': 'Гренки',
    'recipe.meat_cooked.name': 'Жареное мясо',
    'recipe.meat_fat.name': 'Жаркое в сале',
    'recipe.cooked_fish.name': 'Печёная рыба',
    'recipe.soup_meat.name': 'Мясная похлёбка',
    'recipe.soup_veg.name': 'Похлёбка',
    'recipe.soup_mushroom.name': 'Грибной суп',
    'recipe.soup_bone.name': 'Бульон на костях',
    'recipe.gruel.name': 'Мучная похлёбка',
    'recipe.ukha.name': 'Уха',
    'recipe.ukha_rich.name': 'Уха богатая',
    'recipe.shchi.name': 'Щи',
    'recipe.compote.name': 'Компот',
    'recipe.compote_berry.name': 'Брусничный компот',
    'recipe.dough.name': 'Тесто',
    'recipe.pelmeni.name': 'Пельмени',
    'recipe.kulebyaka.name': 'Кулебяка',
    'recipe.fish_pie.name': 'Рыбник',
    'recipe.bread_oven.name': 'Хлеб (печь)',
    'recipe.bread_ash.name': 'Хлеб (костёр)',
    'recipe.rusk.name': 'Сухари',
    'recipe.lard_salt.name': 'Солёное сало',
    'recipe.salt_fish.name': 'Солёная рыба',
    'recipe.dried_fish.name': 'Сушёная рыба',
    'recipe.meat_dried.name': 'Вяленое мясо',
    'recipe.sauerkraut.name': 'Квашеная капуста',
    'recipe.pickles_turnip.name': 'Квашеная репа',
    'recipe.kvass.name': 'Квас',
    'recipe.potato_fried.name': 'Жареная картошка',
    'recipe.potato_boiled.name': 'Варёная картошка',
    'recipe.chaga_tea.name': 'Чай из чаги',
    'recipe.needle_tea.name': 'Хвойный чай',
    'recipe.planks_saw.name': 'Доски (пилой)',
    'recipe.planks_axe.name': 'Доски (топором)',
    'recipe.nails_scrap.name': 'Гвозди',
    'recipe.nails_horseshoe.name': 'Гвозди (подкова)',
    'recipe.hinge_iron.name': 'Петли',
    'recipe.door_wood.name': 'Дверь',
    'recipe.barricade_plank.name': 'Баррикадная доска',
    'recipe.bed_frame.name': 'Кровать',
    'recipe.chest_wood.name': 'Сундук',
    'recipe.crate_wood.name': 'Ящик',
    'recipe.stool_wood.name': 'Табурет',
    'recipe.bench_wood.name': 'Лавка',
    'recipe.table_wood.name': 'Стол',
    'recipe.shelf_wood.name': 'Полка',
    'recipe.coffin_wood.name': 'Гроб',
    'recipe.mug_wood.name': 'Кружки',
    'recipe.bowl_wood.name': 'Миски',
    'recipe.spoon_wood.name': 'Ложки',
    'recipe.ladle.name': 'Черпак',
    'recipe.cast_iron.name': 'Чугунок',
    'recipe.pot.name': 'Котелок',
    'recipe.axe.name': 'Топор',
    'recipe.hatchet.name': 'Топорик',
    'recipe.axe_small.name': 'Колунок',
    'recipe.hammer_make.name': 'Молоток',
    'recipe.saw.name': 'Пила',
    'recipe.shovel.name': 'Лопата',
    'recipe.crowbar.name': 'Лом',
    'recipe.ice_pick.name': 'Ледоруб',
    'recipe.knife.name': 'Нож',
    'recipe.hunting_knife.name': 'Охотничий нож',
    'recipe.pitchfork.name': 'Вилы',
    'recipe.sickle.name': 'Серп',
    'recipe.scythe.name': 'Коса',
    'recipe.file_metal.name': 'Напильник',
    'recipe.pliers.name': 'Плоскогубцы',
    'recipe.screwdriver.name': 'Отвёртка',
    'recipe.horseshoe_make.name': 'Подковы',
    'recipe.wood_glue.name': 'Столярный клей',
    'recipe.lantern.name': 'Фонарь',
    'recipe.sewing_kit.name': 'Швейный набор',
    'recipe.recycle_saw.name': 'Сдать пилу в лом',
    'recipe.recycle_axe.name': 'Сдать топор в лом',
    'recipe.recycle_hammer.name': 'Сдать молоток в лом',
    'recipe.ushanka.name': 'Ушанка (волк)',
    'recipe.rabbit_fur_cap.name': 'Заячья шапка',
    'recipe.coat_fur_bear.name': 'Тулуп (медведь)',
    'recipe.coat_fur_wolf.name': 'Тулуп (волк)',
    'recipe.mittens_hare.name': 'Рукавицы (заяц)',
    'recipe.mittens_linen.name': 'Рукавицы (лён)',
    'recipe.valenki.name': 'Валенки',
    'recipe.leather_boots.name': 'Сапоги',
    'recipe.portyanki.name': 'Портянки',
    'recipe.blanket.name': 'Одеяло',
    'recipe.bearskin_rug.name': 'Медвежья полость',
    'recipe.sack_rag.name': 'Мешок (тряпьё)',
    'recipe.recycle_coat.name': 'Распороть шинель',
    'recipe.recycle_wool.name': 'Распороть пальто',
    'recipe.recycle_linen.name': 'Разрезать лён',
    'recipe.recycle_valenki.name': 'Распороть валенки',
    'recipe.arrow.name': 'Стрелы',
    'recipe.arrow_hunting.name': 'Стрелы добротные',
    'recipe.arrow_bone.name': 'Стрелы (кость)',
    'recipe.bow.name': 'Лук',
    'recipe.bullet_cast.name': 'Пули',
    'recipe.gunpowder.name': 'Порох',
    'recipe.rifle_round.name': 'Патроны',
    'recipe.rifle_round_batch.name': 'Патроны (партия)',
    'recipe.shell.name': 'Картечь',
    'recipe.bandage_rag.name': 'Бинт (тряпьё)',
    'recipe.bandage_linen.name': 'Бинты (лён)',
    'recipe.bandage_clean.name': 'Чистые бинты',
    'recipe.splint.name': 'Лубок',
    'recipe.crucifix.name': 'Крест нательный',

    // ----------------------------------------------------------------
    //  КОНТЕЙНЕРЫ (названия обыскиваемых мест; ключи = loot_tables.js)
    // ----------------------------------------------------------------
    'container.kitchen_pech': 'Печка',
    'container.kitchen_table': 'Кухонный стол',
    'container.kitchen_cupboard': 'Кухонный шкаф',
    'container.kitchen_shelf': 'Кухонная полка',
    'container.bedroom_chest': 'Сундук в спальне',
    'container.bedroom_wardrobe': 'Шкаф в спальне',
    'container.bedroom_bed': 'Кровать',
    'container.living_shelf': 'Полка в гостиной',
    'container.living_crate': 'Ящик в гостиной',
    'container.living_sofa': 'Диван',
    'container.barn_hay': 'Сено в амбаре',
    'container.barn_tools': 'Амбарный инструмент',
    'container.warehouse_crate': 'Складской ящик',
    'container.warehouse_barrel': 'Складская бочка',
    'container.warehouse_sack': 'Складской мешок',
    'container.store_counter': 'Прилавок лавки',
    'container.store_shelf_food': 'Лавка: съестное',
    'container.store_shelf_tools': 'Лавка: инструменты',
    'container.store_shelf_cloth': 'Лавка: одежда',
    'container.store_storage': 'Лавочный склад',
    'container.church_altar': 'Алтарь',
    'container.church_candle': 'Свечной ящик',
    'container.doctor_cabinet': 'Аптечный шкаф врача',
    'container.doctor_bed': 'Кровать во флигеле',
    'container.school_desk': 'Парта',
    'container.school_shelf': 'Классная полка',
    'container.tavern_bar': 'Стойка трактира',
    'container.tavern_table': 'Стол трактира',
    'container.tavern_cellar': 'Погреб трактира',
    'container.smithy_anvil': 'Кузнечный угол',
    'container.smithy_shelf': 'Полка кузни',
    'container.sawmill_workbench': 'Верстак пилорамы',
    'container.granary_sack': 'Мешок житницы',
    'container.stable_rack': 'Стойло конюшни',
    'container.jail_locker': 'Шкаф околотка',
    'container.guardtower_locker': 'Шкаф вышки',
    'container.telegraph_desk': 'Стол телеграфа',
    'container.dacha_chest': 'Дачный сундук',
    'container.boat_supply': 'Пристанский припас',
    'container.fishing_rack': 'Рыбацкий стеллаж',
    'container.cellar_veg': 'Овощной погреб',
    'container.ruined_debris': 'Обломки пожарища',
    'container.ranger_cache': 'Тайник егеря',
    'container.house_generic': 'Хозяйская утварь',
    'container.personal_body': 'Одежда покойника',
    'container.wolf_body': 'Туша волка',
    'container.bear_body': 'Туша медведя',
    'container.deer_body': 'Туша оленя',
    'container.hare_body': 'Тушка зайца',
    'container.bandit_body': 'Труп разбойника',
    'container.crow_body': 'Тушка вороны',

    // ----------------------------------------------------------------
    //  ПРОЧЕЕ
    // ----------------------------------------------------------------
    'ui.kg': 'кг',
    'ui.kcal': 'ккал',
    'ui.degrees': '°C',
    'ui.days_short': 'дн.',
    'ui.piece': 'шт.',
    'ui.new': 'Новый',
    'ui.old': 'Старый'
  };

  // ====================================================================
  //  ДВИЖОК I18N
  // ====================================================================

  /** Текущий язык (двухбуквенный). */
  var lang = 'ru';

  /** Словарь текущего языка (лениво, из WS.Data.locales). */
  function dictOf(code) {
    if (WS.Data && WS.Data.locales && WS.Data.locales[code]) {
      return WS.Data.locales[code];
    }
    return null;
  }

  /** Есть ли перевод. */
  function has(key) {
    var d = dictOf(lang);
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return true;
    if (lang !== 'ru') {
      var r = dictOf('ru');
      if (r && Object.prototype.hasOwnProperty.call(r, key)) return true;
    }
    return false;
  }

  /**
   * Подстановка {токен} из объекта параметров.
   * t('msg.start', {days: 60}) -> «…60 дней…»
   */
  function subst(str, params) {
    return String(str).replace(/\{([a-zA-Z0-9_]+)\}/g, function (all, name) {
      return (params[name] != null) ? String(params[name]) : all;
    });
  }

  /**
   * Перевод ключа.
   *  t(key)              -> перевод | последний сегмент ключа
   *  t(key, 'Лит-л')      -> перевод | литерал
   *  t(key, {days: 3})    -> перевод с подстановкой
   */
  function t(key, a) {
    var v;
    var d = dictOf(lang);

    if (d && Object.prototype.hasOwnProperty.call(d, key)) {
      v = d[key];
    } else if (lang !== 'ru') {
      // запасной язык — русский (канонический)
      var r = dictOf('ru');
      if (r && Object.prototype.hasOwnProperty.call(r, key)) v = r[key];
    }

    if (v == null && typeof a === 'string' && a) {
      v = a;                                   // литеральный запасной перевод
    }
    if (v == null) {
      // последний сегмент ключа: 'item.bread.name' -> 'name'
      var i = String(key).lastIndexOf('.');
      v = (i >= 0) ? String(key).slice(i + 1) : String(key);
    }

    if (a && typeof a === 'object') {
      v = subst(v, a);
    }
    return v;
  }

  /** Сменить язык. Возвращает true, если словарь нашёлся. */
  function setLang(code) {
    code = String(code || '').toLowerCase();
    if (dictOf(code)) {
      lang = code;
      return true;
    }
    WS.warn('I18N: нет словаря "' + code + '"');
    return false;
  }

  /** Доступные языки (по WS.Data.locales). */
  function langs() {
    var out = ['ru'];
    if (WS.Data && WS.Data.locales) {
      out = [];
      for (var k in WS.Data.locales) {
        if (WS.Data.locales.hasOwnProperty(k)) out.push(k);
      }
    }
    return out;
  }

  /** Количество ключей в словаре языка. */
  function size(code) {
    var d = dictOf(code || lang);
    if (!d) return 0;
    var n = 0;
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) n++;
    return n;
  }

  // регистрация словаря в общее хранилище (контракт: WS.Data.locales)
  WS.boot(function initRuLocale() {
    WS.Data = WS.Data || {};
    WS.Data.locales = WS.Data.locales || {};
    // СЛИЯНИЕ, а не перезапись: модули (items_books, items_cook, notes…)
    // регистрируют свои ключи в Data.locales.ru ещё до этого бута —
    // прежнее присваивание целиком затирало их (книги без имён и т.п.).
    // Канонический словарь побеждает при конфликте ключей.
    var cur = WS.Data.locales.ru;
    if (!cur || cur === RU) {
      WS.Data.locales.ru = RU;
    } else {
      for (var k in RU) if (Object.prototype.hasOwnProperty.call(RU, k)) cur[k] = RU[k];
    }
    WS.log('I18N: русский словарь — ' + size('ru') + ' ключей (слияние)');
  }, 'i18n:ru');

  WS.def('I18N', {
    t: t,
    has: has,
    setLang: setLang,
    langs: langs,
    size: size,
    lang: function () { return lang; }
  });
})();
