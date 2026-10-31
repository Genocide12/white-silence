/**
 * Процедурный звук: синтез эффектов в Web Audio API без единого аудиофайла.
 * Порт идеи ProceduralAudio.cs из jev-rts: короткие эффекты синтезируются кодом,
 * голосовой пул, защита от спама, случайный pitch.
 * Плюс: амбиент (ветер), волчий вой, выстрел, огонь — слои эмбиента.
 */
(function () {
  'use strict';

  var ac = null;                 // AudioContext
  var master = null;             // мастер-гейн
  var voices = [];               // пул источников
  var buffers = {};              // имя -> AudioBuffer
  var lastPlayed = {};            // имя -> time
  var ambience = {
    wind: null, windGain: null,
    fire: null, fireGain: null,
    drone: null, droneGain: null
  };

  var volume = 0.7;
  var muted = false;

  function ensureCtx() {
    if (ac) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = volume;
      master.connect(ac.destination);
    } catch (e) {
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------- синтез буферов
  function xorshift(seed) { return function () { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 65536) / 32767.5 - 1; }; }

  function makeBuffer(duration, fn) {
    var rate = 22050;
    var n = Math.ceil(duration * rate);
    var buf = ac.createBuffer(1, n, rate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      var t = i / rate, u = t / duration;
      data[i] = fn(t, u, i);
    }
    return buf;
  }

  function synth(name) {
    switch (name) {
      case 'click': return makeBuffer(0.06, function (t) {
        return Math.sin(t * 2 * Math.PI * 510) * 0.3 * Math.exp(-40 * t);
      });
      case 'select': return makeBuffer(0.07, function (t) {
        return (Math.sin(t * 2 * Math.PI * 510) * 0.35 + Math.sin(t * 2 * Math.PI * 765) * 0.13) * Math.exp(-24 * t);
      });
      case 'step_snow': return makeBuffer(0.14, function (t, u) {
        var n = (Math.random() * 2 - 1);
        return (n * 0.35 + Math.sin(t * 2 * Math.PI * (140 - 40 * u)) * 0.12) * Math.exp(-16 * t);
      });
      case 'step_wood': return makeBuffer(0.1, function (t) {
        return (Math.sin(t * 2 * Math.PI * 190) * 0.3 + (Math.random() * 2 - 1) * 0.2) * Math.exp(-28 * t);
      });
      case 'chop': return makeBuffer(0.22, function (t, u) {
        var n = (Math.random() * 2 - 1);
        return (Math.sin(t * 2 * Math.PI * (155 - 60 * u)) * 0.5 * Math.exp(-14 * t) +
                n * 0.6 * Math.exp(-55 * t));
      });
      case 'mine': return makeBuffer(0.2, function (t) {
        return ((Math.sin(t * 2 * Math.PI * 1320) * 0.26 + Math.sin(t * 2 * Math.PI * 2171) * 0.17) * Math.exp(-8 * t) +
                (Math.random() * 2 - 1) * 0.5 * Math.exp(-50 * t));
      });
      case 'build': return makeBuffer(0.24, function (t, u) {
        return (Math.sin(t * 2 * Math.PI * (180 - 50 * u)) * 0.45 + (Math.random() * 2 - 1) * 0.3) * Math.pow(1 - u, 2);
      });
      case 'hit': return makeBuffer(0.16, function (t) {
        return ((Math.random() * 2 - 1) * 0.45 + Math.sin(t * 2 * Math.PI * 90) * 0.45) * Math.exp(-14 * t);
      });
      case 'hit_flesh': return makeBuffer(0.18, function (t, u) {
        return (Math.sin(t * 2 * Math.PI * (70 - 30 * u)) * 0.5 + (Math.random() * 2 - 1) * 0.35) * Math.exp(-10 * t);
      });
      case 'death': return makeBuffer(0.4, function (t, u) {
        return ((Math.random() * 2 - 1) * 0.3 + Math.sin(t * 2 * Math.PI * (110 - 65 * u)) * 0.35) * Math.pow(1 - u, 1.5);
      });
      case 'eat': return makeBuffer(0.3, function (t, u) {
        var s = Math.sin(t * 2 * Math.PI * (90 + 60 * (u > 0.5 ? 1 : 0)));
        return (s * 0.2 + (Math.random() * 2 - 1) * 0.25) * (u > 0.8 ? Math.pow(1 - (u - 0.8) * 5, 2) : 1);
      });
      case 'drink': return makeBuffer(0.35, function (t, u) {
        return (Math.sin(t * 2 * Math.PI * (240 + 120 * u)) * 0.15 + (Math.random() * 2 - 1) * 0.12) * Math.exp(-5 * t);
      });
      case 'door': return makeBuffer(0.3, function (t, u) {
        return (Math.sin(t * 2 * Math.PI * (90 + 40 * u)) * 0.35 + (Math.random() * 2 - 1) * 0.12) * Math.pow(1 - u, 2);
      });
      case 'door_locked': return makeBuffer(0.15, function (t) {
        return (Math.sin(t * 2 * Math.PI * 130) * 0.4 + (Math.random() * 2 - 1) * 0.2) * Math.exp(-30 * t);
      });
      case 'window_break': return makeBuffer(0.45, function (t, u) {
        var rings = 0;
        for (var k = 1; k < 6; k++) rings += Math.sin(t * 2 * Math.PI * (1400 + k * 700)) * (1 / k);
        return ((Math.random() * 2 - 1) * 0.4 * Math.exp(-6 * t) + rings * 0.1) * Math.pow(1 - u, 1.2);
      });
      case 'pickup': return makeBuffer(0.1, function (t, u) {
        return (Math.sin(t * 2 * Math.PI * (330 + 200 * u)) * 0.3) * Math.pow(1 - u, 2);
      });
      case 'drop': return makeBuffer(0.12, function (t) {
        return ((Math.random() * 2 - 1) * 0.25 + Math.sin(t * 2 * Math.PI * 100) * 0.3) * Math.exp(-22 * t);
      });
      case 'error': return makeBuffer(0.2, function (t, u) {
        return (Math.sin(t * 2 * Math.PI * (140 - 20 * u)) * 0.4) * Math.pow(1 - u, 1.4);
      });
      case 'craft': return makeBuffer(0.3, function (t, u) {
        return (Math.sin(t * 2 * Math.PI * (520 + 160 * u)) * 0.22 + (Math.random() * 2 - 1) * 0.15) * Math.pow(1 - u, 2);
      });
      case 'levelup': return makeBuffer(0.5, function (t, u) {
        var s = Math.sin(t * 2 * Math.PI * 392) * 0.2 + Math.sin(t * 2 * Math.PI * 494) * 0.2 + Math.sin(t * 2 * Math.PI * 587) * 0.2;
        return s * (u < 0.7 ? Math.min(1, t / 0.02) : Math.pow(1 - (u - 0.7) / 0.3, 2));
      });
      case 'gunshot': return makeBuffer(0.5, function (t, u) {
        var n = (Math.random() * 2 - 1);
        return (n * 0.9 * Math.exp(-18 * t) + Math.sin(t * 2 * Math.PI * (60 - 40 * u)) * 0.5 * Math.exp(-6 * t));
      });
      case 'reload': return makeBuffer(0.35, function (t, u) {
        var clicks = Math.sin(t * 2 * Math.PI * 900) * Math.exp(-60 * Math.abs((u % 0.33) - 0.05));
        return clicks * 0.4 + (Math.random() * 2 - 1) * 0.06;
      });
      case 'howl': return makeBuffer(1.6, function (t, u) {
        // вой: восходящий тон + вибрато + спад
        var f = 260 + 190 * Math.min(1, u * 3.3) - 120 * Math.max(0, u - 0.7) / 0.3;
        var vib = Math.sin(t * 2 * Math.PI * 6) * 8;
        var s = Math.sin(t * 2 * Math.PI * (f + vib));
        var s2 = Math.sin(t * 2 * Math.PI * (f * 1.5 + vib)) * 0.3;
        var env = Math.min(1, u * 8) * Math.pow(1 - Math.max(0, (u - 0.6) / 0.4), 1.6);
        return (s * 0.35 + s2) * env;
      });
      case 'growl': return makeBuffer(0.7, function (t, u) {
        var f = 70 + 30 * Math.sin(t * 2 * Math.PI * 3);
        var s = Math.sin(t * 2 * Math.PI * f) * 0.5 + (Math.random() * 2 - 1) * 0.25;
        return s * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.2)), 1.5);
      });
      case 'bear_roar': return makeBuffer(1.1, function (t, u) {
        var f = 90 + 60 * Math.sin(t * 2 * Math.PI * 2.2) - 40 * u;
        var s = Math.sin(t * 2 * Math.PI * f) * 0.6 + (Math.random() * 2 - 1) * 0.35;
        return s * Math.min(1, u * 6) * Math.pow(1 - u, 0.8);
      });
      case 'bird': return makeBuffer(0.3, function (t, u) {
        var f = 2200 + 800 * Math.sin(t * 2 * Math.PI * 14);
        return Math.sin(t * 2 * Math.PI * f) * 0.15 * Math.pow(1 - u, 2);
      });
      case 'crow': return makeBuffer(0.35, function (t, u) {
        var f = 900 - 300 * u;
        return (Math.sin(t * 2 * Math.PI * f) * 0.2 + (Math.random() * 2 - 1) * 0.1) *
               Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 2);
      });
      case 'match': return makeBuffer(0.4, function (t, u) {
        return (Math.random() * 2 - 1) * 0.35 * Math.exp(-8 * t) + Math.sin(t * 2 * Math.PI * 2800) * 0.08 * Math.exp(-12 * t);
      });
      case 'fall': return makeBuffer(0.25, function (t, u) {
        return ((Math.random() * 2 - 1) * 0.3 + Math.sin(t * 2 * Math.PI * 80) * 0.4) * Math.pow(1 - u, 2);
      });
      case 'heartbeat': return makeBuffer(0.6, function (t, u) {
        var b1 = Math.exp(-40 * Math.abs(t - 0.12)) * Math.sin(t * 2 * Math.PI * 55);
        var b2 = Math.exp(-40 * Math.abs(t - 0.36)) * Math.sin(t * 2 * Math.PI * 48);
        return (b1 + b2 * 0.7) * 0.6;
      });
      case 'snow_step_deep': return makeBuffer(0.18, function (t, u) {
        return (Math.random() * 2 - 1) * 0.28 * Math.exp(-10 * t) * (0.5 + 0.5 * (1 - u));
      });
      case 'victory': return makeBuffer(0.9, function (t, u) {
        var s = (Math.sin(t * 2 * Math.PI * 262) + Math.sin(t * 2 * Math.PI * 330) + Math.sin(t * 2 * Math.PI * 392)) * 0.16;
        return s * Math.min(1, u * 10) * Math.pow(1 - u, 0.5);
      });
      case 'radio_static': return makeBuffer(0.8, function (t, u) {
        return (Math.random() * 2 - 1) * 0.22 * (0.4 + 0.6 * Math.sin(t * 2 * Math.PI * 3));
      });
      case 'bell': return makeBuffer(1.2, function (t, u) {
        var s = Math.sin(t * 2 * Math.PI * 660) * 0.3 + Math.sin(t * 2 * Math.PI * 1320) * 0.15 + Math.sin(t * 2 * Math.PI * 1980) * 0.07;
        return s * Math.exp(-2.2 * t);
      });
      case 'splash': return makeBuffer(0.3, function (t, u) {
        return ((Math.random() * 2 - 1) * 0.35 + Math.sin(t * 2 * Math.PI * 400) * 0.15) * Math.pow(1 - u, 2.5);
      });
      case 'trap_snap': return makeBuffer(0.2, function (t) {
        return ((Math.random() * 2 - 1) * 0.5 + Math.sin(t * 2 * Math.PI * 200) * 0.4) * Math.exp(-20 * t);
      });
      case 'bandit_shout': return makeBuffer(0.5, function (t, u) {
        var f = 180 + 120 * Math.sin(t * 2 * Math.PI * 5) * (1 - u);
        var s = Math.sin(t * 2 * Math.PI * f) * 0.4 + (Math.random() * 2 - 1) * 0.15;
        return s * Math.min(1, u * 5) * Math.pow(1 - u, 0.7);
      });
      default:
        return makeBuffer(0.12, function (t, u) {
          return (Math.sin(t * 2 * Math.PI * 680) * 0.25 + (Math.random() * 2 - 1) * 0.12) * Math.pow(1 - u, 2);
        });
    }
  }

  function getBuf(name) {
    if (!ensureCtx()) return null;
    if (buffers[name]) return buffers[name];
    var b = synth(name);
    buffers[name] = b;
    return b;
  }

  /** Проиграть эффект. o = {x, y} — мировая позиция для громкости по дистанции. */
  function play(name, o) {
    o = o || {};
    if (muted || !ensureCtx()) return;
    if (ac.state === 'suspended') ac.resume();
    var buf = getBuf(name);
    if (!buf) return;
    var now = ac.currentTime;
    var last = lastPlayed[name] || -1;
    var gap = o.gap !== undefined ? o.gap : 0.04;
    if (now - last < gap) return;
    lastPlayed[name] = now;

    var vol = o.vol !== undefined ? o.vol : 0.8;
    // позиционное затухание
    if (o.x !== undefined && WS.G && WS.G.player) {
      var d = WS.M.dist(o.x, o.y, WS.G.player.x, WS.G.player.y);
      if (d > 30) return;
      vol *= Math.max(0, 1 - d / 30);
    }
    var src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    var g = ac.createGain();
    g.gain.value = volume * vol;
    src.connect(g);
    g.connect(master);
    src.start(now);
    voices.push(src);
    src.onended = function () {
      var i = voices.indexOf(src);
      if (i >= 0) voices.splice(i, 1);
    };
    if (voices.length > 24) voices.shift();
  }

  // ------------------------------------------------------------- амбиент
  function noiseBuffer(sec) {
    var n = Math.floor(ac.sampleRate * sec);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Ветер: шум через фильтр, громкость зависит от погоды/укрытия. */
  function startWind() {
    if (!ensureCtx() || ambience.wind) return;
    var src = ac.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 0.7;
    var g = ac.createGain();
    g.gain.value = 0.05;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start();
    ambience.wind = src;
    ambience.windGain = g;
    ambience.windFilter = lp;
    // медленная модуляция
    var lfo = ac.createOscillator();
    lfo.frequency.value = 0.13;
    var lfoG = ac.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    lfo.start();
    ambience.windLfo = lfo;
  }

  /** Тёмный дрон (музыка выживания): два расстроенных осциллятора. */
  function startDrone() {
    if (!ensureCtx() || ambience.drone) return;
    var o1 = ac.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    var o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 82.5;
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    var g = ac.createGain();
    g.gain.value = 0.03;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
    o1.start(); o2.start();
    ambience.drone = { o1: o1, o2: o2 };
    ambience.droneGain = g;
  }

  function stopAmbience() {
    try {
      if (ambience.wind) { ambience.wind.stop(); ambience.windLfo.stop(); ambience.wind = null; ambience.windLfo = null; }
      if (ambience.drone) { ambience.drone.o1.stop(); ambience.drone.o2.stop(); ambience.drone = null; }
      if (ambience.fire) { ambience.fire.stop(); ambience.fire = null; }
    } catch (e) { /* уже остановлено */ }
    ambience.fireGain = null;
    ambience.windGain = null;
    ambience.droneGain = null;
  }

  /** Обновление амбиента: ветер от погоды, огонь от близости костра/печи. */
  function updateAmbience(dt) {
    if (muted || !ensureCtx()) return;
    if (!WS.G || !WS.G.running) return;
    if (!ambience.wind) startWind();
    if (!ambience.drone) startDrone();
    var wind = 0.03, fire = 0;
    if (WS.Weather) wind = WS.Weather.windLevel();
    if (WS.World) {
      var lights = WS.World.lightsNear(WS.G.player.x, WS.G.player.y, 8);
      for (var i = 0; i < lights.length; i++) {
        if (lights[i].fire) fire = Math.max(fire, 1 - lights[i].d / 8);
      }
    }
    if (ambience.windGain) {
      var indoor = WS.World && WS.World.isInside ? (WS.World.isInside(WS.G.player.x, WS.G.player.y) ? 0.3 : 1) : 1;
      ambience.windGain.gain.setTargetAtTime(0.02 + wind * 0.14 * indoor, ac.currentTime, 0.8);
    }
    if (ambience.droneGain) {
      var night = WS.Time ? (1 - WS.Time.light()) : 0.5;
      ambience.droneGain.gain.setTargetAtTime(0.015 + night * 0.03, ac.currentTime, 2.0);
    }
    // треск огня — редкими импульсами
    if (fire > 0.2 && Math.random() < fire * dt * 2.2) {
      play('match', { vol: fire * 0.5, gap: 0.1 });
    }
  }

  WS.boot(function initAudio() {
    // разблокировка аудио по первому клику (политика браузеров)
    document.addEventListener('pointerdown', function unlock() {
      if (ensureCtx() && ac.state === 'suspended') ac.resume();
    }, { once: true });
    // амбиент-тик
    WS.tick(41, function audioTick(dt) {
      updateAmbience(dt);
    }, 'audio:amb');
    // звуки по событиям
    WS.Ev.on('sound:play', function (d) { play(d.name, d); });
  }, 'audio:init');

  WS.def('Snd', {
    play: play,
    getBuf: getBuf,
    setVolume: function (v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = volume; },
    getVolume: function () { return volume; },
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = muted ? 0 : volume; },
    isMuted: function () { return muted; },
    stopAmbience: stopAmbience,
    ctx: function () { return ac; },
    // мастер-гейн для файловой озвучки (voice_audio.js): общий mute/громкость
    bus: function () { return master; }
  });
})();
