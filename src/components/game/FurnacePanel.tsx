'use client';

import { useRef, useState } from 'react';
import { Flame, Zap, Sparkles, MoonStar } from 'lucide-react';
import { formatNum, formatTime } from '@/game/format';
import {
  actClick, useGame,
} from '@/game/store';
import {
  autoClickRate, auroraMultiplier, clickPower, dayOfPolarNight, isAuroraActive, woodPerSec,
} from '@/game/engine';

interface FloatNum { id: number; x: number; y: number; text: string; }
let floatSeq = 0;

export function FurnacePanel() {
  const s = useGame();
  const [floats, setFloats] = useState<FloatNum[]>([]);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const wps = woodPerSec(s);
  const cp = clickPower(s);
  const acr = autoClickRate(s);
  const aurora = isAuroraActive(s);
  const auroraLeft = aurora ? Math.max(0, s.auroraUntil - s.playTime) : 0;
  const auroraSoon = !aurora ? Math.max(0, s.auroraNext - s.playTime) : 0;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const gain = actClick();
    const rect = e.currentTarget.getBoundingClientRect();
    const box = e.currentTarget.parentElement?.getBoundingClientRect() ?? rect;
    const x = (e.clientX || rect.left + rect.width / 2) - box.left;
    const y = (e.clientY || rect.top + rect.height / 2) - box.top;
    const id = ++floatSeq;
    setFloats((f) => [...f.slice(-10), { id, x, y, text: `+${formatNum(gain)}` }]);
    window.setTimeout(() => setFloats((f) => f.filter((t) => t.id !== id)), 1000);
  };

  return (
    <section className="panel-card rounded-2xl p-5 sm:p-6 flex flex-col gap-4 relative overflow-visible" aria-label="Печь">
      <header className="flex items-center justify-between">
        <h2 className="font-black uppercase tracking-widest text-sm text-slate-300">Печь</h2>
        <div className="flex items-center gap-1.5 text-xs text-slate-400" title="День полярной ночи (10 минут игры = 1 день)">
          <MoonStar className="w-4 h-4 text-indigo-200/70" aria-hidden />
          <span>День <b className="text-slate-200">{dayOfPolarNight(s)}</b></span>
        </div>
      </header>

      <div className="relative flex justify-center">
        <button
          ref={btnRef}
          type="button"
          onClick={handleClick}
          aria-label={`Рубить дрова: +${formatNum(cp)}`}
          className={`flame-btn flame-pulse w-44 h-44 sm:w-52 sm:h-52 rounded-full flex flex-col items-center justify-center gap-1 select-none cursor-pointer ${aurora ? 'aurora-hot' : ''}`}
        >
          <Flame className="w-14 h-14 sm:w-16 sm:h-16 text-white drop-shadow-lg" aria-hidden />
          <span className="font-black text-xl sm:text-2xl text-white drop-shadow">РУБИТЬ</span>
          <span className="text-sm font-bold text-amber-50/90 tabular-nums">+{formatNum(cp)}</span>
        </button>
        {/* всплывающие числа */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {floats.map((f) => (
            <span key={f.id} className="float-num text-lg" style={{ left: f.x, top: f.y }}>
              {f.text}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="panel-card rounded-xl px-3 py-2">
          <div className="text-slate-400">Добыча</div>
          <div className="font-bold text-emerald-300 text-sm tabular-nums">{formatNum(wps)}/с</div>
        </div>
        <div className="panel-card rounded-xl px-3 py-2">
          <div className="text-slate-400 flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" aria-hidden /> Автоклик
          </div>
          <div className="font-bold text-sky-300 text-sm tabular-nums">{acr > 0 ? `${acr}/с` : '—'}</div>
        </div>
      </div>

      {aurora ? (
        <div className="rounded-xl px-3 py-2 text-sm font-bold text-teal-200 bg-teal-500/10 border border-teal-400/30 flex items-center gap-2 justify-center animate-pulse">
          <Sparkles className="w-4 h-4" aria-hidden />
          СЕВЕРНОЕ СИЯНИЕ ×{auroraMultiplier(s)} — {formatTime(auroraLeft)}
        </div>
      ) : (
        <div className="rounded-xl px-3 py-2 text-xs text-slate-400 bg-white/[0.03] border border-white/5 text-center">
          Сияние через ~{formatTime(auroraSoon)}
        </div>
      )}
    </section>
  );
}
