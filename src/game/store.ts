// Реакт-обвязка движка: снапшоты, игровой цикл, автосейв, события.
import { useSyncExternalStore } from 'react';
import {
  GameState, TickResult, OfflineReport, ScavengeResult, HuntResult,
  SAVE_KEY, createInitialState, deserialize, serialize, applyOffline, tick, checkMilestones,
  doClick, buyGenerator, buyUpgrade, buyMine, buyTelegraph, buyFurnace, buyInvention, buyStarUpgrade, doPrestige,
  doScavenge, doCraft, doHunt, chooseProfession, radioThreshold, gazetteMilestone,
} from './engine';
import { ACHIEVEMENTS } from './content';
import { plural } from './format';
import { auroraMultiplier } from './engine';

export interface GameEvent {
  id: number;
  kind: 'achievement' | 'milestone' | 'aurora' | 'info' | 'prestige' | 'scavenge' | 'hunt' | 'radio' | 'gazette' | 'ending' | 'craft';
  title: string;
  text: string;
}

const listeners = new Set<() => void>();
const eventQueue: GameEvent[] = [];
let eventsSnapshot: GameEvent[] = [];
let eventSeq = 1;
let state: GameState = createInitialState();
let snapshot: GameState = state;
const serverSnapshot = createInitialState();
let started = false;
let lastSaveAt = 0;
let lastOffline: OfflineReport | null = null;

function emit() {
  state.rev += 1;
  snapshot = { ...state };
  listeners.forEach((l) => l());
}

function pushEvent(kind: GameEvent['kind'], title: string, text: string) {
  const e: GameEvent = { id: eventSeq++, kind, title, text };
  eventQueue.push(e);
  emitEvents();
  window.setTimeout(() => removeEvent(e.id), 6500);
}

function removeEvent(id: number) {
  const i = eventQueue.findIndex((e) => e.id === id);
  if (i >= 0) {
    eventQueue.splice(i, 1);
    emitEvents();
  }
}

export function dismissEvent(id: number) { removeEvent(id); }

function emitEvents() {
  eventsSnapshot = eventQueue.slice();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getSnapshot(): GameState { return snapshot; }
export function getServerSnapshot(): GameState { return serverSnapshot; }

export function saveGame() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVE_KEY, serialize(state));
    lastSaveAt = state.playTime;
  } catch { /* localStorage переполнен или закрыт — молча живём дальше */ }
}

export function takeOfflineReport(): OfflineReport | null { return lastOffline; }
export function clearOfflineReport() { lastOffline = null; }

function handleTickResults(res: TickResult) {
  if (res.auroraStarted) {
    pushEvent('aurora', 'Северное сияние!', `Небо загорелось: всё производство ×${auroraMultiplier(state)} на 30 секунд.`);
  }
  for (const id of res.newAchievements) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) pushEvent('achievement', `Достижение: ${a.name}`, `${a.desc} (+1% к производству)`);
  }
  for (const m of checkMilestones(state)) {
    pushEvent('milestone', `Веха: ${m.title}`, m.text);
  }
  // v2: летопись и эпилоги
  if (res.radioHeard) {
    pushEvent('radio', 'Радио: передача принята', res.radioHeard.text.slice(0, 220) + (res.radioHeard.text.length > 220 ? '…' : ''));
  }
  if (res.gazetteSeen) {
    pushEvent('gazette', `Газета: «${res.gazetteSeen.title}»`, `${res.gazetteSeen.date}. ${res.gazetteSeen.cols[0]?.h || ''}`);
  }
  for (const e of res.newEndings) {
    pushEvent('ending', `ЭПИЛОГ ОТКРЫТ: ${e.title}`, e.epigraph || e.condition);
    saveGame();
  }
}

export function startGame() {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Загрузка сейва
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const loaded = deserialize(raw);
      if (loaded) state = loaded;
    }
  } catch { /* повреждённый сейв — начинаем с чистого листа */ }

  // Оффлайн-доход
  lastOffline = applyOffline(state);
  if (lastOffline && lastOffline.wood < 1 && lastOffline.coal < 1 && lastOffline.depeshi < 1) lastOffline = null;

  emit();

  // Игровой цикл: 10 тиков/сек
  window.setInterval(() => {
    const res = tick(state, 0.1);
    handleTickResults(res);
    if (state.playTime - lastSaveAt > 10) saveGame();
    emit();
  }, 100);

  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
}

// ---------------- действия (обёртки с emit) ----------------

export function actClick(): number { const g = doClick(state, 1); emit(); return g; }

