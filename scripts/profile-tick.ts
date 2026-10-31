// профилировка горячего пути движка: где уходят микросекунды тика
import { createInitialState, tick, woodPerSec, coalPerSec, clickPower, doClick, checkAchievements, buyGenerator } from '../src/game/engine';

const s = createInitialState();
const rand = () => 0.5;
// разгон до середины игры: техники + топка + склад
s.gens = [50, 40, 30, 20, 10, 5, 3, 2, 1, 1];
s.mines = [5, 3, 1];
s.telegraphs = [3, 1];
s.furnace = 12;
s.wood = 1e9;
for (let i = 0; i < 60; i++) buyGenerator(s, i % 10, 1);
s.crafted = ['shchi', 'porridge', 'ukha', 'bread', 'kompot', 'pie_fish', 'pie_meat', 'pie_berry'];

const N = 200_000;
let t0 = Date.now();
for (let i = 0; i < N; i++) tick(s, 1, rand);
let tTick = Date.now() - t0;

t0 = Date.now();
for (let i = 0; i < N; i++) woodPerSec(s);
let tWps = Date.now() - t0;

t0 = Date.now();
for (let i = 0; i < N; i++) coalPerSec(s);
let tCoal = Date.now() - t0;

t0 = Date.now();
for (let i = 0; i < N; i++) clickPower(s);
let tClick = Date.now() - t0;

t0 = Date.now();
for (let i = 0; i < N; i++) checkAchievements(s);
let tAch = Date.now() - t0;

console.log(`tick:        ${(tTick / N * 1000).toFixed(2)} мкс/вызов`);
console.log(`woodPerSec:  ${(tWps / N * 1000).toFixed(2)} мкс/вызов`);
console.log(`coalPerSec:  ${(tCoal / N * 1000).toFixed(2)} мкс/вызов`);
console.log(`clickPower:  ${(tClick / N * 1000).toFixed(2)} мкс/вызов`);
console.log(`checkAchiev: ${(tAch / N * 1000).toFixed(2)} мкс/вызов`);
console.log(`дров/с в состоянии: ${woodPerSec(s).toExponential(2)}`);
