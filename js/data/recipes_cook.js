/**
 * recipes_cook.js — РЕЦЕПТЫ РАСШИРЕННОЙ КУЛИНАРИИ (модуль H1): 101 рецепт
 * русской кухни — супы, каши, стряпня, выпечка, заготовки, напитки и
 * праздничные блюда. Категория 'cook', станции 'fire' | 'stove'
 * (холодные заготовки — null, паттерн recipes.js). Супы и каши требуют
 * чугунный котёл (tools: ['pot_cast']). Навык — cook (lv 0..5+).
 * Связи: data/items_cook.js (блюда/ингредиенты), systems/cooking.js
 * (WS.Cook — стряпня с качеством), systems/craft.js (обычный крафт).
 */
(function () {
  'use strict';

  var recipes = [];

  // русский словарь для i18n (ключи 'recipe.<id>.name')
  var RU = {};

  /** Добавить рецепт (контроль локальных дублей + нормализация полей). */
  function R(r) {
    if (!r || !r.id) return;
    for (var i = 0; i < recipes.length; i++) {
      if (recipes[i].id === r.id) {
        WS.warn('recipes_cook: дубликат id "' + r.id + '" пропущен');
        return;
      }
    }
    // нормализация (та же, что в recipes.js)
    r.name_key = r.name_key || ('recipe.' + r.id + '.name');
    r.station = r.station || null;
    r.time = Math.max(1, Math.round(r.time || 5));
    r.req = r.req || [];
    r.tools = r.tools || [];
    r.out = r.out || [];
    r.skill = r.skill || null;
    r.cat = r.cat || 'cook';
    recipes.push(r);
    RU['recipe.' + r.id + '.name'] = r.name || r.id;
  }

  // ====================================================================
  //  §1. БАЗОВАЯ СТРЯПНЯ
  //  «Отварить всё съедобное»: печёное, пареное, вкрутую. Без премудростей,
  //  станция — костёр или печь, инструмент — руки да нож.
  // ====================================================================

  // — Картошка в золе: клубень — в горячие угли, мундир — в защиту.
  R({
    id: 'potato_ash_bake', name: 'Картошка в золе', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'potato', n: 1 }],
    tools: [],
    out: [{ id: 'potato_baked', n: 2 }],
    skill: null,
    desc: 'Закопать в угли и не спешить: мундир сам отойдёт.'
  });

  // — Толчёнка: варёная картошка да ложка. С маслом — барская.
  R({
    id: 'potato_mash_make', name: 'Толчёнка', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'potato', n: 2 }, { id: 'milk_bottle', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'potato_mashed', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: null,
    desc: 'Толочь до гладкости, молоко влить горячим.'
  });

  // — Яйца вкрутую: пять минут кипения — и паёк готов.
  R({
    id: 'egg_boil_make', name: 'Яйца вкрутую', cat: 'cook', station: 'fire', time: 4,
    req: [{ id: 'egg', n: 2 }],
    tools: [],
    out: [{ id: 'egg_boiled', n: 2 }],
    skill: null,
    desc: 'Вкрутую — на дорогу, всмятку — к столу.'
  });

  // — Яичница: с пылу с жару.
  R({
    id: 'egg_fry_make', name: 'Яичница', cat: 'cook', station: 'fire', time: 4,
    req: [{ id: 'egg', n: 2 }, { id: 'fat', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'egg_fried', n: 2 }],
    skill: null,
    desc: 'Сало шипит — яйца вперёд.'
  });

  // — Жареная курица: птица на сковороде.
  R({
    id: 'chicken_roast_make', name: 'Жареная курица', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'chicken', n: 1 }, { id: 'fat', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'roast_chicken', n: 2 }],
    skill: null,
    desc: 'Обжарить до румяной корки, не пересушить.'
  });

  // — Свёкла печёная: целиком, в кожуре.
  R({
    id: 'beet_bake_make', name: 'Свёкла печёная', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'beet', n: 2 }],
    tools: [],
    out: [{ id: 'beet_baked', n: 2 }],
    skill: null,
    desc: 'Запечь в кожуре: слаще варёной.'
  });

  // — Пареная репа: проще пареной репы.
  R({
    id: 'turnip_stew_make', name: 'Пареная репа', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'turnip', n: 3 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'turnip_stewed', n: 3 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Томить в горшке под крышкой, воду выпарить.'
  });

  // — Разделать курицу: мясо, потроха, кости — всё в дело.
  R({
    id: 'chicken_dress', name: 'Разделать курицу', cat: 'cook', station: null, time: 4,
    req: [{ id: 'chicken', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'meat_raw', n: 2 }, { id: 'giblets', n: 1 }, { id: 'bone_old', n: 1 }],
    skill: null,
    desc: 'Опалить, выпотрошить, разделать: ничего не пропадёт.'
  });

  // ====================================================================
  //  §2. СУПЫ
  //  Честный состав: капуста/мясо/рыба/овощи + вода + котёл. Вода уходит
  //  из фляги, фляга возвращается. Печь томит лучше костра.
  // ====================================================================

  // — Щи из свежей капусты: капуста, картошка, лук и вода.
  R({
    id: 'shchi_fresh', name: 'Щи из свежей капусты', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'cabbage', n: 1 }, { id: 'potato', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'shchi', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Свежая капуста в котле: щи сутки настаиваются, мы не будем ждать.'
  });

  // — Кислые щи: квашеная капуста да сало.
  R({
    id: 'shchi_sour', name: 'Кислые щи', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'sauerkraut', n: 1 }, { id: 'potato', n: 1 }, { id: 'lard_piece', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'shchi_sour', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Кислая капуста, сало, лавровый лист из мечты.'
  });

  // — Пустые щи: капуста да вода. Бедный, но горячий обед.
  R({
    id: 'shchi_empty', name: 'Пустые щи', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'cabbage', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'shchi', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Ни мяса, ни сала — зато горячо и по-нашему.'
  });

  // — Щи с грибами: квашеная капуста да сушёные грибы.
  R({
    id: 'shchi_grib', name: 'Щи с грибами', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'cabbage', n: 1 }, { id: 'dried_mushrooms', n: 2 }, { id: 'potato', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'shchi', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Грибной навар заменяет мясо: постные щи не хуже скоромных.'
  });

  // — Борщ: свёкла решает всё.
  R({
    id: 'borscht', name: 'Борщ', cat: 'cook', station: 'stove', time: 16,
    req: [{ id: 'beet', n: 1 }, { id: 'cabbage', n: 1 }, { id: 'potato', n: 1 }, { id: 'meat_raw', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'borscht', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Свёклу — в навар, мясо — в бульон: малиновое варево.'
  });

  // — Уха простая: рыба, лук и ключевая вода.
  R({
    id: 'ukha_fish', name: 'Уха (простая)', cat: 'cook', station: 'fire', time: 12,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'ukha_fish', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Две рыбы и луковица — и не говори, что не навар.'
  });

  // — Двойная уха: сначала бульон, потом вторая рыба.
  R({
    id: 'ukha_double', name: 'Двойная уха', cat: 'cook', station: 'stove', time: 20,
    req: [{ id: 'fresh_fish', n: 3 }, { id: 'potato', n: 1 }, { id: 'carrot', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'ukha_double', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Бульон на одном улове, рыба из второго: поморская хитрость.'
  });

  // — Молочная уха: рыба, томлённая в молоке.
  R({
    id: 'ukha_milk', name: 'Молочная уха', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'milk_bottle', n: 1 }, { id: 'onion', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'ukha_milk', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Беломорский обычай: треска в молоке.'
  });

  // — Рассольник: перловка и солёные огурцы.
  R({
    id: 'rassolnik', name: 'Рассольник', cat: 'cook', station: 'stove', time: 16,
    req: [{ id: 'barley', n: 1 }, { id: 'pickles', n: 2 }, { id: 'meat_raw', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'rassolnik', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Перловку замочи, огурцы поруби, рассол не вылей.'
  });

  // — Калья: рыбный дедушка рассольника — рыба с огурцами.
  R({
    id: 'kalya', name: 'Калья', cat: 'cook', station: 'stove', time: 16,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'pickles', n: 1 }, { id: 'barley', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kalya', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Старинный рыбный суп: огурцы и перловка — с уловом в родстве.'
  });

  // — Солянка мясная: густая, на жареном.
  R({
    id: 'solyanka_meat', name: 'Солянка мясная', cat: 'cook', station: 'stove', time: 16,
    req: [{ id: 'meat_cooked', n: 2 }, { id: 'pickles', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'solyanka', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Обжарить, влить бульон, огурцов — не жалеть.'
  });

  // — Солянка рыбная: на солёной рыбе.
  R({
    id: 'solyanka_fish', name: 'Солянка рыбная', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'salt_fish', n: 2 }, { id: 'pickles', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'solyanka_fish', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Солёная рыба задаёт тон, лук смягчает.'
  });

  // — Гороховый суп: горох, картошка, лук.
  R({
    id: 'goroh_soup', name: 'Гороховый суп', cat: 'cook', station: 'fire', time: 14,
    req: [{ id: 'pea', n: 2 }, { id: 'potato', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'pea_soup', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Горох разварить до пюре — ложка должна стоять.'
  });

  // — Гороховый с копчёностями: дым вместо мяса.
  R({
    id: 'soup_pea_smoked', name: 'Гороховый с копчёностями', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'pea', n: 2 }, { id: 'meat_smoked', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'pea_soup', n: 3 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Копчёный хвост в горохе — деревенское богатство.'
  });

  // — Грибовница из свежих (мороженых) грибов.
  R({
    id: 'gribownitsa', name: 'Грибовница', cat: 'cook', station: 'fire', time: 13,
    req: [{ id: 'frozen_mushroom', n: 3 }, { id: 'potato', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'mushroom_soup', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Грибы оттаять в котле: навар тёмный, душа светлая.'
  });

  // — Грибовница из сушёных грибов: лес возвращается в воду.
  R({
    id: 'grib_soup_dried', name: 'Грибовница (сушёные)', cat: 'cook', station: 'fire', time: 13,
    req: [{ id: 'dried_mushrooms', n: 2 }, { id: 'potato', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'mushroom_soup', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Сушёные грибы снова станут едой: замочи и вари.'
  });

  // — Крапивный суп: весенняя заглушка.
  R({
    id: 'nettle_soup', name: 'Крапивный суп', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'nettle', n: 2 }, { id: 'potato', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'nettle_soup', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Молодую крапиву — в бульон: первая зелень после зимы.'
  });

  // — Холодец: кости вывариваются в желатин.
  R({
    id: 'kholodets', name: 'Холодец', cat: 'cook', station: 'stove', time: 25,
    req: [{ id: 'bone_old', n: 2 }, { id: 'meat_raw', n: 2 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kholodets', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Томить кости до клейкости: мороз доварит сам.'
  });

  // — Рыбный холодец: студёная рыба в желе.
  R({
    id: 'kholodets_fish', name: 'Рыбный холодец', cat: 'cook', station: 'stove', time: 25,
    req: [{ id: 'fresh_fish', n: 3 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kholodets_fish', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Рыбье желе: застынет на подоконнике.'
  });

  // — Лапша куриная: домашняя лапша из теста.
  R({
    id: 'lapsha_soup', name: 'Лапша куриная', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'chicken', n: 1 }, { id: 'dough', n: 1 }, { id: 'carrot', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'lapsha_soup', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Тесто резать лентами, курицу — в навар первым.'
  });

  // — Куриный бульон: светлое лекарство.
  R({
    id: 'broth_chicken', name: 'Куриный бульон', cat: 'cook', station: 'fire', time: 12,
    req: [{ id: 'chicken', n: 1 }, { id: 'onion', n: 1 }, { id: 'carrot', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'broth_chicken', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Снять пену, томить на углях: пить горячим.'
  });

  // ====================================================================
  //  §3. КАШИ
  //  «Щи да каша — пища наша». Котёл, крупа, вода или молоко.
  // ====================================================================

  // — Гречневая каша на воде.
  R({
    id: 'kasha_grech', name: 'Гречневая каша', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'buckwheat', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_buckwheat', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Не мешать! Рассыпчатость — в терпении.'
  });

  // — Молочная каша из гречки.
  R({
    id: 'kasha_grech_milk', name: 'Гречка на молоке', cat: 'cook', station: 'stove', time: 11,
    req: [{ id: 'buckwheat', n: 1 }, { id: 'milk_bottle', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_milk', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: null,
    desc: 'Молоко вместо воды: каша выходит нежной.'
  });

  // — Пшённая каша на воде.
  R({
    id: 'kasha_pshen', name: 'Пшённая каша', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'millet', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_millet', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Пшено промыть трижды — и в котёл.'
  });

  // — Молочная пшённая каша.
  R({
    id: 'kasha_pshen_milk', name: 'Пшённая на молоке', cat: 'cook', station: 'stove', time: 11,
    req: [{ id: 'millet', n: 1 }, { id: 'milk_bottle', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_milk', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: null,
    desc: 'Жёлтая каша на белом молоке.'
  });

  // — Тыквенная каша: пшено в тыкве, на молоке.
  R({
    id: 'kasha_pumpkin', name: 'Тыквенная каша', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'millet', n: 1 }, { id: 'pumpkin', n: 1 }, { id: 'milk_bottle', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_pumpkin', n: 3 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Тыкву — кубиком, пшено — следом: томить до сладости.'
  });

  // — Овсяная каша на молоке: двойная порция.
  R({
    id: 'kasha_oat_milk', name: 'Овсянка на молоке', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'oat_flakes', n: 1 }, { id: 'milk_bottle', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_oat', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: null,
    desc: 'Хлопья в горячее молоко: разварится само.'
  });

  // — Манная каша на молоке с маслом.
  R({
    id: 'kasha_sem_milk', name: 'Манка на молоке', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'semolina', n: 1 }, { id: 'milk_bottle', n: 1 }, { id: 'butter_wheel', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_semolina', n: 3 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Сыпь манку тонкой струйкой — комков не будет.'
  });

  // — Гороховая каша: толчёная, с луком.
  R({
    id: 'kasha_pea', name: 'Гороховая каша', cat: 'cook', station: 'fire', time: 12,
    req: [{ id: 'pea', n: 2 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_pea', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Горох разварить и истолочь, лук обжарить в сале.'
  });

  // — Полевая каша: крупа, сало, лук. Солдатская.
  R({
    id: 'polevaya', name: 'Полевая каша', cat: 'cook', station: 'fire', time: 12,
    req: [{ id: 'buckwheat', n: 1 }, { id: 'lard_piece', n: 1 }, { id: 'onion', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'polevaya_kasha', n: 2 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Без воды: сало топится, крупа томится в жиру.'
  });

  // — Гречка с грибами: постная, а сытная.
  R({
    id: 'kasha_grib', name: 'Гречка с грибами', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'buckwheat', n: 1 }, { id: 'dried_mushrooms', n: 2 }, { id: 'onion', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'kasha_grib', n: 2 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Грибы замочить, лук — в масло, гречку — сверху.'
  });

  // ====================================================================
  //  §4. ОСНОВНОЕ
  //  Мясо, рыба, дичь. Жарка — на чугунке, тушение — в котле.
  // ====================================================================

  // — Домашняя тушёнка: мясо вытоплено с салом и солью, в банке.
  R({
    id: 'meat_stew', name: 'Тушёнка домашняя', cat: 'cook', station: 'stove', time: 30,
    req: [{ id: 'meat_raw', n: 2 }, { id: 'fat', n: 1 }, { id: 'salt_bag', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'meat_stew', n: 2 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Томить в собственном жиру: банка стоит до весны.'
  });

  // — Рыба тушёная: с картошкой и луком.
  R({
    id: 'fish_stew', name: 'Рыба тушёная', cat: 'cook', station: 'stove', time: 13,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'potato', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'fish_stew', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Рыбу под овощи, воды — на палец: тушить под крышкой.'
  });

  // — Пельмени варёные: из мороза в кипяток.
  R({
    id: 'pelmeni_boil', name: 'Пельмени отварить', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'pelmeni', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'pelmeni_boiled', n: 3 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'В кипяток, помешать, вынуть всплывшие.'
  });

  // — Котлеты: рубленое мясо с хлебом и луком.
  R({
    id: 'kotlety', name: 'Котлеты', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'meat_raw', n: 2 }, { id: 'bread', n: 1 }, { id: 'onion', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'kotlety', n: 3 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Мясо сечь с луком, хлеб — для нежности.'
  });

  // — Заячьи котлеты: дичь со шпигом.
  R({
    id: 'kotlety_hare', name: 'Заячьи котлеты', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'meat_raw', n: 2 }, { id: 'lard_piece', n: 1 }, { id: 'onion', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'chops_hare', n: 3 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Без шпига заяц сухой — сало решает.'
  });

  // — Рыбные котлеты: из печёной рыбы.
  R({
    id: 'kotlety_fish', name: 'Рыбные котлеты', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'cooked_fish', n: 2 }, { id: 'bread', n: 1 }, { id: 'egg', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'kotlety_fish', n: 3 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Кости вынуть, фарш отбить о доску.'
  });

  // — Куриные котлеты: фарш с яйцом и хлебом.
  R({
    id: 'kotlety_chicken', name: 'Куриные котлеты', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'chicken', n: 1 }, { id: 'bread', n: 1 }, { id: 'egg', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'kotlety_chicken', n: 3 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Курицу сечь, хлеб — в молоке... в нашем деле — в воде.'
  });

  // — Потроха тушёные: с картошкой и луком.
  R({
    id: 'giblets_stew', name: 'Потроха тушёные', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'giblets', n: 1 }, { id: 'potato', n: 1 }, { id: 'onion', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'giblets_stew', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Сердце и печёнку — первыми, пупки — дольше.'
  });

  // — Медвежья лапа заливная: царский деликатес.
  R({
    id: 'bear_paw', name: 'Медвежья лапа заливная', cat: 'cook', station: 'stove', time: 40,
    req: [{ id: 'meat_raw', n: 4 }, { id: 'bone_old', n: 2 }, { id: 'carrot', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: ['pot_cast'],
    out: [{ id: 'bear_paw_jellied', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 5 },
    desc: 'Томить до кости: сила медвежья перейдёт в желе.'
  });

  // — Заяц жареный: в сале, до корочки.
  R({
    id: 'roasted_hare', name: 'Заяц жареный', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'meat_raw', n: 2 }, { id: 'lard_piece', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'roasted_hare', n: 2 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Сало растопить, дичь — в чугунок.'
  });

  // — Драники: тёртая картошка с яйцом.
  R({
    id: 'draniki', name: 'Драники', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'potato', n: 3 }, { id: 'egg', n: 1 }, { id: 'onion', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'draniki', n: 3 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Тереть картошку до сока, жарить горкой.'
  });

  // — Рыба жареная: в муке, на сале.
  R({
    id: 'fish_fried', name: 'Рыба жареная', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'flour_bag', n: 1 }, { id: 'fat', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'fish_fried', n: 2 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Обвалять в муке — корочка сама придёт.'
  });

  // — Рыба копчёная: над дровяным дымом.
  R({
    id: 'fish_smoke', name: 'Рыба коптить', cat: 'cook', station: 'fire', time: 35,
    req: [{ id: 'fresh_fish', n: 2 }, { id: 'firewood_bundle', n: 1 }],
    tools: [],
    out: [{ id: 'fish_smoked', n: 2 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Дым — ольховый, терпение — долгое.'
  });

  // — Мясо копчёное: ломтями над углями.
  R({
    id: 'meat_smoke', name: 'Мясо коптить', cat: 'cook', station: 'fire', time: 35,
    req: [{ id: 'meat_raw', n: 2 }, { id: 'firewood_bundle', n: 1 }],
    tools: [],
    out: [{ id: 'meat_smoked', n: 2 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Холодный дым хранит мясо лучше соли.'
  });

  // — Грибы жареные: со луком, в сале.
  R({
    id: 'mushrooms_fry', name: 'Грибы жареные', cat: 'cook', station: 'fire', time: 8,
    req: [{ id: 'frozen_mushroom', n: 3 }, { id: 'fat', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'mushrooms_fried', n: 2 }],
    skill: null,
    desc: 'Оттаять на сковороде — вода уйдёт, вкус останется.'
  });

  // — Картошка с грибами: в чугунке, под крышкой.
  R({
    id: 'mushroom_potato', name: 'Картошка с грибами', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'frozen_mushroom', n: 2 }, { id: 'potato', n: 2 }, { id: 'onion', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'mushroom_potato', n: 2 }],
    skill: null,
    desc: 'Слоями: картошка, грибы, лук — и в печь.'
  });

  // — Картошка с салом: с солёной отбеленкой.
  R({
    id: 'potato_salo', name: 'Картошка с салом', cat: 'cook', station: 'fire', time: 10,
    req: [{ id: 'potato', n: 2 }, { id: 'salo_salted', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'potato_salo', n: 2 }],
    skill: null,
    desc: 'Сало топится, картошка румянится.'
  });

  // ====================================================================
  //  §5. ВЫПЕЧКА (нужна печь!)
  //  Хлеб, блины, пироги. Тесто простое (мука+вода) и сдобное (яйцо+молоко).
  // ====================================================================

  // — Сдобное тесто: на яйце и молоке.
  R({
    id: 'dough_rich', name: 'Сдобное тесто', cat: 'cook', station: null, time: 5,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'egg', n: 1 }, { id: 'milk_bottle', n: 1 }],
    tools: [],
    out: [{ id: 'dough_rich', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Вымесить до гладкости: блинам и оладьям основа.'
  });

  // — Ржаной хлеб: две буханки из мешка муки.
  R({
    id: 'bread_rye', name: 'Ржаной хлеб', cat: 'cook', station: 'stove', time: 20,
    req: [{ id: 'flour_bag', n: 2 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'bread_rye_black', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'На закваске, в горячей печи: корка потрескается — хорошо.'
  });

  // — Белый хлеб: пшеничная коврига.
  R({
    id: 'bread_white', name: 'Белый хлеб', cat: 'cook', station: 'stove', time: 20,
    req: [{ id: 'flour_bag', n: 2 }, { id: 'milk_bottle', n: 1 }, { id: 'egg', n: 1 }],
    tools: [],
    out: [{ id: 'bread_white', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Мягкий мякиш: к чаю и к празднику.'
  });

  // — Каравай: праздничный хлеб.
  R({
    id: 'karavay', name: 'Каравай', cat: 'cook', station: 'stove', time: 25,
    req: [{ id: 'flour_bag', n: 2 }, { id: 'egg', n: 2 }, { id: 'milk_bottle', n: 1 }, { id: 'butter_wheel', n: 1 }],
    tools: [],
    out: [{ id: 'karavay', n: 2 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 5 },
    desc: 'Высокий, круглый, с косой по боку: свадебное дело.'
  });

  // — Блины: тонкие, на молоке.
  R({
    id: 'blini', name: 'Блины', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'milk_bottle', n: 1 }, { id: 'egg', n: 2 }],
    tools: ['cast_iron'],
    out: [{ id: 'blini', n: 4 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Тесто жидкое, сковорода — раскалённая: первый блин комом.'
  });

  // — Блины гречневые: кислая закваска.
  R({
    id: 'blini_grech', name: 'Блины гречневые', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'buckwheat', n: 1 }, { id: 'milk_bottle', n: 1 }, { id: 'egg', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'blini_buckwheat', n: 4 }, { id: 'bottle_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Из гречневой крупы: темнее и душистее.'
  });

  // — Оладьи: пухлые, из сдобы.
  R({
    id: 'oladji', name: 'Оладьи', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'dough_rich', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'oladji', n: 4 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Ложку теста на сковороду — и не тревожить до румянца.'
  });

  // — Пирожки с мясом: печёные, с луком.
  R({
    id: 'pirozhki_meat', name: 'Пирожки с мясом', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'dough', n: 1 }, { id: 'meat_cooked', n: 1 }, { id: 'onion', n: 1 }],
    tools: [],
    out: [{ id: 'pirozhki', n: 4 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Лепить да защипывать: начинка — жареное мясо с луком.'
  });

  // — Пирожки с рыбой: поморский карман.
  R({
    id: 'pirozhki_fish', name: 'Пирожки с рыбой', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'dough', n: 1 }, { id: 'cooked_fish', n: 2 }, { id: 'onion', n: 1 }],
    tools: [],
    out: [{ id: 'pirozhki_fish', n: 4 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Рыбу размять, лук — в начинку.'
  });

  // — Пирожки с капустой: постные.
  R({
    id: 'pirozhki_cabbage', name: 'Пирожки с капустой', cat: 'cook', station: 'stove', time: 13,
    req: [{ id: 'dough', n: 1 }, { id: 'cabbage', n: 1 }, { id: 'onion', n: 1 }],
    tools: [],
    out: [{ id: 'pirozhki_cabbage', n: 4 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Капусту потушить, тесто — тонко, защип — крепко.'
  });

  // — Пирожки с грибами: из сушёных, душистых.
  R({
    id: 'pirozhki_mushroom', name: 'Пирожки с грибами', cat: 'cook', station: 'stove', time: 13,
    req: [{ id: 'dough', n: 1 }, { id: 'dried_mushrooms', n: 2 }, { id: 'onion', n: 1 }],
    tools: [],
    out: [{ id: 'pirozhki_mushroom', n: 4 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Грибы замочить, порубить с луком.'
  });

  // — Пирог с капустой: большой, семейный.
  R({
    id: 'pirog_cabbage', name: 'Пирог с капустой', cat: 'cook', station: 'stove', time: 18,
    req: [{ id: 'dough', n: 2 }, { id: 'cabbage', n: 2 }, { id: 'egg', n: 1 }],
    tools: [],
    out: [{ id: 'pirog_cabbage', n: 2 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'На противень, швом вниз: режь на всю семью.'
  });

  // — Рыбник: пирог с целой рыбой.
  R({
    id: 'pirog_fish', name: 'Рыбник (большой)', cat: 'cook', station: 'stove', time: 18,
    req: [{ id: 'dough', n: 2 }, { id: 'fresh_fish', n: 3 }, { id: 'onion', n: 1 }],
    tools: [],
    out: [{ id: 'pirog_fish', n: 2 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Рыба целиком в тесте: северное богатство.'
  });

  // — Шаньги: сибирские ватрушки с картошкой.
  R({
    id: 'shangi', name: 'Шаньги', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'dough', n: 1 }, { id: 'potato', n: 1 }, { id: 'butter_wheel', n: 1 }],
    tools: [],
    out: [{ id: 'shangi', n: 3 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Сверху — картошка с маслом: зауральское солнце.'
  });

  // — Растягаи: открытые лодочки с рыбой.
  R({
    id: 'rasskezhi', name: 'Растягаи', cat: 'cook', station: 'stove', time: 14,
    req: [{ id: 'dough', n: 1 }, { id: 'fresh_fish', n: 2 }, { id: 'onion', n: 1 }],
    tools: [],
    out: [{ id: 'rasskezhi', n: 3 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Тесто растянуть, рыбу — в открытый верх.'
  });

  // — Пряник мятный: печатный, на меду.
  R({
    id: 'pryanik_mint', name: 'Пряник мятный', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'honey_jar', n: 1 }, { id: 'sugar_loaf', n: 1 }],
    tools: [],
    out: [{ id: 'pryanik', n: 4 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Мяту — по праздникам, мёд — всегда.'
  });

  // — Сухари армейские: из пшеничного хлеба.
  R({
    id: 'suhari', name: 'Сухари (пшеничные)', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'bread', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'suhari', n: 4 }],
    skill: null,
    desc: 'Нарезать ломтями и высушить в остывающей печи.'
  });

  // — Сухари из ржаного: чёрные, звенящие.
  R({
    id: 'suhari_rye', name: 'Сухари (ржаные)', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'bread_rye_black', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'suhari', n: 5 }],
    skill: null,
    desc: 'Ржаной сухарь тверже — зато сытнее.'
  });

  // — Сухари из белого: господские.
  R({
    id: 'suhari_white', name: 'Сухари (белые)', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'bread_white', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'suhari', n: 5 }],
    skill: null,
    desc: 'Белый хлеб — в дорогу сухарём.'
  });

  // — Ятка ягодная: открытый пирог с брусникой.
  R({
    id: 'tart_berries', name: 'Ятка ягодная', cat: 'cook', station: 'stove', time: 15,
    req: [{ id: 'dough_rich', n: 1 }, { id: 'cranberries_jar', n: 1 }, { id: 'sugar_loaf', n: 1 }],
    tools: [],
    out: [{ id: 'tart_berries', n: 2 }, { id: 'jar_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Ягоду — в лунку теста, сахар — сверху.'
  });

  // — Мастерская кулебяка: на все случаи.
  R({
    id: 'kulebyaka_master', name: 'Кулебяка мастерская', cat: 'cook', station: 'stove', time: 20,
    req: [{ id: 'dough', n: 2 }, { id: 'meat_cooked', n: 2 }, { id: 'kasha_buckwheat', n: 1 }, { id: 'egg', n: 1 }],
    tools: [],
    out: [{ id: 'kulebyaka', n: 3 }],
    skill: { id: 'cook', lv: 4 },
    desc: 'Мясо, каша и яйцо слоями: пирог-хамелеон.'
  });

  // — Ватрушка: с творогом.
  R({
    id: 'vatrushka', name: 'Ватрушки', cat: 'cook', station: 'stove', time: 13,
    req: [{ id: 'dough', n: 1 }, { id: 'tvorog', n: 1 }, { id: 'egg', n: 1 }],
    tools: [],
    out: [{ id: 'vatrushka', n: 3 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Лепёшка с творожной серёдкой.'
  });

  // ====================================================================
  //  §6. ЗАГОТОВКИ
  //  Соль, дым, мороз. Станция не нужна — нужны руки и кадка.
  // ====================================================================

  // — Грибы маринованные: в банке, с рассолом.
  R({
    id: 'mushrooms_pickle', name: 'Грибы мариновать', cat: 'cook', station: null, time: 20,
    req: [{ id: 'frozen_mushroom', n: 3 }, { id: 'salt_bag', n: 1 }, { id: 'jar_empty', n: 1 }],
    tools: [],
    out: [{ id: 'mushrooms_pickled', n: 3 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Отварить, залить крепким рассолом: до Пасхи достоят.'
  });

  // — Грибы солёные: горячий засол.
  R({
    id: 'mushrooms_salt', name: 'Грибы солить', cat: 'cook', station: null, time: 20,
    req: [{ id: 'frozen_mushroom', n: 3 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'mushrooms_salted', n: 3 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Солом да грузди: под гнёт.'
  });

  // — Кадка квашенины: полная.
  R({
    id: 'cabbage_sauer_full', name: 'Кадка квашенины', cat: 'cook', station: null, time: 30,
    req: [{ id: 'cabbage', n: 3 }, { id: 'carrot', n: 1 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'cabbage_sauer_full', n: 4 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Шинковать, мять с солью до сока: ждать три дня.'
  });

  // — Юкола: рыба вялится целиком.
  R({
    id: 'fish_hang_dry', name: 'Юкола (вялить)', cat: 'cook', station: 'fire', time: 35,
    req: [{ id: 'fresh_fish', n: 2 }],
    tools: [],
    out: [{ id: 'fish_dried_hang', n: 2 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Распластать и развесить у костра: ветер и дым сделают своё.'
  });

  // — Мясо вяленое: полосы с солью.
  R({
    id: 'meat_jerky', name: 'Мясо вялить', cat: 'cook', station: 'fire', time: 30,
    req: [{ id: 'meat_raw', n: 2 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'meat_jerky', n: 2 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Тонко, посолить, повесить над углями.'
  });

  // — Сало солёное: шмат в соли.
  R({
    id: 'salo_salt', name: 'Сало солить', cat: 'cook', station: null, time: 12,
    req: [{ id: 'fat', n: 2 }, { id: 'salt_bag', n: 1 }],
    tools: [],
    out: [{ id: 'salo_salted', n: 3 }],
    skill: null,
    desc: 'Обвалять в соли, придавить: неделя — и готово.'
  });

  // — Винегрет: свёкла, картошка, огурец.
  R({
    id: 'vinegret', name: 'Винегрет', cat: 'cook', station: null, time: 5,
    req: [{ id: 'beet_baked', n: 1 }, { id: 'potato_boiled', n: 1 }, { id: 'pickles', n: 1 }],
    tools: ['knife'],
    out: [{ id: 'vinegret', n: 2 }],
    skill: null,
    desc: 'Всё кубиком, свёкла — последней, иначе выкрасит.'
  });

  // ====================================================================
  //  §7. НАПИТКИ
  //  Морс, кисель, компот, чаи и сбитень. Вода уходит из фляги.
  // ====================================================================

  // — Морс из банки: брусника, сахар, вода.
  R({
    id: 'mors_jar', name: 'Морс (из банки)', cat: 'cook', station: 'stove', time: 9,
    req: [{ id: 'cranberries_jar', n: 1 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'berries_mors', n: 3 }, { id: 'jar_empty', n: 1 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Ягоду размять, отжать, жмых — в кипяток.'
  });

  // — Морс из мороженых ягод: лесная версия.
  R({
    id: 'mors_fresh', name: 'Морс (из ягод)', cat: 'cook', station: 'fire', time: 9,
    req: [{ id: 'frozen_berries', n: 2 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'berries_mors', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Мороженая ягода отдаёт всё сытно и кисло.'
  });

  // — Кисель ягодный: с мукой для густоты.
  R({
    id: 'kissel_berry', name: 'Кисель ягодный', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'frozen_berries', n: 2 }, { id: 'flour_bag', n: 1 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'kissel', n: 3 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Муку развести холодной — потом в кипяток: без комков.'
  });

  // — Кисель из сухофруктов: осенний.
  R({
    id: 'kissel_dried', name: 'Кисель из сухофруктов', cat: 'cook', station: 'stove', time: 10,
    req: [{ id: 'apple_dried', n: 2 }, { id: 'flour_bag', n: 1 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'kissel', n: 3 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Отвар густой, с кислой ноткой.'
  });

  // — Кисель овсяный: напиток-еда.
  R({
    id: 'kissel_oat', name: 'Кисель овсяный', cat: 'cook', station: 'stove', time: 25,
    req: [{ id: 'oat_flakes', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'kissel_oat', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Овёс закисает сам — остаётся процедить.'
  });

  // — Компот ассорти: сухофрукты с ягодой.
  R({
    id: 'compote_dried', name: 'Компот ассорти', cat: 'cook', station: 'stove', time: 9,
    req: [{ id: 'apple_dried', n: 2 }, { id: 'frozen_berries', n: 1 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'compote_dried', n: 3 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Сухофрукты и ягода в сахаре: три стакана лета.'
  });

  // — Копорский чай: иван-чай.
  R({
    id: 'tea_ivan', name: 'Копорский чай', cat: 'cook', station: 'fire', time: 6,
    req: [{ id: 'ivan_grass', n: 2 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'tea_ivan', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Лист кипрея: русский самоварный напиток.'
  });

  // — Чага заваренная: берёзовый гриб.
  R({
    id: 'tea_chaga_brew', name: 'Чага (заварить)', cat: 'cook', station: 'fire', time: 6,
    req: [{ id: 'birch_chaga', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'tea_chaga_brew', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Настой чаги: тёмный, как северная ночь.'
  });

  // — Хвойный чай: с сахаром, против цинги.
  R({
    id: 'tea_pine', name: 'Хвойный чай', cat: 'cook', station: 'stove', time: 6,
    req: [{ id: 'fir_needles', n: 2 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'tea_pine', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: null,
    desc: 'Иглы да сахар: горькое лекарство.'
  });

  // — Сбитень: горячий мёд.
  R({
    id: 'sbiten', name: 'Сбитень', cat: 'cook', station: 'stove', time: 8,
    req: [{ id: 'honey_jar', n: 1 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'sbiten', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Мёд с кипятком «сбивают» до пены: пить обжигающим.'
  });

  // — Ягодный квас: на дрожжах хлебной корки.
  R({
    id: 'kvas_berry', name: 'Квас ягодный', cat: 'cook', station: 'stove', time: 18,
    req: [{ id: 'frozen_berries', n: 2 }, { id: 'bread', n: 1 }, { id: 'sugar_loaf', n: 1 }, { id: 'water_flask', n: 1 }],
    tools: [],
    out: [{ id: 'kvass_flask', n: 2 }, { id: 'flask_empty', n: 1 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Корка да ягода бродят в тепле: к вечеру шипит.'
  });

  // ====================================================================
  //  §8. МОЛОЧНАЯ КУХНЯ
  //  Цепочка: молоко -> творог -> сметана -> масло.
  // ====================================================================

  // — Творог: из скисшего молока.
  R({
    id: 'tvorog', name: 'Творог', cat: 'cook', station: 'stove', time: 20,
    req: [{ id: 'milk_bottle', n: 2 }],
    tools: [],
    out: [{ id: 'tvorog', n: 2 }, { id: 'bottle_empty', n: 2 }],
    skill: null,
    desc: 'Простокваша сама створожится — отжать через тряпицу.'
  });

  // — Сметана: отстоявшийся верх.
  R({
    id: 'smetana', name: 'Сметана', cat: 'cook', station: null, time: 40,
    req: [{ id: 'milk_bottle', n: 2 }],
    tools: [],
    out: [{ id: 'smetana', n: 1 }, { id: 'bottle_empty', n: 2 }],
    skill: null,
    desc: 'Верх снять, дать подкиснуть в тепле.'
  });

  // — Масло: сбить из сметаны.
  R({
    id: 'butter_churn', name: 'Масло сбить', cat: 'cook', station: null, time: 15,
    req: [{ id: 'smetana', n: 2 }],
    tools: [],
    out: [{ id: 'butter_wheel', n: 1 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Взбивать до крупы: масло всплывёт.'
  });

  // — Топлёное молоко: томлёное в печи.
  R({
    id: 'milk_bake', name: 'Топлёное молоко', cat: 'cook', station: 'stove', time: 30,
    req: [{ id: 'milk_bottle', n: 2 }],
    tools: [],
    out: [{ id: 'milk_baked', n: 1 }, { id: 'bottle_empty', n: 2 }],
    skill: null,
    desc: 'Глиняный горшок в остывающую печь — до коричневой пенки.'
  });

  // — Сырники: творог, яйцо, мука.
  R({
    id: 'syrniki', name: 'Сырники', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'tvorog', n: 2 }, { id: 'egg', n: 1 }, { id: 'flour_bag', n: 1 }],
    tools: ['cast_iron'],
    out: [{ id: 'syrniki', n: 4 }],
    skill: { id: 'cook', lv: 2 },
    desc: 'Лепёшки обвалять в муке: жарить на масле.'
  });

  // ====================================================================
  //  §9. ДЕСЕРТ И ПРАЗДНИЧНОЕ
  //  skill cook 5+: у купцов и в большие праздники.
  // ====================================================================

  // — Медовый пряник: на чистом мёду.
  R({
    id: 'pryanik_honey', name: 'Медовый пряник', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'honey_jar', n: 1 }],
    tools: [],
    out: [{ id: 'pryanik_honey', n: 4 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Мёд вместо сахара: пряник выходит влажным.'
  });

  // — Медовый пряник (старописьменный вариант имени).
  R({
    id: 'prianik_honey', name: 'Пряник медовый', cat: 'cook', station: 'stove', time: 12,
    req: [{ id: 'flour_bag', n: 1 }, { id: 'honey_jar', n: 1 }],
    tools: [],
    out: [{ id: 'prianik_honey', n: 4 }],
    skill: { id: 'cook', lv: 1 },
    desc: 'Тот же рецепт — пишут и так, и этак.'
  });

  // — Медовик: купеческий торт.
  R({
    id: 'medovik', name: 'Медовик', cat: 'cook', station: 'stove', time: 30,
    req: [{ id: 'flour_bag', n: 2 }, { id: 'honey_jar', n: 1 }, { id: 'egg', n: 2 }, { id: 'butter_wheel', n: 1 }],
    tools: [],
    out: [{ id: 'medovik', n: 4 }],
    skill: { id: 'cook', lv: 5 },
    desc: 'Восемь коржей промазать сметаной: гостей — на пороге.'
  });

  // — Пасха творожная: праздничная заглушка.
  R({
    id: 'pascha', name: 'Пасха творожная', cat: 'cook', station: null, time: 15,
    req: [{ id: 'tvorog', n: 2 }, { id: 'butter_wheel', n: 1 }, { id: 'honey_jar', n: 1 }],
    tools: [],
    out: [{ id: 'pascha', n: 2 }],
    skill: { id: 'cook', lv: 3 },
    desc: 'Творог с маслом и мёдом: в форму и под гнёт.'
  });

  // ====================================================================
  //  ЛОКАЛИЗАЦИЯ (паттерн items_cloth.js: без перезаписи чужих ключей)
  // ====================================================================

  function applyRu() {
    try {
      WS.Data = WS.Data || {};
      WS.Data.locales = WS.Data.locales || {};
      var ru = WS.Data.locales.ru = WS.Data.locales.ru || {};
      for (var k in RU) {
        if (RU.hasOwnProperty(k) && !ru[k]) ru[k] = RU[k];
      }
    } catch (e) {
      WS.err('recipes_cook: локализация не влита', e && e.message);
    }
  }

  // ====================================================================
  //  САМОПРОВЕРКА: уникальность id, валидность полей.
  // ====================================================================

  function selfTest() {
    var problems = [];
    var i, k;
    for (i = 0; i < recipes.length; i++) {
      var r = recipes[i];
      if (r.cat !== 'cook') problems.push(r.id + ': cat != cook');
      if (r.station && r.station !== 'fire' && r.station !== 'stove') {
        problems.push(r.id + ': станция "' + r.station + '" не fire/stove');
      }
      if (!r.out.length) problems.push(r.id + ': нет выходов');
      if (!RU['recipe.' + r.id + '.name']) problems.push(r.id + ': нет имени в словаре');
      for (k = 0; k < r.req.length; k++) {
        if (!r.req[k].id || !(r.req[k].n >= 1)) problems.push(r.id + ': req[' + k + '] кривой');
      }
    }
    if (recipes.length < 100) problems.push('рецептов меньше 100: ' + recipes.length);
    if (problems.length) {
      WS.warn('recipes_cook self-test: ' + problems.length + ' проблем: ' + problems.join('; '));
    }
    return problems.length === 0;
  }

  // ====================================================================
  //  РЕГИСТРАЦИЯ
  //  Наш boot идёт ПОСЛЕ data/recipes.js (алфавит: recipes < recipes_cook):
  //  дополняем общий реестр, обновляем индекс, проверяем целостность.
  // ====================================================================

  WS.boot(function initRecipesCook() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    WS.Data.recipes = WS.Data.recipes || [];
    WS.Data.recipesById = WS.Data.recipesById || {};

    var added = 0;
    var dupes = 0;
    var broken = [];

    for (var i = 0; i < recipes.length; i++) {
      var r = recipes[i];
      if (WS.Data.recipesById[r.id]) {
        // не перекрываем рецепты базового recipes.js — только свои
        WS.warn('recipes_cook: рецепт "' + r.id + '" уже есть, пропущен');
        dupes++;
        continue;
      }
      WS.Data.recipes.push(r);
      WS.Data.recipesById[r.id] = r;
      added++;
    }

    // целостность: каждый id в рецепте должен существовать в предметах
    for (i = 0; i < recipes.length; i++) {
      var rr = recipes[i];
      var k, id;
      for (k = 0; k < rr.req.length; k++) {
        id = rr.req[k].id;
        if (!WS.Data.items[id]) broken.push(rr.id + ':req:' + id);
      }
      for (k = 0; k < rr.out.length; k++) {
        id = rr.out[k].id;
        if (!WS.Data.items[id]) broken.push(rr.id + ':out:' + id);
      }
      for (k = 0; k < rr.tools.length; k++) {
        id = rr.tools[k];
        if (!WS.Data.items[id]) broken.push(rr.id + ':tool:' + id);
      }
    }
    if (broken.length) {
      WS.warn('recipes_cook: неизвестные предметы — ' + broken.join(', '));
    }

    applyRu();
    if (WS.Ev && WS.Ev.on) {
      WS.Ev.on('game:start', applyRu);
      WS.Ev.on('game:load', applyRu);
    }
    if (WS.afterFirstFrame) WS.afterFirstFrame(applyRu);

    selfTest();

    WS.log('recipes_cook: ' + added + ' кулинарных рецептов зарегистрировано' +
      (dupes ? ' (дублей пропущено: ' + dupes + ')' : '') +
      (broken.length ? ' [ОШИБКИ ЦЕЛОСТНОСТИ: ' + broken.length + ']' : ''));
  }, 'data:recipes_cook');

  WS.def('DataRecipesCook', {
    recipes: recipes,
    locale: RU,
    selfTest: selfTest
  });
})();
