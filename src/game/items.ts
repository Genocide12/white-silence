// ============================================================
// items.ts — предметы, еда, оружие, одежда, крафт, лор
// ============================================================

export type ItemCategory = 'mat' | 'food' | 'drink' | 'tool' | 'weapon' | 'cloth' | 'med' | 'misc' | 'fuel';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  cat: ItemCategory;
  /** вес, кг */
  weight: number;
  stack?: number;
  /** восстановление голода 0..100 */
  food?: number;
  /** восстановление жажды 0..100 */
  drink?: number;
  /** восстановление энергии 0..100 */
  energy?: number;
  /** лечение HP */
  heal?: number;
  /** шанс болезни, если есть сырое (0..1) */
  sick?: number;
  /** урон в ближнем бою */
  dmg?: number;
  /** дальность оружия (тайлов) */
  reach?: number;
  /** скорость атаки, сек */
  atkSpeed?: number;
  /** теплота одежды */
  warmth?: number;
  /** слот: head|torso|legs|feet|hands */
  slot?: 'head' | 'torso' | 'legs' | 'feet' | 'hands';
  /** можно ли рубить деревья */
  chop?: number;
  /** можно ли добывать камень */
  mine?: number;
  /** топливо для костра, мин горения */
  burn?: number;
  /** костёр разжигается */
  tinder?: boolean;
  /** жидкость (замерзает на морозе) */
  liquid?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  // ---- материалы ----
  wood:      { id: 'wood', name: 'Древесина', desc: 'Ветви и щепки. Горят, из них всё строили.', cat: 'mat', weight: 0.7, stack: 30, burn: 2.2, chop: 0 },
  log:       { id: 'log', name: 'Бревно', desc: 'Тяжёлое бревно для больших построек.', cat: 'mat', weight: 3.5, stack: 10, burn: 7 },
  stone:     { id: 'stone', name: 'Камень', desc: 'Прочный серый камень.', cat: 'mat', weight: 1.2, stack: 30 },
  scrap:     { id: 'scrap', name: 'Металлолом', desc: 'Ржавые детали со станции.', cat: 'mat', weight: 0.9, stack: 30 },
  wire:      { id: 'wire', name: 'Проволока', desc: 'Стальная проволока. Связывает всё.', cat: 'mat', weight: 0.2, stack: 20 },
  rope:      { id: 'rope', name: 'Верёвка', desc: 'Прочная пеньковая верёвка.', cat: 'mat', weight: 0.5, stack: 10 },
  cloth:     { id: 'cloth', name: 'Тряпьё', desc: 'Куски ткани, бинты, ветошь.', cat: 'mat', weight: 0.15, stack: 30 },
  feather:   { id: 'feather', name: 'Перья', desc: 'Птичьи перья для стрел.', cat: 'mat', weight: 0.02, stack: 30 },
  bone:      { id: 'bone', name: 'Кости', desc: 'Кости животных. Иглы, крючки, клей.', cat: 'mat', weight: 0.2, stack: 20 },
  fat:       { id: 'fat', name: 'Жир', desc: 'Топлёный жир. Пища и топливо.', cat: 'mat', weight: 0.3, stack: 20, food: 8 },
  hide:      { id: 'hide', name: 'Шкура', desc: 'Сырая шкура животного.', cat: 'mat', weight: 1.8, stack: 8 },
  tannedHide:{ id: 'tannedHide', name: 'Мех', desc: 'Выделанная шкура — тёплая и мягкая.', cat: 'mat', weight: 1.2, stack: 8 },
  snowBlock: { id: 'snowBlock', name: 'Снежный блок', desc: 'Плотный блок для иглу.', cat: 'mat', weight: 1.0, stack: 12 },
  battery:   { id: 'battery', name: 'Батарея', desc: 'Кислотная батарея со склада.', cat: 'mat', weight: 4, stack: 3 },
  antenna:   { id: 'antenna', name: 'Антенна', desc: 'Радиомачта из обломков. Нужен передатчик.', cat: 'mat', weight: 6, stack: 1 },
  // ---- еда ----
  berries:   { id: 'berries', name: 'Морошка', desc: 'Кислые мороженые ягоды.', cat: 'food', weight: 0.1, stack: 15, food: 6 },
  rawMeat:   { id: 'rawMeat', name: 'Сырое мясо', desc: 'Есть сырым — отравиться.', cat: 'food', weight: 0.5, stack: 12, food: 22, sick: 0.75 },
  cookedMeat:{ id: 'cookedMeat', name: 'Жареное мясо', desc: 'Горячее, сытное, пахнет домом.', cat: 'food', weight: 0.4, stack: 12, food: 42, energy: 5 },
  driedMeat: { id: 'driedMeat', name: 'Вяленое мясо', desc: 'Не портится и греет в дороге.', cat: 'food', weight: 0.2, stack: 20, food: 30 },
  rawFish:   { id: 'rawFish', name: 'Рыба', desc: 'Свежий улов из полыньи.', cat: 'food', weight: 0.5, stack: 12, food: 18, sick: 0.6 },
  cookedFish:{ id: 'cookedFish', name: 'Печёная рыба', desc: 'Дымится на костре.', cat: 'food', weight: 0.4, stack: 12, food: 36, energy: 4 },
  cannedStew:{ id: 'cannedStew', name: 'Тушёнка', desc: 'Банка станции «Восток-7».', cat: 'food', weight: 0.45, stack: 10, food: 55 },
  crackers:  { id: 'crackers', name: 'Сухари', desc: 'Сухой паёк экспедиции.', cat: 'food', weight: 0.1, stack: 25, food: 12 },
  chocoBar:  { id: 'chocoBar', name: 'Шоколад', desc: 'Последняя радость.', cat: 'food', weight: 0.08, stack: 10, food: 16, energy: 14 },
  coffeeBeans:{id: 'coffeeBeans', name: 'Кофе', desc: 'Молотый. Варить в котелке.', cat: 'food', weight: 0.1, stack: 8 },
  // ---- напитки ----
  snowBall:  { id: 'snowBall', name: 'Снег', desc: 'Замёрзшая вода. Есть нельзя — простуда.', cat: 'drink', weight: 0.2, stack: 10, liquid: true },
  water:     { id: 'water', name: 'Вода', desc: 'Чистая питьевая вода.', cat: 'drink', weight: 0.5, stack: 5, drink: 45, liquid: true },
  dirtyWater:{ id: 'dirtyWater', name: 'Талая вода', desc: 'Из полыньи. Кипятить!', cat: 'drink', weight: 0.5, stack: 5, drink: 20, sick: 0.5, liquid: true },
  coffee:    { id: 'coffee', name: 'Кофе', desc: 'Горячий, бодрящий.', cat: 'drink', weight: 0.4, stack: 3, drink: 30, energy: 35, food: 4, liquid: true },
  pineTea:   { id: 'pineTea', name: 'Хвойный чай', desc: 'Витамины с иголками.', cat: 'drink', weight: 0.4, stack: 3, drink: 25, energy: 8, heal: 2, liquid: true },
  // ---- инструменты ----
  stoneAxe:  { id: 'stoneAxe', name: 'Каменный топор', desc: 'Рубит деревья. Бьёт волков.', cat: 'tool', weight: 2.5, chop: 1, dmg: 14, reach: 1.2, atkSpeed: 0.75, stack: 1 },
  ironAxe:   { id: 'ironAxe', name: 'Стальной топор', desc: 'Топор со склада станции.', cat: 'tool', weight: 3, chop: 2.2, dmg: 24, reach: 1.2, atkSpeed: 0.8, stack: 1 },
  stonePick: { id: 'stonePick', name: 'Каменная кирка', desc: 'Отбивает камень от скал.', cat: 'tool', weight: 2.8, mine: 1, dmg: 10, reach: 1.1, atkSpeed: 0.9, stack: 1 },
  knife:     { id: 'knife', name: 'Нож', desc: 'Разделывает добычу, режет ткань.', cat: 'tool', weight: 0.4, dmg: 8, reach: 0.9, atkSpeed: 0.4, stack: 1 },
  saw:       { id: 'saw', name: 'Снежная пила', desc: 'Режет снежные блоки для иглу.', cat: 'tool', weight: 1.6, dmg: 6, reach: 0.9, atkSpeed: 0.6, stack: 1 },
  pot:       { id: 'pot', name: 'Котелок', desc: 'Варить снег, кипятить воду.', cat: 'tool', weight: 1.2, stack: 1 },
  torch:     { id: 'torch', name: 'Факел', desc: 'Свет и тепло в руке. Волки боятся.', cat: 'tool', weight: 0.8, burn: 12, dmg: 7, reach: 1.0, atkSpeed: 0.6, stack: 1 },
  lantern:   { id: 'lantern', name: 'Фонарь', desc: 'Станционный керосиновый фонарь.', cat: 'tool', weight: 1.4, stack: 1 },
  fishingRod:{ id: 'fishingRod', name: 'Удочка', desc: 'Ловит рыбу в полынье.', cat: 'tool', weight: 0.9, stack: 1 },
  // ---- оружие ----
  spear:     { id: 'spear', name: 'Копьё', desc: 'Длинная дубина с жалом. Держит зверя на дистанции.', cat: 'weapon', weight: 2.2, dmg: 19, reach: 2.1, atkSpeed: 0.85, chop: 0.5, stack: 1 },
  bow:       { id: 'bow', name: 'Лук', desc: 'Охота на дистанции.', cat: 'weapon', weight: 1.1, dmg: 17, reach: 8.5, atkSpeed: 1.1, stack: 1 },
  arrow:     { id: 'arrow', name: 'Стрела', desc: 'Самодельная стрела с перьями.', cat: 'weapon', weight: 0.06, stack: 20, dmg: 3 },
  // ---- одежда ----
  oldParka:  { id: 'oldParka', name: 'Старая куртка', desc: 'Ветром битая, но всё же куртка.', cat: 'cloth', weight: 1.5, warmth: 1.6, slot: 'torso', stack: 1 },
  furParka:  { id: 'furParka', name: 'Меховая парка', desc: 'Из волчьих шкур. Тепло родного леса.', cat: 'cloth', weight: 2.6, warmth: 3.4, slot: 'torso', stack: 1, dmg: 2, reach: 1.0, atkSpeed: 0.8 },
  wolfCloak: { id: 'wolfCloak', name: 'Волчий плащ', desc: 'Вожак стаи не оценит иронию.', cat: 'cloth', weight: 3, warmth: 4.2, slot: 'torso', stack: 1 },
  hat:       { id: 'hat', name: 'Ушанка', desc: 'Без шапки на морозе не живут.', cat: 'cloth', weight: 0.4, warmth: 1.1, slot: 'head', stack: 1 },
  furHat:    { id: 'furHat', name: 'Меховая шапка', desc: 'Тёплый капюшон из шкур.', cat: 'cloth', weight: 0.5, warmth: 1.8, slot: 'head', stack: 1 },
  pants:     { id: 'pants', name: 'Штаны', desc: 'Ватные штаны полярника.', cat: 'cloth', weight: 0.9, warmth: 1.2, slot: 'legs', stack: 1 },
  furPants:  { id: 'furPants', name: 'Меховые штаны', desc: 'Штаны из выделанных шкур.', cat: 'cloth', weight: 1.4, warmth: 2.2, slot: 'legs', stack: 1 },
  boots:     { id: 'boots', name: 'Валенки', desc: 'Сухие — спасают. Мокрые — нет.', cat: 'cloth', weight: 0.8, warmth: 0.9, slot: 'feet', stack: 1 },
  furBoots:  { id: 'furBoots', name: 'Меховые унты', desc: 'Ноги как в печке.', cat: 'cloth', weight: 1.1, warmth: 1.7, slot: 'feet', stack: 1 },
  gloves:    { id: 'gloves', name: 'Рукавицы', desc: 'Пальцы целее будут.', cat: 'cloth', weight: 0.3, warmth: 0.7, slot: 'hands', stack: 1 },
  // ---- медицина ----
  bandage:   { id: 'bandage', name: 'Бинт', desc: 'Останавливает кровотечение.', cat: 'med', weight: 0.1, stack: 10, heal: 15 },
  medkit:    { id: 'medkit', name: 'Аптечка', desc: 'Полный набор станции.', cat: 'med', weight: 1.0, stack: 3, heal: 45 },
  herbs:     { id: 'herbs', name: 'Травяной сбор', desc: 'Ягель и зверобой. Помогает от хвори.', cat: 'med', weight: 0.1, stack: 12, heal: 6 },
  // ---- прочее ----
  book:      { id: 'book', name: 'Книга', desc: 'Сжечь можно, жалко.', cat: 'misc', weight: 0.6, stack: 5, burn: 4 },
  flare:     { id: 'flare', name: 'Сигнальная ракета', desc: 'Освещает ночь и отпугивает зверя.', cat: 'misc', weight: 0.2, stack: 5 },
};

