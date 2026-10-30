/**
 * ЦЕННОСТИ И РЕЛИКВИИ: коллекционные предметы с историей.
 * Находятся в конкретных местах, имеют лор и «музейную» ценность.
 * Соберите все — достижение «Хранитель».
 */
(function () {
  'use strict';

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'good');
  }

  // 24 реликвии: id, где лежит, текст
  var RELICS = [
    { id: 'relic_icon_kazan', name: 'Икона Казанской, киотная',
      place: 'Церковь, алтарь', w: 1.2, val: 50,
      lore: 'Серебряный оклад с царапиной от штыка — или от когтя. Год как год, а вера цела.' },
    { id: 'relic_bell_small', name: 'Колокол-благовест, ручной',
      place: 'Церковь, подсвечник', w: 0.8, val: 45,
      lore: 'Отлит вологодским мастером в 1889-м. Звон чистый, на целую версту.' },
    { id: 'relic_gospel', name: 'Евангелие в бархате',
      place: 'Церковь, аналой', w: 1.5, val: 60,
      lore: 'Среброзлатая оправа потемнела, но буквы ясны. Помечено: «вклад купца Балакирева».' },
    { id: 'relic_teapot_silver', name: 'Чайник серебряный, купеческий',
      place: 'Дача Балакиревых', w: 0.9, val: 40,
      lore: 'Герб на крышке забит гвоздём — кем-то поспешно и с чувством.' },
    { id: 'relic_watch_chain', name: 'Хронометр судовой',
      place: 'Вокзал, телеграфный стол', w: 0.2, val: 55,
      lore: 'Штурманский, с гравировкой «Св. Николай, 1903». Ход держит.' },
    { id: 'relic_telegraph_key', name: 'Ключ телеграфный, латунный',
      place: 'Вокзал, аппаратная', w: 0.7, val: 45,
      lore: 'Стёрт до блеска. Сколько слов прошло через эту пружину — не сосчитать.' },
    { id: 'relic_karavai_blessed', name: 'Просфора засохшая',
      place: 'Церковь, дарохранительница', w: 0.05, val: 20,
      lore: 'Высохла до каменного. Хранится в полотне, отданном кому-то на память.' },
    { id: 'relic_medal_stanislav', name: 'Орден Станислава 3-й степени',
      place: 'Околоток, шкаф', w: 0.03, val: 35,
      lore: 'С мечами и бантом. Владелец не успел их развязать.' },
    { id: 'relic_saber_cossack', name: 'Шашка казачья, клеймо Златоуста',
      place: 'Околоток, оружейная пирамида', w: 1.3, val: 50,
      lore: 'Заточена. Лезвие в смазке: хозяин собирался вернуться.' },
    { id: 'relic_map_hand', name: 'Карта губернии, рукописная',
      place: 'Школа, учительский стол', w: 0.15, val: 30,
      lore: 'Акварель, дороги и волости. На полях детской рукой: «а тут живут медведи».' },
    { id: 'relic_gramota', name: 'Грамота «За усердие»',
      place: 'Школа, шкаф', w: 0.1, val: 25,
      lore: 'Выдана мельнику Старцеву в 1912-м. Печать сорвана — но кем и зачем?' },
    { id: 'relic_samovar_tula', name: 'Самовар тульский, фигурный',
      place: 'Трактир, стойка', w: 3.2, val: 40,
      lore: 'Формой — юбилейный. Краник с секретом, который знал один мастер.' },
    { id: 'relic_harmon_chromka', name: 'Гармонь хромка, перламутр',
      place: 'Трактир, подмостки', w: 1.4, val: 35,
      lore: 'Ряд комочков на мехах от мороза — лечится у печи. Голос — сибирский, широковатый.' },
    { id: 'relic_axe_branded', name: 'Топор с клеймом артели',
      place: 'Пилорама, верстак', w: 2.3, val: 30,
      lore: 'Клеймо «Артель Ветлугина, 1915». Таких в губернии три: этот — лучший.' },
    { id: 'relic_saw_frame', name: 'Лучковая пила краснодеревная',
      place: 'Пилорама, стеллаж', w: 1.8, val: 28,
      lore: 'Зуб мелкий, для чистой работы. Кто держал — тот и умер мастером.' },
    { id: 'relic_ledger', name: 'Книга торговая, конторская',
      place: 'Лавка, прилавок', w: 1.1, val: 25,
      lore: 'Долги и доверенности последнего квартала. Кто должен — уже никому.' },
    { id: 'relic_scales', name: 'Весы аптечные, разновесы',
      place: 'Фельдшерский пункт', w: 1.0, val: 35,
      lore: 'Точность до грана. Апптекарская честность в жестяном футляре.' },
    { id: 'relic_sygnum', name: 'Печать волостная',
      place: 'Волостное правление', w: 0.3, val: 30,
      lore: 'С двумя орлами. Теперь ни один. Но печать осталась печатью.' },
    { id: 'relic_camera', name: 'Фотокамера-туристская',
      place: 'Дача, чердак', w: 2.0, val: 45,
      lore: 'С тремя кассетами. Плёнки засвечены, затвор лязгает бодро.' },
    { id: 'relic_kerchief_scarce', name: 'Платок с диагональю',
      place: 'Дача, комод', w: 0.12, val: 20,
      lore: 'Из тех, что дарят раз в жизни. Пахнет чужим счастьем и нафталином.' },
    { id: 'relic_kamya', name: 'Камея морская',
      place: 'Лавка, тайник под полом', w: 0.04, val: 55,
      lore: 'Профиль женщины, резец не наш, северный. Кто увёз её сюда — загадка губернии.' },
    { id: 'relic_compass_legasy', name: 'Компас лоцманский',
      place: 'Пристань, конторка', w: 0.1, val: 40,
      lore: 'Стрелка на север стоит как вкопанная. Севера тут хватит на всех.' },
    { id: 'relic_ring_wedding', name: 'Кольцо обручальное, тройное',
      place: 'Изба, сундук', w: 0.01, val: 30,
      lore: 'Три металла, три обета. Внутри гравировка: «И. и М., до весны».' },
    { id: 'relic_spinning', name: 'Прялка резная',
      place: 'Изба зажиточная', w: 4.0, val: 30,
      lore: 'Лопасть с солнцем и конём. Веретено отсутствует — может, и к лучшему.' }
  ];

  // ================================================================ РЕГИСТРАЦИЯ ПРЕДМЕТОВ
  function defItems() {
    WS.Data = WS.Data || {};
    WS.Data.items = WS.Data.items || {};
    WS.Data.locales = WS.Data.locales || {};
    WS.Data.locales.ru = WS.Data.locales.ru || {};
    for (var i = 0; i < RELICS.length; i++) {
      var r = RELICS[i];
      if (!WS.Data.items[r.id]) {
        WS.Data.items[r.id] = {
          id: r.id, cat: 'misc', w: r.w, stack: 1,
          relic: true, val: r.val, sanity: 3,
          tags: ['relic', 'bandit_valuable']
        };
      }
      WS.Data.locales.ru['item.' + r.id + '.name'] = r.name;
      WS.Data.locales.ru['item.' + r.id + '.desc'] = r.lore + ' (' + r.place + ')';
    }
  }

  // ================================================================ ЧТЕНИЕ РЕЛИКВИИ
  function read(itemId) {
    for (var i = 0; i < RELICS.length; i++) {
      if (RELICS[i].id === itemId) {
        var r = RELICS[i];
        var text = r.name + '\n\n' + r.lore + '\n\n' + r.place;
        if (WS.Ui && WS.Ui.confirm) {
          WS.Ui.confirm('Реликвия\n\n' + text, function () {});
        } else if (WS.Fx && WS.G) {
          WS.Fx.text(r.name, WS.G.player.x, WS.G.player.y - 1, { life: 2.5 });
        }
        if (WS.G && WS.G.player) {
          WS.G.player.needs.sanity = Math.min(100, WS.G.player.needs.sanity + 3);
        }
        if (WS.G && WS.G.story) {
          if (!WS.G.story.relics) WS.G.story.relics = {};
          if (!WS.G.story.relics[itemId]) {
            WS.G.story.relics[itemId] = true;
            var count = 0;
            for (var k in WS.G.story.relics) count++;
            toast('Реликвия найдена (' + count + '/' + RELICS.length + '): ' + r.name, 'good');
            WS.Snd.play('bell', { vol: 0.3 });
          }
        }
        return r;
      }
    }
    return null;
  }

  // ================================================================ ПОДКЛЮЧЕНИЕ К ЛУТУ
  /** Добавить реликвии в соответствующие таблицы лута (по полю place). */
  function injectToLoot() {
    WS.Data = WS.Data || {};
    WS.Data.loot = WS.Data.loot || {};
    var map = {
      'Церковь, алтарь': { t: 'church_altar', w: 6 },
      'Церковь, подсвечник': { t: 'church_candle', w: 5 },
      'Церковь, аналой': { t: 'church_altar', w: 4 },
      'Церковь, дарохранительница': { t: 'church_altar', w: 3 },
      'Дача Балакиревых': { t: 'dacha_chest', w: 6 },
      'Дача, чердак': { t: 'dacha_chest', w: 5 },
      'Дача, комод': { t: 'dacha_chest', w: 4 },
      'Вокзал, телеграфный стол': { t: 'telegraph_desk', w: 6 },
      'Вокзал, аппаратная': { t: 'telegraph_desk', w: 5 },
      'Околоток, шкаф': { t: 'jail_locker', w: 5 },
      'Околоток, оружейная пирамида': { t: 'jail_locker', w: 4 },
      'Школа, учительский стол': { t: 'school_desk', w: 6 },
      'Школа, шкаф': { t: 'school_shelf', w: 5 },
      'Трактир, стойка': { t: 'tavern_bar', w: 5 },
      'Трактир, подмостки': { t: 'tavern_table', w: 4 },
      'Пилорама, верстак': { t: 'sawmill_workbench', w: 6 },
      'Пилорама, стеллаж': { t: 'sawmill_workbench', w: 4 },
      'Лавка, прилавок': { t: 'store_counter', w: 5 },
      'Лавка, тайник под полом': { t: 'store_storage', w: 6 },
      'Фельдшерский пункт': { t: 'doctor_cabinet', w: 5 },
      'Волостное правление': { t: 'jail_locker', w: 4 },
      'Пристань, конторка': { t: 'boat_supply', w: 5 },
      'Изба, сундук': { t: 'bedroom_chest', w: 3 },
      'Изба зажиточная': { t: 'bedroom_chest', w: 4 }
    };
    for (var i = 0; i < RELICS.length; i++) {
      var r = RELICS[i];
      var m = map[r.place];
      if (!m) continue;
      var table = WS.Data.loot[m.t];
      if (!table) continue;
      // не дублировать
      var has = false;
      for (var k = 0; k < table.items.length; k++) {
        if (table.items[k].id === r.id) { has = true; break; }
      }
      if (!has) {
        table.items.push({ id: r.id, w: m.w, min: 1, max: 1 });
      }
    }
  }

  // ================================================================ СТАТИСТИКА
  function found() {
    if (!WS.G || !WS.G.story || !WS.G.story.relics) return 0;
    var n = 0;
    for (var k in WS.G.story.relics) n++;
    return n;
  }

  WS.boot(function initRelics() {
    defItems();
    injectToLoot();
    // чтение при использовании
    WS.Ev.on('item:read', function (d) {
      if (d && d.id && /relic/.test(d.id)) read(d.id);
    });
  }, 'relics:init');

  WS.def('Relics', {
    all: RELICS,
    read: read,
    found: found,
    total: RELICS.length
  });
})();
