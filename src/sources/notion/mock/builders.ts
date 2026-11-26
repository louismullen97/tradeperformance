import type { NotionPage, NotionPropertySchema, NotionPropertyValue, NotionRichText } from '../types';

/** Deterministic PRNG (mulberry32) so mock data is identical on every load. */
export function rng(seed: number) {
  let a = seed;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    between: (min: number, max: number) => min + next() * (max - min),
  };
}

export const rt = (s: string): NotionRichText[] =>
  s ? [{ type: 'text', plain_text: s, text: { content: s } }] : [];

const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const opts = (names: string[]) => names.map((name, i) => ({ name, color: COLORS[i % COLORS.length] }));

/** Property schema builders. */
export const S = {
  title: (id: string, name: string): NotionPropertySchema => ({ id, name, type: 'title', title: {} }),
  text: (id: string, name: string): NotionPropertySchema => ({ id, name, type: 'rich_text', rich_text: {} }),
  number: (id: string, name: string, format = 'number'): NotionPropertySchema => ({ id, name, type: 'number', number: { format } }),
  select: (id: string, name: string, options: string[]): NotionPropertySchema => ({ id, name, type: 'select', select: { options: opts(options) } }),
  status: (id: string, name: string, options: string[]): NotionPropertySchema => ({ id, name, type: 'status', status: { options: opts(options) } }),
  multi: (id: string, name: string, options: string[]): NotionPropertySchema => ({ id, name, type: 'multi_select', multi_select: { options: opts(options) } }),
  date: (id: string, name: string): NotionPropertySchema => ({ id, name, type: 'date', date: {} }),
  checkbox: (id: string, name: string): NotionPropertySchema => ({ id, name, type: 'checkbox', checkbox: {} }),
  url: (id: string, name: string): NotionPropertySchema => ({ id, name, type: 'url', url: {} }),
  files: (id: string, name: string): NotionPropertySchema => ({ id, name, type: 'files', files: {} }),
  formula: (id: string, name: string, expression: string): NotionPropertySchema => ({ id, name, type: 'formula', formula: { expression } }),
};

/** Property value builders. */
export const V = {
  title: (id: string, s: string): NotionPropertyValue => ({ id, type: 'title', title: rt(s) }),
  text: (id: string, s: string | null): NotionPropertyValue => ({ id, type: 'rich_text', rich_text: rt(s ?? '') }),
  number: (id: string, n: number | null): NotionPropertyValue => ({ id, type: 'number', number: n }),
  select: (id: string, name: string | null): NotionPropertyValue => ({ id, type: 'select', select: name ? { name } : null }),
  status: (id: string, name: string | null): NotionPropertyValue => ({ id, type: 'status', status: name ? { name } : null }),
  multi: (id: string, names: string[]): NotionPropertyValue => ({ id, type: 'multi_select', multi_select: names.map((name) => ({ name })) }),
  date: (id: string, start: string | null): NotionPropertyValue => ({ id, type: 'date', date: start ? { start, end: null } : null }),
  checkbox: (id: string, checked: boolean): NotionPropertyValue => ({ id, type: 'checkbox', checkbox: checked }),
  url: (id: string, url: string | null): NotionPropertyValue => ({ id, type: 'url', url }),
  files: (id: string, count: number, seed: string): NotionPropertyValue => ({
    id,
    type: 'files',
    files: Array.from({ length: count }, (_, i) => ({
      name: `chart-${seed}-${i + 1}.png`,
      type: 'external' as const,
      external: { url: `https://www.tradingview.com/x/${seed}${i}/` },
    })),
  }),
  formulaNumber: (id: string, n: number | null): NotionPropertyValue => ({ id, type: 'formula', formula: { type: 'number', number: n } }),
};

function hex(seed: string, len: number) {
  let h = 0x811c9dc5;
  let out = '';
  for (let round = 0; out.length < len; round++) {
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193);
    }
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, len);
}

