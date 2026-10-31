// Одноразовый зонд: полный список предметов без русских имён.
import { createRequire } from 'module';
const require = createRequire('/home/z/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.argv[2];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3500);
  const bad = await page.evaluate(() => {
    const items = WS.Data.items;
    const out = [];
    for (const id in items) {
      const nm = WS.Inv.nameOf(id);
      if (/^[A-Z][a-z]+( [A-Za-z]+)*$/.test(nm) && !/[а-яё]/i.test(nm)) {
        out.push(id + '|' + nm);
      }
    }
    return out;
  });
  console.log(bad.join('\n'));
  console.log('TOTAL: ' + bad.length);
  await browser.close();
};
run().catch(e => { console.error(e); process.exit(1); });
