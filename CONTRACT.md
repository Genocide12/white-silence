# CONTRACT.md — контракт API «Белое Безмолвие»

Единый документ для всех модулей. Читайте перед написанием любого файла.

## Правила файлов
1. Никаких import/export, CommonJS, AMD. Каждый файл — IIFE `(function(){ 'use strict'; ... })();`, расширяющий `window.WS`.
2. На этапе загрузки ЗАПРЕЩЕНЫ вызовы других модулей. Только: `WS.def(path, obj)`, `WS.boot(fn, name)`, `WS.tick(pri, fn, name)`, `WS.log/warn/err`, определения констант/функций.
3. Модули регистрируются: `WS.def('systems.needs', {...})` → доступен как `WS.systems.needs` (и `WS.Needs` если определить руками ниже). Для удобства делаем алиасы: `WS.def('Needs', obj)` → `WS.Needs`.
4. Язык кода/комментариев: русский в комментариях, латиница в идентификаторах. Строки интерфейса — через `WS.I18N.t(key)`; если i18n нет — литерал русский (i18n перехватит).
5. Синтаксис — ES5-совместимый (let/const не использовать, стрелки не использовать, template literals не использовать). Проверка: `node --check file.js` должен проходить.
6. Каждый файл начинается с JSDoc-комментария (2–6 строк): назначение, связь с другими модулями.
7. Ошибки — через WS.err() + try/catch в рискованных местах. Никаких alert/confirm/prompt.

## Приоритеты тика (WS.tick(pri, fn))
- 0 — input flush
- 5 — камера
- 10 — время (Time.update)
- 15 — погода
- 20 — мир: обновление тайлов/объектов (снег, огонь)
- 30 — сущности (движение, анимации)
- 40 — системы (нужды, температура, здоровье, скиллы)
- 41 — аудио амбиент
- 50 — ИИ
- 60 — игрок (управление, действия)
- 70 — рендер (занято: Gfx)
- 80 — UI (занято: Ui)
- 99 — input flush

## Ядро (уже реализовано)
- `WS.def/WS.boot/WS.tick/WS.log/WS.warn/WS.err` — ns.js
- `WS.RNG.mk(seed) -> {f, range, int, chance, pick, shuffle, weighted}`; `WS.RNG.strHash(s)`, `hash2(x,y,seed)`, `hash3`, `valueNoise2`, `fbm2`
- `WS.M` — clamp, lerp, dist, dist2, ang, dir8, toScreen, toWorld, TW=64, TH=32, approach, angDiff, gauss(rng), fmtKg
- `WS.Ev.on/once/off/emit` — события (список в events.js)
- `WS.Loop` — цикл; `WS.Loop.setSpeed(n)`; скорость учитывается во всех update через dt*(WS.Loop.speed)
- `WS.Time` — update(dt) вызван тиком 10; day(), hour(), hourF(), minute(), fmt(), light() 0..1, daysLeft(), isPolarNight(), DAYS_TO_SHIP=60
- `WS.Input` — down('up'), hit('inventory'), mouse() -> {x, y, wx, wy, tx, ty, left, leftP, right, rightP, wheel}, hitCode('KeyE'), keyIsDown
- `WS.Cam` — cx, cy, zoom, follow, worldToScreen, screenToWorld, viewBounds(pad), kick(power)
- `WS.Gfx` — канвас, frame() уже рисует всё; dirty() при изменении тайлов (setTile вызывает сам)
- `WS.Spr` — def(name, {w, h, draw(c, w, h, frame, dir, variant)}), defmap(name, rows, legend, scale), get(name, frame, dir, variant) -> canvas, pal (палитра), px(c, x, y, w, h, col), ell()
- `WS.Snd.play(name, {x, y, vol, gap})` — имена: click, select, step_snow, step_wood, chop, mine, build, hit, hit_flesh, death, eat, drink, door, door_locked, window_break, pickup, drop, error, craft, levelup, gunshot, reload, howl, growl, bear_roar, bird, crow, match, fall, heartbeat, victory, radio_static, bell, splash, trap_snap, bandit_shout
- `WS.Save.save/load/exists/remove/meta`
- `WS.Fx.spawn(type, x, y, o)`, burst, text(str, x, y, o)
- `WS.State.newGame(seed, prof, traits)` — создаёт WS.G; поля см. core/state.js