/** Deterministic Notion-style UUID. */
export function notionId(seed: string) {
  const h = hex(seed, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function page(
  dataSourceId: string,
  dbSlug: string,
  index: number,
  titleText: string,
  properties: Record<string, NotionPropertyValue>,
  editedAt: string,
): NotionPage {
  const id = notionId(`${dbSlug}-${index}`);
  const slug = titleText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  return {
    object: 'page',
    id,
    url: `https://www.notion.so/${slug}-${id.replace(/-/g, '')}`,
    created_time: editedAt,
    last_edited_time: editedAt,
    in_trash: false,
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties,
  };
}

// ── Trade facts shared by all mock databases ─────────────────────────────

export const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'AUDUSD', 'XAUUSD', 'USDCAD'] as const;
const PAIR_PRICE: Record<string, { price: number; dp: number }> = {
  EURUSD: { price: 1.085, dp: 5 },
  GBPUSD: { price: 1.272, dp: 5 },
  USDJPY: { price: 151.2, dp: 3 },
  GBPJPY: { price: 192.4, dp: 3 },
  AUDUSD: { price: 0.661, dp: 5 },
  XAUUSD: { price: 2350, dp: 2 },
  USDCAD: { price: 1.358, dp: 5 },
};

export interface TradeFacts {
  date: string; // YYYY-MM-DD
  closeDate: string;
  hour: number;
  pair: string;
  setup: string;
  direction: 'long' | 'short';
  risk: number; // percent
  r: number;
  pl: number; // percent
  session: string;
  timeframe: string;
  entryType: string;
  entry: number;
  exit: number;
  note: string;
}

const NOTES_WIN = [
  'Clean displacement after the sweep, held to target.',
  'Waited for the retest, textbook entry.',
  'Partials at 1R, runner hit TP.',
  'Followed the plan. HTF bias aligned.',
];
const NOTES_LOSS = [
  'Entered early before confirmation.',
  'News spike took out the stop.',
  'Against HTF bias — should have skipped.',
  'Valid setup, just didn’t work.',
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextWeekday(iso: string, step: number) {
  let d = addDays(iso, step);
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export function generateTrades(
  seed: number,
  count: number,
  start: string,
  setups: readonly string[],
  riskOptions: readonly number[],
): TradeFacts[] {
  const r = rng(seed);
  const trades: TradeFacts[] = [];
  let date = start;
  for (let i = 0; i < count; i++) {
    date = nextWeekday(date, r.next() < 0.55 ? 1 : 0);
    const pair = r.pick(PAIRS);
    const direction = r.next() < 0.52 ? 'long' : 'short';
    const risk = r.pick(riskOptions);
    const roll = r.next();
    const rMult = roll < 0.5 ? round(r.between(0.8, 3.6), 2) : roll < 0.9 ? -1 : roll < 0.95 ? round(-r.between(0.3, 0.8), 2) : 0;
    const { price, dp } = PAIR_PRICE[pair];
    const entry = round(price * (1 + r.between(-0.03, 0.03)), dp);
    const stop = price * 0.0025;
    const exit = round(entry + (direction === 'long' ? 1 : -1) * rMult * stop, dp);
    const hour = r.pick([3, 8, 9, 10, 14, 15, 16]);
    trades.push({
      date,
      closeDate: r.next() < 0.8 ? date : addDays(date, 1),
      hour,
      pair,
      setup: r.pick(setups),
      direction,
      risk,
      r: rMult,
      pl: round(risk * rMult, 2),
      session: hour < 7 ? 'Asia' : hour < 13 ? 'London' : 'New York',
      timeframe: r.pick(['M5', 'M15', 'M15', 'H1', 'H4']),
      entryType: r.pick(['Market', 'Limit', 'Limit', 'Stop']),
      entry,
      exit,
      note: rMult > 0 ? r.pick(NOTES_WIN) : r.pick(NOTES_LOSS),
    });
  }
  return trades;
}