// ============================================================
// Рецепты крафта
// ============================================================
export interface Recipe {
  id: string;
  name: string;
  out: { id: string; n: number };
  need: { id: string; n: number }[];
  needSkill?: { id: string; lvl: number };
  atFire?: boolean; // требуется костёр/печка рядом
  minutes: number; // игрового времени
  xp?: number;
  cat: 'basics' | 'tools' | 'camp' | 'food' | 'cloth' | 'build' | 'signal';
  hint?: string;
}

export const RECIPES: Recipe[] = [
  // основы
  { id: 'r_rope', name: 'Верёвка', out: { id: 'rope', n: 1 }, need: [{ id: 'cloth', n: 4 }], minutes: 20, xp: 6, cat: 'basics', hint: 'Скрутить из тряпья' },
  { id: 'r_torch', name: 'Факел', out: { id: 'torch', n: 1 }, need: [{ id: 'wood', n: 2 }, { id: 'cloth', n: 2 }, { id: 'fat', n: 1 }], minutes: 12, xp: 6, cat: 'basics' },
  { id: 'r_bandage', name: 'Бинт', out: { id: 'bandage', n: 2 }, need: [{ id: 'cloth', n: 3 }], minutes: 8, xp: 4, cat: 'basics' },
  { id: 'r_arrow', name: 'Стрелы ×4', out: { id: 'arrow', n: 4 }, need: [{ id: 'wood', n: 2 }, { id: 'feather', n: 2 }, { id: 'scrap', n: 1 }], minutes: 18, xp: 8, cat: 'basics' },
  // инструменты
  { id: 'r_stoneAxe', name: 'Каменный топор', out: { id: 'stoneAxe', n: 1 }, need: [{ id: 'wood', n: 3 }, { id: 'stone', n: 2 }, { id: 'rope', n: 1 }], minutes: 35, xp: 15, cat: 'tools', hint: 'Первый инструмент новичка' },
  { id: 'r_stonePick', name: 'Каменная кирка', out: { id: 'stonePick', n: 1 }, need: [{ id: 'wood', n: 3 }, { id: 'stone', n: 3 }, { id: 'rope', n: 1 }], minutes: 35, xp: 15, cat: 'tools' },
  { id: 'r_saw', name: 'Снежная пила', out: { id: 'saw', n: 1 }, need: [{ id: 'scrap', n: 3 }, { id: 'wood', n: 2 }, { id: 'rope', n: 1 }], minutes: 40, xp: 18, cat: 'tools' },
  { id: 'r_knife', name: 'Нож', out: { id: 'knife', n: 1 }, need: [{ id: 'scrap', n: 2 }, { id: 'cloth', n: 1 }], needSkill: { id: 'craft', lvl: 1 }, minutes: 30, xp: 16, cat: 'tools' },
  { id: 'r_rod', name: 'Удочка', out: { id: 'fishingRod', n: 1 }, need: [{ id: 'wood', n: 3 }, { id: 'rope', n: 1 }, { id: 'bone', n: 1 }], needSkill: { id: 'craft', lvl: 2 }, minutes: 30, xp: 16, cat: 'tools' },
  { id: 'r_bow', name: 'Лук', out: { id: 'bow', n: 1 }, need: [{ id: 'wood', n: 4 }, { id: 'rope', n: 2 }], needSkill: { id: 'craft', lvl: 2 }, minutes: 50, xp: 25, cat: 'tools' },
  { id: 'r_spear', name: 'Копьё', out: { id: 'spear', n: 1 }, need: [{ id: 'wood', n: 3 }, { id: 'knife', n: 1 }, { id: 'rope', n: 1 }], minutes: 25, xp: 14, cat: 'tools' },
  // лагерь
  { id: 'r_campfire', name: 'Кострище', out: { id: 'campfire', n: 1 }, need: [{ id: 'wood', n: 4 }, { id: 'stone', n: 4 }], minutes: 25, xp: 12, cat: 'camp', hint: 'Ставится на землю (клавиша B в режиме стройки)' },
  { id: 'r_igloo', name: 'Снежное иглу', out: { id: 'igloo', n: 1 }, need: [{ id: 'snowBlock', n: 8 }], needSkill: { id: 'craft', lvl: 2 }, minutes: 60, xp: 30, cat: 'camp', hint: 'Укрытие от ветра' },
  { id: 'r_dryrack', name: 'Сушилка', out: { id: 'dryrack', n: 1 }, need: [{ id: 'wood', n: 4 }, { id: 'rope', n: 2 }], minutes: 30, xp: 12, cat: 'camp', hint: 'Вялит мясо в дорогу' },
  { id: 'r_snowblock', name: 'Снежные блоки ×2', out: { id: 'snowBlock', n: 2 }, need: [{ id: 'water', n: 1 }], atFire: true, minutes: 15, xp: 5, cat: 'camp', hint: 'Снег + вода, замерзает в блоки' },
  // еда
  { id: 'r_cookMeat', name: 'Жареное мясо', out: { id: 'cookedMeat', n: 1 }, need: [{ id: 'rawMeat', n: 1 }], atFire: true, minutes: 14, xp: 8, cat: 'food' },
  { id: 'r_cookFish', name: 'Печёная рыба', out: { id: 'cookedFish', n: 1 }, need: [{ id: 'rawFish', n: 1 }], atFire: true, minutes: 12, xp: 8, cat: 'food' },
  { id: 'r_dryMeat', name: 'Вяленое мясо', out: { id: 'driedMeat', n: 1 }, need: [{ id: 'rawMeat', n: 1 }, { id: 'salt', n: 0 }], atFire: false, minutes: 90, xp: 8, cat: 'food', hint: 'На сушилке: используй сушилку' },
  { id: 'r_boilWater', name: 'Кипячёная вода', out: { id: 'water', n: 2 }, need: [{ id: 'dirtyWater', n: 2 }, { id: 'pot', n: 1 }], atFire: true, minutes: 16, xp: 6, cat: 'food' },
  { id: 'r_meltSnow', name: 'Талая вода', out: { id: 'dirtyWater', n: 2 }, need: [{ id: 'snowBall', n: 2 }, { id: 'pot', n: 1 }], atFire: true, minutes: 10, xp: 4, cat: 'food' },
  { id: 'r_coffee', name: 'Кофе', out: { id: 'coffee', n: 1 }, need: [{ id: 'coffeeBeans', n: 1 }, { id: 'water', n: 1 }, { id: 'pot', n: 1 }], atFire: true, minutes: 12, xp: 7, cat: 'food' },
  { id: 'r_pineTea', name: 'Хвойный чай', out: { id: 'pineTea', n: 1 }, need: [{ id: 'wood', n: 1 }, { id: 'water', n: 1 }, { id: 'pot', n: 1 }], atFire: true, minutes: 10, xp: 5, cat: 'food' },
  // одежда
  { id: 'r_tan', name: 'Выделать шкуру', out: { id: 'tannedHide', n: 1 }, need: [{ id: 'hide', n: 1 }, { id: 'fat', n: 1 }, { id: 'knife', n: 1 }], minutes: 45, xp: 14, cat: 'cloth' },
  { id: 'r_hat', name: 'Меховая шапка', out: { id: 'furHat', n: 1 }, need: [{ id: 'tannedHide', n: 1 }, { id: 'cloth', n: 2 }], minutes: 40, xp: 18, cat: 'cloth' },
  { id: 'r_furParka', name: 'Меховая парка', out: { id: 'furParka', n: 1 }, need: [{ id: 'tannedHide', n: 3 }, { id: 'cloth', n: 4 }, { id: 'rope', n: 1 }], needSkill: { id: 'craft', lvl: 2 }, minutes: 90, xp: 40, cat: 'cloth', hint: 'Лучшая одежда до плаща вожака' },
  { id: 'r_furPants', name: 'Меховые штаны', out: { id: 'furPants', n: 1 }, need: [{ id: 'tannedHide', n: 2 }, { id: 'cloth', n: 2 }], needSkill: { id: 'craft', lvl: 1 }, minutes: 60, xp: 24, cat: 'cloth' },
  { id: 'r_furBoots', name: 'Меховые унты', out: { id: 'furBoots', n: 1 }, need: [{ id: 'tannedHide', n: 2 }, { id: 'rope', n: 1 }], minutes: 50, xp: 20, cat: 'cloth' },
  { id: 'r_wolfCloak', name: 'Волчий плащ', out: { id: 'wolfCloak', n: 1 }, need: [{ id: 'tannedHide', n: 5 }, { id: 'bone', n: 4 }, { id: 'rope', n: 2 }], needSkill: { id: 'craft', lvl: 4 }, minutes: 120, xp: 60, cat: 'cloth', hint: 'Трофейная вещь' },
  // стройка
  { id: 'r_wall', name: 'Стена из брёвен', out: { id: 'wall', n: 1 }, need: [{ id: 'log', n: 2 }], minutes: 30, xp: 12, cat: 'build', hint: 'Защита лагеря' },
  { id: 'r_door', name: 'Дверь', out: { id: 'door', n: 1 }, need: [{ id: 'log', n: 1 }, { id: 'scrap', n: 2 }, { id: 'rope', n: 1 }], minutes: 25, xp: 12, cat: 'build' },
  { id: 'r_bedroll', name: 'Спальник', out: { id: 'bedroll', n: 1 }, need: [{ id: 'tannedHide', n: 2 }, { id: 'cloth', n: 4 }], minutes: 45, xp: 16, cat: 'build', hint: 'Сон в тепле' },
  { id: 'r_crate', name: 'Ящик', out: { id: 'crate', n: 1 }, need: [{ id: 'wood', n: 4 }, { id: 'scrap', n: 1 }], minutes: 20, xp: 8, cat: 'build', hint: 'Хранение вещей' },
  // сигнал спасения
  { id: 'r_antenna', name: 'Радиомачта', out: { id: 'antennaBuild', n: 1 }, need: [{ id: 'wire', n: 4 }, { id: 'scrap', n: 6 }, { id: 'log', n: 2 }], needSkill: { id: 'craft', lvl: 3 }, minutes: 90, xp: 50, cat: 'signal', hint: 'Возвести у радиорубки' },
];