## Мир (реализовано в world/world.js)
- `WS.World.T` — enum тайлов (VOID 0 … CRYPT 31)
- `WS.World.tiles/blocked/objects/ents/lights/buildings`, `w=220, h=220`
- `tileAt/setTile/carve/blockTile/isTileBlocked/terrainMoveCost`
- `addObject(o)` — o: {x, y, sprName, solid, name, container?, inv?, door?, light?, fireLight?, scale?, z?, render(ctx,sx,sy,zoom)?}
- `addEnt(e)` / `removeEnt(e)` — e: {x, y, hp, dir, spr|sprName, ...}
- `addLight({x, y, r, a, flicker, fire})`
- `query(x0, y0, x1, y1)` — для рендера; `entsNear(x, y, r)`; `objsAt(tx, ty)`; `objAt(tx, ty)`
- `isInside(x, y)`, `buildingAt(tx, ty)`
- `spawnPoint` — точка старта игрока
- `serialize()/deserialize()/reset()` — диффы

## Сущности (договор)
Общие поля: `{id, kind, x, y, dir (0=N..7=NW), hp, maxHp, speed, sprName, sprFrame, dead?, sleeping?, brain?}`
kind: 'player', 'wolf', 'bear', 'deer', 'hare', 'crow', 'bandit', 'hermit', 'fish', 'drop'
Спрайты: `sprName` + `sprFrame` (кадр анимации) + `dir`. Gfx рисует `WS.Spr.get(sprName, sprFrame, dir)`.
Функция `e.render(ctx, sx, sy, zoom)` опциональна для кастомной отрисовки.
Смерть: `WS.Ev.emit('ent:kill', {ent, by})`; удалить `WS.World.removeEnt(e)`.

## Игрок (WS.G.player — см. core/state.js)
- нужды: `needs.{hunger, thirst, fatigue, sanity, warmth}` 0..100
- `temp` — температура тела 37.0
- инвентарь: `inv: [{id, count, cond?, data?}]`; `equip: {head, torso, legs, feet, hands, back, hand1, hand2}` (слоты объектов {id, cond})
- навыки: `skills.{axe, melee, firearm, sneak, run, cook, carpentry, tailor, medic, forage, track, survive}` — {lv 0..10, xp}

## Предметы (js/data/items_*.js)
Схема — см. js/data/items_seed.js. Регистрация: копировать в `WS.Data.items[id]` внутри WS.boot.
ВАЖНО: сначала `WS.Data = WS.Data || {}; WS.Data.items = WS.Data.items || {};`.

## UI (js/ui/*)
- `WS.Ui.showMenu()`, `WS.Ui.modal()` (true — модальный экран открыт, ввод игрока отключён)
- `WS.Ui.toast(text, kind)` — kind: info, warn, bad, good
- Экраны добавляются в `#ui-root` как `<div class="ws-panel">`.
- Один экранный файл = один экран: show/hide через classList 'hidden'.

## Локализация (js/i18n/ru.js, en.js)
`WS.I18N.t(key)` — ключи вида 'item.bread.name', 'ui.inventory', 'wolf.desc'.
Словари: `WS.Data.locales = { ru: {...}, en: {...} }`. Все новые строки идут в словарь.

## Генерация мира (js/world/gen_*.js)
Единственная точка входа: `WS.Gen.generate(seed)` — вызывается из Main.newGame.
Внутри: `var R = WS.RNG.mk(seed);` — все случайности через R (детерминизм!).
Порядок: рельеф → река/озеро → дороги → посёлок (план) → здания (внешние) → интерьеры → мебель/лут → лес → звери → spawn игрока.
Регистрация: `WS.def('Gen', { generate: fn })`.

## Погода (js/world/weather.js)
`WS.def('Weather', {...})`: `newGame()`, `update(dt)` (тик 15), `current() -> {id, temp, wind, snow, light}`, `windLevel() 0..1`, `lightDim() 0..1`, `draw(ctx, cam)` (вызывает Gfx), `tempOutside()` — °C. Типы: clear, overcast, snow, blizzard, fog, hard_frost, snowstorm.

## Крафт (js/systems/craft.js + data/recipes.js)
`WS.Craft.recipes` = [{id, name_key, cat, station, time, req: [{id, n}], tools: [id], out: [{id, n}], skill: {id, lv}}]
cat: survival, carpentry, cook, tailor, ammo, misc. station: null | 'fire' | 'stove' | 'workbench' | 'forge'.

## Лут (js/data/loot_*.js)
`WS.Data.loot['house_kitchen'] = { rolls: [3, 5], items: [{id, w, min, max}...] }`
Контейнер объектов: `o.container = 'house_kitchen'`; `o.inv = null` (лениво генерится при первом обыске, R2 = WS.RNG.mk(seed ^ hash(o.id))).

## Запрещено
- Менять core/* и world/world.js (доработки — через меня)
- Использовать внешние CDN/шрифты (кроме системных)
- alert/confirm/prompt
- canvas в HTML (только #game)
- Audio без WS.Snd
- Свой requestAnimationFrame (только WS.tick)
