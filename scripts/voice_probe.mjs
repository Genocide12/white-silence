// Верификация озвучки (Web Speech API): тумблеры «Голос деда» / «Голос
// радио-диктора», громкость голоса, полнота фраз (холод/волки/факелы...).
// Заменяет speechSynthesis заглушкой-рекордером ДО загрузки страницы,
// стартует партию, триггерит контексты и проверяет произнесённое.
// Использование: node scripts/voice_probe.mjs [url]
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  // --- заглушка-рекордер речи (до любых скриптов страницы) ---
  // ВАЖНО: speechSynthesis — ридонли-аксессор на Window.prototype,
  // простое присваивание молча игнорируется — только defineProperty.
  await page.addInitScript(() => {
    window.__spoken = [];       // все utterance
    window.__speechCalls = 0;   // сколько раз позвали speak()
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speaking: false, paused: false, pending: false, onvoiceschanged: null,
        getVoices: () => [{ lang: 'ru-RU', name: 'mock-ded', default: true, localService: true, voiceURI: 'mock-ded' }],
        speak: (u) => { window.__speechCalls++; window.__spoken.push({ text: u && u.text, volume: u && u.volume, pitch: u && u.pitch, rate: u && u.rate }); },
        cancel: () => {}, pause: () => {}, resume: () => {}
      },
      writable: true, configurable: true
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: function (text) {
        this.text = text || ''; this.lang = ''; this.voice = null;
        this.volume = 1; this.rate = 1; this.pitch = 1;
      },
      writable: true, configurable: true
    });
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);

  const failed = [];
  const ok = (name, cond) => {
    console.log((cond ? '  ok   ' : '  FAIL ') + name);
    if (!cond) failed.push(name);
  };

  // 0) модуль и дефолтные настройки голоса
  const pre = await page.evaluate(() => ({
    thoughts: !!WS.Thoughts,
    cats: WS.Thoughts ? Object.keys(WS.Thoughts._db).length : 0,
    voice: WS.Thoughts && WS.Thoughts.voiceInfo ? WS.Thoughts.voiceInfo() : null,
    opts: WS.Options ? { ded: WS.Options.get('voiceDed'), radio: WS.Options.get('voiceRadio'), vol: WS.Options.get('voiceVol') } : null
  }));
  console.log('ПРЕДПУСК:', JSON.stringify(pre));
  ok('модуль Thoughts зарегистрирован', pre.thoughts);
  ok('гейты по умолчанию: дед вкл, радио вкл, громкость 1',
     pre.voice && pre.voice.ded === true && pre.voice.radio === true && pre.voice.vol === 1);

  // 1) старт партии: дед-режим говорит первую реплику сам
  await page.evaluate(() => { WS.Main.newGame('telegraph', ['frostproof', 'patient'], 1917); });
  await page.waitForTimeout(1500);
  const started = await page.evaluate(() => ({
    calls: window.__speechCalls,
    running: !!(WS.G && WS.G.running),
    crazy: !!(WS.Crazy && WS.Crazy.active())
  }));
  console.log('СТАРТ ПАРТИИ:', JSON.stringify(started));
  ok('игра запущена (дед-режим)', started.running && started.crazy);
  ok('первая реплика деда произнесена', started.calls >= 1);

  // Хелпер: триггер с ретраями (общая пауза мыслей 6.5с может съедать событие)
  const fire = async (js, checkJs, label, tries = 3) => {
    for (let i = 0; i < tries; i++) {
      await page.evaluate(js);
      await page.waitForTimeout(900);
      if (await page.evaluate(checkJs)) {
        console.log('  триггер «' + label + '» сработал (попытка ' + (i + 1) + ')');
        return true;
      }
      await page.waitForTimeout(7000);
    }
    console.log('  триггер «' + label + '» не сработал за ' + tries + ' попытки');
    return false;
  };

  // 2) ХОЛОД: эмитим настоящий хук temp:stage (стадия 2 = «бьёт дрожь»)
  const coldOk = await fire(
    () => WS.Ev.emit('temp:stage', { stage: 2, name: 'холодно', core: 35.2 }),
    () => window.__spoken.some((s) => /мёрзн|укрыти|костёр|печк|холод/i.test(s.text || '')),
    'холод (temp:stage)'
  );
  if (!coldOk) {
    // страховка: прямой вызов контекста (prio 3 проходит мимо общей паузы)
    await page.evaluate(() => WS.Thoughts.think('frostbite', { prio: 3, cd: 0.001 }));
    await page.waitForTimeout(500);
  }
  const cold = await page.evaluate(() => window.__spoken.find((s) => /мёрзн|укрыти|костёр|печк|холод/i.test(s.text || '')) || null);
  console.log('ХОЛОД:', cold ? JSON.stringify(cold.text) : 'нет');
  ok('фраза про холод: «Мёрзну»/«укрытие»/«костёр»', !!cold);

  // 3) ВОЛКИ: настоящий хук — живой волк рядом целится в деда
  const wolfOk = await fire(
    () => {
      const p = WS.G.player;
      WS.World.addEnt({ id: 'probe_wolf', kind: 'wolf', x: p.x + 3, y: p.y,
                        hp: 40, maxHp: 40, dir: 0, target: p, mode: 'chase' });
    },
    () => window.__spoken.some((s) => /заметили волки|Волки|Волчара/i.test(s.text || '')),
    'волки (dangerTick)',
    2
  );
  const wolf = await page.evaluate(() => window.__spoken.find((s) => /заметили волки|Волки|Волчара/i.test(s.text || '')) || null);
  console.log('ВОЛКИ:', wolf ? JSON.stringify(wolf.text) : 'нет');
  ok('фраза про волков: «заметили волки»/«Волки»', !!wolf);

  // 4) прочие настоящие хуки (бонус, не критичны для ассерта количества)
  await fire(() => WS.Ev.emit('fish:caught', {}), () => window.__spoken.some((s) => /Поймал|Рыбк|батеньк/i.test(s.text || '')), 'рыбалка', 2);
  await fire(() => WS.Ev.emit('night:fall', { day: 1 }), () => window.__spoken.some((s) => /очь|Темнеет/i.test(s.text || '')), 'ночь', 2);
  await fire(() => WS.Ev.emit('item:crafted', { out: { id: 'torch' } }), () => window.__spoken.some((s) => /акел/i.test(s.text || '')), 'крафт факела', 2);

  // 5) форс новых контекстов напрямую (prio 3 — мимо общей паузы)
  const forced = await page.evaluate(() => [
    WS.Thoughts.think('warmed_up', { prio: 3, cd: 0.001 }),
    WS.Thoughts.think('torches_done', { prio: 3, cd: 0.001 }),
    WS.Thoughts.think('cz_last_day', { prio: 3, cd: 0.001 }),
    WS.Thoughts.think('cz_sleeping', { prio: 3, cd: 0.001 }),
    WS.Thoughts.think('hard_frost', { prio: 3, cd: 0.001 })
  ]);
  console.log('НОВЫЕ КОНТЕКСТЫ (форс):', JSON.stringify(forced));
  ok('все 5 новых контекстов озвучены', forced.every((t) => typeof t === 'string' && t.length > 0));

  // 6) АССЕРТ КОЛИЧЕСТВА
  const total = await page.evaluate(() => ({ calls: window.__speechCalls, n: window.__spoken.length }));
  console.log('ПРОИЗНЕСЕНО ВСЕГО:', total.n, 'фраз (вызовов speak:', total.calls + ')');
  ok('произнесено не меньше 5 фраз', total.n >= 5);

  // 7) ГРОМКОСТЬ ГОЛОСА: слайдер 0.5 → utterance.volume = 0.5
  await page.evaluate(() => WS.Options.set('voiceVol', 0.5));
  const volRec = await page.evaluate(() => {
    WS.Thoughts.think('inv_full', { prio: 3, cd: 0.001 });
    return window.__spoken[window.__spoken.length - 1];
  });
  console.log('ГРОМКОСТЬ 0.5:', JSON.stringify(volRec));
  ok('громкость голоса применяется (volume=0.5)', volRec && Math.abs(volRec.volume - 0.5) < 0.01);

  // 8) ТУМБЛЕР «ГОЛОС ДЕДА» ВЫКЛ: речь молчит, пузырь мыслей ОСТАЁТСЯ
  const dedOff = await page.evaluate(() => {
    WS.Options.set('voiceDed', false);
    const before = window.__speechCalls;
    WS.Thoughts.think('blizzard', { prio: 3, cd: 0.001 });
    const el = document.getElementById('ws-thought');
    const res = {
      spoken: window.__speechCalls - before,
      bubbleVisible: !!(el && !el.classList.contains('hidden')),
      bubbleText: el ? el.textContent : ''
    };
    WS.Options.set('voiceDed', true);
    return res;
  });
  console.log('ДЕД ВЫКЛ:', JSON.stringify(dedOff));
  ok('дед выкл → speak() не вызывается', dedOff.spoken === 0);
  ok('дед выкл → пузырь мыслей остаётся', dedOff.bubbleVisible && dedOff.bubbleText.length > 0);

  // 9) РАДИО-ДИКТОР: вкл — говорит своим голосом; выкл — молчит, пузырь есть
  const radioOn = await page.evaluate(() => {
    const before = window.__speechCalls;
    WS.Thoughts.radioSay('Внимание, говорит Северная радиостанция.', 'Радио · зонд', 0, 0);
    const el = document.getElementById('ws-radio-bubble');
    return { spoken: window.__speechCalls - before,
             last: window.__spoken[window.__spoken.length - 1] || null,
             bubble: !!(el && !el.classList.contains('hidden')) };
  });
  console.log('РАДИО ВКЛ:', JSON.stringify(radioOn));
  ok('радио вкл → диктор говорит', radioOn.spoken === 1 && radioOn.bubble);
  ok('голос диктора отличается (pitch ~1.06, volume 0.95×0.5)',
     radioOn.last && radioOn.last.pitch > 1 && Math.abs(radioOn.last.volume - 0.475) < 0.01);

  const radioOff = await page.evaluate(() => {
    WS.Options.set('voiceRadio', false);
    const before = window.__speechCalls;
    WS.Thoughts.radioSay('Диктор молчит по просьбе деда.', 'Радио · зонд', 0, 0);
    const el = document.getElementById('ws-radio-bubble');
    const res = { spoken: window.__speechCalls - before,
                  bubble: !!(el && !el.classList.contains('hidden')) };
    WS.Options.set('voiceRadio', true);
    return res;
  });
  console.log('РАДИО ВЫКЛ:', JSON.stringify(radioOff));
  ok('радио выкл → диктор молчит, текст у приёмника остаётся',
     radioOff.spoken === 0 && radioOff.bubble);

  // 10) МАСТЕР-ВЫКЛЮЧАТЕЛЬ (клавиша в дед-режиме): глушит всё
  const master = await page.evaluate(() => {
    WS.Thoughts.setVoiceOn(false);
    const before = window.__speechCalls;
    WS.Thoughts.think('dawn', { prio: 3, cd: 0.001 });
    const res = {
      spoken: window.__speechCalls - before,
      master: WS.Thoughts.isVoiceOn(),
      optsSynced: WS.Options.get('voiceDed') === false && WS.Options.get('voiceRadio') === false
    };
    WS.Thoughts.setVoiceOn(true);
    return res;
  });
  console.log('МАСТЕР ВЫКЛ:', JSON.stringify(master));
  ok('мастер выкл → полная тишина', master.spoken === 0);
  ok('мастер синхронизирует тумблеры настроек', master.optsSynced);

  // 11) ЭКРАН НАСТРОЕК: ряды на месте, чекбокс реально переключает опцию
  const ui = await page.evaluate(() => {
    WS.Options.show();
    const rows = Array.prototype.slice.call(document.querySelectorAll('.ws-options-row'));
    const row = (t) => rows.filter((r) => r.textContent.indexOf(t) >= 0)[0] || null;
    return {
      dedRow: !!row('Голос деда (озвучка мыслей)'),
      dedChecked: row('Голос деда (озвучка мыслей)') ? row('Голос деда (озвучка мыслей)').querySelector('input').checked : null,
      radioRow: !!row('Голос радио-диктора'),
      volRow: !!row('Громкость голоса')
    };
  });
  console.log('НАСТРОЙКИ UI:', JSON.stringify(ui));
  ok('в настройках есть «Голос деда (озвучка мыслей)» (вкл)', ui.dedRow && ui.dedChecked === true);
  ok('в настройках есть «Голос радио-диктора»', ui.radioRow);
  ok('в настройках есть «Громкость голоса»', ui.volRow);

  await page.locator('.ws-options-row', { hasText: 'Голос деда (озвучка мыслей)' }).locator('input[type=checkbox]').click();
  await page.waitForTimeout(300);
  const afterClick = await page.evaluate(() => {
    const v = WS.Options.get('voiceDed');
    WS.Options.set('voiceDed', true);
    WS.Options.hide();
    return v;
  });
  console.log('КЛИК ПО ЧЕКБОКСУ «Голос деда» → voiceDed =', JSON.stringify(afterClick));
  ok('клик по чекбоксу выключает voiceDed', afterClick === false);

  // 12) голос деда — низкий бас (pitch 0.42)
  const dedPitch = await page.evaluate(() => {
    const u = window.__spoken.find((s) => Math.abs(s.pitch - 0.42) < 0.001);
    return u ? u.pitch : null;
  });
  ok('голос деда — низкий бас (pitch 0.42)', dedPitch !== null);

  // 13) консоль без ошибок
  console.log('ОШИБКИ (' + errors.length + '):', errors.slice(0, 8));
  ok('0 ошибок консоли', errors.length === 0);

  // --- всё произнесённое ---
  const spoken = await page.evaluate(() => window.__spoken.map((s) => s.text));
  console.log('=== ПРОИЗНЕСЕНО (' + spoken.length + ') ===');
  spoken.forEach((t, i) => console.log('  ' + (i + 1) + '. ' + t));

  await browser.close();
  if (failed.length) {
    console.log('ПРОВАЛЕНО (' + failed.length + '):', failed);
    process.exit(1);
  }
  console.log('ГОЛОС ДЕДА: ВСЕ АССЕРТЫ ПРОШЛИ');
  process.exit(0);
};
run().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
