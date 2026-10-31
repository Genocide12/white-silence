// профилировка decide(): что съедает время бота
import { createInitialState, tick, doClick } from '../src/game/engine';
import { BOTS, decide } from './sim-incremental';

const s = createInitialState();
const rand = () => 0.5;
// разгон: 3 часа игры с решениями каждые 10с — как «Оптимальный»
const t0 = Date.now();
let decides = 0;
for (let t = 0; t < 3 * 3600; t += 1) {
  doClick(s, 3);
  if (t % 10 === 0) { decide(s, BOTS[1], [], rand); decides++; }
  tick(s, 1, rand);
}
const wall = Date.now() - t0;
console.log(`3 игровых часа: ${wall}мс, decide-вызовов: ${decides}`);
console.log(`средний decide: ${(wall / Math.max(1, decides)).toFixed(2)}мс`);
console.log(`дров: ${s.totalWood.toExponential(2)}, рецептов: ${s.crafted.length}, обысков: ${s.searches.reduce((a, b) => a + b, 0)}`);
