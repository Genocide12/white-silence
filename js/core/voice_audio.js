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
        var pr = ac.decodeAudioData(ab, function (buf) {
          S.bufs[id] = buf;
          S.statN.decoded++;
          delete S.loading[id];
          if (cb) cb(buf);
        }, function () {
          delete S.loading[id];
          S.failed[id] = true;
          if (cb) cb(null);
        });
        // современный промис-вариант
        if (pr && pr.then) {
          pr.then(function (buf) {
            S.bufs[id] = buf;
            S.statN.decoded++;
            delete S.loading[id];
            if (cb) cb(buf);
          }).catch(function () {
            delete S.loading[id];
            S.failed[id] = true;
            if (cb) cb(null);
          });
        }
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

  function prefetchCommon() {
    if (!S.manifest) return;
    var ids = Object.keys(S.manifest.phrases);
    // сначала реплики изгнания и приветствие — они звучат чаще всего
    var pri = [];
    for (var i = 0; i < ids.length; i++) {
      if (/^banish|^hello|^radio_hello/.test(ids[i])) pri.push(ids[i]);
    }
    for (var k = 0; k < ids.length && pri.length < PREFETCH; k++) pri.push(ids[k]);
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
    // гейты настроек: дед / радио+новости — отдельные тумблеры
    var ch = phrase.ch || 'ded';
    if (ch === 'ded') {
      if (!optBool('voiceDed', true)) return false;
    } else if (ch === 'radio' || ch === 'news') {
      if (!optBool('voiceRadio', true)) return false;
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
