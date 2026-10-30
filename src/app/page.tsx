'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine, HudSnapshot } from '@/game/engine';
import { GameState } from '@/game/state';
import { ITEMS, RECIPES, NOTES, itemName, itemWeight, INV_MAX_SLOTS, EQUIP_SLOTS } from '@/game/items';
import { SKILL_NAMES, SKILL_DESC } from '@/game/state';
import { audio } from '@/game/audio';

type Panel = null | 'inv' | 'craft' | 'skills' | 'notes' | 'help' | 'pause' | 'note';

interface NoteView { id: string; title: string; text: string; place: string }

const CAT_NAMES: Record<string, string> = {
  basics: 'Основа', tools: 'Инструменты', camp: 'Лагерь', food: 'Еда', cloth: 'Одежда', build: 'Стройка', signal: 'Сигнал',
};

function Bar({ value, max = 100, color, icon, label }: { value: number; max?: number; color: string; icon: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-center text-sm select-none">{icon}</span>
      <div className="relative h-3 w-36 overflow-hidden rounded-full border border-white/15 bg-black/50">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-9 text-[10px] tabular-nums text-white/70">{Math.round(value)}</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [noteView, setNoteView] = useState<NoteView | null>(null);
  const [invVersion, setInvVersion] = useState(0);
  const [craftCat, setCraftCat] = useState('basics');
  const [menuScreen, setMenuScreen] = useState<'main' | 'intro'>('main');
  const [hasSave, setHasSave] = useState(false);
  const [uiTick, setUiTick] = useState(0);
  const panelRef = useRef<Panel>(null);
  panelRef.current = panel;

  useEffect(() => {
    setHasSave(Engine.hasSave());
  }, []);

  // ----------------------------------------------------------
  // старт игры
  // ----------------------------------------------------------
  const startGame = useCallback((mode: 'new' | 'continue') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let state: GameState | null = null;
    if (mode === 'continue') state = Engine.load();
    if (mode === 'new') Engine.clearSave();
    const seed = mode === 'new' ? (Math.floor(Math.random() * 100000) + 1) : (state?.seed ?? 4242);
    audio.init();
    audio.resume();
    const engine = new Engine(canvas, seed, state ?? undefined);
    engine.onUi = () => setUiTick(t => t + 1);
    engine.onNote = (noteId) => {
      const n = NOTES.find(x => x.id === noteId);
      if (n) setNoteView(n);
    };
    engine.onDeath = () => setUiTick(t => t + 1);
    engine.onRescue = () => setUiTick(t => t + 1);
    engineRef.current = engine;
    (window as any).__game = engine; // для отладки/QA
    engine.attach();
    setStarted(true);
  }, []);

  // ----------------------------------------------------------
  // цикл опроса HUD
  // ----------------------------------------------------------
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const e = engineRef.current;
      if (e) setHud(e.getHud());
    }, 150);
    return () => clearInterval(id);
  }, [started]);

  // ----------------------------------------------------------
  // клавиши интерфейса
  // ----------------------------------------------------------
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const eng = engineRef.current;
      if (!eng) return;
      audio.resume();
      if (eng.state.player.dead) {
        if (k === 'enter' || k === 'escape') restart();
        return;
      }
      if (eng.state.gameOver && eng.state.rescued) {
        if (k === 'enter' || k === 'escape') restart();
        return;
      }
      if (noteView) {
        if (k === 'escape' || k === 'e' || k === 'enter') setNoteView(null);
        return;
      }
      switch (k) {
        case 'tab': case 'i': case 'ш':
          e.preventDefault();
          togglePanel('inv');
          break;
        case 'c': case 'с':
          togglePanel('craft');
          break;
        case 'k': case 'л':
          togglePanel('skills');
          break;
        case 'j': case 'о':
          togglePanel('notes');
          break;
        case 'h': case 'р':
          togglePanel('help');
          break;
        case 'escape':
          if (panelRef.current) togglePanel(null);
          else togglePanel('pause');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, noteView]);

  const togglePanel = useCallback((p: Panel) => {
    setPanel(prev => {
      const next = prev === p ? null : p;
      const eng = engineRef.current;
      if (eng) eng.uiFocus = next !== null;
      audio.ui();
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    Engine.clearSave();
    const eng = engineRef.current;
    if (eng) eng.detach();
    engineRef.current = null;
    setStarted(false);
    setPanel(null);
    setHud(null);
    setHasSave(false);
    setMenuScreen('main');
  }, []);

  // ----------------------------------------------------------
  // мышь на канвасе
  // ----------------------------------------------------------
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !started) return;
    const onMove = (e: MouseEvent) => {
      const eng = engineRef.current;
      if (eng) { eng.mouseX = e.clientX; eng.mouseY = e.clientY; }
    };
    const onDown = (e: MouseEvent) => {
      const eng = engineRef.current;
      if (!eng || eng.uiFocus) return;
      audio.resume();
      if (e.button === 0) eng.playerAttack();
    };
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mousedown', onDown);
    return () => {
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mousedown', onDown);
    };
  }, [started]);

  // ----------------------------------------------------------
  // виртуальный джойстик (мобильные)
  // ----------------------------------------------------------
  const joyRef = useRef<HTMLDivElement>(null);
  const [joyKnob, setJoyKnob] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    const el = joyRef.current;
    if (!el || !started) return;
    let active = false;
    let cx = 0, cy = 0;
    const R = 44;
    const setKnob = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy);
      const k = len > R ? R / len : 1;
      const kx = dx * k, ky = dy * k;
      setJoyKnob([kx, ky]);
      const eng = engineRef.current;
      if (eng) {
        // экранные координаты -> мировые (изометрия)
        const wx = (kx / R + ky / R * 2) * 0.7;
        const wy = (ky / R * 2 - kx / R) * 0.7;
        eng.virtualMove = [wx, wy];
      }
    };
    const down = (e: PointerEvent) => {
      active = true;
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      setKnob(e.clientX - cx, e.clientY - cy);
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      setKnob(e.clientX - cx, e.clientY - cy);
    };
    const up = () => {
      active = false;
      setJoyKnob([0, 0]);
      const eng = engineRef.current;
      if (eng) eng.virtualMove = [0, 0];
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [started]);

  const eng = engineRef.current;
  const g = eng?.state;

  const weatherIcon = hud ? ({ clear: '✦', overcast: '☁', snowfall: '❄', blizzard: '❅' } as Record<string, string>)[hud.weather] || '' : '';

  return (
    <main className="relative h-screen w-full select-none overflow-hidden bg-[#0a0e1a]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* игровой canvas — монтируется всегда, чтобы движок не терял ссылку */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ============================================================ */}
      {/* МЕНЮ (оверлей) */}
      {/* ============================================================ */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
          <div className="pointer-events-none absolute inset-0" style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 20%, #1b2b45 0%, #0a0e1a 70%), radial-gradient(ellipse 40% 30% at 70% 80%, #14202f 0%, transparent 60%)',
          }} />
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{
            background: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,0.02) 3px 4px)',
          }} />
          {menuScreen === 'main' ? (
            <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.5em] text-sky-300/70">выживание на полярной станции</div>
                <h1 className="bg-gradient-to-b from-sky-100 to-sky-400 bg-clip-text text-6xl font-black text-transparent drop-shadow-[0_0_30px_rgba(125,211,252,0.35)] md:text-7xl">
                  БЕЛАЯ ТИШИНА
                </h1>
                <div className="text-sm text-white/50">«Восток-7» · полярная ночь · −42 °C</div>
              </div>
              <div className="flex flex-col gap-3 w-72">
                {hasSave && (
                  <button
                    onClick={() => startGame('continue')}
                    className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-6 py-3 text-lg font-semibold text-sky-100 shadow-[0_0_24px_rgba(56,189,248,0.25)] transition hover:bg-sky-500/35 hover:shadow-[0_0_36px_rgba(56,189,248,0.45)]"
                  >
                    Продолжить
                  </button>
                )}
                <button
                  onClick={() => startGame('new')}
                  className={`px-6 py-3 text-lg font-semibold transition rounded-lg border ${hasSave ? 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10' : 'border-sky-400/40 bg-sky-500/20 text-sky-100 shadow-[0_0_24px_rgba(56,189,248,0.25)] hover:bg-sky-500/35'}`}
                >
                  Новая игра
                </button>
                <button
                  onClick={() => setMenuScreen('intro')}
                  className="rounded-lg border border-white/10 px-6 py-2 text-sm text-white/50 transition hover:bg-white/5 hover:text-white/80"
                >
                  Как играть
                </button>
              </div>
              <div className="max-w-md text-xs leading-relaxed text-white/35">
                Изометрический выживач: добывай ресурсы, охоться, крафти, греись у костра, строй радиомачту и подай сигнал спасения. Волки и медведи активнее ночью.
              </div>
            </div>
          ) : (
            <div className="relative z-10 max-h-[86vh] max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-white/10 bg-black/60 p-8 text-sm leading-relaxed text-white/80 backdrop-blur">
              <h2 className="text-2xl font-bold text-sky-200">Как играть</h2>
              <ul className="space-y-1.5">
                <li><b className="text-white">WASD</b> — движение · <b className="text-white">Shift</b> — бег (тратит силы)</li>
                <li><b className="text-white">ЛКМ / Пробел</b> — атака, рубка деревьев и добыча камня</li>
                <li><b className="text-white">E</b> — взаимодействие: поднять, обыскать, рыбачить, спать</li>
                <li><b className="text-white">F</b> — разжечь/погасить костёр (2 древесины)</li>
                <li><b className="text-white">Tab / I</b> — инвентарь · <b className="text-white">C</b> — крафт · <b className="text-white">K</b> — навыки · <b className="text-white">J</b> — записки · <b className="text-white">H</b> — помощь</li>
                <li><b className="text-white">1–3</b> — зум камеры · <b className="text-white">Esc</b> — пауза</li>
              </ul>
              <div className="border-t border-white/10 pt-3 text-white/60">
                <b className="text-sky-200">Выживание:</b> следи за теплом (одежда + костёр + здания), голодом, жаждой (кипяти воду!), сном и здоровьем. Волки боятся огня. Медведь у северных скал — смертелен без оружия. Цель: собрать радиомачту (крафт → «Сигнал»), найти батарею на складе и подать сигнал бедствия у радио в радиорубке.
              </div>
              <button onClick={() => setMenuScreen('main')} className="mt-2 rounded-lg border border-sky-400/40 bg-sky-500/20 px-5 py-2 font-semibold text-sky-100 transition hover:bg-sky-500/35">
                Назад
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* ИГРА */}
      {/* ============================================================ */}

      {/* ---------- HUD: статсы слева сверху ---------- */}
      {hud && !hud.dead && (
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/45 p-3 backdrop-blur-sm">
          <Bar value={hud.hp} color="linear-gradient(90deg,#dc2626,#ef4444)" icon="❤" label="Здоровье" />
          <Bar value={hud.hunger} color="linear-gradient(90deg,#b45309,#f59e0b)" icon="🍖" label="Сытость" />
          <Bar value={hud.thirst} color="linear-gradient(90deg,#0369a1,#38bdf8)" icon="💧" label="Жажда" />
          <Bar value={hud.energy} color="linear-gradient(90deg,#4d7c0f,#a3e635)" icon="⚡" label="Энергия" />
          <Bar value={hud.warmth} color="linear-gradient(90deg,#7c3aed,#e879f9)" icon="🔥" label="Тепло" />
          {hud.sick > 0 && <Bar value={hud.sick} color="linear-gradient(90deg,#65a30d,#84cc16)" icon="🤢" label="Хворь" />}
          {hud.bleeding && <div className="animate-pulse text-[11px] font-bold text-red-400">⚠ Кровотечение! Бинтуй (Tab → бинт)</div>}
        </div>
      )}

      {/* ---------- HUD: время/погода справа сверху ---------- */}
      {hud && !hud.dead && (
        <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-right backdrop-blur-sm">
          <div className="text-lg font-bold tabular-nums text-white">День {hud.day} · {hud.timeStr}</div>
          <div className="text-sm text-white/70">{weatherIcon} {hud.weather} · {hud.temp} °C</div>
          <div className={`text-xs ${hud.weight > hud.maxWeight ? 'text-red-400' : 'text-white/50'}`}>⚖ {hud.weight} / {hud.maxWeight} кг</div>
          {hud.rescued && (
            <div className="animate-pulse rounded bg-green-500/20 px-2 py-0.5 text-xs font-bold text-green-300">
              🚁 Вертолёт через {Math.ceil(hud.rescueT)} мин — будь у мачты!
            </div>
          )}
        </div>
      )}

      {/* ---------- кнопки панелей ---------- */}
      {hud && !hud.dead && (
        <div className="absolute right-3 top-24 flex flex-col gap-1.5" style={{ pointerEvents: 'auto' }}>
          {[
            { p: 'inv' as Panel, label: 'Рюкзак', key: 'Tab' },
            { p: 'craft' as Panel, label: 'Крафт', key: 'C' },
            { p: 'skills' as Panel, label: 'Навыки', key: 'K' },
            { p: 'notes' as Panel, label: 'Записки', key: 'J' },
            { p: 'help' as Panel, label: 'Помощь', key: 'H' },
          ].map(x => (
            <button key={x.p} onClick={() => togglePanel(x.p)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition ${panel === x.p ? 'border-sky-400/60 bg-sky-500/30 text-white' : 'border-white/10 bg-black/45 text-white/70 hover:bg-white/10'}`}>
              {x.label} <span className="text-white/35">[{x.key}]</span>
            </button>
          ))}
        </div>
      )}

      {/* ---------- подсказка взаимодействия ---------- */}
      {hud && hud.nearHint && !hud.dead && !panel && !noteView && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-sky-300/30 bg-black/60 px-4 py-1.5 text-sm text-sky-100 backdrop-blur-sm md:bottom-16">
          {hud.nearHint}
        </div>
      )}

      {/* ---------- тосты ---------- */}
      {g && (
        <div className="pointer-events-none absolute bottom-40 left-1/2 flex w-96 max-w-[90vw] -translate-x-1/2 flex-col items-center gap-1 md:bottom-36">
          {g.toasts.map(t => (
            <div key={t.id} className={`rounded-md border px-3 py-1 text-xs backdrop-blur-sm ${t.kind === 'bad' ? 'border-red-400/40 bg-red-950/70 text-red-200' : t.kind === 'good' ? 'border-green-400/40 bg-green-950/70 text-green-200' : t.kind === 'craft' ? 'border-amber-400/40 bg-amber-950/70 text-amber-200' : 'border-white/15 bg-black/60 text-white/85'}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* ---------- прогресс работы ---------- */}
      {hud && hud.craftName && !hud.dead && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 w-64 -translate-x-1/2">
          <div className="mb-1 text-center text-xs text-white/80">{hud.craftName}</div>
          <div className="h-2 overflow-hidden rounded-full border border-white/20 bg-black/60">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${hud.craftPct * 100}%` }} />
          </div>
        </div>
      )}

      {/* ---------- мобильный джойстик ---------- */}
      <div ref={joyRef} className="absolute bottom-6 left-6 z-10 flex h-24 w-24 touch-none items-center justify-center rounded-full border border-white/20 bg-white/5 backdrop-blur-sm md:hidden" style={{ pointerEvents: 'auto' }}>
        <div className="h-10 w-10 rounded-full bg-white/40" style={{ transform: `translate(${joyKnob[0]}px, ${joyKnob[1]}px)` }} />
      </div>
      {hud && !hud.dead && (
        <div className="absolute bottom-8 right-6 z-10 flex flex-col gap-2 md:hidden" style={{ pointerEvents: 'auto' }}>
          <button onPointerDown={() => engineRef.current?.interact()} className="h-14 w-14 rounded-full border border-sky-300/40 bg-sky-500/30 text-sm font-bold text-white backdrop-blur">E</button>
          <button onPointerDown={() => engineRef.current?.playerAttack()} className="h-14 w-14 rounded-full border border-red-300/40 bg-red-500/30 text-lg font-bold text-white backdrop-blur">⚔</button>
          <button onPointerDown={() => togglePanel('inv')} className="h-14 w-14 rounded-full border border-white/25 bg-black/40 text-lg text-white backdrop-blur">🎒</button>
        </div>
      )}

      {/* ============================================================ */}
      {/* ПАНЕЛИ */}
      {/* ============================================================ */}
      {panel && g && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) togglePanel(null); }}>
          <div className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/15 bg-[#101725]/95 p-5 shadow-2xl">

            {/* ---------- ИНВЕНТАРЬ ---------- */}
            {panel === 'inv' && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">🎒 Инвентарь <span className="text-sm font-normal text-white/40">({g.inv.length}/{INV_MAX_SLOTS} · {hud?.weight}/{hud?.maxWeight} кг)</span></h2>
                  <button onClick={() => togglePanel(null)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-white/60 hover:bg-white/10">Esc</button>
                </div>
                {/* экипировка */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {EQUIP_SLOTS.map(s => {
                    const id = g.equip[s.key];
                    const d = id ? ITEMS[id] : null;
                    return (
                      <button key={s.key}
                        onClick={() => { if (id) { g.unequipSlot(s.key); setInvVersion(v => v + 1); audio.ui(); } }}
                        title={d ? `${d.name} · тепло ${d.warmth} · клик — снять` : 'Пусто'}
                        className={`flex min-w-28 flex-col items-center rounded-lg border px-3 py-2 text-center text-xs ${d ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-black/30 text-white/30'}`}>
                        <span className="text-white/40">{s.name}</span>
                        <span className="font-semibold">{d ? d.name : '—'}</span>
                        {d && <span className="text-[10px] text-amber-300/70">тепло +{d.warmth}</span>}
                      </button>
                    );
                  })}
                  <div className="flex items-center rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 text-xs text-sky-200">
                    🌡 Суммарное тепло: +{g.totalWarmth().toFixed(1)}
                  </div>
                </div>
                {/* сетка предметов */}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {g.inv.map((slot, i) => {
                    const d = ITEMS[slot.id];
                    if (!d) return null;
                    return (
                      <div key={i} className="group relative flex flex-col rounded-lg border border-white/10 bg-black/40 p-2 text-center">
                        <div className="text-2xl">{itemIcon(d)}</div>
                        <div className="mt-1 truncate text-[11px] font-medium text-white/90" title={d.desc}>{d.name}</div>
                        <div className="text-[10px] text-white/40">{slot.n > 1 && `×${slot.n}`} · {d.weight} кг</div>
                        <div className="mt-1 flex gap-1">
                          <button onClick={() => { g.useItem(i); setInvVersion(v => v + 1); audio.ui(); }}
                            className="flex-1 rounded bg-sky-500/25 px-1 py-0.5 text-[10px] text-sky-100 hover:bg-sky-500/45">
                            {d.slot ? 'Надеть' : (d.cat === 'med' || d.cat === 'food' || d.cat === 'drink') ? 'Употребить' : 'Осмотреть'}
                          </button>
                          <button onClick={() => { g.removeItem(slot.id, 1); g.world.addGroundItem(g.player.x, g.player.y, slot.id, 1); setInvVersion(v => v + 1); }}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-red-500/30 hover:text-red-200" title="Выбросить">✕</button>
                        </div>
                      </div>
                    );
                  })}
                  {Array.from({ length: Math.max(0, INV_MAX_SLOTS - g.inv.length) }).map((_, i) => (
                    <div key={`e${i}`} className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/8 text-white/10">·</div>
                  ))}
                </div>
              </div>
            )}

            {/* ---------- КРАФТ ---------- */}
            {panel === 'craft' && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">🔨 Крафт</h2>
                  <button onClick={() => togglePanel(null)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-white/60 hover:bg-white/10">Esc</button>
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {Object.entries(CAT_NAMES).map(([k, v]) => (
                    <button key={k} onClick={() => setCraftCat(k)}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${craftCat === k ? 'bg-sky-500/30 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{v}</button>
                  ))}
                </div>
                <div className="space-y-2">
                  {RECIPES.filter(r => r.cat === craftCat).map(r => {
                    const chk = g.canCraft(r.id);
                    const working = g.player.craftRecipe === r.id;
                    return (
                      <div key={r.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${chk.ok ? 'border-white/15 bg-black/30' : 'border-white/5 bg-black/20 opacity-60'}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                            {r.name}
                            {working && <span className="animate-pulse text-xs text-amber-300">делаю… {Math.round((g.player.craftT / r.minutes) * 100)}%</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                            {(r.need || []).map(nd => {
                              const have = g.invCount(nd.id);
                              return (
                                <span key={nd.id} className={have >= nd.n ? 'text-white/60' : 'text-red-400/80'}>
                                  {itemName(nd.id)} ×{nd.n} <span className="text-white/35">({have})</span>
                                </span>
                              );
                            })}
                            {r.atFire && <span className={g.fireNear(g.player.x, g.player.y, 2.2) ? 'text-orange-300' : 'text-red-400/80'}>🔥 нужен огонь</span>}
                            {r.needSkill && <span className={g.skills[r.needSkill.id].lvl >= r.needSkill.lvl ? 'text-white/60' : 'text-red-400/80'}>навык: {SKILL_NAMES[r.needSkill.id]} ур.{r.needSkill.lvl}</span>}
                            <span className="text-white/30">~{r.minutes} мин</span>
                          </div>
                          {r.hint && <div className="text-[10px] text-white/35">{r.hint}</div>}
                        </div>
                        <button
                          disabled={!chk.ok}
                          onClick={() => { g.startCraft(r.id); setInvVersion(v => v + 1); }}
                          className={`rounded-lg px-4 py-2 text-xs font-bold transition ${chk.ok ? 'bg-amber-500/25 text-amber-200 hover:bg-amber-500/40' : 'cursor-not-allowed bg-white/5 text-white/25'}`}>
                          {working ? '…' : 'Создать'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------- НАВЫКИ ---------- */}
            {panel === 'skills' && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">📈 Навыки</h2>
                  <button onClick={() => togglePanel(null)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-white/60 hover:bg-white/10">Esc</button>
                </div>
                <div className="space-y-3">
                  {Object.entries(SKILL_NAMES).map(([k, name]) => {
                    const s = g.skills[k];
                    const pct = (s.xp / s.xpNext) * 100;
                    return (
                      <div key={k}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-semibold text-white/90">{name} <span className="text-amber-300">ур. {s.lvl}</span></span>
                          <span className="text-[10px] text-white/40">{SKILL_DESC[k]}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/50">
                          <div className="h-full bg-gradient-to-r from-sky-600 to-sky-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/60">
                  Статистика: убито зверей — {g.stats.killed}, срублено деревьев — {g.stats.chopped}, crafted — {g.stats.crafted}, рыбы поймано — {g.stats.caught}, съедено — {g.stats.eaten}.
                </div>
              </div>
            )}

            {/* ---------- ЗАПИСКИ ---------- */}
            {panel === 'notes' && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">📜 Записки ({g.notesFound.length}/{NOTES.length})</h2>
                  <button onClick={() => togglePanel(null)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-white/60 hover:bg-white/10">Esc</button>
                </div>
                {g.notesFound.length === 0 ? (
                  <div className="py-8 text-center text-sm text-white/40">Ты пока не нашёл ни одной записки.<br />Обшарь здания станции — ящики, столы, шкафы.</div>
                ) : (
                  <div className="space-y-2">
                    {g.notesFound.map(id => {
                      const n = NOTES.find(x => x.id === id)!;
                      return (
                        <button key={id} onClick={() => { setNoteView(n); audio.ui(); }}
                          className="w-full rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-left transition hover:bg-amber-950/40">
                          <div className="text-sm font-bold text-amber-200">{n.title}</div>
                          <div className="text-xs text-white/50">найдено: {n.place}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---------- ПОМОЩЬ ---------- */}
            {panel === 'help' && (
              <div className="space-y-3 text-sm text-white/80">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">❔ Помощь</h2>
                  <button onClick={() => togglePanel(null)} className="rounded-lg border border-white/10 px-3 py-1 text-sm text-white/60 hover:bg-white/10">Esc</button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="mb-1 font-bold text-sky-200">Управление</div>
                    <ul className="space-y-1 text-xs">
                      <li><b>WASD</b> — движение, <b>Shift</b> — бег</li>
                      <li><b>ЛКМ/Пробел</b> — атака/рубка/добыча</li>
                      <li><b>E</b> — взаимодействие</li>
                      <li><b>F</b> — костёр · <b>1–3</b> — зум</li>
                      <li><b>Tab</b> рюкзак · <b>C</b> крафт · <b>K</b> навыки · <b>J</b> записки</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="mb-1 font-bold text-sky-200">Цель игры</div>
                    <ul className="space-y-1 text-xs">
                      <li>Выживать: тепло, еда, вода, сон</li>
                      <li>Сделать топор → дрова → костёр</li>
                      <li>Сшить меховую одежду из шкур</li>
                      <li>Собрать радиомачту (крафт → Сигнал)</li>
                      <li>Найти батарею (склад) → подать сигнал с радио</li>
                      <li>Дожить до вертолёта у мачты</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="mb-1 font-bold text-sky-200">Опасности</div>
                    <ul className="space-y-1 text-xs">
                      <li>🔥 Холод: мёрзнешь ночью и в метель</li>
                      <li>🐺 Волки: ночью агрессивны, боятся огня</li>
                      <li>🐻 Медведь: у северных скал, очень силён</li>
                      <li>🍖 Сырое мясо и сырая вода — болезнь</li>
                      <li>🩸 Укусы кровоточат — нужен бинт</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="mb-1 font-bold text-sky-200">Советы</div>
                    <ul className="space-y-1 text-xs">
                      <li>Вскипяти воду из полыньи/снега</li>
                      <li>Печь в жилом модуле греет весь дом</li>
                      <li>Факел в рюкзаке отпугивает волков</li>
                      <li>Иглу + спальник = ночёвка в глуши</li>
                      <li>Автосохранение каждые 30 мин</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- ПАУЗА ---------- */}
            {panel === 'pause' && (
              <div className="mx-auto max-w-sm space-y-3 text-center">
                <h2 className="text-2xl font-bold text-white">Пауза</h2>
                <div className="text-sm text-white/50">День {hud?.day}, {hud?.timeStr} · {hud?.temp} °C</div>
                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={() => { engineRef.current?.save(); setHasSave(true); g.toast('Сохранено', 'good'); togglePanel(null); }}
                    className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-6 py-2.5 font-semibold text-sky-100 hover:bg-sky-500/35">💾 Сохранить</button>
                  <button onClick={() => togglePanel(null)}
                    className="rounded-lg border border-white/20 bg-white/5 px-6 py-2.5 font-semibold text-white/80 hover:bg-white/10">▶ Продолжить</button>
                  <button onClick={restart}
                    className="rounded-lg border border-red-400/30 px-6 py-2 text-sm text-red-300 hover:bg-red-500/15">Выйти в меню (сейв сохранён)</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- записка ---------- */}
      {noteView && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setNoteView(null)}>
          <div className="max-w-md rotate-[-1deg] rounded-lg border border-amber-900/50 p-6 shadow-2xl" style={{ background: 'linear-gradient(160deg,#e8dcc0,#d4c5a0)' }}>
            <div className="mb-1 text-xs italic text-amber-900/60">станция «Восток-7»</div>
            <h3 className="mb-3 text-lg font-bold text-amber-950">{noteView.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-950/90">{noteView.text}</p>
            <div className="mt-4 text-right text-[10px] text-amber-900/50">{noteView.place}</div>
            <div className="mt-3 text-center">
              <button onClick={() => setNoteView(null)} className="rounded border border-amber-900/40 bg-amber-100/40 px-4 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100/70">
                Убрать записку (E / Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- СМЕРТЬ ---------- */}
      {hud?.dead && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-4 backdrop-blur">
          <div className="max-w-md space-y-4 text-center">
            <div className="text-6xl">💀</div>
            <h2 className="text-4xl font-black text-red-300">ТЫ ПОГИБ</h2>
            <p className="text-white/70">{hud.deathReason}</p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/60">
              Прожито дней: <b className="text-white">{hud.day}</b> · убито зверей: <b className="text-white">{g?.stats.killed}</b> · срублено: <b className="text-white">{g?.stats.chopped}</b> · crafted: <b className="text-white">{g?.stats.crafted}</b>
            </div>
            <button onClick={restart} className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-8 py-3 font-bold text-sky-100 hover:bg-sky-500/35">
              Начать заново (Enter)
            </button>
          </div>
        </div>
      )}

      {/* ---------- ФИНАЛ ---------- */}
      {hud && !hud.dead && hud.gameOver && hud.rescued && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-sky-950/90 to-black/90 p-4 backdrop-blur">
          <div className="max-w-lg space-y-4 text-center">
            <div className="text-6xl animate-bounce">🚁</div>
            <h2 className="text-4xl font-black text-sky-200">СПАСЕНИЕ ПРИБЫЛО</h2>
            <p className="text-white/75">Вертолёт МИ-8 сел у мачты. Пилот машет тебе рукой.<br />Ты выжил в Белой тишине.</p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/60">
              Дней в полярной ночи: <b className="text-white">{hud.day}</b> · убито зверей: <b className="text-white">{g?.stats.killed}</b> · записок найдено: <b className="text-white">{g?.notesFound.length}/{NOTES.length}</b> · crafted: <b className="text-white">{g?.stats.crafted}</b>
            </div>
            <button onClick={restart} className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-8 py-3 font-bold text-sky-100 hover:bg-sky-500/35">
              Ещё раз (Enter)
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function itemIcon(d: { cat: string; id: string }): string {
  if (d.id.includes('Axe') || d.id.includes('axe')) return '🪓';
  if (d.id.includes('Pick')) return '⛏';
  if (d.id === 'knife') return '🔪';
  if (d.id === 'saw') return '🪚';
  if (d.id === 'pot') return '🍲';
  if (d.id === 'torch') return '🕯';
  if (d.id === 'lantern') return '🏮';
  if (d.id === 'fishingRod') return '🎣';
  if (d.id === 'bow') return '🏹';
  if (d.id === 'arrow') return '➶';
  if (d.id === 'spear') return '🔱';
  if (d.cat === 'mat') {
    if (d.id === 'wood' || d.id === 'log') return '🪵';
    if (d.id === 'stone') return '🪨';
    if (d.id === 'wire' || d.id === 'scrap') return '⚙';
    if (d.id === 'rope') return '🪢';
    if (d.id === 'cloth') return '🧵';
    if (d.id === 'feather') return '🪶';
    if (d.id === 'bone') return '🦴';
    if (d.id === 'fat') return '🧈';
    if (d.id.includes('hide') || d.id.includes('Hide')) return '🟫';
    if (d.id === 'snowBlock') return '⬜';
    if (d.id === 'battery') return '🔋';
    if (d.id === 'antenna') return '📡';
    return '📦';
  }
  if (d.cat === 'food') {
    if (d.id === 'berries') return '🫐';
    if (d.id.includes('raw')) return '🥩';
    if (d.id.includes('cooked') || d.id.includes('dried')) return '🍖';
    if (d.id.includes('Fish')) return '🐟';
    if (d.id.includes('Stew')) return '🥫';
    if (d.id.includes('cracker')) return '🍪';
    if (d.id.includes('choco')) return '🍫';
    if (d.id.includes('coffee')) return '☕';
    return '🍽';
  }
  if (d.cat === 'drink') return d.id === 'coffee' ? '☕' : '💧';
  if (d.cat === 'med') return d.id === 'bandage' ? '🩹' : d.id === 'medkit' ? '🧰' : '🌿';
  if (d.cat === 'cloth') return '🧥';
  return '❔';
}
