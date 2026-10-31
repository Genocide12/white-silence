/**
 * ГОЛОСОВОЙ ПЛЕЕР «СТУДИЯ ДЕДА» — файловая озвучка вместо робота.
 *
 * Раньше деда озвучивал Web Speech API — получился робот из лифта.
 * Теперь фразы заранее начитаны разными голосами (дед, радио-диктор,
 * сводка новостей, мультяшки, тарелка, рассказчик) и лежат в
 * assets/voice/*.mp3 + manifest.json. Этот модуль:
 *   - грузит манифест (id/текст → файл);
 *   - декодирует mp3 через AudioContext игры (WS.Snd.ctx());
 *   - играет через общий мастер-гейн (уважает громкость и mute);
 *   - кэширует буферы и префетчит частые фразы.
 *
 * Интеграция: systems/thoughts.js → speak()/radioSay() сначала пробует
 * VoiceBox (по тексту), нет файла — остаётся только пузырь мысли (никаких
 * роботов). Прямые реплики (ритуал, победа) — по ключу playKey().
 *
 * Связи: core/audio.js (контекст и мастер-гейн), ui/options.js
 * (voiceVol, voiceDed, voiceRadio), systems/crazy.js.
 */
(function () {
  'use strict';

  var MANIFEST_URL = 'assets/voice/manifest.json';
  var PREFETCH = 14;                    // сколько частых фраз префетчим

  var S = {
    manifest: null,          // {phrases:{id:{f,t,ch}}, byText:{}}
    bufs: {},                // id -> AudioBuffer
    loading: {},             // id -> true (запрос уже в полёте)
    failed: {},              // id -> true (не смогли загрузить)
    enabled: true,
    statN: { played: 0, decoded: 0, missed: 0 }   // для отладки/пробников
  };

  // каналы озвучки: разная громкость/характер
  var CHANNELS = {
    ded: 1.0, radio: 0.9, news: 0.9, cartoon: 0.95, alien: 1.0, narrator: 0.95
  };

  function optBool(k, dflt) {
    try {
      if (WS.Options && WS.Options.get) {
        var v = WS.Options.get(k);
        return v === undefined ? dflt : !!v;
      }
    } catch (e) { /* пусто */ }
    return dflt;
  }

  function optVol() {
    try {
      if (WS.Options && WS.Options.get) {
        var v = WS.Options.get('voiceVol');
        if (typeof v === 'number') return Math.max(0, Math.min(1, v));
      }
    } catch (e) { /* пусто */ }
    return 1;
  }

  // ====================================================================
  //  ЗАГРУЗКА МАНИФЕСТА И ФАЙЛОВ
  // ====================================================================

  function loadManifest() {
    try {
      fetch(MANIFEST_URL, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw new Error('нет манифеста озвучки');
        return r.json();
      }).then(function (j) {
        S.manifest = j || {};
        S.manifest.phrases = S.manifest.phrases || {};
        S.manifest.byText = {};
        for (var id in S.manifest.phrases) {
          if (S.manifest.phrases.hasOwnProperty(id)) {
            var p = S.manifest.phrases[id];
            if (p && p.t) S.manifest.byText[p.t] = id;
          }
        }
        WS.log('[VoiceBox] манифест озвучки: ' + Object.keys(S.manifest.phrases).length + ' фраз');
        prefetchCommon();
      }).catch(function () {
        S.manifest = { phrases: {}, byText: {} };
        WS.log('[VoiceBox] озвучки нет — дед молчит, но текст пишет');
      });
    } catch (e) {
      S.manifest = { phrases: {}, byText: {} };
    }
  }

  function ctx() {
    try { return WS.Snd ? WS.Snd.ctx() : null; } catch (e) { return null; }
  }

  /** Мастер-гейн игры (общий mute/громкость). Добавлен в audio.js: bus(). */
  function bus() {
    try { return WS.Snd && WS.Snd.bus ? WS.Snd.bus() : null; } catch (e) { return null; }
  }

  function fetchBuf(id, cb) {
    if (!S.manifest || !S.manifest.phrases[id] || S.loading[id] || S.failed[id]) {
      if (cb) cb(null);
      return;
    }
    var f = S.manifest.phrases[id].f;
    var url = 'assets/voice/' + f;
    S.loading[id] = true;
    try {
      fetch(url, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw new Error('404 ' + url);
        return r.arrayBuffer();
      }).then(function (ab) {
        var ac = ctx();
        if (!ac) throw new Error('нет аудиоконтекста');
        // ФИКС FV-2: в Chromium decodeAudioData вызывает И legacy-колбэк,
        // И резолвит промис — раньше фраза считалась в stat().decoded дважды.
        // Флаг done: первая же удачная расшифровка засчитывается один раз,
        // повторные срабатывания (колбэк ИЛИ промис) молча игнорируются.
        var done = false;
        function okOnce(buf) {
          if (done) return;                 // уже посчитано — не двойним
          done = true;
          S.bufs[id] = buf;
          S.statN.decoded++;
          delete S.loading[id];
          if (cb) cb(buf);
        }
        function errOnce() {
          if (done) return;
          done = true;
          delete S.loading[id];
          S.failed[id] = true;
          if (cb) cb(null);
        }
        var pr = ac.decodeAudioData(ab, okOnce, errOnce);   // legacy-колбэк
        if (pr && pr.then) pr.then(okOnce).catch(errOnce);  // современный промис-вариант
      }).catch(function () {
        delete S.loading[id];
        S.failed[id] = true;
        if (cb) cb(null);
      });
    } catch (e) {
      delete S.loading[id];
      S.failed[id] = true;
      if (cb) cb(null);
    }
  }

  // приоритетный список префетча: интро партии — рассказчик и первая реплика
  // деда. ФИКС FV-1: раньше ловились только /^banish|^hello|^radio_hello/,
  // narrator_intro и cz_start не попадали в префетч и МОЛЧАЛИ при холодном
  // старте партии (звучали лишь со второго раза, после прогрева из playId).
  var PRI_INTRO = ['narrator_intro', 'cz_start'];

  function prefetchCommon() {
    if (!S.manifest) return;
    var ids = Object.keys(S.manifest.phrases);
    // сначала интро (обязаны звучать с первого же старта)...
    var pri = [];
    for (var p = 0; p < PRI_INTRO.length; p++) {
      if (S.manifest.phrases[PRI_INTRO[p]]) pri.push(PRI_INTRO[p]);
    }
    // ...затем реплики изгнания и приветствия — они звучат чаще всего
    for (var i = 0; i < ids.length; i++) {
      if (/^banish|^hello|^radio_hello/.test(ids[i])) pri.push(ids[i]);
    }
    // добиваем лимит остальными фразами манифеста (без дублей)
    for (var k = 0; k < ids.length && pri.length < PREFETCH; k++) {
      if (pri.indexOf(ids[k]) < 0) pri.push(ids[k]);
    }
    for (var j = 0; j < Math.min(PREFETCH, pri.length); j++) fetchBuf(pri[j]);
  }

  // ====================================================================
  //  ВОСПРОИЗВЕДЕНИЕ
  // ====================================================================

  function playing() {
    // считаем играющие голосовые источники (не даём хору дедов)
    return S.playingN || 0;
  }

  function playId(id, opt) {
    opt = opt || {};
    if (!S.manifest || !S.manifest.phrases[id]) return false;
    var phrase = S.manifest.phrases[id];
    // гейты настроек: все НЕ-радио каналы (дед, мультяшки, тарелка,
    // рассказчик) слушают тумблер «Голос деда». ФИКС FV-3: раньше гейтились
    // только ded и radio/news — при voiceDed=false мультяшки продолжали
    // орать. Радио и новости остались на своём отдельном тумблере.
    var ch = phrase.ch || 'ded';
    if (ch === 'radio' || ch === 'news') {
      if (!optBool('voiceRadio', true)) return false;
    } else if (!optBool('voiceDed', true)) {
      return false;
    }
    var vol = optVol();
    if (vol <= 0.001) return false;
    var buf = S.bufs[id];
    if (!buf) {
      S.statN.missed++;
      fetchBuf(id);                     // в следующий раз прозвучит
      return false;                     // сейчас — тишина (не робот!)
    }
    var ac = ctx();
    if (!ac) return false;
    try {
      var src = ac.createBufferSource();
      src.buffer = buf;
      var g = ac.createGain();
      var chVol = CHANNELS[ch] || 1;
      var base = (opt.volume != null) ? opt.volume : chVol;
      g.gain.value = Math.max(0, Math.min(1.5, base * vol));
      var out = bus();
      if (out) g.connect(out); else g.connect(ac.destination);
      src.connect(g);
      src.onended = function () { S.playingN = Math.max(0, (S.playingN || 1) - 1); };
      S.playingN = (S.playingN || 0) + 1;
      S.statN.played++;
      src.start(0);
      return true;
    } catch (e) {
      WS.err('VoiceBox: проигрывание', e && e.message);
      return false;
    }
  }

  /** Произнести текст, если он есть в банке озвучки. true = прозвучал. */
  function speakText(text, opt) {
    if (!S.manifest || !S.manifest.byText) return false;
    var id = S.manifest.byText[String(text || '').trim()];
    if (!id) return false;
    return playId(id, opt);
  }

  function playKey(id, opt) { return playId(id, opt); }

  function stopAll() {
    // файловые фразы короткие — останавливать нечего, но на будущее
  }

  // ====================================================================
  //  BOOT / API
  // ====================================================================

  WS.boot(function initVoiceBox() {
    loadManifest();
    WS.log('[VoiceBox] студийная озвучка деда подключена');
  }, 'voicebox:init');

  WS.def('VoiceBox', {
    playKey: playKey,
    speakText: speakText,
    stopAll: stopAll,
    has: function (id) { return !!(S.manifest && S.manifest.phrases[id]); },
    hasText: function (t) { return !!(S.manifest && S.manifest.byText && S.manifest.byText[String(t || '').trim()]); },
    ready: function () { return !!S.manifest; },
    count: function () { return S.manifest ? Object.keys(S.manifest.phrases).length : 0; },
    // отладка/пробники: сколько буферов расшифровано, сколько фраз прозвучало
    stat: function () { return { played: S.statN.played, decoded: S.statN.decoded, missed: S.statN.missed }; },
    _buf: function (id) { return S.bufs[id] || null; }
  });
})();
