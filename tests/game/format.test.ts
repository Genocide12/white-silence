import { describe, expect, test } from 'bun:test';
import { formatNum, formatTime, plural, wordFor } from '../../src/game/format';

const NBSP = '\u00A0';

describe('formatNum', () => {
  test('малые числа', () => {
    expect(formatNum(0)).toBe('0');
    expect(formatNum(0.1)).toBe('0.1');
    expect(formatNum(1)).toBe('1');
    expect(formatNum(5.55)).toBe('5.55');
    expect(formatNum(999)).toBe('999');
  });
  test('суффиксы', () => {
    expect(formatNum(1000)).toBe(`1${NBSP}K`);
    expect(formatNum(1500)).toBe(`1.5${NBSP}K`);
    expect(formatNum(1e6)).toBe(`1${NBSP}M`);
    expect(formatNum(2.34e9)).toBe(`2.34${NBSP}B`);
    expect(formatNum(1e12)).toBe(`1${NBSP}T`);
    expect(formatNum(1e15)).toBe(`1${NBSP}Qa`);
    expect(formatNum(1e33)).toBe(`1${NBSP}Dc`);
  });
  test('инженерная запись за пределами суффиксов', () => {
    expect(formatNum(1e36)).toBe('1.00e36');
    expect(formatNum(4.2e100)).toBe('4.20e100');
  });
  test('крайние случаи', () => {
    expect(formatNum(-5)).toBe('-5');
    expect(formatNum(-1500)).toBe(`-1.5${NBSP}K`);
    expect(formatNum(Infinity)).toBe('∞');
  });
});

describe('formatTime', () => {
  test('секунды и минуты', () => {
    expect(formatTime(0)).toBe('0с');
    expect(formatTime(59)).toBe('59с');
    expect(formatTime(60)).toBe('1м 00с');
    expect(formatTime(125)).toBe('2м 05с');
  });
  test('часы и дни', () => {
    expect(formatTime(3600)).toBe('1ч 00м 00с');
    expect(formatTime(86400)).toBe('1д 00ч 00м');
  });
});

describe('plural', () => {
  test('русская плюрализация', () => {
    expect(plural(1, 'полярная звезда', 'полярные звезды', 'полярных звёзд')).toBe('полярная звезда');
    expect(plural(2, 'полярная звезда', 'полярные звезды', 'полярных звёзд')).toBe('полярные звезды');
    expect(plural(5, 'полярная звезда', 'полярные звезды', 'полярных звёзд')).toBe('полярных звёзд');
    expect(plural(11, 'полярная звезда', 'полярные звезды', 'полярных звёзд')).toBe('полярных звёзд');
    expect(plural(21, 'полярная звезда', 'полярные звезды', 'полярных звёзд')).toBe('полярная звезда');
    expect(plural(111, 'полярная звезда', 'полярные звезды', 'полярных звёзд')).toBe('полярных звёзд');
  });
});

describe('wordFor', () => {
  test('порядки величин', () => {
    expect(wordFor(1e3)).toBe('тысячу');
    expect(wordFor(1e9)).toBe('миллиард');
    expect(wordFor(1e100)).toBe('дециллион'); // выше названий — отдаёт максимум
  });
});
