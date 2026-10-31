'use client';

import { useEffect, useState } from 'react';
import {
  Axe, Slice, Users, Factory, Building2, Ship, TrainFront, Waves, Atom, Rocket,
  Pickaxe, Mountain, Warehouse, KeyRound, RadioTower, GraduationCap,
  Compass, Star, Trophy, BarChart3, Settings, Lock, Check, Zap, Sparkles,
  Copy, Download, Upload, Trash2, Wrench, BookOpen, Flame, Snowflake,
  Home, CookingPot, Crosshair, ScrollText, Landmark, Search, Package, PawPrint,
  Newspaper, Radio, MoonStar, type LucideIcon,
} from 'lucide-react';
import type { GameState } from '@/game/engine';
import {
  coalPerSec, depeshiPerSec, furnaceCost, furnaceStep, genMult, generatorCost, genVisible,
  globalMult, isAuroraActive, maxBuyCount, maxBuyFurnace, maxBuyMine, maxBuyTelegraph,
  mineCost, prestigeGain, prestigeUnlocked, starBonusPerStar, telegraphCost,
  coalUnlocked, telegraphUnlocked, totalGenerators, upgradeAvailable, woodPerSec,
  deserialize, SAVE_KEY, scavengeCost, buildingUnlocked, craftUnlocked, craftCost,
  huntCost, huntUnlocked, uniqueItems, totalHunts, craftEffects, profession, radioThreshold, gazetteMilestone,
} from '@/game/engine';
import {
  ACHIEVEMENTS, GENERATORS, INVENTIONS, MILESTONES, MINES, STAR_UPGRADES, TELEGRAPHS, UPGRADES,
  COAL_UNLOCK, PRESTIGE_UNLOCK, TELEGRAPH_UNLOCK,
  type UpgradeDef,
} from '@/game/content';
import {
  BUILDINGS, BEASTS, CRAFTS, PROFESSIONS, ENDINGS, NOTES, RADIO, GAZETTE, BESTIARY, WINTER_RULES,
  CAT_RU_CRAFT, itemTier, TIER_RU, itemName, ALL_ITEMS, TOTAL_ITEMS, calendarDay,
} from '@/game/legacy';
import { formatNum, formatFull, formatTime } from '@/game/format';
import {
  actBuyFurnace, actBuyGen, actBuyInvention, actBuyMine, actBuyStarUpgrade, actBuyTelegraph,
  actBuyUpgrade, actPrestige, hardReset, saveGame, setAutoBuy, setAutoFurnace, useGame,
  actScavenge, actCraft, actHunt, actChooseProfession, applyImportedSave,
} from '@/game/store';

export type TabId =
  | 'village' | 'craft' | 'hunt' | 'artel' | 'upgrades' | 'coal' | 'telegraph' | 'prestige'
  | 'stars' | 'chronicle' | 'endings' | 'achievements' | 'stats' | 'settings';

export interface TabDef { id: TabId; label: string; icon: LucideIcon; }

