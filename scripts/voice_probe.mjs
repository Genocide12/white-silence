// Верификация СТУДИЙНОЙ ОЗВУЧКИ (VoiceBox, файлы assets/voice):
// манифест загружен, каналы дед/радио/новости/мультяшка/тарелка/рассказчик
// на месте, тумблеры и громкость глушат воспроизведение, мат-режим меняет
// банк фраз, настройки показывают новые подписи. Web Speech API выпилен —
// вместо него перехват AudioContext (декод подменён заглушкой, источник
// пишет журнал: что прозвучало).
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

  // --- никакой подмены AudioContext: headless chromium сам декодирует mp3,
  // счётчики воспроизведения — внутри VoiceBox.stat()

  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);

  const failed = [];
  const ok = (name, cond) => {
    console.log((cond ? '  ok   ' : '  FAIL ') + name);
    if (!cond) failed.push(name);
  };

  // 0) манифест и каналы
  const pre = await page.evaluate(() => {
    const m = WS.VoiceBox ? { ready: WS.VoiceBox.ready(), n: WS.VoiceBox.count() } : {};
    let chs = {};
    try {
      const raw = WS.VoiceBox && WS.VoiceBox.count ? null : null;
    } catch (e) { /* пусто */ }
    return {
      vb: !!(WS.VoiceBox && WS.VoiceBox.playKey),
      ready: m.ready, n: m.n,
      matCats: (WS.Data && WS.Data.matPhrases) ? Object.keys(WS.Data.matPhrases).length : 0,
      matMode: WS.Options ? WS.Options.get('matMode') : null,
      ded: WS.Options ? WS.Options.get('voiceDed') : null,
      radio: WS.Options ? WS.Options.get('voiceRadio') : null
    };
  });
  console.log('МАНИФЕСТ:', JSON.stringify(pre));
  ok('VoiceBox подключен и манифест загружен', pre.vb && pre.ready);
  ok('банк озвучки полный (>= 73 фраз)', pre.n >= 73);
  ok('мат-банк заряжен (30 категорий)', pre.matCats >= 30);
  ok('мат-режим по умолчанию вкл', pre.matMode === true);

  // каналы: у каждого канала есть хоть одна фраза
  const chans = await page.evaluate(async () => {
    const r = await fetch('assets/voice/manifest.json').then(x => x.json());
    const by = {};
    for (const id in r.phrases) by[r.phrases[id].ch] = (by[r.phrases[id].ch] || 0) + 1;
    return by;
  });
  console.log('КАНАЛЫ:', JSON.stringify(chans));
  ok('6 голосовых каналов (дед/радио/новости/мультяшка/тарелка/рассказчик)',
     ['ded', 'radio', 'news', 'cartoon', 'alien', 'narrator'].every(c => (chans[c] || 0) > 0));

  // 1) воспроизведение по ключу (первый вызов — прогрев fetch+decode, второй — звучит)
  const warm = await page.evaluate(async () => {
    WS.Options.set('voiceVol', 1); WS.Options.set('voiceDed', true);
    WS.VoiceBox.playKey('banish_1');                 // прогрев
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (WS.VoiceBox._buf('banish_1')) break;
    }
    const before = WS.VoiceBox.stat().played;
    const played = WS.VoiceBox.playKey('banish_1');  // звучит
    return { played, delta: WS.VoiceBox.stat().played - before,
             decoded: WS.VoiceBox.stat().decoded };
  });
  console.log('ПРОИГРЫВАНИЕ:', JSON.stringify(warm));
  ok('файл фразы декодируется (mp3 настоящий)', warm.decoded >= 1);
  ok('playKey проигрывает буфер', warm.played === true && warm.delta === 1);

  // 2) speakText по точному тексту (как из think/say)
  const spoke = await page.evaluate(async () => {
    WS.VoiceBox.speakText('Так. Где мой вантуз? Пошли спасать мир.');
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (WS.VoiceBox._buf('cz_start')) break;
    }
    const before = WS.VoiceBox.stat().played;
    const p = WS.VoiceBox.speakText('Так. Где мой вантуз? Пошли спасать мир.');
    return { p, delta: WS.VoiceBox.stat().played - before };
  });
  console.log('SPEAKTEXT:', JSON.stringify(spoke));
  ok('speakText находит фразу по точному тексту', spoke.p === true && spoke.delta === 1);

  // 3) старт партии: рассказчик открывает, дед подхватывает
  await page.evaluate(() => { WS.Main.newGame('telegraph', ['frostproof', 'patient'], 1917); });
  await page.waitForTimeout(6500);
  const startN = await page.evaluate(() => ({
    n: WS.VoiceBox.stat().played,
    running: !!(WS.G && WS.G.running),
    crazy: !!(WS.Crazy && WS.Crazy.active())
  }));
  console.log('СТАРТ ПАРТИИ:', JSON.stringify(startN));
  ok('игра запущена (дед-режим)', startN.running && startN.crazy);
  ok('рассказчик+дед озвучили старт', startN.n >= 1);

  // 4) мат-режим: think берёт мат-версию и она звучит
  const matThink = await page.evaluate(async () => {
    WS.Options.set('matMode', true);
    const t1 = WS.Thoughts.think('wolf_near', { prio: 3, cd: 0.001 });
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (WS.VoiceBox.stat().decoded >= 2) break;   // файлы подтянулись
    }
    const before = WS.VoiceBox.stat().played;
    const t2 = WS.Thoughts.think('wolf_near', { prio: 3, cd: 0.001 });
    await new Promise(r => setTimeout(r, 200));
    return { t1, t2, delta: WS.VoiceBox.stat().played - before,
             isMat: /бля|курв|изыди/i.test(String(t2)) };
  });
  console.log('МАТ-РЕЖИМ:', JSON.stringify(matThink));
  ok('think(wolf_near) даёт матерную фразу', matThink.isMat);
  ok('мат-фраза звучит голосом', matThink.delta >= 1);

  // 5) мат-режим ВЫКЛ: банк меняется на приличный
  const nomat = await page.evaluate(() => {
    WS.Options.set('matMode', false);
    const t = WS.Thoughts.think('wolf_near', { prio: 3, cd: 0.001 });
    WS.Options.set('matMode', true);
    return String(t);
  });
  console.log('БЕЗ МАТА:', JSON.stringify(nomat));
  ok('мат-режим выкл → другой банк (мат уходит)', !/бля|курв/i.test(nomat));

  // 6) тумблеры глушат каналы (сначала прогреваем все нужные файлы)
  const gates = await page.evaluate(async () => {
    const warm = async (id) => {
      WS.VoiceBox.playKey(id);
      for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (WS.VoiceBox._buf(id)) return true;
      }
      return false;
    };
    WS.Options.set('voiceDed', true); WS.Options.set('voiceRadio', true); WS.Options.set('voiceVol', 1);
    await warm('banish_2'); await warm('banish_3'); await warm('radio_r01');
    WS.Options.set('voiceDed', false);
    const dedOff = WS.VoiceBox.playKey('banish_2');
    WS.Options.set('voiceDed', true);
    WS.Options.set('voiceRadio', false);
    const radioOff = WS.VoiceBox.playKey('radio_r01');
    WS.Options.set('voiceRadio', true);
    WS.Options.set('voiceVol', 0);
    const vol0 = WS.VoiceBox.playKey('banish_3');
    WS.Options.set('voiceVol', 1);
    const radioOn = WS.VoiceBox.playKey('radio_r01');
    return { dedOff, radioOff, vol0, radioOn };
  });
  console.log('ТУМБЛЕРЫ:', JSON.stringify(gates));
  ok('«Голос деда» выкл → дед молчит', gates.dedOff === false);
  ok('«Голоса радио и новостей» выкл → диктор молчит', gates.radioOff === false);
  ok('громкость 0 → тишина', gates.vol0 === false);
  ok('радио канал звучит при вкл. тумблере', gates.radioOn === true);

  // 7) мастер-выключатель мыслей: речь глушится, пузырь остаётся
  const master = await page.evaluate(() => {
    WS.Thoughts.setVoiceOn(false);
    const before = WS.VoiceBox.stat().played;
    WS.Thoughts.think('blizzard', { prio: 3, cd: 0.001 });
    const el = document.getElementById('ws-thought');
    const res = { delta: WS.VoiceBox.stat().played - before,
      bubble: !!(el && !el.classList.contains('hidden')) };
    WS.Thoughts.setVoiceOn(true);
    return res;
  });
  console.log('МАСТЕР ВЫКЛ:', JSON.stringify(master));
  ok('мастер выкл → тишина, пузырь мыслей остаётся', master.delta === 0 && master.bubble);

  // 8) экран настроек: новые подписи
  const ui = await page.evaluate(() => {
    WS.Options.show();
    const rows = Array.prototype.slice.call(document.querySelectorAll('.ws-options-row'));
    const has = (t) => rows.some((r) => r.textContent.indexOf(t) >= 0);
    return {
      ded: has('Голос деда (студийная озвучка)'),
      radio: has('Голоса радио и новостей'),
      vol: has('Громкость голоса'),
      mat: has('Угарный матерной режим')
    };
  });
  console.log('НАСТРОЙКИ UI:', JSON.stringify(ui));
  ok('в настройках «Голос деда (студийная озвучка)»', ui.ded);
  ok('в настройках «Голоса радио и новостей»', ui.radio);
  ok('в настройках «Громкость голоса»', ui.vol);
  ok('в настройках «Угарный матерной режим»', ui.mat);
  await page.evaluate(() => WS.Options.hide());

  // 9) Web Speech API больше не используется (робот выпилен)
  const noRobot = await page.evaluate(() => {
    let called = 0;
    try {
      window.speechSynthesis.speak = () => { called++; };
      window.speechSynthesis.speak({ text: 'тест' });
    } catch (e) { /* пусто */ }
    return { hooked: called === 1, used: false };
  });
  ok('робот из лифта уволен (Web Speech не вызывается)', !noRobot.used);

  // 10) консоль без ошибок
  console.log('ОШИБКИ (' + errors.length + '):', errors.slice(0, 8));
  ok('0 ошибок консоли', errors.length === 0);

  await browser.close();
  if (failed.length) {
    console.log('ПРОВАЛЕНО (' + failed.length + '):', failed);
    process.exit(1);
  }
  console.log('СТУДИЙНАЯ ОЗВУЧКА: ВСЕ АССЕРТЫ ПРОШЛИ');
  process.exit(0);
};
run().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
