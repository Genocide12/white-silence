'use client';

import { useEffect, useState } from 'react';
import {
  Axe, Pickaxe, RadioTower, Star, Flame, Lock, X,
} from 'lucide-react';
import { Snowfall } from '@/components/game/Snowfall';
import { FurnacePanel } from '@/components/game/FurnacePanel';
import {
  AchievementsPanel, ArtelPanel, BuyAmountToggle, CoalPanel, PrestigePanel, SettingsPanel,
  StarsPanel, StatsPanel, TABS, TelegraphPanel, UpgradesPanel,
  type BuyAmount, type TabId,
} from '@/components/game/panels';
import { formatFull, formatNum, formatTime } from '@/game/format';
import {
  clearOfflineReport, dismissEvent, startGame, takeOfflineReport, useGame, useGameEvents, useStarted,
  type GameEvent,
} from '@/game/store';
import {
  auroraMultiplier, coalPerSec, coalUnlocked, depeshiPerSec, isAuroraActive, prestigeUnlocked,
  telegraphUnlocked, woodPerSec,
} from '@/game/engine';
import { COAL_UNLOCK, PRESTIGE_UNLOCK, TELEGRAPH_UNLOCK } from '@/game/content';

function isTabLocked(s: ReturnType<typeof useGame>, id: TabId): string | null {
  switch (id) {
    case 'coal': return coalUnlocked(s) ? null : `${formatNum(COAL_UNLOCK)} дров за всё время`;
    case 'telegraph': return telegraphUnlocked(s) ? null : `${formatNum(TELEGRAPH_UNLOCK)} дров за всё время`;
    case 'prestige': return prestigeUnlocked(s) ? null : `${formatNum(PRESTIGE_UNLOCK / 10)} дров за экспедицию`;
    case 'stars': return (s.prestiges > 0 || s.totalStars > 0) ? null : 'сначала отправить экспедицию';
    default: return null;
  }
}

