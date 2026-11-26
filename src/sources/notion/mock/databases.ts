import type { NotionDatabase, NotionPage } from '../types';
import { generateTrades, notionId, page, rt, S, V } from './builders';

export interface MockNotionDatabase {
  database: NotionDatabase;
  pages: NotionPage[];
}

const iso = (date: string, hour = 9) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const ddmmyyyy = (date: string) => {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
};

// ─────────────────────────────────────────────────────────────────────────
// 1. "Trading Journal 2026" — tidy journal using conventional names.
//    Percent properties use Notion's percent format (stored as fractions).
// ─────────────────────────────────────────────────────────────────────────
function tradingJournal(): MockNotionDatabase {
  const slug = 'journal-2026';
  const id = notionId(slug);
  const setups = ['London Breakout', 'Liquidity Sweep', 'Trend Pullback', 'Range Fade'];
  const P = {
    trade: 'title',
    date: 'Dt%3A',
    pair: 'Pr%40x',
    setup: 'St%7Bq',
    direction: 'Dr%5E1',
    risk: 'Rk%25p',
    resultR: 'Rr%3Bz',
    resultPct: 'Rp%3Fa',
    session: 'Ss%2Fn',
    timeframe: 'Tf%3Ck',
    notes: 'Nt%3Dw',
    shots: 'Sc%7Ch',
    account: 'Ac%60c',
  };
  const database: NotionDatabase = {
    object: 'database',
    id,
    url: `https://www.notion.so/${id.replace(/-/g, '')}`,
    title: rt('Trading Journal 2026'),
    icon: { type: 'emoji', emoji: '📈' },
    last_edited_time: '2026-03-19T18:42:00.000Z',
    properties: {
      Trade: S.title(P.trade, 'Trade'),
      Date: S.date(P.date, 'Date'),
      Pair: S.select(P.pair, 'Pair', ['EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'AUDUSD', 'XAUUSD', 'USDCAD']),
      Setup: S.select(P.setup, 'Setup', setups),
      Direction: S.select(P.direction, 'Direction', ['Long', 'Short']),
      'Risk %': S.number(P.risk, 'Risk %', 'percent'),
      'Result R': S.number(P.resultR, 'Result R'),
      'Result %': S.number(P.resultPct, 'Result %', 'percent'),
      Session: S.select(P.session, 'Session', ['Asia', 'London', 'New York']),
      Timeframe: S.select(P.timeframe, 'Timeframe', ['M5', 'M15', 'H1', 'H4']),
      Notes: S.text(P.notes, 'Notes'),
      Screenshots: S.files(P.shots, 'Screenshots'),
      Account: S.select(P.account, 'Account', ['FTMO 100k', 'Personal']),
    },
  };

  const facts = generateTrades(2026, 46, '2026-01-05', setups, [0.5, 1, 1, 1, 1.5]);
  const pages = facts.map((t, i) =>
    page(slug, i, `${t.pair} ${t.direction === 'long' ? '↑' : '↓'} ${t.setup}`, {
      Trade: V.title(P.trade, `${t.pair} ${t.direction === 'long' ? '↑' : '↓'} ${t.setup}`),
      Date: V.date(P.date, t.date),
      Pair: V.select(P.pair, t.pair),
      Setup: V.select(P.setup, i === 17 ? null : t.setup), // forgot to tag the setup
      Direction: V.select(P.direction, t.direction === 'long' ? 'Long' : 'Short'),
      'Risk %': V.number(P.risk, i === 31 ? 0.12 : t.risk / 100), // fat-finger: 12% risk
      'Result R': V.number(P.resultR, t.r),
      'Result %': V.number(P.resultPct, Math.round(t.pl * 100) / 10000),
      Session: V.select(P.session, t.session),
      Timeframe: V.select(P.timeframe, t.timeframe),
      Notes: V.text(P.notes, t.note),
      Screenshots: V.files(P.shots, i % 3 === 0 ? 2 : 1, `${slug}${i}`),
      Account: V.select(P.account, i % 4 === 0 ? 'Personal' : 'FTMO 100k'),
    }, iso(t.date, t.hour + 2)),
  );

  // Same trade logged twice (copy-pasted row).
  const dupSource = pages[8];
  pages.splice(9, 0, { ...page(slug, 900, 'copy', dupSource.properties, dupSource.last_edited_time) });
  // Empty template row left at the bottom of the database.
  pages.push(
    page(slug, 901, '', {
      Trade: V.title(P.trade, ''),
      Date: V.date(P.date, null),
      Pair: V.select(P.pair, null),
      Setup: V.select(P.setup, null),
      Direction: V.select(P.direction, null),
      'Risk %': V.number(P.risk, null),
      'Result R': V.number(P.resultR, null),
      'Result %': V.number(P.resultPct, null),
      Session: V.select(P.session, null),
      Timeframe: V.select(P.timeframe, null),
      Notes: V.text(P.notes, null),
      Screenshots: V.files(P.shots, 0, 'x'),
      Account: V.select(P.account, null),
    }, '2026-03-19T18:42:00.000Z'),
  );
  return { database, pages };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. "FX Trade Log" — different naming conventions, a formula for R and
//    P/L typed as free text.
// ─────────────────────────────────────────────────────────────────────────
function fxTradeLog(): MockNotionDatabase {
  const slug = 'fx-trade-log';
  const id = notionId(slug);
  const setups = ['ICT Silver Bullet', 'Order Block', 'FVG Continuation', 'Asia Range Break'];
  const P = {
    name: 'title',
    entryDate: 'eD%3Aq',
    instrument: 'In%2F7',
    strategy: 'Sg%5Dk',
    risk: 'Rs%3B1',
    rMultiple: 'Rm%3Fx',
    plPct: 'Pl%25t',
    side: 'Ls%7C2',
    closeDate: 'Cd%3C0',
    entryPrice: 'Ep%2Bz',
    exitPrice: 'Xp%2B9',
    entryType: 'Et%40m',
    killzone: 'Kz%3Dn',
    review: 'Rv%5Eb',
    status: 'Su%5Ew',
  };
  const database: NotionDatabase = {
    object: 'database',
    id,
    url: `https://www.notion.so/${id.replace(/-/g, '')}`,
    title: rt('FX Trade Log'),
    icon: { type: 'emoji', emoji: '💱' },
    last_edited_time: '2026-03-21T09:15:00.000Z',
    properties: {
      Name: S.title(P.name, 'Name'),
      'Entry Date': S.date(P.entryDate, 'Entry Date'),
      Instrument: S.select(P.instrument, 'Instrument', ['EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'AUDUSD', 'XAUUSD', 'USDCAD']),
      Strategy: S.select(P.strategy, 'Strategy', setups),
      Risk: S.number(P.risk, 'Risk'),
      'R Multiple': S.formula(P.rMultiple, 'R Multiple', 'if(prop("Status") == "Closed", (prop("Exit Price") - prop("Entry Price")) / prop("Stop Distance"), empty())'),
      'P/L %': S.text(P.plPct, 'P/L %'),
      'Long/Short': S.select(P.side, 'Long/Short', ['Buy', 'Sell', 'Hedge']),
      'Close Date': S.date(P.closeDate, 'Close Date'),
      'Entry Price': S.number(P.entryPrice, 'Entry Price'),
      'Exit Price': S.number(P.exitPrice, 'Exit Price'),
      'Entry Type': S.select(P.entryType, 'Entry Type', ['Market', 'Limit', 'Stop']),
      Killzone: S.select(P.killzone, 'Killzone', ['Asia', 'London', 'New York']),
      Review: S.text(P.review, 'Review'),
      Status: S.status(P.status, 'Status', ['Open', 'Closed']),
    },
  };

  const facts = generateTrades(77, 61, '2026-01-02', setups, [0.25, 0.5, 0.5, 1]);
  const pages = facts.map((t, i) => {
    const open = i >= 59; // last two trades are still running
    const plText =
      i === 12 ? '1.2.%' : i === 40 ? 'n/a' : `${t.pl > 0 ? '+' : ''}${t.pl.toFixed(2)}%`;
    const r = open ? null : i === 23 ? -t.r || 1.5 : t.r; // #23: R sign inverted by formula bug
    return page(slug, i, `${t.pair} ${t.setup}`, {
      Name: V.title(P.name, `${t.pair} — ${t.setup}`),
      'Entry Date': V.date(P.entryDate, `${t.date}T${String(t.hour).padStart(2, '0')}:30:00.000+00:00`),
      Instrument: V.select(P.instrument, t.pair),
      Strategy: V.select(P.strategy, t.setup),
      Risk: V.number(P.risk, t.risk),
      'R Multiple': V.formulaNumber(P.rMultiple, r),
      'P/L %': V.text(P.plPct, open ? null : plText),
      'Long/Short': V.select(P.side, i === 50 ? 'Hedge' : t.direction === 'long' ? 'Buy' : 'Sell'),
      'Close Date': V.date(P.closeDate, open ? null : t.closeDate),
      'Entry Price': V.number(P.entryPrice, t.entry),
      'Exit Price': V.number(P.exitPrice, open ? null : t.exit),
      'Entry Type': V.select(P.entryType, t.entryType),
      Killzone: V.select(P.killzone, t.session),
      Review: V.text(P.review, t.note),
      Status: V.status(P.status, open ? 'Open' : 'Closed'),
    }, iso(t.closeDate, t.hour + 3));
  });
  const dup = pages[33];
  pages.splice(34, 0, page(slug, 900, 'copy', dup.properties, dup.last_edited_time));
  pages.splice(48, 0, page(slug, 901, 'copy', pages[47].properties, pages[47].last_edited_time));
  return { database, pages };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. "Prop Challenge — Phase 1" — messy: dates and R as text, the risk column
//    has an unusual name, and some rows are incomplete.
// ─────────────────────────────────────────────────────────────────────────
function propChallenge(): MockNotionDatabase {
  const slug = 'prop-phase-1';
  const id = notionId(slug);
  const setups = ['A+ Reversal', 'Breakout Retest', 'Continuation'];
  const P = {
    num: 'title',
    tradeDate: 'Td%3Bm',
    ticker: 'Tk%2Fq',
    model: 'Md%3A5',
    rr: 'RR%3A8',
    ret: 'Rt%25e',
    exposure: 'Ex%25p',
    tags: 'Tg%7B3',
    chart: 'Ch%2Fl',
    lessons: 'Ls%5Bv',
    followed: 'Fp%3Fk',
  };
  const database: NotionDatabase = {
    object: 'database',
    id,
    url: `https://www.notion.so/${id.replace(/-/g, '')}`,
    title: rt('Prop Challenge — Phase 1'),
    icon: { type: 'emoji', emoji: '🏁' },
    last_edited_time: '2026-02-27T21:03:00.000Z',
    properties: {
      'Trade #': S.title(P.num, 'Trade #'),
      'Trade Date': S.text(P.tradeDate, 'Trade Date'),
      Ticker: S.text(P.ticker, 'Ticker'),
      Model: S.select(P.model, 'Model', setups),
      'R:R Result': S.text(P.rr, 'R:R Result'),
      Return: S.number(P.ret, 'Return', 'percent'),
      'Exposure %': S.number(P.exposure, 'Exposure %', 'percent'),
      Tags: S.multi(P.tags, 'Tags', ['A+', 'FOMO', 'Revenge', 'Patient', 'News']),
      'Chart Link': S.url(P.chart, 'Chart Link'),
      Lessons: S.text(P.lessons, 'Lessons'),
      'Followed Plan': S.checkbox(P.followed, 'Followed Plan'),
    },
  };

  const facts = generateTrades(505, 27, '2026-02-02', setups, [0.5, 1]);
  const pages = facts.map((t, i) => {
    const rText = i === 14 ? 'BE' : `${t.r}R`;
    return page(slug, i, `#${i + 1}`, {
      'Trade #': V.title(P.num, `#${i + 1}`),
      'Trade Date': V.text(P.tradeDate, i === 9 ? '31/02/2026' : ddmmyyyy(t.date)),
      Ticker: V.text(P.ticker, i === 5 ? '' : t.pair),
      Model: V.select(P.model, t.setup),
      'R:R Result': V.text(P.rr, rText),
      Return: V.number(P.ret, Math.round(t.pl * 100) / 10000),
      'Exposure %': V.number(P.exposure, t.risk / 100),
      Tags: V.multi(P.tags, t.r > 0 ? ['A+', 'Patient'] : i % 2 ? ['FOMO'] : ['News']),
      'Chart Link': V.url(P.chart, i % 5 === 0 ? null : `https://www.tradingview.com/x/pc${i}/`),
      Lessons: V.text(P.lessons, t.note),
      'Followed Plan': V.checkbox(P.followed, t.r > 0),
    }, iso(t.date, 20));
  });
  return { database, pages };
}

export const MOCK_DATABASES: MockNotionDatabase[] = [tradingJournal(), fxTradeLog(), propChallenge()];