export function actBuyGen(i: number, n: number): boolean { const ok = buyGenerator(state, i, n); if (ok) emit(); return ok; }
export function actBuyUpgrade(id: string): boolean { const ok = buyUpgrade(state, id); if (ok) emit(); return ok; }
export function actBuyMine(i: number, n: number): boolean { const ok = buyMine(state, i, n); if (ok) emit(); return ok; }
export function actBuyTelegraph(i: number, n: number): boolean { const ok = buyTelegraph(state, i, n); if (ok) emit(); return ok; }
export function actBuyFurnace(levels: number): boolean { const ok = buyFurnace(state, levels); if (ok) emit(); return ok; }
export function actBuyInvention(id: string): boolean { const ok = buyInvention(state, id); if (ok) emit(); return ok; }
export function actBuyStarUpgrade(id: string): boolean { const ok = buyStarUpgrade(state, id); if (ok) emit(); return ok; }

export function actPrestige(): number {
  const gain = doPrestige(state);
  if (gain > 0) {
    pushEvent('prestige', `Экспедиция №${state.prestiges} отправлена!`,
      `За пазухой — ${gain} ${plural(gain, 'полярная звезда', 'полярные звезды', 'полярных звёзд')}. Каждая навсегда усиливает производство.` +
      (state.lastDream ? ` Во сне привиделось: «${state.lastDream}»` : ''));
    saveGame();
    emit();
  }
  return gain;
}

// ---------------- v2: посёлок, хозяйство, охота ----------------

export function actScavenge(i: number): ScavengeResult | null {
  const res = doScavenge(state, i);
  if (!res) return null;
  const items = res.found.map((f) => `${f.isNew ? '✦ ' : ''}${f.name} ×${f.n}`).join(', ');
  pushEvent('scavenge', `Обыск: ${res.building}`,
    (res.found.length ? items : 'Пусто. Хоть шаром покати.') +
    (res.note ? ` | Найдена записка: «${res.note.title}»` : '') +
    (res.refund > 0 ? ` | Барахолка: +${Math.floor(res.refund)} дров` : ''));
  emit();
  return res;
}

export function actCraft(id: string, name: string): boolean {
  const ok = doCraft(state, id);
  if (ok) {
    pushEvent('craft', `Освоено: ${name}`, 'Рецепт из зимовки — теперь твой навсегда.');
    emit();
  }
  return ok;
}

export function actHunt(i: number): HuntResult | null {
  const res = doHunt(state, i);
  if (!res) return null;
  const loot = res.loot.map((l) => `${l.isNew ? '✦ ' : ''}${l.name} ×${l.n}`).join(', ');
  pushEvent('hunt', res.trophy ? `ТРОФЕЙ! Облава: ${res.beast}` : `Облава: ${res.beast}`,
    (res.loot.length ? loot : 'Зверь ушёл. Следы остались.') + (res.refund > 0 ? ` | Скупщик: +${Math.floor(res.refund)} дров` : ''));
  emit();
  return res;
}

export function actChooseProfession(id: string, name: string): boolean {
  const ok = chooseProfession(state, id);
  if (ok) {
    pushEvent('info', `Профессия: ${name}`, 'Стартовый набор — на складе. Зимуй по-новому.');
    saveGame();
    emit();
  }
  return ok;
}

export function setAutoBuy(i: number, v: boolean) { state.autoBuy[i] = v; emit(); }
export function setAutoFurnace(v: boolean) { state.autoFurnace = v; emit(); }

export function hardReset() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ок */ }
  state = createInitialState();
  emit();
}

/** Применить импортированный сейв к живой игре (без перезагрузки —
 *  раньше beforeunload успевал перезаписать импорт старым состоянием). */
export function applyImportedSave(json: string): boolean {
  const loaded = deserialize(json);
  if (!loaded) return false;
  state = loaded;
  saveGame();
  lastOffline = applyOffline(state);
  emit();
  return true;
}

// ---------------- хуки ----------------

export function useGame(): GameState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const emptyEvents: GameEvent[] = [];

export function useGameEvents(): GameEvent[] {
  return useSyncExternalStore(subscribe, getEventsSnapshot, getEmptyEventsSnapshot);
}

function getEventsSnapshot(): GameEvent[] { return eventsSnapshot; }
function getEmptyEventsSnapshot(): GameEvent[] { return emptyEvents; }

/** false на сервере и первом кадре гидратации, true на клиенте — заменяет паттерн mounted */
export function useStarted(): boolean {
  return useSyncExternalStore(subscribe, getTrue, getFalse);
}
const getTrue = () => true;
const getFalse = () => false;