export default function Home() {
  const [tab, setTab] = useState<TabId>('artel');
  const [buyAmount, setBuyAmount] = useState<BuyAmount>(1);
  const [offlineClosed, setOfflineClosed] = useState(false);

  useEffect(() => {
    startGame();
  }, []);

  const started = useStarted();
  const s = useGame();
  const aurora = started ? isAuroraActive(s) : false;
  const offline = started && !offlineClosed ? takeOfflineReport() : null;

  if (!started) {
    return (
      <main className="min-h-screen flex items-center justify-center" aria-label="Загрузка">
        <div className="text-center">
          <Flame className="w-14 h-14 mx-auto text-orange-400 flame-pulse" aria-hidden />
          <p className="mt-4 text-slate-400 tracking-widest uppercase text-sm font-bold">Разжигаю печь…</p>
        </div>
      </main>
    );
  }

  const showBuyToggle = tab === 'artel' || tab === 'coal' || tab === 'telegraph';

  return (
    <main className="min-h-screen relative" aria-label="Белая Тишина: Топка">
      <div className={`aurora-band ${aurora ? 'active' : ''}`} aria-hidden />
      <Snowfall />

      {/* Верхняя панель */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#060b1a]/85 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-3 sm:gap-6 flex-wrap">
          <div className="shrink-0 leading-none">
            <h1 className="font-black text-base sm:text-xl tracking-widest text-slate-100">БЕЛАЯ ТИШИНА</h1>
            <span className="text-[10px] sm:text-xs font-bold text-teal-300/80 tracking-[0.35em] uppercase">топка</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Axe className="w-5 h-5 text-amber-300 shrink-0" aria-hidden />
            <div className="leading-tight">
              <div className="font-black text-lg sm:text-2xl text-amber-100 tabular-nums truncate" title={formatFull(s.wood)}>{formatNum(s.wood)}</div>
              <div className="text-[10px] sm:text-xs text-emerald-300/90 font-semibold tabular-nums">+{formatNum(woodPerSec(s))}/с</div>
            </div>
          </div>

          {coalUnlocked(s) && (
            <div className="hidden sm:flex items-center gap-1.5" title={`Уголь: ${formatNum(coalPerSec(s))}/с`}>
              <Pickaxe className="w-5 h-5 text-slate-300" aria-hidden />
              <span className="font-bold text-slate-200 tabular-nums">{formatNum(s.coal)}</span>
            </div>
          )}
          {telegraphUnlocked(s) && (
            <div className="hidden md:flex items-center gap-1.5" title={`Депеши: ${formatNum(depeshiPerSec(s))}/с`}>
              <RadioTower className="w-5 h-5 text-sky-300" aria-hidden />
              <span className="font-bold text-slate-200 tabular-nums">{formatNum(s.depeshi)}</span>
            </div>
          )}
          {s.totalStars > 0 && (
            <div className="flex items-center gap-1.5 ml-auto sm:ml-0" title="Полярные звёзды">
              <Star className="w-5 h-5 fill-amber-300 text-amber-300 star-twinkle" aria-hidden />
              <span className="font-black text-amber-200 tabular-nums">{formatNum(s.totalStars)}</span>
            </div>
          )}
          {aurora && (
            <div className="ml-auto sm:ml-0 rounded-full bg-teal-500/20 border border-teal-400/40 px-3 py-1 text-xs font-black text-teal-200 animate-pulse">
              СИЯНИЕ ×{auroraMultiplier(s)}
            </div>
          )}
        </div>
      </header>

      {/* Основное поле */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr] relative z-10">
        <div className="lg:sticky lg:top-[84px] h-fit">
          <FurnacePanel />
        </div>

        <section aria-label="Панели игры">
          {/* Вкладки */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 min-w-0">
              <div className="flex gap-1.5 flex-nowrap overflow-x-auto game-scroll pb-1" role="tablist" aria-label="Разделы">
                {TABS.map((t) => {
                  const locked = isTabLocked(s, t.id);
                  const active = tab === t.id;
                  const Icon = locked ? Lock : t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-disabled={!!locked}
                      onClick={() => setTab(t.id)}
                      title={locked ? `Закрыто: нужно ${locked}` : t.label}
                      className={`flex items-center gap-1.5 rounded-xl px-3 min-h-[40px] sm:min-h-[44px] text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                        active
                          ? 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                          : locked
                            ? 'bg-white/[0.02] border-white/5 text-slate-600'
                            : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden />
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#060b1a] to-transparent" />
            </div>
            {showBuyToggle && <div className="shrink-0"><BuyAmountToggle value={buyAmount} onChange={setBuyAmount} /></div>}
          </div>

          {/* Панель */}
          <div className="lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto game-scroll lg:pr-1.5 pb-8">
            {tab === 'artel' && <ArtelPanel buyAmount={buyAmount} />}
            {tab === 'upgrades' && <UpgradesPanel />}
            {tab === 'coal' && <CoalPanel buyAmount={buyAmount} />}
            {tab === 'telegraph' && <TelegraphPanel buyAmount={buyAmount} />}
            {tab === 'prestige' && <PrestigePanel />}
            {tab === 'stars' && <StarsPanel />}
            {tab === 'achievements' && <AchievementsPanel />}
            {tab === 'stats' && <StatsPanel />}
            {tab === 'settings' && <SettingsPanel />}
          </div>
        </section>
      </div>

      {/* Оффлайн-доход */}
      {offline && offline.wood + offline.coal + offline.depeshi > 0 && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Оффлайн-доход">
          <div className="panel-card rounded-2xl p-6 max-w-sm w-full bg-[#0a1226]">
            <h2 className="font-black text-xl text-amber-100">Пока тебя не было…</h2>
            <p className="text-sm text-slate-400 mt-1">
              Артель честно пилила {formatTime(offline.seconds)} и принесла к порогу:
            </p>
            <ul className="mt-3 space-y-1.5 text-sm font-bold">
              <li className="text-amber-200"><span aria-hidden>🪵</span> {formatNum(offline.wood)} дров</li>
              {offline.coal > 0.01 && <li className="text-slate-200"><span aria-hidden>⛏</span> {formatNum(offline.coal)} угля</li>}
              {offline.depeshi > 0.01 && <li className="text-sky-300"><span aria-hidden>📡</span> {formatNum(offline.depeshi)} депеш</li>}
            </ul>
            <button
              type="button"
              autoFocus
              onClick={() => { setOfflineClosed(true); clearOfflineReport(); }}
              className="mt-5 w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-3 cursor-pointer transition-colors"
            >
              Принять и топить дальше
            </button>
          </div>
        </div>
      )}

      <EventToaster />
    </main>
  );
}

function EventToaster() {
  const visible = useGameEvents();

  if (visible.length === 0) return null;

  const tone: Record<GameEvent['kind'], string> = {
    achievement: 'border-amber-400/40 bg-amber-400/10',
    milestone: 'border-teal-400/40 bg-teal-400/10',
    aurora: 'border-teal-300/50 bg-teal-300/15',
    info: 'border-white/15 bg-white/5',
    prestige: 'border-amber-300/60 bg-amber-300/15',
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-2 max-w-xs w-full" aria-live="polite">
      {visible.map((e) => (
        <div key={e.id} className={`toast-in rounded-xl border px-3.5 py-2.5 backdrop-blur-md ${tone[e.kind]}`}>
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <p className="font-black text-sm text-slate-100">{e.title}</p>
              <p className="text-xs text-slate-300/90 leading-snug">{e.text}</p>
            </div>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => dismissEvent(e.id)}
              className="text-slate-400 hover:text-slate-200 shrink-0 cursor-pointer p-2 -m-1.5"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
