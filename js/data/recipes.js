/**
 * recipes.js — ДАННЫЕ КРАФТА (модуль C1): ~145 рецептов по шести категориям
 * (survival / cook / carpentry / tailor / ammo / misc) + fallback-объявления
 * предметов, на которые ссылаются рецепты, но которых ещё нет в items_*.js
 * (идентификаторы совпадают с loot_tables.js — когда их объявит канонический
 * файл items_cloth.js, его boot выполнится раньше и определения не конфликтуют).
 * Схема: WS.Data.recipes = [{id, name_key, name, cat, station, time,
 *   req: [{id, n}], tools: [id], out: [{id, n}], skill: {id, lv}, desc}].
 * Связи: systems/craft.js (исполнитель), systems/inventory.js (списание/выдача).
 */
(function () {
  'use strict';

  var recipes = [];

  /** Добавить рецепт (с контролем дублей — защита от опечаток при правках). */
  function R(r) {
    if (!r || !r.id) return;
    for (var i = 0; i < recipes.length; i++) {
      if (recipes[i].id === r.id) {
        WS.warn('recipes: дубликат id "' + r.id + '" пропущен');
        return;
      }
    }
    // нормализация полей
    r.name_key = r.name_key || ('recipe.' + r.id + '.name');
    r.station = r.station || null;
    r.time = Math.max(1, Math.round(r.time || 5));
    r.req = r.req || [];
    r.tools = r.tools || [];
    r.out = r.out || [];
    r.skill = r.skill || null;
    r.cat = r.cat || 'misc';
    recipes.push(r);
  }

  // ====================================================================
  //  ВЫЖИВАНИЕ (cat: 'survival')
  //  Свет, тепло, ловушки, подручное снаряжение. Станций почти не нужно —
  //  нож да руки. Отталкиваемся от предметов, что уже есть в предметах Б.
  // ====================================================================

  // — Факел: доска, тряпьё и жир. Свет на полтора часа, волки морщатся.
  R({
    id: 'torch', name: 'Факел', cat: 'survival', station: null, time: 3,
    req: [{ id: 'plank', n: 1 }, { id: 'cloth_rag', n: 1 }, { id: 'fat', n: 1 }],
    tools: [],
    out: [{ id: 'torch', n: 1 }],
    skill: null,
    desc: 'Доска, пропитанная жиром тряпка — свет и тычок медведю.'
  });

  // — Факел на лампадном масле: горит ровнее жирового.
  R({
    id: 'torch_oil', name: 'Масляный факел', cat: 'survival', station: null, time: 3,
    req: [{ id: 'plank', n: 1 }, { id: 'cloth_rag', n: 1 }, { id: 'lamp_oil', n: 1 }],
    tools: [],
    out: [{ id: 'torch', n: 1 }],
    skill: null,
    desc: 'Пропитка маслом вместо жира — меньше чада.'
  });

  // — Поленья: бревно топором — две вязанки хвороста.
  R({
    id: 'firewood_chop', name: 'Поленья', cat: 'survival', station: null, time: 4,
    req: [{ id: 'log', n: 1 }],
    tools: ['axe'],
    out: [{ id: 'firewood_bundle', n: 2 }],
    skill: null,
    desc: 'Рубить бревно на поленья — топором сподручнее.'
  });

  // — Чурки: пилой выходит больше чурбачков, чем топором.
  R({
    id: 'firewood_saw', name: 'Чурки', cat: 'survival', station: null, time: 5,
    req: [{ id: 'log', n: 1 }],
    tools: ['saw'],
    out: [{ id: 'firewood_bundle', n: 3 }],
    skill: null,
    desc: 'Распустить бревно пилой — без сколов и заноз.'
  });

  // — Хворост из старых досок: две доски — одна вязанка.
  R({
    id: 'firewood_plank', name: 'Хворост из досок', cat: 'survival', station: null, time: 3,
    req: [{ id: 'plank', n: 2 }],
    tools: ['axe'],
    out: [{ id: 'firewood_bundle', n: 1 }],
    skill: null,
    desc: 'Кривые доски — в печь, не в работу.'
  });

  // — Древесный уголь: брёвна томятся в костре до угольков.
  R({
    id: 'charcoal_burn', name: 'Уголёк', cat: 'survival', station: 'fire', time: 20,
    req: [{ id: 'log', n: 2 }],
    tools: [],
    out: [{ id: 'charcoal', n: 4 }],
    skill: null,
    desc: 'Томить дерево в золе — получишь уголь для кузни и пороха.'
  });

  // — Уголь из хвороста: гори, гори ясно.
  R({
    id: 'charcoal_bundle', name: 'Уголь из хвороста', cat: 'survival', station: 'fire', time: 18,
    req: [{ id: 'firewood_bundle', n: 2 }],
    tools: [],
    out: [{ id: 'charcoal', n: 4 }],
    skill: null,
    desc: 'Мелкие поленья прогорают в уголь быстро.'
  });

  // — Мешок угля: удобно носить и сыпать в печь.
  R({
    id: 'charcoal_bag', name: 'Мешок угля', cat: 'survival', station: null, time: 3,
    req: [{ id: 'charcoal', n: 6 }, { id: 'linen_sheet', n: 1 }],
    tools: [],
    out: [{ id: 'charcoal_bag', n: 1 }],
    skill: null,
    desc: 'Лён вместо обёртки: шесть горстей угля в тугой мешок.'
  });

  // — Лыжи: три доски и верёвка — по сугробам как по дороге.
  R({
    id: 'skis', name: 'Лыжи', cat: 'survival', station: null, time: 8,
    req: [{ id: 'plank', n: 3 }, { id: 'rope', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'skis', n: 1 }],
    skill: null,
    desc: 'Снегоступы из досок: увязать крепления верёвкой.'
  });

  // — Спальник волчий: шкура, подклад и сухожилия.
  R({
    id: 'bedroll_fur', name: 'Спальник (шкура)', cat: 'survival', station: null, time: 8,
    req: [{ id: 'wolf_pelt', n: 1 }, { id: 'linen_sheet', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['sewing_kit'],
    out: [{ id: 'bedroll', n: 1 }],
    skill: { id: 'tailor', lv: 1 },
    desc: 'Волчья шкура на льняной подкладке — спать в поле как дома.'
  });

  // — Спальник сенный: снопы в мешке — и бедному спальник.
  R({
    id: 'bedroll_hay', name: 'Спальник (сено)', cat: 'survival', station: null, time: 5,
    req: [{ id: 'hay_bale', n: 2 }, { id: 'burlap_sack', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['sewing_kit'],
    out: [{ id: 'bedroll', n: 1 }],
    skill: null,
    desc: 'Два снопа сена в мешке: колюче, зато тепло и дёшево.'
  });

  // — Силок: проволочная петля на дощечке-площадке.
  R({
    id: 'trap_snare', name: 'Силок', cat: 'survival', station: null, time: 4,
    req: [{ id: 'snare_wire', n: 1 }, { id: 'plank', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'trap_snare', n: 2 }],
    skill: null,
    desc: 'Заяц в петлю: дощечка-площадка и проволочная жилка.'
  });

  // — Силок без площадки: голая проволока, вдвое больше жилок.
  R({
    id: 'trap_snare_wire', name: 'Силок (проволока)', cat: 'survival', station: null, time: 3,
    req: [{ id: 'snare_wire', n: 2 }],
    tools: ['pliers'],
    out: [{ id: 'trap_snare', n: 1 }],
    skill: null,
    desc: 'Скрутить две жилы в петлю — плоскогубцами быстрее.'
  });

  // — Леска из сухожилий: звериные жилы, скрученные в нить.
  R({
    id: 'fishing_line', name: 'Леска', cat: 'survival', station: null, time: 3,
    req: [{ id: 'sinew', n: 2 }],
    tools: [],
    out: [{ id: 'fishing_line', n: 2 }],
    skill: null,
    desc: 'Скрученные сухожилия держат рыбу до пуда.'
  });

  // — Леска из проволоки: тонкая стальная жила.
  R({
    id: 'fishing_line_wire', name: 'Леска (проволока)', cat: 'survival', station: null, time: 3,
    req: [{ id: 'snare_wire', n: 1 }],
    tools: ['pliers'],
    out: [{ id: 'fishing_line', n: 1 }],
    skill: null,
    desc: 'Проволока — на снасти: жёсткая, но крепкая.'
  });

  // — Крючки из гвоздей: гвоздь + напильник = жало.
  R({
    id: 'hook_nail', name: 'Крючки (гвозди)', cat: 'survival', station: 'workbench', time: 4,
    req: [{ id: 'nails', n: 2 }],
    tools: ['file_metal'],
    out: [{ id: 'hook_line', n: 2 }],
    skill: null,
    desc: 'Загнуть и заострить гвоздь — крючок готов.'
  });

  // — Крючки костяные: старый северный способ.
  R({
    id: 'hook_bone', name: 'Крючки (кость)', cat: 'survival', station: null, time: 4,
    req: [{ id: 'bone_old', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'hook_line', n: 2 }],
    skill: null,
    desc: 'Выстругать крючки из крепкой кости — не ржавеют.'
  });

  // — Удочка: хлыст, леска, крючок и мотовильце.
  R({
    id: 'fishing_rod', name: 'Удочка', cat: 'survival', station: null, time: 8,
    req: [{ id: 'plank', n: 1 }, { id: 'rope', n: 1 },
           { id: 'fishing_line', n: 1 }, { id: 'hook_line', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'fishing_rod', n: 1 }],
    skill: null,
    desc: 'Дощатый хлыст с мотовильцем: у проруби вечер коротает.'
  });

  // — Костровой крюк: подвес для котелка над огнём.
  R({
    id: 'fire_hook', name: 'Костровой крюк', cat: 'survival', station: null, time: 5,
    req: [{ id: 'plank', n: 1 }, { id: 'rope', n: 1 }, { id: 'scrap_metal', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'fire_hook', n: 1 }],
    skill: null,
    desc: 'Стальной крюк на шесте: котелок висит над углями.'
  });

  // — Копьё: заострённая доска с обмоткой.
  R({
    id: 'spear', name: 'Копьё', cat: 'survival', station: null, time: 5,
    req: [{ id: 'plank', n: 1 }, { id: 'rope', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'spear', n: 1 }],
    skill: null,
    desc: 'Держи медведя на расстоянии вытянутого копья.'
  });

  // — Пыжи: тряпьё, пробитое в гильзу.
  R({
    id: 'wadding', name: 'Пыжи', cat: 'survival', station: null, time: 2,
    req: [{ id: 'cloth_rag', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'wadding', n: 4 }],
    skill: null,
    desc: 'Нарезать тряпьё кружками — на четыре пыжа.'
  });

  // — Трут: старые газеты рвутся на тряпьё.
  R({
    id: 'tinder', name: 'Трут из газет', cat: 'survival', station: null, time: 1,
    req: [{ id: 'newspaper_stack', n: 1 }],
    tools: [],
    out: [{ id: 'cloth_rag', n: 2 }],
    skill: null,
    desc: 'Жухлая бумага вспыхивает от одной искры.'
  });

  // — Свечи из воска: фитиль и три огарка.
  R({
    id: 'candle_wax', name: 'Свечи (воск)', cat: 'survival', station: null, time: 3,
    req: [{ id: 'wax_block', n: 1 }, { id: 'cloth_rag', n: 1 }],
    tools: [],
    out: [{ id: 'candle_stump', n: 3 }],
    skill: null,
    desc: 'Вощёная тряпица вместо фитиля — три маленькие свечки.'
  });

  // — Свечи из жира: чадят, но светят.
  R({
    id: 'candle_fat', name: 'Свечи (жир)', cat: 'survival', station: 'fire', time: 4,
    req: [{ id: 'fat', n: 1 }, { id: 'cloth_rag', n: 1 }],
    tools: [],
    out: [{ id: 'candle_stump', n: 2 }],
    skill: null,
    desc: 'Растопить жир и окунуть фитиль — свет за копейку.'
  });

  // — Вытопка лампадного масла: два куска жира — бутылка масла.
  R({
    id: 'lamp_oil_render', name: 'Масло (вытопка)', cat: 'survival', station: 'fire', time: 10,
    req: [{ id: 'fat', n: 2 }],
    tools: ['pot'],
    out: [{ id: 'lamp_oil', n: 1 }],
    skill: null,
    desc: 'Выварить жир в котелке — масла для фонаря хватит до утра.'
  });

  // — Верёвка из льна: скрутить полотнище в жгут.
  R({
    id: 'rope_linen', name: 'Верёвка (лён)', cat: 'survival', station: null, time: 3,
    req: [{ id: 'linen_sheet', n: 1 }],
    tools: [],
    out: [{ id: 'rope', n: 1 }],
    skill: null,
    desc: 'Льняной жгут держит и мешок, и нарты.'
  });

  // — Верёвка из тряпья: два жгута в одну верёвку.
  R({
    id: 'rag_rope', name: 'Верёвка (тряпьё)', cat: 'survival', station: null, time: 3,
    req: [{ id: 'cloth_rag', n: 2 }],
    tools: [],
    out: [{ id: 'rope', n: 1 }],
    skill: null,
    desc: 'Перекрутить тряпки — держит вдвое хуже пеньковой.'
  });

  // — Моток верёвок: три верёвки в один тугой моток.
  R({
    id: 'rope_coil', name: 'Моток верёвок', cat: 'survival', station: null, time: 3,
    req: [{ id: 'rope', n: 3 }],
    tools: [],
    out: [{ id: 'rope_coil', n: 1 }],
    skill: null,
    desc: 'Смотать в один моток — и в клеть.'
  });

  // — Мешок: лён и сухожилия в грубую ткань.
  R({
    id: 'burlap_sack', name: 'Мешок', cat: 'survival', station: null, time: 4,
    req: [{ id: 'linen_sheet', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['sewing_kit'],
    out: [{ id: 'burlap_sack', n: 2 }],
    skill: null,
    desc: 'Два мешка из одного полотна: шить грубо, но крепко.'
  });

  // — Нарты: волокуша для тяжёлой поклажи.
  R({
    id: 'sledge', name: 'Нарты', cat: 'carpentry', station: 'workbench', time: 12,
    req: [{ id: 'plank', n: 4 }, { id: 'rope', n: 2 }, { id: 'nails', n: 4 }],
    tools: ['hammer'],
    out: [{ id: 'sledge', n: 1 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Полозья и настил: тащить за собой пуды добычи.'
  });

  // — Носилки: два шеста и холстина.
  R({
    id: 'stretcher', name: 'Носилки', cat: 'carpentry', station: 'workbench', time: 6,
    req: [{ id: 'plank', n: 2 }, { id: 'cloth_rag', n: 2 }, { id: 'rope', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'stretcher', n: 1 }],
    skill: null,
    desc: 'Дощатые носилки на верёвочных лямках — раненого донести.'
  });

  // — Снегозадержатели: щиты вдоль дороги, чтобы замет не замело.
  R({
    id: 'snow_fence', name: 'Снегозадержатель', cat: 'carpentry', station: 'workbench', time: 6,
    req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 3 }, { id: 'rope', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'snow_fence', n: 2 }],
    skill: null,
    desc: 'Решётчатые щиты: ставь там, где ветер наносит сугробы.'
  });

  // — Костяная игла с нитями: швейный набор без единого гвоздя.
  R({
    id: 'sewing_kit_bone', name: 'Швейный набор (кость)', cat: 'survival', station: null, time: 5,
    req: [{ id: 'bone_old', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['file_metal'],
    out: [{ id: 'sewing_kit', n: 1 }],
    skill: null,
    desc: 'Игла из кости, нити из жил: чинить одежду и без лавки.'
  });

  // ====================================================================
  //  ГОТОВКА (cat: 'cook')
  //  Станции: костёр ('fire') и печь ('stove'). Котёл (pot) нужен для
  //  супов и каш. Вода уходит из фляги — пустая фляга возвращается.
  // ====================================================================

  // — Каша на воде: манка и кипяток.
  R({
    id: 'kasha_water', name: 'Каша на воде', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'semolina', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'kasha', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Сыпь манку в кипяток да помешивай.'
  });

  // — Каша из овсяных хлопьев: бедная, но горячая.
  R({
    id: 'kasha_oat', name: 'Овсяная каша', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'oat_flakes', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'kasha', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Овсянка на костре — сытная и простая.'
  });

  // — Каша на молоке: двойная порция, духовка печи.
  R({
    id: 'kasha_milk', name: 'Каша на молоке', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'oat_flakes', n: 1 }, { id: 'milk_bottle', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'kasha', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: null,
    desc: 'Молочная каша в печи — два полных горшка.'
  });

  // — Молочная манка: как бабушка варила.
  R({
    id: 'porridge_milk', name: 'Манная каша', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'semolina', n: 1 }, { id: 'milk_bottle', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'kasha', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: null,
    desc: 'Манка на молоке: комков не будет, если мешать.'
  });

  // — Гренки: хлеб подсушился на углях.
  R({
    id: 'toast', name: 'Гренки', cat: 'cook', station: 'fire', time: 5,
    req: [{ id: 'bread', n: 1 }],
    tools: [],
    out: [{ id: 'toast', n: 1 }],
    skill: null,
    desc: 'Подсушить ломоть на угле — хрустит и не черствеет.'
  });

  // — Жареное мясо: сырое — в котелок, кошачья еда.
  R({
    id: 'meat_cooked', name: 'Жареное мясо', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'meat_raw', n: 1 }],
    tools: [],
    out: [{ id: 'meat_cooked', n: 1 }],
    skill: null,
    desc: 'Сырое мясо в Севере — верный путь к худой болезни.'
  });

  // — Жаркое в сале: две порции из куска и шмата.
  R({
    id: 'meat_fat', name: 'Жаркое в сале', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'meat_raw', n: 1 }, { id: 'lard_piece', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'meat_cooked', n: 2 }],
    skill: null,
    desc: 'Шипит в чугунке на сале — сытней не придумаешь.'
  });

  // — Печёная рыба: свежий улов на прутике.
  R({
    id: 'cooked_fish', name: 'Печёная рыба', cat: 'cook', station: 'fire', time: 7,
    req: [{ id: 'fresh_fish', n: 1 }],
    tools: [],
    out: [{ id: 'cooked_fish', n: 1 }],
    skill: null,
    desc: 'Свежую рыбу — к углям, пока не стухла.'
  });

  // — Мясная похлёбка: мясо, картошка, лук. Две полные миски.
  R({
    id: 'soup_meat', name: 'Мясная похлёбка', cat: 'cook', station: 'fire', time: 12,
    req: [{ id: 'meat_raw', n: 1 }, { id: 'potato', n: 1 },
           { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'soup_meat', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Густая похлёбка: ложка стоит.'
  });

  // — Овощная похлёбка: что выросло на огороде.
  R({
    id: 'soup_veg', name: 'Похлёбка', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'potato', n: 1 }, { id: 'cabbage', n: 1 },
           { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'soup_veg', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Без мяса, зато горячая и на всех.'
  });

  // — Грибной суп: сушёные грибы снова станут едой.
  R({
    id: 'soup_mushroom', name: 'Грибной суп', cat: 'cook', station: 'fire', time: 12,
    req: [{ id: 'dried_mushrooms', n: 2 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'soup_mushroom', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Замочить грибы в кипятке — лес отдаёт всё.'
  });

  // — Бульон на костях: кости вывариваются в навар.
  R({
    id: 'soup_bone', name: 'Бульон на костях', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'bone_old', n: 2 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'soup_meat', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Старые кости да лук — а всё-таки наваристо.'
  });

  // — Мучная похлёбка: мука, разведённая кипятком.
  R({
    id: 'gruel', name: 'Мучная похлёбка', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'soup_veg', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Помол да вода: пусто, но горячо и липнет к рёбрам.'
  });

  // — Уха: рыба, лук и ключевая вода.
  R({
    id: 'ukha', name: 'Уха', cat: 'cook', station: 'fire', time: 12,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'ukha', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Две рыбы, луковица — и не говори, что не навар.'
  });

  // — Царская уха: с картошкой и морковью, в печи. Двойная порция.
  R({
    id: 'ukha_rich', name: 'Уха богатая', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'potato', n: 1 },
           { id: 'carrot', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'ukha', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Уха с овощами томится в печи — сама просится в ложку.'
  });

  // — Щи из капусты с салом: на печи, до темна.
  R({
    id: 'shchi', name: 'Щи', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'cabbage', n: 2 }, { id: 'lard_piece', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'soup_veg', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Капуста да сало: щи сутки настаиваются, мы не будем ждать.'
  });

  // — Компот из сухофруктов: сушёные яблоки и кипяток.
  R({
    id: 'compote', name: 'Компот', cat: 'cook', station: 'stove', time: 8,
    req: [{ id: 'apple_dried', n: 2 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'compote', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Сухие яблоки запарить — два стакана летнего вкуса.'
  });

  // — Компот брусничный: банка брусники и сахарная голова.
  R({
    id: 'compote_berry', name: 'Брусничный компот', cat: 'cook', station: 'stove', time: 8,
    req: [{ id: 'cranberries_jar', n: 1 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'compote', n: 3 }, { id: 'jar_empty', n: 1 }],
    skill: null,
    desc: 'Кислая ягода да сахар — три стакана, банка остаётся.'
  });

  // — Тесто: мука и вода. Основа основ.
  R({
    id: 'dough', name: 'Тесто', cat: 'cook', station: null, time: 5,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'dough', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Замесить крутое тесто — на пельмени и кулебяки.'
  });

  // — Пельмени: тесто и рубленое мясо. Три горсти.
  R({
    id: 'pelmeni', name: 'Пельмени', cat: 'cook', station: null, time: 10,
    req: [{ id: 'dough', n: 1 }, { id: 'meat_raw', n: 1 }],
    tools: [],
    out: [{ id: 'pelmeni', n: 3 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Лепить да морозить: в Севере холодильник за окном.'
  });

  // — Кулебяка с мясом: тесто, жареное мясо, капуста.
  R({
    id: 'kulebyaka', name: 'Кулебяка', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'dough', n: 1 }, { id: 'meat_cooked', n: 1 }, { id: 'cabbage', n: 1 }],
    tools: [],
    out: [{ id: 'kulebyaka', n: 2 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Пирог с начинкой: и обед, и паёк в дорогу.'
  });

  // — Рыбная кулебяка: тесто и печёная рыба.
  R({
    id: 'fish_pie', name: 'Рыбник', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'dough', n: 1 }, { id: 'cooked_fish', n: 2 }, { id: 'onion', n: 1 }],
    tools: [],
    out: [{ id: 'kulebyaka', n: 2 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Рыба в тесте — поморский пирог, сытнее хлеба.'
  });

  // — Хлеб в печи: мука, вода и ложка жира. Два каравая.
  R({
    id: 'bread_oven', name: 'Хлеб (печь)', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'water_flask', n: 1 }, { id: 'fat', n: 1 }],
    tools: [],
    out: [{ id: 'bread', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Хлеб на закваске из жира: печь должна дышать жаром.'
  });

  // — Хлеб на костре: тесто — в золу, золу — в хлеб.
  R({
    id: 'bread_ash', name: 'Хлеб (костёр)', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'dough', n: 1 }],
    tools: [],
    out: [{ id: 'bread', n: 1 }],
    skill: null,
    desc: 'Лепёшка в горячей золе: без печи, да с корочкой.'
  });

  // — Сухари: хлеб режется и досушивается в остывающей печи.
  R({
    id: 'rusk', name: 'Сухари', cat: 'cook', station: 'stove', time: 8,
    req: [{ id: 'bread', n: 1 }],
    tools: [],
    out: [{ id: 'rusk', n: 4 }],
    skill: null,
    desc: 'Четыре сухаря из одного хлеба: не портятся месяцами.'
  });

  // — Шмат сала: жир обваливается в соли.
  R({
    id: 'lard_salt', name: 'Солёное сало', cat: 'cook', station: null, time: 3,
    req: [{ id: 'fat', n: 1 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'lard_piece', n: 2 }],
    skill: null,
    desc: 'Соль — лучший друг сала: лежит месяцами.'
  });

  // — Солёная рыба: улов в рассол.
  R({
    id: 'salt_fish', name: 'Солёная рыба', cat: 'cook', station: null, time: 5,
    req: [{ id: 'fresh_fish', n: 1 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'salt_fish', n: 2 }],
    skill: null,
    desc: 'Две рыбы в соляном рассоле: до весны доживут.'
  });

  // — Сушёная рыба: подвялить у костра.
  R({
    id: 'dried_fish', name: 'Сушёная рыба', cat: 'cook', station: 'fire', time: 25,
    req: [{ id: 'fresh_fish', n: 2 }],
    tools: [],
    out: [{ id: 'dried_fish', n: 2 }],
    skill: { id: 'survive', lv: 1 },
    desc: 'Юколу вялили до звона — запас на долгий путь.'
  });

  // — Вяленое мясо: полосы мяса над углями.
  R({
    id: 'meat_dried', name: 'Вяленое мясо', cat: 'cook', station: 'fire', time: 25,
    req: [{ id: 'meat_raw', n: 2 }],
    tools: [],
    out: [{ id: 'meat_dried', n: 2 }],
    skill: { id: 'survive', lv: 1 },
    desc: 'Тонкие полосы, дым и время: не портится, хрустит.'
  });

  // — Квашеная капуста: бочка, капуста, соль и терпение.
  R({
    id: 'sauerkraut', name: 'Квашеная капуста', cat: 'cook', station: null, time: 20,
    req: [{ id: 'cabbage', n: 1 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'sauerkraut', n: 3 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Три горшка квашенины: витамины среди зимы.'
  });

  // — Квашеная репа: до картошки квасили репу.
  R({
    id: 'pickles_turnip', name: 'Квашеная репа', cat: 'cook', station: null, time: 20,
    req: [{ id: 'turnip', n: 2 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'pickles', n: 2 }],
    skill: null,
    desc: 'Репа в рассоле — дедовский способ дожить до урожая.'
  });

  // — Квас: хлеб, сахар и вода бродят в тепле печи.
  R({
    id: 'kvass', name: 'Квас', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'bread', n: 2 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'kvass_flask', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Сухари да сахар: к вечеру будет чем запить.'
  });

  // — Жареная картошка: чугунок, жир и лопатка.
  R({
    id: 'potato_fried', name: 'Жареная картошка', cat: 'cook', station: 'stove', time: 8,
    req: [{ id: 'potato', n: 2 }, { id: 'fat', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'potato_fried', n: 2 }],
    skill: null,
    desc: 'На сале, с корочкой — запах на весь дом.'
  });

  // — Варёная картошка: в мундире, в котелке.
  R({
    id: 'potato_boiled', name: 'Варёная картошка', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'potato', n: 3 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'potato_boiled', n: 3 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Три картофелины в кипятке: обед бедняка.'
  });

  // — Чай из чаги: берёзовый гриб, настоянный в котелке.
  R({
    id: 'chaga_tea', name: 'Чай из чаги', cat: 'cook', station: 'fire', time: 6,
    req: [{ id: 'birch_chaga', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'forest_tea', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Чага гонит хворь и греет лучше сахару.'
  });

  // — Хвойный чай: еловые иглы против цинги.
  R({
    id: 'needle_tea', name: 'Хвойный чай', cat: 'cook', station: 'fire', time: 6,
    req: [{ id: 'fir_needles', n: 2 }, { id: 'water_flask', n: 1 }],
    tools: ['pot'],
    out: [{ id: 'forest_tea', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Иглы с ели — горько, но цинга отступает.'
  });

  // ====================================================================
  //  СТОЛЯРКА И КУЗНЯ (cat: 'carpentry')
  //  Верстак — дерево, наковальня — мелкая ковка, горн — плавка.
  //  Инструмент (tools) не расходуется, но изнашивается (cond).
  // ====================================================================

  // — Доски пилой: из бревна выходит три доски.
  R({
    id: 'planks_saw', name: 'Доски (пилой)', cat: 'carpentry', station: 'workbench', time: 6,
    req: [{ id: 'log', n: 1 }],
    tools: ['saw'],
    out: [{ id: 'plank', n: 3 }],
    skill: null,
    desc: 'Вдоль волокна, без сколов: три добрые доски.'
  });

  // — Доски топором: быстрее, но две — и те кривые.
  R({
    id: 'planks_axe', name: 'Доски (топором)', cat: 'carpentry', station: null, time: 6,
    req: [{ id: 'log', n: 1 }],
    tools: ['axe'],
    out: [{ id: 'plank', n: 2 }],
    skill: null,
    desc: 'Тесать бревно топором — грубо, зато без верстака.'
  });

  // — Гвозди: обрезок металла под молотком даёт десяток.
  R({
    id: 'nails_scrap', name: 'Гвозди', cat: 'carpentry', station: 'anvil', time: 6,
    req: [{ id: 'scrap_metal', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'nails', n: 10 }],
    skill: null,
    desc: 'Вытянуть, отрубить, заострить — гвоздь за гвоздём.'
  });

  // — Гвозди из подковы: старая подкова — восемь гвоздей.
  R({
    id: 'nails_horseshoe', name: 'Гвозди (подкова)', cat: 'carpentry', station: 'anvil', time: 4,
    req: [{ id: 'horseshoe', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'nails', n: 8 }],
    skill: null,
    desc: 'Ржавую подкову — в гвозди: добру пропадать нельзя.'
  });

  // — Петли: две пары из куска металла.
  R({
    id: 'hinge_iron', name: 'Петли', cat: 'carpentry', station: 'anvil', time: 4,
    req: [{ id: 'scrap_metal', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'hinge_iron', n: 2 }],
    skill: null,
    desc: 'Кованая петля держит дверь крепче гвоздя.'
  });

  // — Дверь: четыре доски, гвозди и две петли.
  R({
    id: 'door_wood', name: 'Дверь', cat: 'carpentry', station: 'workbench', time: 12,
    req: [{ id: 'plank', n: 4 }, { id: 'nails', n: 4 }, { id: 'hinge_iron', n: 2 }],
    tools: ['hammer'],
    out: [{ id: 'door_wood', n: 1 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Поставь вместо выбитой — и волки постучатся, а не войдут.'
  });

  // — Баррикадная доска: гвозди насквозь, остриями наружу.
  R({
    id: 'barricade_plank', name: 'Баррикадная доска', cat: 'carpentry', station: 'workbench', time: 5,
    req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 6 }],
    tools: ['hammer'],
    out: [{ id: 'barricade_plank', n: 2 }],
    skill: null,
    desc: 'Прибить крест-накрест к оконной раме — две за раз.'
  });

  // — Кровать: восемь досок на шкантах и верёвочной сетке.
  R({
    id: 'bed_frame', name: 'Кровать', cat: 'carpentry', station: 'workbench', time: 18,
    req: [{ id: 'plank', n: 8 }, { id: 'nails', n: 8 }, { id: 'rope', n: 2 }],
    tools: ['hammer'],
    out: [{ id: 'bed_frame', n: 1 }],
    skill: { id: 'carpentry', lv: 2 },
    desc: 'Тесаный лежак с сеткой: сон на нарах да на боку надоел.'
  });

  // — Сундук: шесть досок и петли вместо замка.
  R({
    id: 'chest_wood', name: 'Сундук', cat: 'carpentry', station: 'workbench', time: 15,
    req: [{ id: 'plank', n: 6 }, { id: 'nails', n: 4 }, { id: 'hinge_iron', n: 2 }],
    tools: ['hammer'],
    out: [{ id: 'chest_wood', n: 1 }],
    skill: { id: 'carpentry', lv: 2 },
    desc: 'Крышка на петлях: припрятать припас от чужих глаз.'
  });

  // — Ящик: четыре доски и горсть гвоздей.
  R({
    id: 'crate_wood', name: 'Ящик', cat: 'carpentry', station: 'workbench', time: 8,
    req: [{ id: 'plank', n: 4 }, { id: 'nails', n: 6 }],
    tools: ['hammer'],
    out: [{ id: 'crate_wood', n: 1 }],
    skill: null,
    desc: 'Ровный ящик под припасы — не помешает и в погребе.'
  });

  // — Табуреты: две штуки из пары досок.
  R({
    id: 'stool_wood', name: 'Табурет', cat: 'carpentry', station: 'workbench', time: 5,
    req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 3 }],
    tools: ['hammer'],
    out: [{ id: 'stool_wood', n: 2 }],
    skill: null,
    desc: 'Четыре ножки, сиденье — сел, и ножи точить удобно.'
  });

  // — Лавка: длинная скамья к столу.
  R({
    id: 'bench_wood', name: 'Лавка', cat: 'carpentry', station: 'workbench', time: 6,
    req: [{ id: 'plank', n: 3 }, { id: 'nails', n: 4 }],
    tools: ['hammer'],
    out: [{ id: 'bench_wood', n: 1 }],
    skill: null,
    desc: 'Лавка вдоль стены: и сесть, и спать, если прижмёт.'
  });

  // — Стол: доски на козлах.
  R({
    id: 'table_wood', name: 'Стол', cat: 'carpentry', station: 'workbench', time: 10,
    req: [{ id: 'plank', n: 4 }, { id: 'nails', n: 6 }],
    tools: ['hammer'],
    out: [{ id: 'table_wood', n: 1 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Столешница в четыре доски: стряпать и есть не на полу.'
  });

  // — Полки: пара из двух досок.
  R({
    id: 'shelf_wood', name: 'Полка', cat: 'carpentry', station: 'workbench', time: 5,
    req: [{ id: 'plank', n: 2 }, { id: 'nails', n: 3 }],
    tools: ['hammer'],
    out: [{ id: 'shelf_wood', n: 2 }],
    skill: null,
    desc: 'Прибить к стене — банки сами просятся в ряд.'
  });

  // — Гроб: восемь досок. Делать не хочется, а надо.
  R({
    id: 'coffin_wood', name: 'Гроб', cat: 'carpentry', station: 'workbench', time: 20,
    req: [{ id: 'plank', n: 8 }, { id: 'nails', n: 8 }],
    tools: ['hammer'],
    out: [{ id: 'coffin_wood', n: 1 }],
    skill: { id: 'carpentry', lv: 3 },
    desc: 'По-христиански: последний дом для того, кто не дошёл до весны.'
  });

  // — Кружки деревянные: из доски выточить пару.
  R({
    id: 'mug_wood', name: 'Кружки', cat: 'carpentry', station: null, time: 4,
    req: [{ id: 'plank', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'mug_wood', n: 2 }],
    skill: null,
    desc: 'Бадейка с ручкой: квас не разольёшь.'
  });

  // — Миски: две из одной доски.
  R({
    id: 'bowl_wood', name: 'Миски', cat: 'carpentry', station: null, time: 4,
    req: [{ id: 'plank', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'bowl_wood', n: 2 }],
    skill: null,
    desc: 'Выдолбить миску — дело одной свечи.'
  });

  // — Ложки: четыре штуки из щепки.
  R({
    id: 'spoon_wood', name: 'Ложки', cat: 'carpentry', station: null, time: 4,
    req: [{ id: 'plank', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'spoon_wood', n: 4 }],
    skill: null,
    desc: 'Резать ложки на продажу — занятие заключённых.'
  });

  // — Черпак: доска и крюк металла.
  R({
    id: 'ladle', name: 'Черпак', cat: 'carpentry', station: null, time: 5,
    req: [{ id: 'plank', n: 1 }, { id: 'scrap_metal', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'ladle', n: 1 }],
    skill: null,
    desc: 'Ковш на железном крюке: разливать по мискам.'
  });

  // — Чугунок: плавка лома в горне.
  R({
    id: 'cast_iron', name: 'Чугунок', cat: 'carpentry', station: 'forge', time: 12,
    req: [{ id: 'scrap_metal', n: 3 }],
    tools: ['hammer'],
    out: [{ id: 'cast_iron', n: 1 }],
    skill: null,
    desc: 'Отлить тяжёлую сковороду: печь без чугунка — не печь.'
  });

  // — Котелок: жестяной котел на три куска металла.
  R({
    id: 'pot', name: 'Котелок', cat: 'carpentry', station: 'forge', time: 12,
    req: [{ id: 'scrap_metal', n: 3 }],
    tools: ['hammer'],
    out: [{ id: 'pot', n: 1 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Выковать да пропаять: без котелка дальняя дорога горька.'
  });

  // — Топор: два куска металла на тесаное топорище.
  R({
    id: 'axe', name: 'Топор', cat: 'carpentry', station: 'anvil', time: 12,
    req: [{ id: 'scrap_metal', n: 2 }, { id: 'plank', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'axe', n: 1 }],
    skill: { id: 'carpentry', lv: 2 },
    desc: 'Лезвие, обух, клин: главный инструмент северного двора.'
  });

  // — Топорик: меньший и легче.
  R({
    id: 'hatchet', name: 'Топорик', cat: 'carpentry', station: 'anvil', time: 8,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'plank', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'hatchet', n: 1 }],
    skill: null,
    desc: 'Одной рукой машет, в дорожный мешок ложится.'
  });

  // — Колунок: маленький колун для лучины.
  R({
    id: 'axe_small', name: 'Колунок', cat: 'carpentry', station: 'anvil', time: 8,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'plank', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'axe_small', n: 1 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Щепать лучину да мелкий хворост.'
  });

  // — Молоток: боёк на рукоять.
  R({
    id: 'hammer_make', name: 'Молоток', cat: 'carpentry', station: 'anvil', time: 8,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'plank', n: 1 }],
    tools: [],
    out: [{ id: 'hammer', n: 1 }],
    skill: null,
    desc: 'Гвоздь без молотка не вгонится — заведи свой.'
  });

  // — Пила: полотно с зубьями, натянутое на раму.
  R({
    id: 'saw', name: 'Пила', cat: 'carpentry', station: 'anvil', time: 10,
    req: [{ id: 'scrap_metal', n: 2 }, { id: 'plank', n: 1 }],
    tools: ['file_metal'],
    out: [{ id: 'saw', n: 1 }],
    skill: { id: 'carpentry', lv: 2 },
    desc: 'Напильником — зуб за зубом: лучковой пилой веселей.'
  });

  // — Лопата: штык металла на два черенка.
  R({
    id: 'shovel', name: 'Лопата', cat: 'carpentry', station: 'forge', time: 10,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'plank', n: 2 }],
    tools: ['hammer'],
    out: [{ id: 'shovel', n: 1 }],
    skill: null,
    desc: 'Рыть снег и могилу — без лопаты никак.'
  });

  // — Лом: два куска металла, гнутых и закалённых.
  R({
    id: 'crowbar', name: 'Лом', cat: 'carpentry', station: 'forge', time: 8,
    req: [{ id: 'scrap_metal', n: 2 }],
    tools: [],
    out: [{ id: 'crowbar', n: 1 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Отжать дверь, вскрыть пол — свайка железная.'
  });

  // — Ледоруб: штырь и рукоять — для прорубей.
  R({
    id: 'ice_pick', name: 'Ледоруб', cat: 'carpentry', station: 'anvil', time: 6,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'plank', n: 1 }],
    tools: [],
    out: [{ id: 'ice_pick', n: 1 }],
    skill: null,
    desc: 'Долбить лёд да щепать морозную рыбу.'
  });

  // — Нож: лезвие и обмотанная тряпьём рукоять.
  R({
    id: 'knife', name: 'Нож', cat: 'carpentry', station: 'anvil', time: 6,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'cloth_rag', n: 1 }],
    tools: ['file_metal'],
    out: [{ id: 'knife', n: 1 }],
    skill: null,
    desc: 'Скромный нож: и хлеб, и зверь, и оборона.'
  });

  // — Охотничий нож: крепкая сталь и обмотка жилами.
  R({
    id: 'hunting_knife', name: 'Охотничий нож', cat: 'carpentry', station: 'forge', time: 10,
    req: [{ id: 'scrap_metal', n: 2 }, { id: 'sinew', n: 1 }],
    tools: ['file_metal'],
    out: [{ id: 'hunting_knife', n: 1 }],
    skill: { id: 'carpentry', lv: 3 },
    desc: 'Снимать шкуру одним движением — дело кузнеца и охотника.'
  });

  // — Вилы: два куска металла и пара досок.
  R({
    id: 'pitchfork', name: 'Вилы', cat: 'carpentry', station: 'anvil', time: 10,
    req: [{ id: 'scrap_metal', n: 2 }, { id: 'plank', n: 2 }],
    tools: ['hammer'],
    out: [{ id: 'pitchfork', n: 1 }],
    skill: null,
    desc: 'Сено вилами переворачивать да лиходеев держать на удалении.'
  });

  // — Серп: полумесяц металла на чаплыжник.
  R({
    id: 'sickle', name: 'Серп', cat: 'carpentry', station: 'anvil', time: 6,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'plank', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'sickle', n: 1 }],
    skill: null,
    desc: 'Жать траву на подстилку скоту.'
  });

  // — Коса: длинное лезвие на косовище.
  R({
    id: 'scythe', name: 'Коса', cat: 'carpentry', station: 'anvil', time: 10,
    req: [{ id: 'scrap_metal', n: 2 }, { id: 'plank', n: 2 }],
    tools: ['hammer'],
    out: [{ id: 'scythe', n: 1 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Маховая коса: и сено, и аргумент в драке.'
  });

  // — Напильник: сталь с насечкой.
  R({
    id: 'file_metal', name: 'Напильник', cat: 'carpentry', station: 'forge', time: 10,
    req: [{ id: 'scrap_metal', n: 2 }],
    tools: ['hammer'],
    out: [{ id: 'file_metal', n: 1 }],
    skill: { id: 'carpentry', lv: 3 },
    desc: 'Насечь зубцы по стали — без него оружие не заточить.'
  });

  // — Плоскогубцы: губки и шарнир.
  R({
    id: 'pliers', name: 'Плоскогубцы', cat: 'carpentry', station: 'forge', time: 6,
    req: [{ id: 'scrap_metal', n: 1 }],
    tools: [],
    out: [{ id: 'pliers', n: 1 }],
    skill: { id: 'carpentry', lv: 2 },
    desc: 'Гнуть проволоку и вытаскивать гвозди.'
  });

  // — Отвёртка: шлицевое жало.
  R({
    id: 'screwdriver', name: 'Отвёртка', cat: 'carpentry', station: 'forge', time: 6,
    req: [{ id: 'scrap_metal', n: 1 }],
    tools: [],
    out: [{ id: 'screwdriver', n: 1 }],
    skill: null,
    desc: 'Простоватая отвёртка: крутить шурупы да подсунуть в щель.'
  });

  // — Подковы: пара из одного куска.
  R({
    id: 'horseshoe_make', name: 'Подковы', cat: 'carpentry', station: 'anvil', time: 5,
    req: [{ id: 'scrap_metal', n: 1 }],
    tools: ['hammer'],
    out: [{ id: 'horseshoe', n: 2 }],
    skill: { id: 'carpentry', lv: 1 },
    desc: 'Гнутый обод с шипами: коню — счастье, дому — над дверью.'
  });

  // — Столярный клей: вываренные жилы.
  R({
    id: 'wood_glue', name: 'Столярный клей', cat: 'carpentry', station: 'fire', time: 15,
    req: [{ id: 'sinew', n: 3 }],
    tools: ['pot'],
    out: [{ id: 'wood_glue', n: 1 }],
    skill: null,
    desc: 'Мездровый клей: держит лук и фанеру лучше гвоздей.'
  });

  // — Фонарь: корпус и стекло.
  R({
    id: 'lantern', name: 'Фонарь', cat: 'carpentry', station: 'forge', time: 12,
    req: [{ id: 'scrap_metal', n: 2 }, { id: 'window_glass', n: 1 }],
    tools: ['pliers'],
    out: [{ id: 'lantern', n: 1 }],
    skill: { id: 'carpentry', lv: 2 },
    desc: 'Стеклянный футляр да фитиль: свет на шесть часов.'
  });

  // — Швейный набор: игла из гвоздя, нитки, обрывок холста.
  R({
    id: 'sewing_kit', name: 'Швейный набор', cat: 'carpentry', station: null, time: 5,
    req: [{ id: 'scrap_metal', n: 1 }, { id: 'cloth_rag', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['file_metal'],
    out: [{ id: 'sewing_kit', n: 1 }],
    skill: null,
    desc: 'Игла, напёрсток из гильзы, клубок ниток.'
  });

  // — Перековать старую пилу: в лом.
  R({
    id: 'recycle_saw', name: 'Сдать пилу в лом', cat: 'carpentry', station: 'forge', time: 6,
    req: [{ id: 'saw', n: 1 }],
    tools: [],
    out: [{ id: 'scrap_metal', n: 1 }],
    skill: null,
    desc: 'Ржавое полотно — в горн: металл дороже воспоминаний.'
  });

  // — Перековать старый топор: в лом.
  R({
    id: 'recycle_axe', name: 'Сдать топор в лом', cat: 'carpentry', station: 'forge', time: 6,
    req: [{ id: 'axe', n: 1 }],
    tools: [],
    out: [{ id: 'scrap_metal', n: 1 }],
    skill: null,
    desc: 'Треснувшее топорище не спасти — железо в дело.'
  });

  // — Перековать старый молоток: в лом.
  R({
    id: 'recycle_hammer', name: 'Сдать молоток в лом', cat: 'carpentry', station: 'forge', time: 6,
    req: [{ id: 'hammer', n: 1 }],
    tools: [],
    out: [{ id: 'scrap_metal', n: 1 }],
    skill: null,
    desc: 'Разбегавшийся боёк — на переплавку.'
  });

  // ====================================================================
  //  ПОРТНО (cat: 'tailor')
  //  Швейный набор не расходуется, но тупится (cond). Шкуры зверей
  //  северного леса — валюта портного.
  // ====================================================================

  // — Ушанка из волчьей шкуры: с завязками.
  R({
    id: 'ushanka', name: 'Ушанка (волк)', cat: 'tailor', station: null, time: 8,
    req: [{ id: 'wolf_pelt', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['sewing_kit'],
    out: [{ id: 'ushanka', n: 1 }],
    skill: { id: 'tailor', lv: 1 },
    desc: 'Волчий мех на голове: уши не отдубеют и в буран.'
  });

  // — Заячья шапка: из пары заячьих шкурок.
  R({
    id: 'rabbit_fur_cap', name: 'Заячья шапка', cat: 'tailor', station: null, time: 6,
    req: [{ id: 'hare_pelt', n: 2 }, { id: 'sinew', n: 1 }],
    tools: ['sewing_kit'],
    out: [{ id: 'rabbit_fur_cap', n: 1 }],
    skill: null,
    desc: 'Заячьи шкурки легки и теплы — шапка на первое время.'
  });

  // — Тулуп медвежий: одна шкура на всю грудь.
  R({
    id: 'coat_fur_bear', name: 'Тулуп (медведь)', cat: 'tailor', station: null, time: 18,
    req: [{ id: 'bear_pelt', n: 1 }, { id: 'sinew', n: 3 }],
    tools: ['sewing_kit'],
    out: [{ id: 'coat_fur', n: 1 }],
    skill: { id: 'tailor', lv: 3 },
    desc: 'Медвежья шкура на плечах: мороз воет, а ты — нет.'
  });

  // — Тулуп волчий: две волчьих шкуры.
  R({
    id: 'coat_fur_wolf', name: 'Тулуп (волк)', cat: 'tailor', station: null, time: 18,
    req: [{ id: 'wolf_pelt', n: 2 }, { id: 'sinew', n: 3 }],
    tools: ['sewing_kit'],
    out: [{ id: 'coat_fur', n: 1 }],
    skill: { id: 'tailor', lv: 2 },
    desc: 'Сшить волчьи шкуры встык — полшубра, но и то хлеб.'
  });

  // — Рукавицы заячьи: шкурка и жилы.
  R({
    id: 'mittens_hare', name: 'Рукавицы (заяц)', cat: 'tailor', station: null, time: 5,
    req: [{ id: 'hare_pelt', n: 1 }, { id: 'sinew', n: 1 }],
    tools: ['sewing_kit'],
    out: [{ id: 'mittens', n: 1 }],
    skill: null,
    desc: 'Мехом внутрь: пальцы держат топорище.'
  });

  // — Рукавицы холщовые: пара из полотна.
  R({
    id: 'mittens_linen', name: 'Рукавицы (лён)', cat: 'tailor', station: null, time: 4,
    req: [{ id: 'linen_sheet', n: 1 }, { id: 'sinew', n: 1 }],
    tools: ['sewing_kit'],
    out: [{ id: 'mittens', n: 2 }],
    skill: null,
    desc: 'Холщовые верхонки: не тепло, а руки целы.'
  });

  // — Валенки: шкуры на войлочную колодку.
  R({
    id: 'valenki', name: 'Валенки', cat: 'tailor', station: null, time: 12,
    req: [{ id: 'hare_pelt', n: 2 }, { id: 'wolf_pelt', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['sewing_kit'],
    out: [{ id: 'valenki', n: 1 }],
    skill: { id: 'tailor', lv: 2 },
    desc: 'Меховые сапоги: в стужу — что печь по колено.'
  });

  // — Сапоги кожаные: оленья кожа, дёготь на водоотталкивание.
  R({
    id: 'leather_boots', name: 'Сапоги', cat: 'tailor', station: null, time: 15,
    req: [{ id: 'deer_pelt', n: 1 }, { id: 'sinew', n: 2 }, { id: 'tar_bucket', n: 1 }],
    tools: ['sewing_kit'],
    out: [{ id: 'leather_boots', n: 1 }],
    skill: { id: 'tailor', lv: 2 },
    desc: 'Оленья кожа на швах дёгтем: и в оттепель сухо.'
  });

  // — Портянки: разрезать полотно пополам.
  R({
    id: 'portyanki', name: 'Портянки', cat: 'tailor', station: null, time: 3,
    req: [{ id: 'linen_sheet', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'portyanki', n: 2 }],
    skill: null,
    desc: 'Обмотать ступни сукном — дедовский способ беречь сапоги.'
  });

  // — Одеяло: три полотнища на живую нитку.
  R({
    id: 'blanket', name: 'Одеяло', cat: 'tailor', station: null, time: 10,
    req: [{ id: 'linen_sheet', n: 3 }, { id: 'sinew', n: 2 }],
    tools: ['sewing_kit'],
    out: [{ id: 'blanket', n: 1 }],
    skill: null,
    desc: 'Стёганое одеяло из полотна: накрыться на лежанке.'
  });

  // — Медвежья полость: шкура на сани.
  R({
    id: 'bearskin_rug', name: 'Медвежья полость', cat: 'tailor', station: null, time: 12,
    req: [{ id: 'bear_pelt', n: 1 }, { id: 'sinew', n: 2 }],
    tools: ['sewing_kit'],
    out: [{ id: 'bearskin_rug', n: 1 }],
    skill: { id: 'tailor', lv: 1 },
    desc: 'Мех наружу, подол на сани — и ноги не застудишь.'
  });

  // — Мешок из тряпья: три тряпки в мешковину.
  R({
    id: 'sack_rag', name: 'Мешок (тряпьё)', cat: 'tailor', station: null, time: 4,
    req: [{ id: 'cloth_rag', n: 3 }, { id: 'sinew', n: 1 }],
    tools: ['sewing_kit'],
    out: [{ id: 'burlap_sack', n: 1 }],
    skill: null,
    desc: 'Сшить лоскуты — держит картошку, но не держит воду.'
  });

  // — Распороть шинель: на тряпьё.
  R({
    id: 'recycle_coat', name: 'Распороть шинель', cat: 'tailor', station: null, time: 3,
    req: [{ id: 'coat_cloth', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'cloth_rag', n: 3 }],
    skill: null,
    desc: 'Сукно на ветошь: рвётся легко, греет уже некого.'
  });

  // — Распороть шерстяное пальто: на тряпьё.
  R({
    id: 'recycle_wool', name: 'Распороть пальто', cat: 'tailor', station: null, time: 3,
    req: [{ id: 'wool_coat', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'cloth_rag', n: 4 }],
    skill: null,
    desc: 'Шерсть в дело: четыре лоскута на рукавицы и пыжи.'
  });

  // — Разрезать лён: на тряпьё.
  R({
    id: 'recycle_linen', name: 'Разрезать лён', cat: 'tailor', station: null, time: 2,
    req: [{ id: 'linen_sheet', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'cloth_rag', n: 3 }],
    skill: null,
    desc: 'Полотно в лоскуты: трут, бинты, пыжи.'
  });

  // — Распороть валенки: войлок на тряпьё.
  R({
    id: 'recycle_valenki', name: 'Распороть валенки', cat: 'tailor', station: null, time: 3,
    req: [{ id: 'valenki', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'cloth_rag', n: 2 }],
    skill: null,
    desc: 'Стоптанное войлок — на утепление окон.'
  });

  // ====================================================================
  //  БОЕПРИПАСЫ (cat: 'ammo')
  //  Порох льётся на горне, патроны сидятся на наковальне.
  //  Профессиональные — со скиллом firearm.
  // ====================================================================

  // — Стрелы: древко, гвоздь-остриё, оперение.
  R({
    id: 'arrow', name: 'Стрелы', cat: 'ammo', station: 'workbench', time: 6,
    req: [{ id: 'plank', n: 1 }, { id: 'nails', n: 1 },
           { id: 'cloth_rag', n: 1 }, { id: 'feather_bunch', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'arrow', n: 6 }],
    skill: null,
    desc: 'Шесть стрел: прямые да с перьями.'
  });

  // — Стрелы добротные: побольше гвоздей и перьев.
  R({
    id: 'arrow_hunting', name: 'Стрелы добротные', cat: 'ammo', station: 'workbench', time: 8,
    req: [{ id: 'plank', n: 1 }, { id: 'nails', n: 2 }, { id: 'feather_bunch', n: 2 }],
    tools: ['knife'],
    out: [{ id: 'arrow', n: 8 }],
    skill: { id: 'firearm', lv: 1 },
    desc: 'Каленые острия, тугое оперение: восемь в колчане.'
  });

  // — Стрелы с костяными наконечниками: без единого гвоздя.
  R({
    id: 'arrow_bone', name: 'Стрелы (кость)', cat: 'ammo', station: null, time: 6,
    req: [{ id: 'plank', n: 1 }, { id: 'bone_old', n: 2 }, { id: 'feather_bunch', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'arrow', n: 6 }],
    skill: null,
    desc: 'Костяные жала не ржавеют и зверя берут.'
  });

  // — Лук: доска, тетива-жила, клей.
  R({
    id: 'bow', name: 'Лук', cat: 'ammo', station: 'workbench', time: 12,
    req: [{ id: 'plank', n: 1 }, { id: 'rope', n: 1 },
           { id: 'sinew', n: 2 }, { id: 'wood_glue', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'bow_hunting', n: 1 }],
    skill: { id: 'firearm', lv: 1 },
    desc: 'Клеёный лук с тетивой из жил: тише выстрела не бывает.'
  });

  // — Пули: отлить из лома в форму.
  R({
    id: 'bullet_cast', name: 'Пули', cat: 'ammo', station: 'forge', time: 8,
    req: [{ id: 'scrap_metal', n: 1 }],
    tools: ['pliers'],
    out: [{ id: 'bullet_cast', n: 8 }],
    skill: null,
    desc: 'Форма да горн: восемь свинцовых головок.'
  });

  // — Порох: уголь и селитра из соли.
  R({
    id: 'gunpowder', name: 'Порох', cat: 'ammo', station: 'forge', time: 12,
    req: [{ id: 'charcoal', n: 3 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'gunpowder', n: 1 }],
    skill: { id: 'firearm', lv: 2 },
    desc: 'Толочь в ступке, беречься от искры: дымное зелье.'
  });

  // — Патроны винтовочные: порох, пуля, пыж.
  R({
    id: 'rifle_round', name: 'Патроны', cat: 'ammo', station: 'anvil', time: 6,
    req: [{ id: 'gunpowder', n: 1 }, { id: 'bullet_cast', n: 1 }, { id: 'wadding', n: 1 }],
    tools: [],
    out: [{ id: 'rifle_round', n: 4 }],
    skill: { id: 'firearm', lv: 1 },
    desc: 'Сидка и завальцовка: четыре патрона на мосинку.'
  });

  // — Патроны партией: сразу дюжина, руки набиты.
  R({
    id: 'rifle_round_batch', name: 'Патроны (партия)', cat: 'ammo', station: 'anvil', time: 12,
    req: [{ id: 'gunpowder', n: 3 }, { id: 'bullet_cast', n: 3 }, { id: 'wadding', n: 3 }],
    tools: [],
    out: [{ id: 'rifle_round', n: 12 }],
    skill: { id: 'firearm', lv: 3 },
    desc: 'Дюжина за присест: заряды не делаются наспех.'
  });

  // — Картечь для дробовика: две гильзы.
  R({
    id: 'shell', name: 'Картечь', cat: 'ammo', station: 'anvil', time: 8,
    req: [{ id: 'gunpowder', n: 2 }, { id: 'bullet_cast', n: 2 }, { id: 'wadding', n: 1 }],
    tools: [],
    out: [{ id: 'shell', n: 2 }],
    skill: { id: 'firearm', lv: 2 },
    desc: 'Крупная дробь на медведя: две латунных гильзы.'
  });

  // ====================================================================
  //  МЕДИЦИНА И ПРОЧЕЕ (cat: 'misc')
  //  Бинты, лубки, мелочь. Всё, что держит человека в сборе.
  // ====================================================================

  // — Бинт из тряпья: обмотать да завязать.
  R({
    id: 'bandage_rag', name: 'Бинт (тряпьё)', cat: 'misc', station: null, time: 2,
    req: [{ id: 'cloth_rag', n: 1 }],
    tools: [],
    out: [{ id: 'bandage', n: 1 }],
    skill: null,
    desc: 'Чистую тряпку — на рану: лучше, чем ничего.'
  });

  // — Бинты из льна: разрезать полотно на полосы.
  R({
    id: 'bandage_linen', name: 'Бинты (лён)', cat: 'misc', station: null, time: 3,
    req: [{ id: 'linen_sheet', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'bandage', n: 3 }],
    skill: null,
    desc: 'Три льняных полосы: рвутся плохо, раны держат хорошо.'
  });

  // — Чистые бинты: прокипятить в водке.
  R({
    id: 'bandage_clean', name: 'Чистые бинты', cat: 'misc', station: null, time: 3,
    req: [{ id: 'bandage', n: 2 }, { id: 'vodka', n: 1 }],
    tools: [],
    out: [{ id: 'bandage_clean', n: 2 }],
    skill: null,
    desc: 'Спирт убивает гниль: два стерильных бинта.'
  });

  // — Лубок: расщеплённая доска для сломанной ноги.
  R({
    id: 'splint', name: 'Лубок', cat: 'misc', station: null, time: 3,
    req: [{ id: 'plank', n: 1 }],
    tools: ['saw'],
    out: [{ id: 'splint_plank', n: 2 }],
    skill: null,
    desc: 'Дощечки да обмотка: нога срастётся к весне.'
  });

  // — Нательный крест: нож и дощечка.
  R({
    id: 'crucifix', name: 'Крест нательный', cat: 'misc', station: null, time: 4,
    req: [{ id: 'plank', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'crucifix_wood', n: 1 }],
    skill: null,
    desc: 'Вырезать крестик: не помешает ни в дороге, ни на исповеди.'
  });

  // ====================================================================
  //  FALLBACK-ПРЕДМЕТЫ
  //  Рецепты выше ссылаются на предметы, которые объявит канонический
  //  items_cloth.js (его boot идёт раньше по алфавиту файлов: c < f).
  //  Пока его нет — минимальные определения отсюда. Паттерн as в fire.js
  //  (pot): add только если слота ещё нет.
  // ====================================================================

  /** Новые предметы — выходы рецептов C1 (нигде больше не встречаются). */
  var NEW_ITEMS = [
    // стряпня
    { id: 'soup_meat', cat: 'food', w: 0.9, stack: 2, cal: 1200, thir: -6, per: 3, tags: ['perishable', 'edible'] },
    { id: 'soup_veg', cat: 'food', w: 0.8, stack: 2, cal: 700, thir: -4, per: 3, tags: ['perishable', 'edible'] },
    { id: 'soup_mushroom', cat: 'food', w: 0.8, stack: 2, cal: 800, thir: -4, per: 3, tags: ['perishable', 'edible'] },
    { id: 'ukha', cat: 'food', w: 0.9, stack: 2, cal: 1000, thir: 10, per: 2, tags: ['perishable', 'edible'] },
    { id: 'compote', cat: 'drink', w: 0.9, stack: 2, cal: 300, thir: 45, per: 4, sanity: 3, tags: ['perishable', 'drinkable'] },
    { id: 'dough', cat: 'food', w: 0.7, stack: 3, cal: 400, thir: -8, per: 5, sick: 20, tags: ['perishable', 'edible'] },
    { id: 'kulebyaka', cat: 'food', w: 0.8, stack: 3, cal: 1500, thir: -10, per: 4, tags: ['perishable', 'edible'] },
    { id: 'forest_tea', cat: 'drink', w: 0.8, stack: 2, cal: 20, thir: 40, per: 1, sanity: 4, heal: 3, tags: ['perishable', 'drinkable'] },
    { id: 'potato_fried', cat: 'food', w: 0.4, stack: 4, cal: 900, thir: -12, per: 3, tags: ['perishable', 'edible'] },
    { id: 'potato_boiled', cat: 'food', w: 0.35, stack: 4, cal: 600, thir: -6, per: 3, tags: ['perishable', 'edible'] },
    { id: 'meat_dried', cat: 'food', w: 0.25, stack: 8, cal: 750, thir: -18, per: 40, tags: ['edible'] },
    // медицина
    { id: 'splint_plank', cat: 'med', w: 0.4, stack: 2, cures: 'fracture', tags: ['heal'] },
    // снаряжение
    { id: 'fishing_line', cat: 'tool', w: 0.05, stack: 6, tags: ['fishing'] },
    { id: 'trap_snare', cat: 'tool', w: 0.3, stack: 4, tags: ['trapping'] },
    { id: 'fire_hook', cat: 'tool', w: 0.6, stack: 1, tags: ['cooking'] },
    { id: 'portyanki', cat: 'cloth', w: 0.15, stack: 2, slots: ['feet'], warm: 9, wind: 15, wet: 45, def: 0, tags: [] },
    { id: 'blanket', cat: 'cloth', w: 1.6, stack: 1, warm: 25, wind: 0, wet: 30, def: 0, tags: [] },
    // строительные заготовки (ставит будущий модуль строительства)
    { id: 'door_wood', cat: 'misc', w: 6.0, stack: 1, tags: ['buildable'] },
    { id: 'barricade_plank', cat: 'misc', w: 3.0, stack: 4, tags: ['buildable'] },
    { id: 'bed_frame', cat: 'misc', w: 14.0, stack: 1, tags: ['buildable'] },
    { id: 'chest_wood', cat: 'misc', w: 8.0, stack: 1, tags: ['buildable', 'container_loot'] },
    { id: 'crate_wood', cat: 'misc', w: 5.0, stack: 1, tags: ['buildable', 'container_loot'] },
    { id: 'stool_wood', cat: 'misc', w: 2.0, stack: 2, tags: ['buildable'] },
    { id: 'bench_wood', cat: 'misc', w: 4.0, stack: 1, tags: ['buildable'] },
    { id: 'table_wood', cat: 'misc', w: 7.0, stack: 1, tags: ['buildable'] },
    { id: 'shelf_wood', cat: 'misc', w: 3.0, stack: 2, tags: ['buildable'] },
    { id: 'snow_fence', cat: 'misc', w: 2.5, stack: 3, tags: ['buildable'] },
    { id: 'stretcher', cat: 'misc', w: 5.0, stack: 1, tags: ['buildable'] },
    { id: 'coffin_wood', cat: 'misc', w: 12.0, stack: 1, tags: ['buildable'] }
  ];

  /** Предметы из loot_tables.js, на которые ссылаются рецепты (fallback). */
  var BACKUP_ITEMS = [
    // огородное
    { id: 'potato', cat: 'food', w: 0.2, stack: 12, cal: 500, thir: -8, per: 30, tags: ['perishable', 'edible'] },
    { id: 'onion', cat: 'food', w: 0.12, stack: 10, cal: 150, thir: -5, per: 25, tags: ['perishable', 'edible'] },
    { id: 'cabbage', cat: 'food', w: 1.0, stack: 3, cal: 250, thir: -5, per: 20, tags: ['perishable', 'edible'] },
    { id: 'turnip', cat: 'food', w: 0.3, stack: 8, cal: 200, thir: -6, per: 25, tags: ['perishable', 'edible'] },
    { id: 'carrot', cat: 'food', w: 0.12, stack: 10, cal: 200, thir: -6, per: 20, tags: ['perishable', 'edible'] },
    { id: 'apple_dried', cat: 'food', w: 0.08, stack: 12, cal: 300, thir: -10, per: 0, tags: ['edible'] },
    { id: 'flour_bag', cat: 'food', w: 2.0, stack: 2, cal: 0, thir: -20, per: 120, tags: [] },
    { id: 'cranberries_jar', cat: 'food', w: 0.6, stack: 4, cal: 200, thir: -4, per: 0, tags: ['edible'] },
    { id: 'jar_empty', cat: 'container', w: 0.3, stack: 6, tags: ['container'] },
    { id: 'bottle_empty', cat: 'container', w: 0.35, stack: 4, tags: ['container'] },
    // шкуры, кость, перья
    { id: 'deer_pelt', cat: 'material', w: 3.0, stack: 2, tags: ['tailor'] },
    { id: 'hare_pelt', cat: 'material', w: 0.3, stack: 6, tags: ['tailor'] },
    { id: 'bone_old', cat: 'material', w: 0.3, stack: 10, tags: [] },
    { id: 'feather_bunch', cat: 'material', w: 0.05, stack: 12, tags: [] },
    { id: 'wax_block', cat: 'material', w: 0.4, stack: 6, tags: [] },
    { id: 'hay_bale', cat: 'material', w: 4.0, stack: 3, tags: [] },
    { id: 'burlap_sack', cat: 'container', w: 0.3, stack: 3, tags: ['container'] },
    { id: 'hinge_iron', cat: 'material', w: 0.15, stack: 8, tags: [] },
    { id: 'wood_glue', cat: 'material', w: 0.2, stack: 4, tags: [] },
    { id: 'horseshoe', cat: 'material', w: 0.4, stack: 4, tags: [] },
    { id: 'window_glass', cat: 'material', w: 0.8, stack: 3, tags: [] },
    // инструменты (loot_tables: barn_hay/smithy)
    { id: 'sickle', cat: 'tool', w: 1.0, stack: 1, dmg: 14, range: 1.0, atkSpd: 1.1, knock: 3, crit: 6, tags: ['weapon'] },
    { id: 'scythe', cat: 'tool', w: 2.0, stack: 1, dmg: 18, range: 1.6, atkSpd: 0.8, knock: 4, crit: 6, twoHand: true, tags: ['weapon'] },
    { id: 'mug_wood', cat: 'misc', w: 0.2, stack: 4, tags: [] },
    { id: 'bowl_wood', cat: 'misc', w: 0.25, stack: 4, tags: [] },
    { id: 'spoon_wood', cat: 'misc', w: 0.05, stack: 6, tags: [] },
    { id: 'ladle', cat: 'misc', w: 0.3, stack: 2, tags: [] },
    { id: 'cast_iron', cat: 'tool', w: 2.5, stack: 1, tags: ['cooking'] }
  ];

  /** Зарегистрировать предмет, если его ещё нет (паттерн fire.js). */
  function addIfMissing(items, o) {
    if (!o || !o.id || items[o.id]) return;
    items[o.id] = o;
  }

  // ====================================================================
  //  РЕГИСТРАЦИЯ
  // ====================================================================

  WS.boot(function initRecipes() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};

    // fallback-предметы (канонические файлы данных зарегистрируются раньше)
    var i;
    for (i = 0; i < NEW_ITEMS.length; i++) addIfMissing(WS.Data.items, NEW_ITEMS[i]);
    for (i = 0; i < BACKUP_ITEMS.length; i++) addIfMissing(WS.Data.items, BACKUP_ITEMS[i]);

    // рецепты + индексы
    WS.Data.recipes = recipes;
    WS.Data.recipesById = {};
    for (i = 0; i < recipes.length; i++) {
      WS.Data.recipesById[recipes[i].id] = recipes[i];
    }

    // проверка целостности: каждый id в рецепте должен существовать
    // (страховка от опечаток при будущих правках)
    var broken = [];
    for (i = 0; i < recipes.length; i++) {
      var r = recipes[i];
      var k, id;
      for (k = 0; k < r.req.length; k++) {
        id = r.req[k].id;
        if (!WS.Data.items[id]) broken.push(r.id + ':req:' + id);
      }
      for (k = 0; k < r.out.length; k++) {
        id = r.out[k].id;
        if (!WS.Data.items[id]) broken.push(r.id + ':out:' + id);
      }
      for (k = 0; k < r.tools.length; k++) {
        id = r.tools[k];
        if (!WS.Data.items[id]) broken.push(r.id + ':tool:' + id);
      }
    }
    if (broken.length) {
      WS.warn('recipes: неизвестные предметы — ' + broken.join(', '));
    }

    WS.log('recipes: ' + recipes.length + ' рецептов зарегистрировано');
  }, 'data:recipes');

})();
