/**
 * СИСТЕМА ЧТЕНИЯ: книги читаются постранично с прогрессом.
 * Чтение требует света (день или источник рядом) и времени.
 * Каждая страница — пауза мира, XP и рассудок.
 */
(function () {
  'use strict';

  var session = null;    // {book, page, t, perPage}
  var SPEED = 6;          // секунд реального на страницу

  function toast(text, kind) {
    if (WS.Ui && WS.Ui.toast) WS.Ui.toast(text, kind || 'info');
    else if (WS.Fx && WS.G) WS.Fx.text(text.slice(0, 50), WS.G.player.x, WS.G.player.y - 1, { life: 2 });
  }

  function hasLight() {
    // днём или рядом источник света/окно
    if (WS.Time && WS.Time.light() > 0.25) return true;
    var p = WS.G && WS.G.player;
    if (!p) return false;
    var lights = WS.World ? WS.World.lightsNear(p.x, p.y, 3) : [];
    return lights.length > 0;
  }

  /** Начать чтение книги из инвентаря. */
  function start(itemId) {
    var spec = WS.Data && WS.Data.items ? WS.Data.items[itemId] : null;
    if (!spec) return false;
    var b = spec.bookData || (WS.Library && WS.Library.byId ? WS.Library.byId(itemId) : null);
    if (!b) {
      // обычная записка/газета — короткое чтение
      quickRead(itemId);
      return true;
    }
    if (session) { toast('Вы уже читаете.', 'warn'); return false; }
    if (!hasLight()) {
      toast('Слишком темно для чтения. Нужен свет.', 'warn');
      return false;
    }
    session = { book: b, page: 0, t: 0, perPage: SPEED };
    toast('Вы раскрыли: «' + b.title + '»', 'info');
    WS.Snd.play('craft', { vol: 0.4 });
    return true;
  }

  /** Короткое чтение (записки, газеты, письма). */
  function quickRead(itemId) {
    WS.Ev.emit('item:read', { id: itemId });
    if (WS.G && WS.G.player) {
      WS.G.player.needs.sanity = Math.min(100, WS.G.player.needs.sanity + 1);
    }
    if (WS.G && WS.G.stats) {
      WS.G.stats.notesRead = (WS.G.stats.notesRead || 0) + 1;
    }
  }

  /** Тик чтения: прогресс страницы. */
  function update(dt) {
    if (!session) return;
    var p = WS.G && WS.G.player;
    if (!p) { session = null; return; }
    // прерывание: стало темно / урон / побежал
    if (!hasLight()) {
      toast('Стемнело. Вы закладываете страницу.', 'warn');
      session = null;
      return;
    }
    if (p.sleeping || (WS.Ui && WS.Ui.modal && WS.Ui.modal())) {
      // модал открыт — не прерываем, просто ждём
      return;
    }
    session.t += dt * (WS.Loop && WS.Loop.speed ? 1 : 1);
    if (session.t >= session.perPage) {
      session.t = 0;
      session.page++;
      var b = session.book;
      // эффекты страницы
      if (b.xp && WS.Skills && WS.Skills.addXp) WS.Skills.addXp(b.cat, Math.round(b.xp / b.pages));
      if (b.sanity) p.needs.sanity = Math.min(100, p.needs.sanity + Math.max(1, Math.round(b.sanity / b.pages)));
      if (b.pages_text && b.pages_text[session.page - 1]) {
        showPage(b, session.page - 1);
      }
      if (session.page >= b.pages) {
        finishBook(b);
      }
    }
  }

  /** Показать страницу (мини-модал). */
  var pageEl = null;
  var pageTimer = 0;

  function showPage(b, idx) {
    var root = document.getElementById('ui-root');
    if (!root) return;
    if (pageEl && pageEl.parentNode) return;   // уже открыто
    pageEl = document.createElement('div');
    pageEl.className = 'ws-page-read';
    var t = document.createElement('div');
    t.className = 'ws-page-title';
    t.textContent = b.title + ' — стр. ' + (idx + 1) + ' из ' + b.pages;
    var body = document.createElement('div');
    body.className = 'ws-page-text';
    body.textContent = b.pages_text ? (b.pages_text[idx] || '…') : '…';
    pageEl.appendChild(t);
    pageEl.appendChild(body);
    root.appendChild(pageEl);
    pageTimer = 5;
  }

  function pageTick(dt) {
    if (!pageEl) return;
    pageTimer -= dt;
    if (pageTimer <= 0) {
      if (pageEl.parentNode) pageEl.parentNode.removeChild(pageEl);
      pageEl = null;
    }
  }

  function finishBook(b) {
    session = null;
    toast('Книга дочитана: «' + b.title + '»', 'good');
    WS.Snd.play('levelup', { vol: 0.5 });
    if (WS.G && WS.G.story && WS.G.story.chronicle) {
      WS.G.story.chronicle.push({ day: WS.Time.day(), text: 'Дочитана книга: ' + b.title });
    }
    // книга навыка: перечитывание не даёт полного XP — пометим
    if (b.xp && WS.G) {
      if (!WS.G.story.booksRead) WS.G.story.booksRead = {};
      WS.G.story.booksRead[b.id] = true;
    }
  }

  /** Прервать чтение. */
  function stop() {
    if (session) {
      toast('Вы отложили книгу.', 'info');
      session = null;
    }
  }

  WS.boot(function initReading() {
    WS.tick(44, function readingTick(dt) {
      update(dt);
      pageTick(dt);
    }, 'reading:tick');
    // клавиша: любая движение прерывает чтение
    WS.tick(46, function () {
      if (!session) return;
      if (WS.Input && (WS.Input.down('up') || WS.Input.down('down') ||
          WS.Input.down('left') || WS.Input.down('right'))) {
        stop();
      }
    }, 'reading:break');
  }, 'reading:init');

  WS.def('Reading', {
    start: start,
    stop: stop,
    isReading: function () { return !!session; },
    progress: function () { return session ? session.page / session.book.pages : 0; },
    book: function () { return session ? session.book : null; }
  });
})();