// Постройки (не предметы инвентаря, а объекты мира)
export interface BuildDef {
  id: string;
  name: string;
  desc: string;
  hp: number;
  blocks: boolean;
  light?: number;
  warm?: number;
  interact?: 'sleep' | 'store' | 'cook' | 'fish' | 'radio' | 'dry';
}

export const BUILDS: Record<string, BuildDef> = {
  campfire:  { id: 'campfire', name: 'Кострище', desc: 'Даёт свет и тепло. Подкидывай дрова.', hp: 60, blocks: false, light: 5.5, warm: 26, interact: 'cook' },
  igloo:     { id: 'igloo', name: 'Иглу', desc: 'Снежный купол. Внутри нет ветра.', hp: 100, blocks: true, warm: 14, interact: 'sleep' },
  dryrack:   { id: 'dryrack', name: 'Сушилка', desc: 'Вялит мясо и рыбу.', hp: 40, blocks: true, interact: 'dry' },
  wall:      { id: 'wall', name: 'Стена', desc: 'Бревенчатая стена. Волкам не по зубам.', hp: 220, blocks: true },
  door:      { id: 'door', name: 'Дверь', desc: 'Проход, который можно закрыть.', hp: 160, blocks: false },
  bedroll:   { id: 'bedroll', name: 'Спальник', desc: 'Мягко и тепло спать.', hp: 30, blocks: false, warm: 8, interact: 'sleep' },
  crate:     { id: 'crate', name: 'Ящик', desc: 'Хранит 12 предметов.', hp: 50, blocks: true, interact: 'store' },
  antennaBuild:{ id: 'antennaBuild', name: 'Радиомачта', desc: 'Собери и подавай сигнал бедствия.', hp: 200, blocks: false, interact: 'radio' },
};

