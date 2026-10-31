// Форматирование чисел инкременталки: от «0.1» до «1.23e100».
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
// NBSP: число и суффикс не разносятся по строкам
const NBSP = '\u00A0';

export function formatNum(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + formatNum(-n);
  if (n === 0) return '0';
  if (n < 10) return trimZeros(n.toFixed(2));
  if (n < 1000) return Math.floor(n).toLocaleString('ru-RU');
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = n / Math.pow(10, tier * 3);
    return trimZeros(scaled.toFixed(2)) + NBSP + SUFFIXES[tier];
  }
  const exp = Math.floor(Math.log10(n));
  const mant = n / Math.pow(10, exp);
  return mant.toFixed(2) + 'e' + exp;
}

function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, '');
}

/** Полное русское число для статистики: 12 345 -> «12 345», 1e42 -> «1.00e42» */
export function formatFull(n: number): string {
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) < 1e15) return Math.floor(n).toLocaleString('ru-RU');
  return formatNum(n);
}

/** Секунды -> «1ч 05м 09с» */
export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '—';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor((sec / 3600) % 24);
  const d = Math.floor(sec / 86400);
  const pad = (x: number) => String(x).padStart(2, '0');
  if (d > 0) return `${d}д ${pad(h)}ч ${pad(m)}м`;
  if (h > 0) return `${h}ч ${pad(m)}м ${pad(s)}с`;
  if (m > 0) return `${m}м ${pad(s)}с`;
  return `${s}с`;
}

/** Русская плюрализация: plural(2, 'звезда', 'звезды', 'звёзд') → 'звезды' */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.floor(Math.abs(n)) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

/** «1.23e15» -> «квадриллион» для достижений и тостов */
export function wordFor(n: number): string {
  const names: Array<[number, string]> = [
    [1e3, 'тысячу'], [1e6, 'миллион'], [1e9, 'миллиард'], [1e12, 'триллион'],
    [1e15, 'квадриллион'], [1e18, 'квинтиллион'], [1e21, 'секстиллион'],
    [1e24, 'септиллион'], [1e27, 'октиллион'], [1e30, 'нониллион'],
    [1e33, 'дециллион'],
  ];
  let last = '';
  for (const [v, name] of names) {
    if (n >= v) last = name;
  }
  return last || formatNum(n);
}
