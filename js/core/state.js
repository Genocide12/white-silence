/**
 * Состояние игры WS.G и фабрика новой игры.
 * Структура WS.G (единственное мутируемое глобальное состояние партии):
 *
 * WS.G = {
 *   running, seed, ver,
 *   time: {day, min, totalMin, hourFired},
 *   player: {...} — см. newPlayer(),
 *   weather: {...} — владеет модуль weather
 *   stats: {...}   — статистика выживания
 *   story: {...}   — флаги сюжета, найденные записки
 *   worldDiff: {...} — изменения мира относительно сгенерированного (владение World)
 * }
 */
(function () {
  'use strict';

  /** Все навыки. */
  var SKILLS = [
    'axe', 'melee', 'firearm', 'sneak', 'run', 'cook', 'carpentry',
    'tailor', 'medic', 'forage', 'track', 'survive'
  ];

  function newSkills() {
    var s = {};
    for (var i = 0; i < SKILLS.length; i++) s[SKILLS[i]] = { lv: 0, xp: 0 };
    return s;
  }

  /** Новый персонаж. prof — профессия (см. data/professions.js). */
  function newPlayer(prof, traits) {
    var p = {
      kind: 'player',
      id: 'player',
      x: 0, y: 0,
      dir: 4,                     // 0=N..7=NW
      marker: true,               // белый эллипс под ногами — герой всегда виден
      hp: 100, maxHp: 100,
      speed: 2.2,                 // тайлов/с
      sprintMul: 1.8,
      sneaking: false,
      sleeping: false,
      // нужды 0..100 (100 = отлично)
      needs: {
        hunger: 70,       // еда (0 = смерть от голода)
        thirst: 70,
        fatigue: 80,      // бодрость
        sanity: 70,       // рассудок
        warmth: 70        // субъективное тепло (производная от температуры тела)
      },
      // температура тела: ядро 37°C
      temp: 37.0,
      // травмы и болезни
      bleed: 0,           // сила кровотечения 0..10
      fracture: false,    // перелом ноги
      frostbite: 0,       // тяжесть обморожения 0..100
      sick: null,         // {id, t} болезнь
      infection: 0,       // заражение ран 0..100
      pain: 0,            // боль 0..100
      drunk: 0,           // опьянение
      // инвентарь и экипировка
      inv: [],
      equip: { head: null, torso: null, legs: null, feet: null, hands: null, back: null, hand1: null, hand2: null },
      // опыт
      skills: newSkills(),
      prof: prof || 'telegraph',
      traits: traits || [],
      // прочее
      kills: {},
      reading: null,       // {itemId, progress}
      cookProgress: null,
      breath: 1.0          // дыхание после бега (выносливость)
    };
    return p;
  }

  function newGame(seed, prof, traits) {
    var G = {
      running: false,
      ver: WS.VERSION,
      seed: (seed >>> 0) || (Date.now() >>> 0),
      time: WS.Time.newGame(),
      player: newPlayer(prof, traits),
      weather: null,          // заполнит weather.js
      stats: {
        daysSurvived: 0,
        stepsWalked: 0,
        containersLooted: 0,
        itemsCrafted: 0,
        wolvesKilled: 0,
        bearsKilled: 0,
        banditsKilled: 0,
        animalsHunted: 0,
        fishCaught: 0,
        notesRead: 0,
        mealsCooked: 0,
        nightsSlept: 0,
        coldest: 0,
        closestCall: 0
      },
      story: {
        notes: [],            // id найденных записок
        radio: [],            // id услышанных передач
        flags: {},            // сюжетные флаги
        hints: {}             // показанные обучающие подсказки
      },
      worldDiff: null         // заполнит World.serialize
    };
    return G;
  }

  /** Краткая сводка смерти для экрана «Вот так вы погибли». */
  function deathSummary() {
    var g = WS.G;
    if (!g) return '';
    var s = g.stats;
    return {
      days: g.time.day,
      wolves: s.wolvesKilled,
      looted: s.containersLooted,
      crafted: s.itemsCrafted,
      notes: s.notesRead
    };
  }

  WS.def('State', {
    SKILLS: SKILLS,
    newPlayer: newPlayer,
    newGame: newGame,
    newSkills: newSkills,
    deathSummary: deathSummary
  });
})();