// ============================================================
// Записки (лор станции)
// ============================================================
export interface NoteDef { id: string; title: string; text: string; place: string }

export const NOTES: NoteDef[] = [
  { id: 'n1', title: 'Журнал. День 212', text: 'Температура минус сорок восемь. Генератор №2 снова заглох. Собираем вещи — Москва обещала борт через трое суток. Гусев остаётся ждать механиков с «Полюса». Больше его никто не видел.', place: 'жилой модуль' },
  { id: 'n2', title: 'Заметка на холодильнике', text: 'Собака воет вторую ночь. Лапы не пускаем её на улицу после того, как у восточных скал видели следы. Крупные. Не росомаха. Круглые, как у медведя, но когти длиннее.', place: 'жилой модуль' },
  { id: 'n3', title: 'Радиожурнал. Последняя запись', text: '…повторяю: шторм сорвал антенну. Частоты молчат, приёмник жив только на батарее. Если кто слышит — мы уходим к побережью пешком. Станция «Восток-7» прекращает работу. 14 октября.', place: 'радиорубка' },
  { id: 'n4', title: 'Инструкция по выживанию', text: 'Соблюдай правила: два слоя одежды, сухие ноги. Вода из полыньи — только кипятить. Волки боятся огня — костёр жги всю ночь. Если замёрз — двигайся, сон на морозе смерть.', place: 'жилой модуль' },
  { id: 'n5', title: 'Список Гусева', text: 'Сделать: починить печку. Сходить к скалам за камнем. Проверить полыньи. НЕ ходить к северному лесу после заката — я слышал их там. Каждый божий день слышу.', place: 'склад' },
  { id: 'n6', title: 'К.pagesа газеты', text: '«…полярная ночь продлится ещё сорок суток. Метеорологи прогнозируют аномальные метели…» Остаток газеты ушёл на растопку.', place: 'склад' },
  { id: 'n7', title: 'Дневник, без даты', text: 'Восемь дней один. Ем консервы, снег топлю на печке. Вчера волки прошли у самого купола — свет фонаря их остановил. Слышал, как ведущий поднял вой, и стая ушла на север. Понял: они боятся света. И того, кто не убегает.', place: 'радиорубка' },
  { id: 'n8', title: 'Обрывок карты', text: 'Север — скалы и медвежий лог. Восток — старые полыньи, рыба. Запад — лес, волки. Юг — побережье, туда ушла смена. Джентльмены, выбирайтесь, кто как может.', place: 'лаборатория' },
  { id: 'n9', title: 'Медкарта', text: 'Пациент: Гусев С. П. Обморожение II ст. Направлен на материк. Отказался: «кто-то должен остаться на связи». Врачу так и не удалось его переубедить.', place: 'лаборатория' },
  { id: 'n10', title: 'Последняя записка', text: 'Если ты это читаешь — я не дождался вертолёта, ушёл к побережью. Дверь не заперта, печь работает. На стене схема мачты: соберёшь — подашь сигнал. Удачи, коллега. Мы, полярники, живучие.', place: 'радиорубка' },
];

export function itemDef(id: string): ItemDef {
  return ITEMS[id];
}

export function itemName(id: string): string {
  return ITEMS[id] ? ITEMS[id].name : id;
}

export function itemWeight(id: string): number {
  return ITEMS[id] ? ITEMS[id].weight : 0;
}

/** Грузоподъёмность и слоты инвентаря */
export const INV_MAX_SLOTS = 21;
export const EQUIP_SLOTS: { key: string; name: string }[] = [
  { key: 'head', name: 'Голова' },
  { key: 'torso', name: 'Торс' },
  { key: 'legs', name: 'Ноги' },
  { key: 'feet', name: 'Обувь' },
  { key: 'hands', name: 'Руки' },
];
