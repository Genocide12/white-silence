/**
 * crazy_intro.js — ИНТРО-ЗАСТАВКА «БЕЗУМНОГО ДЕДА» (переделка ЭТАПА 14).
 *
 * Проблема «хуй пойми что получилось»: до сих пор первые 10 секунд
 * партии игрок получал три противоречащих сообщения (тарелка, пароход,
 * «наденьте тёплое»). Теперь ровно один экран отвечает на три вопроса
 * до первого шага: КТО ты, ЧТО делать и ЧТО будет через 60 дней.
 *
 * Экран показывается ОДИН раз на партию (флаг WS.G.story.flags.intro_done)
 * при событии 'game:start', если активен дед-режим (WS.G.crazy).
 * Немодальный по духу, но блокирует ввод до кнопки — интро читают,
 * а не играют сквозь него. ESC/Enter/Space — «Гулять!».
 * Связи: WS.Ev, WS.Snd. Стили — crazy_intro.css.
 */
(function () {
  'use strict';

  var shown = false;
  var root = null;

  /** Текст интро: 5 строк — кто, топливо, бой, прокачка, финал. */
  var LINES = [
    { ico: '🧓', txt: 'Ты — дед-грибник. Живёшь один в занесённом снегом посёлке, ' +
      'и давно видишь то, чего нет: звери вокруг — мультяшки.' },
    { ico: '🍄', txt: 'ГРИБЫ — твоё топливо (не только лекарство). Съел гриб — ' +
      'ПРИХОД 🧠 растёт: мир цветной, мультяшки сами лезут к деду. ' +
      'Приход тает — жуй грибы. Трезвому деду мир сер и пуст.' },
    { ico: '🖐️', txt: 'Изгоняй мультяшек ЛОДОШКОЙ (ЛКМ) — они оставляют подарки и ' +
      'грибную энергию. Скучно? ГРИБНОЙ ЗАЛП [G]: 20 энергии — гром, ' +
      'и все звери леса бегут к тебе.' },
    { ico: '🌳', txt: 'Энергию вкладывай в ДРЕВО МУДРОСТИ [T] — дед станет быстрее, ' +
      'крепче и удачливее. Приступы лечи грибами, а не жди.' },
    { ico: '🛸', txt: 'Через 60 дней тарелка прилетит за тобой. Разведи Магический ' +
      'Огонь на мостках, подай 3 Грибных Зова — и лети к звёздам. ' +
      'Не успеешь — дед уснёт навсегда.' }
  ];

  function flags() {
    return (WS.G && WS.G.story && WS.G.story.flags) ? WS.G.story.flags : null;
  }

  function close() {
    if (!root) return;
    window.removeEventListener('keydown', onKey);
    root.classList.add('hidden');
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
    }, 400);
    shown = false;
    try { if (WS.Snd && WS.Snd.play) WS.Snd.play('click', { vol: 0.3 }); } catch (e2) { /* тихо */ }
  }

  function onKey(ev) {
    if (!root) return;
    if (ev.code === 'Escape' || ev.code === 'Enter' || ev.code === 'Space') {
      ev.preventDefault();
      close();
    }
  }

  function show() {
    if (root || shown) return;
    shown = true;

    root = document.createElement('div');
    root.id = 'ws-crazy-intro';
    // .ws-modal: Ui.modal() увидит элемент и погасит симуляцию/ввод
    // до закрытия заставки (контракт ui.js «МОДАЛЬНОСТЬ»)
    root.className = 'ws-screen ws-modal ws-crazy-intro';

    var inner = document.createElement('div');
    inner.className = 'ci-inner';
    root.appendChild(inner);

    var title = document.createElement('h2');
    title.className = 'ci-title';
    title.textContent = 'БЕЗУМНЫЙ ДЕД';
    inner.appendChild(title);

    var sub = document.createElement('div');
    sub.className = 'ci-sub';
    sub.textContent = 'зима, грибы и летающая тарелка';
    inner.appendChild(sub);

    for (var i = 0; i < LINES.length; i++) {
      var row = document.createElement('div');
      row.className = 'ci-row';
      var ico = document.createElement('span');
      ico.className = 'ci-ico';
      ico.textContent = LINES[i].ico;
      var p = document.createElement('p');
      p.textContent = LINES[i].txt;
      row.appendChild(ico);
      row.appendChild(p);
      inner.appendChild(row);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ws-btn ci-go';
    btn.textContent = '🚶 Гулять, дед!';
    btn.addEventListener('click', close);
    inner.appendChild(btn);

    var foot = document.createElement('div');
    foot.className = 'ci-foot';
    foot.textContent = 'Туториал подскажет первое изгнание · T — Древо Мудрости · J — журнал';
    inner.appendChild(foot);

    document.body.appendChild(root);
    window.addEventListener('keydown', onKey, { once: false });
  }

  WS.boot(function initCrazyIntro() {
    WS.Ev.on('game:start', function () {
      var f = flags();
      // одна партия — одно интро; флаг живёт в сейве
      if (f && f.intro_done) return;
      // только дед-режим (он в этой игре теперь и есть игра)
      if (!(WS.G && WS.G.crazy)) return;
      if (f) f.intro_done = 1;
      // дать миру и HUD встать на ноги, потом показать заставку
      setTimeout(function () {
        try { show(); } catch (e) {
          WS.err('crazy_intro: показ', e && e.message);
        }
      }, 600);
    });
    WS.log('[CrazyIntro] интро-заставка деда готова');
  }, 'ui:crazy_intro');

  WS.def('CrazyIntro', { show: show });
})();