export const TABS: TabDef[] = [
  { id: 'village', label: 'Посёлок', icon: Home },
  { id: 'craft', label: 'Хозяйство', icon: CookingPot },
  { id: 'hunt', label: 'Охота', icon: Crosshair },
  { id: 'artel', label: 'Артель', icon: Users },
  { id: 'upgrades', label: 'Улучшения', icon: Wrench },
  { id: 'coal', label: 'Шахта', icon: Pickaxe },
  { id: 'telegraph', label: 'Телеграф', icon: RadioTower },
  { id: 'prestige', label: 'Экспедиция', icon: Compass },
  { id: 'stars', label: 'Звёзды', icon: Star },
  { id: 'chronicle', label: 'Летопись', icon: ScrollText },
  { id: 'endings', label: 'Эпилоги', icon: MoonStar },
  { id: 'achievements', label: 'Подвиги', icon: Trophy },
  { id: 'stats', label: 'Статистика', icon: BarChart3 },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export type BuyAmount = 1 | 10 | 'max';

const GEN_ICONS: LucideIcon[] = [Axe, Slice, Users, Factory, Building2, Ship, TrainFront, Waves, Atom, Rocket];
const MINE_ICONS: LucideIcon[] = [Pickaxe, Mountain, Zap, Warehouse];
const TEL_ICONS: LucideIcon[] = [KeyRound, RadioTower, GraduationCap];

// ---------------- общие мелочи ----------------

function LockScreen({ text }: { text: string }) {
  return (
    <div className="panel-card rounded-2xl p-8 text-center" role="status">
      <Lock className="w-10 h-10 mx-auto text-slate-400 mb-3" aria-hidden />
      <p className="text-slate-400 text-sm">{text}</p>
    </div>
  );
}

function Currency({ icon: Icon, label, value, perSec, tone }: {
  icon: LucideIcon; label: string; value: string; perSec?: string; tone: string;
}) {
  return (
    <div className="panel-card rounded-xl px-4 py-3 flex items-center gap-3">
      <Icon className={`w-6 h-6 ${tone}`} aria-hidden />
      <div className="min-w-0">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="font-black text-lg truncate tabular-nums">{value}</div>
      </div>
      {perSec && <div className={`ml-auto text-sm font-bold tabular-nums ${tone}`}>{perSec}</div>}
    </div>
  );
}

function BuyButton({ cost, currency, canBuy, onClick, label }: {
  cost: string; currency: string; canBuy: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canBuy}
      className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition-all min-w-[120px] cursor-pointer disabled:cursor-not-allowed ${
        canBuy
          ? 'bg-amber-500/90 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
          : 'bg-white/5 text-slate-400 border border-white/10'
      }`}
    >
      <span className="block text-[11px] font-semibold opacity-80">{label}</span>
      <span className="block tabular-nums">{cost} {currency}</span>
    </button>
  );
}

function Row({ icon: Icon, title, count, desc, effect, buy, progress, extra }: {
  icon: LucideIcon; title: string; count?: number; desc?: string; effect?: string;
  buy?: React.ReactNode; progress?: number; extra?: React.ReactNode;
}) {
  return (
    <div className="panel-card rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-white/[0.06] transition-colors">
      <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-amber-200/80" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-sm sm:text-base">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-xs font-black text-amber-300 bg-amber-400/10 rounded-full px-2 py-0.5">×{formatFull(count)}</span>
          )}
        </div>
        {desc && <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>}
        {effect && <p className="text-[11px] sm:text-xs text-emerald-300/90 mt-0.5 font-semibold">{effect}</p>}
        {progress !== undefined && (
          <div className="h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      {buy}
      {extra}
    </div>
  );
}

export function BuyAmountToggle({ value, onChange }: { value: BuyAmount; onChange: (v: BuyAmount) => void }) {
  const opts: Array<{ v: BuyAmount; label: string }> = [
    { v: 1, label: '×1' }, { v: 10, label: '×10' }, { v: 'max', label: 'MAX' },
  ];
  return (
    <div className="flex rounded-xl overflow-hidden border border-white/10 text-xs font-bold" role="group" aria-label="Количество покупки">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={`px-3 py-1.5 cursor-pointer transition-colors ${value === o.v ? 'bg-amber-500 text-slate-950' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Артель (генераторы) ----------------

export function ArtelPanel({ buyAmount }: { buyAmount: BuyAmount }) {
  const s = useGame();
  return (
    <div className="flex flex-col gap-2.5">
      <Currency icon={Axe} label="Дрова" value={formatNum(s.wood)} perSec={formatNum(woodPerSec(s)) + '/с'} tone="text-amber-300" />
      {GENERATORS.map((g, i) => {
        if (!genVisible(s, i)) {
          // тизер следующего невидимого генератора
          const prevVisible = i === 0 || genVisible(s, i - 1);
          if (!prevVisible) return null;
          return (
            <Row key={g.id} icon={Snowflake} title="Что-то большое…" desc="Раскрывается, когда артели будет что продать." />
          );
        }
        const n = buyAmount === 'max' ? Math.max(1, maxBuyCount(s, i)) : buyAmount;
        const cost = generatorCost(s, i, n);
        const canBuy = s.wood >= cost;
        const each = g.baseProd * genMult(s, i) * globalMult(s);
        const total = each * s.gens[i];
        const Icon = GEN_ICONS[i];
        const hasAuto = s.inventions.includes('autoartel');
        return (
          <Row
            key={g.id}
            icon={Icon}
            title={g.name}
            count={s.gens[i]}
            desc={g.desc}
            effect={s.gens[i] > 0 ? `за штуку: ${formatNum(each)}/с · всего: ${formatNum(total)}/с` : `будет давать ${formatNum(each)}/с`}
            progress={canBuy ? 1 : s.wood / cost}
            buy={
              <BuyButton
                cost={formatNum(cost)}
                currency="дров"
                canBuy={canBuy}
                label={`Купить ×${formatFull(n)}`}
                onClick={() => actBuyGen(i, n)}
              />
            }
            extra={hasAuto ? (
              <button
                type="button"
                onClick={() => setAutoBuy(i, !s.autoBuy[i])}
                aria-pressed={s.autoBuy[i]}
                aria-label={`Автопокупка «${g.name}»: ${s.autoBuy[i] ? 'включена' : 'выключена'}`}
                title="Автопокупка («Автоартель»)"
                className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border cursor-pointer transition-colors ${
                  s.autoBuy[i] ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <Zap className="w-4 h-4" aria-hidden />
              </button>
            ) : undefined}
          />
        );
      })}
    </div>
  );
}

// ---------------- Улучшения ----------------

function upgradeEffect(u: UpgradeDef): string {
  switch (u.kind) {
    case 'clickMult': return `Удар топора ×${u.value}`;
    case 'clickShare': return `Удар +${Math.round(u.value * 100)}% от добычи в секунду`;
    case 'genMult': return `${GENERATORS[u.target ?? 0].name} ×${u.value}`;
    case 'globalMult': return `Всё производство ×${u.value}`;
  }
}

export function UpgradesPanel() {
  const s = useGame();
  const available = UPGRADES.filter((u) => upgradeAvailable(s, u.id)).sort((a, b) => a.cost - b.cost);
  const ownedCount = s.upgrades.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-slate-400">
        Куплено <b className="text-slate-200">{ownedCount}</b> из {UPGRADES.length}. Каждое — навсегда (до новой экспедиции).
      </div>
      {available.length === 0 && (
        <div className="panel-card rounded-2xl p-8 text-center text-slate-400 text-sm">
          Пока нечего улучшать. Руби, строй, возвращайся — умные мысли приходят к занятым.
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-2.5">
        {available.map((u) => {
          const cost = u.cost * (s.starUpgrades.includes('rulebook') ? 0.8 : 1);
          const canBuy = s.wood >= cost;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => actBuyUpgrade(u.id)}
              disabled={!canBuy}
              title={u.desc}
              className={`panel-card rounded-xl p-3 text-left transition-all cursor-pointer disabled:cursor-not-allowed ${
                canBuy ? 'hover:bg-amber-400/10 hover:border-amber-400/40' : 'opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm">{u.name}</span>
                <span className={`text-xs font-black ${canBuy ? 'text-amber-300' : 'text-slate-400'}`}>{formatNum(cost)} дров</span>
              </div>
              <p className="text-xs text-emerald-300/90 font-semibold mt-1">{upgradeEffect(u)}</p>
              <p className="text-[11px] text-slate-400 mt-1 italic leading-snug">{u.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Шахта (уголь + топка) ----------------

export function CoalPanel({ buyAmount }: { buyAmount: BuyAmount }) {
  const s = useGame();
  if (!coalUnlocked(s)) {
    return <LockScreen text={`Вмерзшая в лёд штольня ждёт. Откроется, когда всего будет добыто ${formatNum(COAL_UNLOCK)} дров (сейчас ${formatNum(s.totalWood)}).`} />;
  }
  const fn = buyAmount === 'max' ? Math.max(1, maxBuyFurnace(s)) : 1;
  const fCost = furnaceCost(s, fn);
  const fMult = Math.pow(furnaceStep(s), s.furnace);
  const nextMult = Math.pow(furnaceStep(s), s.furnace + fn);
  const canFurnace = s.coal >= fCost;
  const hasClerk = s.starUpgrades.includes('furnace_clerk');
  return (
    <div className="flex flex-col gap-2.5">
      <Currency icon={Pickaxe} label="Уголь" value={formatNum(s.coal)} perSec={formatNum(coalPerSec(s)) + '/с'} tone="text-slate-300" />

      <div className="panel-card rounded-xl p-4 border-amber-500/20">
        <div className="flex items-center gap-3">
          <Flame className="w-8 h-8 text-orange-400 flame-pulse shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-bold">Топка — уровень {formatFull(s.furnace)}</div>
            <div className="text-xs text-emerald-300/90 font-semibold">
              сейчас ×{fMult.toFixed(2)} к дровам → станет ×{nextMult.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400">Каждый уровень: ×{furnaceStep(s)} навсегда. Цена растёт — жара бесплатной не бывает.</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <BuyButton cost={formatNum(fCost)} currency="угля" canBuy={canFurnace} label={`Разжечь ×${formatFull(fn)}`} onClick={() => actBuyFurnace(fn)} />
            {hasClerk && (
              <button
                type="button"
                onClick={() => setAutoFurnace(!s.autoFurnace)}
                aria-pressed={s.autoFurnace}
                className={`text-[11px] font-bold rounded-lg px-2 py-1 border cursor-pointer ${
                  s.autoFurnace ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                приказчик {s.autoFurnace ? 'работает' : 'спит'}
              </button>
            )}
          </div>
        </div>
      </div>

      {MINES.map((m, i) => {
        const n = buyAmount === 'max' ? Math.max(1, maxBuyMine(s, i)) : buyAmount;
        const cost = mineCost(s, i, n);
        const canBuy = s.wood >= cost;
        const each = m.baseProd * (s.starUpgrades.includes('rich_vein') ? 2 : 1);
        const Icon = MINE_ICONS[i];
        return (
          <Row
            key={m.id}
            icon={Icon}
            title={m.name}
            count={s.mines[i]}
            desc={m.desc}
            effect={`за штуку: ${formatNum(each)} угля/с · всего: ${formatNum(each * s.mines[i])}/с`}
            progress={canBuy ? 1 : s.wood / cost}
            buy={<BuyButton cost={formatNum(cost)} currency="дров" canBuy={canBuy} label={`Купить ×${formatFull(n)}`} onClick={() => actBuyMine(i, n)} />}
          />
        );
      })}
    </div>
  );
}

// ---------------- Телеграф (депеши + изобретения) ----------------

export function TelegraphPanel({ buyAmount }: { buyAmount: BuyAmount }) {
  const s = useGame();
  if (!telegraphUnlocked(s)) {
    return <LockScreen text={`Морзянка пока молчит. Телеграф откроется, когда всего будет добыто ${formatNum(TELEGRAPH_UNLOCK)} дров (сейчас ${formatNum(s.totalWood)}).`} />;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Currency icon={RadioTower} label="Депеши" value={formatNum(s.depeshi)} perSec={formatNum(depeshiPerSec(s)) + '/с'} tone="text-sky-300" />
      <p className="text-xs text-slate-400 italic">Изобретения переживают любую экспедицию — единственное, что утащишь в вечную мерзлоту.</p>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {INVENTIONS.map((inv) => {
          const owned = s.inventions.includes(inv.id);
          const canBuy = !owned && s.depeshi >= inv.cost;
          return (
            <button
              key={inv.id}
              type="button"
              onClick={() => actBuyInvention(inv.id)}
              disabled={owned || !canBuy}
              title={inv.desc}
              className={`panel-card rounded-xl p-3 text-left transition-all cursor-pointer disabled:cursor-not-allowed ${
                owned ? 'border-emerald-400/30 bg-emerald-400/5' : canBuy ? 'hover:bg-sky-400/10 hover:border-sky-400/40' : 'opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm flex items-center gap-1.5">
                  {owned && <Check className="w-4 h-4 text-emerald-400" aria-hidden />}
                  {inv.name}
                </span>
                <span className={`text-xs font-black ${owned ? 'text-emerald-400' : canBuy ? 'text-sky-300' : 'text-slate-400'}`}>
                  {owned ? 'изобретено' : `${formatNum(inv.cost)} депеш`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 italic leading-snug">{inv.desc}</p>
            </button>
          );
        })}
      </div>

      {TELEGRAPHS.map((t, i) => {
        const n = buyAmount === 'max' ? Math.max(1, maxBuyTelegraph(s, i)) : buyAmount;
        const cost = telegraphCost(s, i, n);
        const canBuy = s.wood >= cost;
        const Icon = TEL_ICONS[i];
        return (
          <Row
            key={t.id}
            icon={Icon}
            title={t.name}
            count={s.telegraphs[i]}
            desc={t.desc}
            effect={`за штуку: ${formatNum(t.baseProd)} депеш/с · всего: ${formatNum(t.baseProd * s.telegraphs[i])}/с`}
            progress={canBuy ? 1 : s.wood / cost}
            buy={<BuyButton cost={formatNum(cost)} currency="дров" canBuy={canBuy} label={`Купить ×${formatFull(n)}`} onClick={() => actBuyTelegraph(i, n)} />}
          />
        );
      })}
    </div>
  );
}

// ---------------- Экспедиция (престиж) ----------------

export function PrestigePanel({ onExpedition }: { onExpedition?: () => void }) {
  const s = useGame();
  const gain = prestigeGain(s);
  const [confirming, setConfirming] = useState(false);
  const progress = Math.min(1, s.runWood / PRESTIGE_UNLOCK);

  if (!prestigeUnlocked(s)) {
    return <LockScreen text={`Где-то за горизонтом ждёт пароход. Экспедиции откроются от ${formatNum(PRESTIGE_UNLOCK / 10)} дров за один забег.`} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="panel-card rounded-2xl p-5">
        <h3 className="font-black text-lg flex items-center gap-2">
          <Compass className="w-5 h-5 text-amber-300" aria-hidden />
          Новая экспедиция
        </h3>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Отправь экспедицию — и начнёшь с щепки. Взамен получишь <b className="text-amber-200">полярные звёзды</b>:
          каждая навсегда даёт +{(starBonusPerStar(s) * 100).toFixed(0)}% к добыче дров. Экспедиция №{s.prestiges + 1}.
        </p>

        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">До первой звезды:</span>
            <span className="font-bold">{formatNum(s.runWood)} / {formatNum(PRESTIGE_UNLOCK)}</span>
          </div>
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-teal-400 to-amber-300 rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        {gain > 0 ? (
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <div className="text-2xl font-black text-amber-200 flex items-center gap-2">
              <Star className="w-6 h-6 fill-amber-300 text-amber-300 star-twinkle" aria-hidden />
              +{formatFull(gain)}
            </div>
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 cursor-pointer transition-colors"
              >
                Отправить экспедицию
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { actPrestige(); setConfirming(false); if (onExpedition) onExpedition(); }}
                  className="rounded-xl bg-red-500 hover:bg-red-400 text-white font-black px-4 py-2.5 cursor-pointer transition-colors"
                >
                  Точно. В путь!
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 font-bold px-4 py-2.5 cursor-pointer transition-colors"
                >
                  Передумал
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">Звёзды появятся от {formatNum(PRESTIGE_UNLOCK)} дров за экспедицию. Пока — руби.</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
        <div className="panel-card rounded-xl p-3">
          <div className="font-bold text-red-300 mb-1.5">Останется на берегу</div>
          <ul className="text-slate-400 space-y-0.5">
            <li>• дрова, уголь, депеши и вся техника</li>
            <li>• улучшения за дрова и уровни топки</li>
          </ul>
        </div>
        <div className="panel-card rounded-xl p-3">
          <div className="font-bold text-emerald-300 mb-1.5">Поплывёт с тобой</div>
          <ul className="text-slate-400 space-y-0.5">
            <li>• звёзды и покупки за них</li>
            <li>• изобретения телеграфа и достижения</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------- Звёзды ----------------

export function StarsPanel() {
  const s = useGame();
  if (s.prestiges === 0 && s.totalStars === 0) {
    return <LockScreen text="Звёзды появляются после первой экспедиции. Смотри вкладку «Экспедиция»." />;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <Currency icon={Star} label="Полярных звёзд заработано" value={formatFull(s.totalStars)} tone="text-amber-200" />
        <Currency icon={Sparkles} label="Можно потратить" value={formatFull(s.stars)} tone="text-teal-300" />
      </div>
      <p className="text-xs text-slate-400 italic">
        Каждая заработанная звезда: +{(starBonusPerStar(s) * 100).toFixed(0)}% к дровам. Сейчас это ×{(1 + starBonusPerStar(s) * s.totalStars).toFixed(2)}.
      </p>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {STAR_UPGRADES.map((su) => {
          const owned = s.starUpgrades.includes(su.id);
          const canBuy = !owned && s.stars >= su.cost;
          return (
            <button
              key={su.id}
              type="button"
              onClick={() => actBuyStarUpgrade(su.id)}
              disabled={owned || !canBuy}
              title={su.desc}
              className={`panel-card rounded-xl p-3 text-left transition-all cursor-pointer disabled:cursor-not-allowed ${
                owned ? 'border-amber-400/30 bg-amber-400/5' : canBuy ? 'hover:bg-amber-400/10 hover:border-amber-400/40' : 'opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm flex items-center gap-1.5">
                  {owned && <Check className="w-4 h-4 text-amber-300" aria-hidden />}
                  {su.name}
                </span>
                <span className={`text-xs font-black ${owned ? 'text-amber-300' : canBuy ? 'text-amber-200' : 'text-slate-400'}`}>
                  {owned ? 'куплено' : `${formatNum(su.cost)} ⭐`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 italic leading-snug">{su.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="panel-card rounded-xl p-4">
        <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-slate-400" aria-hidden /> Вахтенный журнал</h3>
        <ul className="text-xs space-y-1.5">
          {MILESTONES.map((m) => {
            const done = s.totalStars >= m.stars;
            return (
              <li key={m.id} className={done ? 'text-slate-200' : 'text-slate-400'}>
                <span className={done ? 'text-amber-300' : 'text-slate-600'}>{done ? '★' : '☆'}</span>{' '}
                <b>{m.title}</b> — {m.stars.toLocaleString('ru-RU')} звёзд. <span className="italic">{m.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ---------------- Достижения ----------------

export function AchievementsPanel() {
  const s = useGame();
  const unlocked = new Set(s.achievements);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-slate-400">
        Открыто <b className="text-slate-200">{unlocked.size}</b> из {ACHIEVEMENTS.length}. Каждое даёт +1% к производству —
        сейчас <b className="text-emerald-300">+{unlocked.size}%</b>.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ACHIEVEMENTS.map((a) => {
          const done = unlocked.has(a.id);
          return (
            <div
              key={a.id}
              title={a.desc}
              className={`panel-card rounded-xl p-2.5 ${done ? 'border-amber-400/30 bg-amber-400/5' : 'opacity-55'}`}
            >
              <div className="flex items-center gap-1.5">
                <Trophy className={`w-3.5 h-3.5 shrink-0 ${done ? 'text-amber-300' : 'text-slate-600'}`} aria-hidden />
                <span className="font-bold text-xs truncate">{a.name}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">{a.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Статистика ----------------

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="font-bold text-sm text-right tabular-nums break-words">{value}</span>
    </div>
  );
}

export function StatsPanel() {
  const s = useGame();
  const prof = profession(s);
  return (
    <div className="space-y-3">
      <div className="panel-card rounded-2xl p-5">
        <h3 className="font-black text-lg mb-3">Журнал станции</h3>
        <StatRow label="Профессия" value={prof ? prof.name : '—'} />
        <StatRow label="День зимовки (из 60)" value={formatFull(Math.min(60, Math.floor(s.playTime / 600) + 1))} />
        <StatRow label="Время у печи" value={formatTime(s.playTime)} />
        <StatRow label="Дров за всё время" value={formatFull(s.totalWood)} />
        <StatRow label="Дров за экспедицию" value={formatFull(s.runWood)} />
        <StatRow label="Лучшая добыча" value={`${formatNum(s.bestWps)}/с`} />
        <StatRow label="Ударов топором" value={formatFull(Math.floor(s.clicks))} />
        <StatRow label="Техники в артели" value={formatFull(totalGenerators(s))} />
        <StatRow label="Угля добыто" value={formatFull(s.totalCoal)} />
        <StatRow label="Уровень топки" value={formatFull(s.furnace)} />
        <StatRow label="Депеш принято" value={formatFull(Math.floor(s.totalDepeshi))} />
        <StatRow label="Экспедиций отправлено" value={formatFull(s.prestiges)} />
        <StatRow label="Полярных звёзд" value={formatFull(s.totalStars)} />
        <StatRow label="Сияний поймано" value={formatFull(s.aurorasSeen)} />
        <StatRow label="Общий множитель производства" value={`×${formatNum(globalMult(s))}`} />
      </div>
      <div className="panel-card rounded-2xl p-5">
        <h3 className="font-black text-lg mb-3">Зимовка по-репозиторному</h3>
        <StatRow label="Предметов на складе" value={`${uniqueItems(s)} / ${TOTAL_ITEMS}`} />
        <StatRow label="Рецептов освоено" value={`${s.crafted.length} / ${CRAFTS.length}`} />
        <StatRow label="Облав проведено" value={formatFull(totalHunts(s))} />
        <StatRow label="Записок найдено" value={`${s.notesFound.length} / ${NOTES.length}`} />
        <StatRow label="Радиопередач принято" value={`${s.radioHeard.length} / ${RADIO.length}`} />
        <StatRow label="Выпусков газеты" value={`${s.gazetteSeen.length} / ${GAZETTE.length}`} />
        <StatRow label="Эпилогов открыто" value={`${s.endings.length} / ${ENDINGS.length}`} />
      </div>
    </div>
  );
}

// ---------------- Настройки ----------------

export function SettingsPanel() {
  const s = useGame();
  const [saveText, setSaveText] = useState('');
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  // подтверждение «Стереть всё» само остывает через 4 секунды — от случайного тапа
  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  const doExport = () => {
    saveGame();
    try {
      setSaveText(btoa(unescape(encodeURIComponent(localStorage.getItem(SAVE_KEY) ?? ''))));
      setMsg('Сейв выгружен — скопируй текст ниже.');
    } catch { setMsg('Не удалось выгрузить сейв.'); }
  };

  const doImport = () => {
    try {
      const json = decodeURIComponent(escape(atob(importText.trim())));
      if (applyImportedSave(json)) {
        setMsg('Сейв принят! Зимуем дальше.');
      } else {
        setMsg('Это не похоже на сейв «Топки». Проверь текст.');
      }
    } catch { setMsg('Кажется, сейв повреждён. Проверь текст.'); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="panel-card rounded-2xl p-5">
        <h3 className="font-black text-lg mb-1">Сейвы</h3>
        <p className="text-xs text-slate-400 mb-3">Игра сохраняется сама каждые 10 секунд и при закрытии вкладки.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={doExport} className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
            <Download className="w-4 h-4" aria-hidden /> Выгрузить сейв
          </button>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(saveText); setMsg('Скопировано в буфер.'); }} disabled={!saveText}
            className="rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 px-3 py-2 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
            <Copy className="w-4 h-4" aria-hidden /> Копировать
          </button>
          <button type="button" onClick={() => { if (confirmReset) { hardReset(); window.location.reload(); } else setConfirmReset(true); }}
            className={`rounded-xl px-3 py-2 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${confirmReset ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-red-500/10 hover:bg-red-500/20 text-red-300'}`}>
            <Trash2 className="w-4 h-4" aria-hidden /> {confirmReset ? 'Точно стереть всё?!' : 'Стереть всё'}
          </button>
        </div>
        {saveText && (
          <textarea readOnly value={saveText} aria-label="Текст сейва"
            className="w-full mt-3 h-20 text-[10px] bg-black/40 border border-white/10 rounded-lg p-2 text-slate-400" />
        )}
        <div className="mt-4">
          <label htmlFor="import-save" className="text-xs text-slate-400">Вставь сейв сюда:</label>
          <textarea id="import-save" value={importText} onChange={(e) => setImportText(e.target.value)}
            className="w-full mt-1 h-20 text-[10px] bg-black/40 border border-white/10 rounded-lg p-2" />
          <button type="button" onClick={doImport} disabled={!importText.trim()}
            className="mt-2 rounded-xl bg-sky-500/80 hover:bg-sky-400 disabled:opacity-40 text-slate-950 px-3 py-2 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" aria-hidden /> Загрузить
          </button>
        </div>
        {msg && <p className="text-xs text-teal-300 mt-2" role="status">{msg}</p>}
      </div>

      <div className="panel-card rounded-2xl p-5 text-sm text-slate-400 leading-relaxed">
        <h3 className="font-black text-lg text-slate-200 mb-1">Об игре</h3>
        <p><b className="text-slate-200">«Белая Тишина: Топка»</b> — полярная инкременталка. Русский Север, 1917 год,
        до парохода — вся зима. Автор игры — <b className="text-slate-200">DirtyG</b>.</p>
        <p className="mt-2 text-xs">Сеанс: {formatTime(s.playTime)}. Сейв живёт в этом браузере.</p>
      </div>
    </div>
  );
}

// ============================================================
// v2: ПОСЁЛОК — обыск 26 мест с настоящими лут-таблицами
// ============================================================

const HIDDEN_LOC_RU = 'Тайник';

export function VillagePanel() {
  const s = useGame();
  const prof = profession(s);
  const uniq = uniqueItems(s);
  const [filter, setFilter] = useState<'all' | 'new'>('all');

  const rows = BUILDINGS.map((b, i) => {
    const unlocked = buildingUnlocked(s, i);
    const cost = scavengeCost(s, i);
    const canBuy = unlocked && s.wood >= cost;
    const hidden = b.unlock >= 1e12;
    return { b, i, unlocked, cost, canBuy, hidden };
  }).filter((r) => r.unlocked || r.b.unlock <= s.totalWood * 50);

  return (
    <div className="space-y-3">
      <div className="panel-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Package className="w-6 h-6 text-amber-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-black text-lg">Склад зимовщика</div>
            <p className="text-xs text-slate-400">
              {uniq} из {TOTAL_ITEMS} предметов репозитория. Каждый уникальный — +0.5% ко всему производству, трофеи — +2%.
            </p>
          </div>
          <div className="text-right">
            <div className="font-black text-2xl text-amber-200 tabular-nums">{uniq}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">предметов</div>
          </div>
        </div>
        <div className="h-2 bg-white/10 rounded-full mt-3 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-teal-400 rounded-full transition-all" style={{ width: `${(uniq / TOTAL_ITEMS) * 100}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          {prof ? `Профессия: ${prof.name} — ${prof.bonus}. ` : ''}
          Дубликаты сдаёт барахолка — дровами по курсу редкости.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setFilter('all')} className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filter === 'all' ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40' : 'bg-white/[0.04] text-slate-400 border border-white/10'}`}>Все места</button>
        <button type="button" onClick={() => setFilter('new')} className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filter === 'new' ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40' : 'bg-white/[0.04] text-slate-400 border border-white/10'}`}>Ещё не обысканы</button>
      </div>

      {rows
        .filter((r) => filter === 'all' || r.unlocked === false || s.searches[r.i] === 0)
        .map(({ b, i, unlocked, cost, canBuy, hidden }) => {
          const searched = s.searches[i];
          const known = new Set(b.tables.flatMap((t) => (ALL_ITEMS as Record<string, unknown>)[t] ? [] : []));
          return (
            <div key={b.key} className="panel-card rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                {hidden ? <Landmark className="w-5 h-5 text-purple-300" aria-hidden /> : <Search className="w-5 h-5 text-amber-200/80" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-sm sm:text-base">{hidden ? `${b.name} (${HIDDEN_LOC_RU})` : b.name}</span>
                  {searched > 0 && <span className="text-xs font-black text-teal-300 bg-teal-400/10 rounded-full px-2 py-0.5">обыщено ×{formatFull(searched)}</span>}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-snug">{b.desc}</p>
              </div>
              {unlocked ? (
                <BuyButton
                  cost={formatNum(cost)}
                  currency="дров"
                  canBuy={canBuy}
                  onClick={() => actScavenge(i)}
                  label="Обыскать"
                />
              ) : (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">откроется</div>
                  <div className="text-xs font-bold text-slate-400 tabular-nums">при {formatNum(b.unlock)} дров всего</div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

// ============================================================
// v2: ХОЗЯЙСТВО — 284 рецепта оригинальной игры
// ============================================================

const CRAFT_EFFECT_RU: Record<string, string> = {
  click: '+2% к силе клика',
  offline: '+1.5% к оффлайн-доходу',
  genDisc: '−0.3% к цене генераторов',
  hunt: '+2% к добыче охоты',
  coal: '+1.5% к добыче угля',
  offlineCap: '+20 минут оффлайн-капа',
  global: '+0.5% ко всему производству',
};

export function CraftPanel() {
  const s = useGame();
  const ef = craftEffects(s);
  const [cat, setCat] = useState<string>('all');
  const cats = ['all', ...Object.keys(CAT_RU_CRAFT)];

  const available = CRAFTS.filter((c) => craftUnlocked(s, c.id));
  const nextLocked = CRAFTS.find((c) => !craftUnlocked(s, c.id));
  const done = new Set(s.crafted);
  const shown = available
    .filter((c) => cat === 'all' || c.cat === cat)
    .filter((c) => !done.has(c.id))
    .slice(0, 40);
  const doneCount = s.crafted.length;

  return (
    <div className="space-y-3">
      <div className="panel-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <CookingPot className="w-6 h-6 text-amber-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-black text-lg">Ремёсла зимовки</div>
            <p className="text-xs text-slate-400">Освоено {doneCount} из {CRAFTS.length} рецептов оригинальной игры. Материалы заготавливает артель — плати дровами. Найденные на складе ингредиенты снижают цену до 35%.</p>
          </div>
          <div className="text-right">
            <div className="font-black text-2xl text-amber-200 tabular-nums">{Math.round((doneCount / CRAFTS.length) * 100)}%</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">мастерство</div>
          </div>
        </div>
        <div className="h-2 bg-white/10 rounded-full mt-3 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all" style={{ width: `${(doneCount / CRAFTS.length) * 100}%` }} />
        </div>
        {doneCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 text-[10px] font-bold">
            {ef.click > 0 && <span className="rounded-full bg-amber-400/10 text-amber-200 px-2 py-1">клик +{Math.round(ef.click * 100)}%</span>}
            {ef.offline > 0 && <span className="rounded-full bg-sky-400/10 text-sky-200 px-2 py-1">оффлайн +{Math.round(ef.offline * 100)}%</span>}
            {ef.genDisc > 0 && <span className="rounded-full bg-emerald-400/10 text-emerald-200 px-2 py-1">генераторы −{Math.round(ef.genDisc * 100)}%</span>}
            {ef.hunt > 0 && <span className="rounded-full bg-red-400/10 text-red-200 px-2 py-1">охота +{Math.round(ef.hunt * 100)}%</span>}
            {ef.coal > 0 && <span className="rounded-full bg-slate-300/10 text-slate-200 px-2 py-1">уголь +{Math.round(ef.coal * 100)}%</span>}
            {ef.offlineCapMin > 0 && <span className="rounded-full bg-teal-400/10 text-teal-200 px-2 py-1">оффлайн-кап +{ef.offlineCapMin} мин</span>}
          </div>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {cats.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors ${cat === c ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40' : 'bg-white/[0.04] text-slate-400 border border-white/10'}`}>
            {c === 'all' ? `Все (${CRAFTS.length - doneCount})` : `${CAT_RU_CRAFT[c]} (${CRAFTS.filter((x) => x.cat === c && !done.has(x.id)).length})`}
          </button>
        ))}
      </div>

      {shown.map((c) => {
        const cost = craftCost(s, c.id);
        const canBuy = s.wood >= cost;
        return (
          <div key={c.id} className="panel-card rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <CookingPot className="w-5 h-5 text-amber-200/80" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-bold text-sm sm:text-base">{c.name}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{CAT_RU_CRAFT[c.cat] || c.cat}</span>
              </div>
              {c.desc && <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-snug line-clamp-2">{c.desc}</p>}
              <p className="text-[11px] sm:text-xs text-emerald-300/90 mt-0.5 font-semibold">{CRAFT_EFFECT_RU[c.effect]}</p>
            </div>
            <BuyButton cost={formatNum(cost)} currency="дров" canBuy={canBuy} onClick={() => actCraft(c.id, c.name)} label="Освоить" />
          </div>
        );
      })}

      {shown.length === 0 && (
        <div className="panel-card rounded-2xl p-6 text-center text-sm text-slate-400">
          {available.length === 0 || doneCount === CRAFTS.filter((c) => cat === 'all' || c.cat === cat).length
            ? 'Все рецепты этой линейки освоены. Мастер!'
            : 'Пока ничего не открыто — копи дрова.'}
        </div>
      )}

      {nextLocked && (
        <div className="panel-card rounded-xl p-3 text-center text-xs text-slate-500">
          Следующее ремесло откроется при {formatNum(nextLocked.unlock)} дров за всё время
        </div>
      )}
    </div>
  );
}

// ============================================================
// v2: ОХОТА — 6 целей облавы с настоящими таблицами добычи
// ============================================================

export function HuntPanel() {
  const s = useGame();
  const hunts = totalHunts(s);
  const ef = craftEffects(s);

  return (
    <div className="space-y-3">
      <div className="panel-card rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <PawPrint className="w-6 h-6 text-red-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-black text-lg">Промысел</div>
          <p className="text-xs text-slate-400">
            {hunts} облав за всё время — каждая +0.3% ко всему производству. Снаряжение охотника: +{Math.round(ef.hunt * 100)}% к добыче.
            В трофейных облавах — шанс на редчайшие находки.
          </p>
        </div>
      </div>

      {BEASTS.map((b, i) => {
        const unlocked = huntUnlocked(s, i);
        const cost = huntCost(s, i);
        const canBuy = unlocked && s.wood >= cost;
        const count = s.hunts[i];
        return (
          <div key={b.key} className="panel-card rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <Crosshair className={`w-5 h-5 ${b.danger >= 5 ? 'text-red-300' : 'text-amber-200/80'}`} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-bold text-sm sm:text-base">{b.name}</span>
                <span className="text-[10px] font-bold text-red-300/80">опасность {b.danger}/10</span>
                {count > 0 && <span className="text-xs font-black text-red-200 bg-red-400/10 rounded-full px-2 py-0.5">облав ×{formatFull(count)}</span>}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-snug">{b.desc}</p>
              {b.bonusTable && <p className="text-[11px] text-purple-300/90 mt-0.5 font-semibold">Шанс трофея: редчайшая добыча</p>}
            </div>
            {unlocked ? (
              <BuyButton cost={formatNum(cost)} currency="дров" canBuy={canBuy} onClick={() => actHunt(i)} label="Облава" />
            ) : (
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">откроется</div>
                <div className="text-xs font-bold text-slate-400 tabular-nums">при {formatNum(b.unlock)} дров всего</div>
              </div>
            )}
          </div>
        );
      })}

      <div className="panel-card rounded-2xl p-4">
        <h3 className="font-black text-base text-slate-200 mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-teal-300" aria-hidden /> Бестиарий Тихой</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {BESTIARY.map((a) => (
            <details key={a.id} className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
              <summary className="text-xs font-bold text-slate-200 cursor-pointer list-none flex items-center justify-between">
                <span>{a.name}</span>
                <span className={`text-[10px] font-black ${a.danger >= 5 ? 'text-red-300' : a.danger >= 1 ? 'text-amber-300' : 'text-slate-500'}`}>опасность {a.danger}</span>
              </summary>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-snug whitespace-pre-line">{a.text}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// v2: ЛЕТОПИСЬ — записки, газета, радио, правила, календарь
// ============================================================

export function ChroniclePanel() {
  const s = useGame();
  const [section, setSection] = useState<'notes' | 'gazette' | 'radio' | 'rules' | 'calendar'>('notes');
  const cal = calendarDay(s.playTime);
  const notesFound = NOTES.filter((n) => s.notesFound.includes(n.id));
  const radioList = RADIO.slice(0, s.radioHeard.length);

  const sections: Array<[typeof section, string, number, number]> = [
    ['notes', 'Записки', notesFound.length, NOTES.length],
    ['gazette', 'Газета', s.gazetteSeen.length, GAZETTE.length],
    ['radio', 'Радио', s.radioHeard.length, RADIO.length],
    ['rules', 'Правила зимовки', 0, 0],
    ['calendar', 'Календарь', cal.n, 60],
  ];

  return (
    <div className="space-y-3">
      <div className="panel-card rounded-2xl p-4">
        <div className="font-black text-lg flex items-center gap-2"><ScrollText className="w-5 h-5 text-teal-300" aria-hidden /> Летопись Пристани-Тихой</div>
        <p className="text-xs text-slate-400 mt-1">
          День {cal.n} из 60 — святой {cal.name}. {cal.note}
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {sections.map(([id, label, a, b]) => (
          <button key={id} type="button" onClick={() => setSection(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${section === id ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40' : 'bg-white/[0.04] text-slate-400 border border-white/10'}`}>
            {label}{b > 0 && ` ${a}/${b}`}
          </button>
        ))}
      </div>

      {section === 'notes' && (
        <div className="space-y-2">
          {notesFound.length === 0 && <div className="panel-card rounded-2xl p-6 text-center text-sm text-slate-400">Записок пока нет. Обыскивай посёлок — бумага переживает людей.</div>}
          {notesFound.map((n) => (
            <details key={n.id} className="panel-card rounded-xl px-4 py-3">
              <summary className="text-sm font-bold text-slate-100 cursor-pointer">{n.title}</summary>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed whitespace-pre-line">{n.text}</p>
            </details>
          ))}
        </div>
      )}

      {section === 'gazette' && (
        <div className="space-y-2">
          {s.gazetteSeen.length === 0 && <div className="panel-card rounded-2xl p-6 text-center text-sm text-slate-400">Газет нет. Первая выйдет при 1 тысяче дров.</div>}
          {GAZETTE.slice(0, s.gazetteSeen.length).map((g) => (
            <details key={g.id} className="panel-card rounded-xl px-4 py-3">
              <summary className="text-sm font-black text-slate-100 cursor-pointer">
                <span className="inline-flex items-center gap-1.5"><Newspaper className="w-3.5 h-3.5 text-amber-300" aria-hidden /> {g.title} — {g.date}</span>
              </summary>
              <div className="grid gap-3 mt-2 sm:grid-cols-2">
                {g.cols.map((col, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] p-3">
                    <div className="text-[11px] font-black text-amber-200/90 uppercase tracking-wide">{col.h}</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{col.t}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {section === 'radio' && (
        <div className="space-y-2">
          {radioList.length === 0 && <div className="panel-card rounded-2xl p-6 text-center text-sm text-slate-400">Эфир молчит. Передачи принимаются по мере накопления депеш.</div>}
          {radioList.map((r) => (
            <div key={r.id} className="panel-card rounded-xl px-4 py-3 flex gap-3">
              <Radio className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" aria-hidden />
              <p className="text-xs text-slate-300 leading-relaxed">{r.text}</p>
            </div>
          ))}
          {s.radioHeard.length < RADIO.length && (
            <div className="panel-card rounded-xl p-3 text-center text-xs text-slate-500">
              Следующая передача — при {formatNum(radioThreshold(s.radioHeard.length))} депеш (сейчас {formatNum(s.totalDepeshi)})
            </div>
          )}
        </div>
      )}

      {section === 'rules' && (
        <div className="space-y-2">
          {WINTER_RULES.map((r) => (
            <div key={r.n} className="panel-card rounded-xl px-4 py-3">
              <div className="text-sm font-black text-slate-100">Правило {r.n}. {r.title}</div>
              <p className="text-xs text-amber-200/90 font-bold mt-1">«{r.law}»</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{r.story}</p>
              <p className="text-[11px] text-teal-300/70 mt-1">{r.why}</p>
            </div>
          ))}
        </div>
      )}

      {section === 'calendar' && (
        <div className="panel-card rounded-2xl p-4">
          <div className="text-sm font-black text-slate-100 mb-3">60 дней зимовки (святцы 1917 года)</div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 60 }, (_, i) => i + 1).map((d) => {
              const day = calendarDay(d * 600 - 300);
              const passed = cal.n >= d;
              return (
                <div key={d} className={`rounded-lg px-2.5 py-1.5 text-xs ${passed ? 'bg-amber-400/10 border border-amber-400/20' : 'bg-white/[0.02] border border-white/5'}`}>
                  <span className={`font-black ${passed ? 'text-amber-200' : 'text-slate-500'}`}>Д{d}</span>
                  <span className="text-slate-400 ml-1.5">{day.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// v2: ЭПИЛОГИ — 7 финалов оригинальной игры
// ============================================================

export function EndingsPanel() {
  const s = useGame();
  return (
    <div className="space-y-3">
      <div className="panel-card rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <MoonStar className="w-6 h-6 text-purple-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-black text-lg">Эпилоги</div>
          <p className="text-xs text-slate-400">{s.endings.length} из {ENDINGS.length} финалов открыто. Семь концовок оригинальной «Белой Тишины» — здесь они стали целями.</p>
        </div>
      </div>
      {ENDINGS.map((e) => {
        const got = s.endings.includes(e.id);
        return (
          <details key={e.id} className={`panel-card rounded-xl px-4 py-3 ${got ? 'border border-purple-400/30' : 'opacity-70'}`} open={got}>
            <summary className="text-sm font-black cursor-pointer flex items-center gap-2 flex-wrap">
              {got ? <MoonStar className="w-4 h-4 text-purple-300" aria-hidden /> : <Lock className="w-4 h-4 text-slate-500" aria-hidden />}
              <span className={got ? 'text-purple-200' : 'text-slate-400'}>{got ? e.title : '???'}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${got ? 'text-purple-300/80' : 'text-slate-500'}`}>{e.kind}</span>
            </summary>
            <p className="text-[11px] text-slate-400 mt-2">{got ? e.condition : `Условие: ${e.condition}`}</p>
            {got && (
              <div className="mt-2 rounded-lg bg-black/30 border border-purple-400/20 p-3">
                <p className="text-xs text-amber-200/90 italic mb-2">{e.epigraph}</p>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{e.text}</p>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

// ============================================================
// v2: ПРОФЕССИИ — выбор при новой экспедиции
// ============================================================

export function ProfessionPicker({ onDone }: { onDone: () => void }) {
  const s = useGame();
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Выбор профессии">
      <div className="panel-card rounded-2xl p-6 max-w-lg w-full bg-[#0a1226] max-h-[90vh] overflow-y-auto game-scroll">
        <h2 className="font-black text-xl text-amber-100">Кем зимовать?</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">Профессии из оригинальной игры. Стартовый набор — сразу на склад, бонус — до конца экспедиции.</p>
        <div className="space-y-2">
          {PROFESSIONS.map((p) => (
            <button key={p.id} type="button"
              onClick={() => { actChooseProfession(p.id, p.name); onDone(); }}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer ${s.profession === p.id ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'}`}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-black text-sm text-slate-100">{p.name}</span>
                <span className="text-[10px] font-bold text-amber-300">{p.bonus}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">{p.desc}</p>
              <p className="text-[10px] text-slate-500 mt-1">С собой: {p.items.slice(0, 5).map((it) => `${itemName(it.id)}${it.n > 1 ? '×' + it.n : ''}`).join(', ')}{p.items.length > 5 ? '…' : ''}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
