// Polymarket Pulse — pulls live Polymarket data, filters out sports (except golf),
// groups markets into themes, and surfaces movers, new markets and whale trades.

const GAMMA = 'https://gamma-api.polymarket.com';
const DATA = 'https://data-api.polymarket.com';

const THEMES = [
  { id: 'oil', name: 'Oil & Energy', re: /\boil\b|crude|wti|brent|hormuz|opec|natural gas|gasoline|\bgas\b|diesel|pipeline|kharg|bab el-mandeb|lng|energy/i },
  { id: 'war', name: 'War & Geopolitics', re: /war\b|invade|invasion|military|strike|missile|nuclear|ceasefire|iran|israel|gaza|hamas|hezbollah|houthi|lebanon|ukrain|russia|putin|zelensk|nato|china|taiwan|xi jinping|korea|kim jong|venezuel|maduro|cuba|greenland|syria|yemen|saudi|blockade|uranium|regime|coup|pakistan|india x|sanction|khamenei|geopolitic/i },
  { id: 'macro', name: 'Fed, Rates & Macro', re: /\bfed\b|fomc|interest rate|rate (cut|hike)|powell|treasury|yield|recession|gdp|unemploy|payroll|jobs report|ecb|bank of england|boj|bank of japan|s&p|spx|nasdaq|dow jones|gold|silver|copper|dollar|tariff|debt ceiling|shutdown|stock market|economy/i },
  { id: 'inflation', name: 'Inflation & Cost of Living', re: /inflation|cpi|pce|price of|eggs|beef|gas hit|\brent\b|mortgage|housing|costco|cost of/i },
  { id: 'elections', name: 'Elections & Politics', re: /election|president|prime minister|senate|house|midterm|governor|nominee|parliament|mayor|chancellor|impeach|trump|supreme court|congress|vote|referendum|cabinet|press secretary|out as|out by/i },
  { id: 'tech', name: 'AI, Tech & Companies', re: /\bai\b|openai|anthropic|google|gemini|nvidia|apple|tesla|spacex|xai|microsoft|meta\b|amazon|ipo|valuation|largest company|data center|agi|model|chip|semiconductor|ceo/i },
  { id: 'crypto', name: 'Crypto', re: /bitcoin|btc|ethereum|\beth\b|solana|xrp|crypto|stablecoin|coinbase|token|fdv|airdrop|hyperliquid|microstrategy|strc/i },
  { id: 'golf', name: 'Golf', re: /golf|\bpga\b|\blpga\b|ryder cup|dp world tour|scheffler|mcilroy|tiger woods/i },
  { id: 'life', name: 'Health, Science & Life', re: /measles|pandemic|virus|flu|covid|vaccine|disease|hantavirus|plague|alien|ufo|hottest|climate|temperature|hurricane|earthquake|weather|movie|box office|spacecraft|moon|mars|nasa/i },
];

const SPORT_RE = /\bvs\.?\b|\bnfl\b|\bnba\b|\bmlb\b|\bnhl\b|uefa|premier league|la liga|serie a|bundesliga|ligue 1|\bufc\b|tennis|\batp\b|\bwta\b|\bf1\b|formula 1|grand prix|cricket|esports|\blol\b|counter-strike|\bcs2\b|dota|valorant|ncaa|soccer|baseball|basketball|hockey|world series|super bowl|champions league|\bmls\b|boxing|nascar|\bipl\b|wnba|stanley cup|heisman|ballon d'or|world cup|olympic|fifa|super league|copa|euroleague|darts|snooker|chess|football|\bmvp\b|rookie of the year|cy young|playoffs|\bgame \d|match winner|spread:|o\/u \d|over\/under|moneyline|\([+-]\d+(\.5)?\)|win on \d{4}-\d\d-\d\d|end in a draw|exact score|laliga|s-tier|halftime|half-time|win worlds|\bmajor\b.*\b(cs|counter)|both teams to score|handicap|total (points|goals|runs|kills|maps|games|sets)/i;
const NOISE_RE = /up or down|above ___ on|price on (january|february|march|april|may|june|july|august|september|october|november|december)|hit on (january|february|march|april|may|june|july|august|september|october|november|december)|# tweets|what will .{1,40} say|say .{1,30} during|mention|# of views|tweets? (from|between)|\d{1,2}-\d{1,2}\?|on (january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}\?$/i;

const isGolf = (e, tags) => tags.some(t => /^golf$/i.test(t)) || THEMES.find(t => t.id === 'golf').re.test(e.title || '');

const ORDER = ['oil', 'war', 'crypto', 'inflation', 'macro', 'tech', 'elections', 'life'];

function classify(e, tags) {
  if (isGolf(e, tags)) return 'golf';
  // Title decides first; tags are only a fallback (they are noisy, e.g. "Economy" on Fed markets).
  for (const text of [e.title || '', tags.join(' ')])
    for (const id of ORDER) if (THEMES.find(t => t.id === id).re.test(text)) return id;
  return 'other';
}

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

function parseMarket(m) {
  let prices, outcomes, tokens;
  try { prices = JSON.parse(m.outcomePrices || '[]'); outcomes = JSON.parse(m.outcomes || '[]'); tokens = JSON.parse(m.clobTokenIds || '[]'); } catch { return null; }
  if (!prices.length) return null;
  return {
    q: m.groupItemTitle || m.question,
    question: m.question,
    p: Number(prices[0]),
    outcome: outcomes[0] || 'Yes',
    d1: num(m.oneDayPriceChange),
    d7: num(m.oneWeekPriceChange),
    d30: num(m.oneMonthPriceChange),
    vol: num(m.volumeNum) || 0,
    v24: num(m.volume24hr) || 0,
    liq: num(m.liquidityNum) || 0,
    end: (m.endDate || '').slice(0, 10),
    token: tokens[0] || null,
  };
}

async function getJSON(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) return await r.json();
    } catch {}
  }
  return null;
}

async function fetchEvents() {
  const urls = [];
  for (let off = 0; off <= 1400; off += 100)
    urls.push(`${GAMMA}/events?active=true&closed=false&order=volume24hr&ascending=false&limit=100&offset=${off}`);
  // Newest events, so brand-new markets show up even before they have volume.
  for (let off = 0; off <= 200; off += 100)
    urls.push(`${GAMMA}/events?active=true&closed=false&order=createdAt&ascending=false&limit=100&offset=${off}`);
  for (const tag of ['golf', 'geopolitics', 'economy', 'inflation', 'oil'])
    urls.push(`${GAMMA}/events?active=true&closed=false&tag_slug=${tag}&order=volume&ascending=false&limit=100`);
  const pages = await Promise.all(urls.map(u => getJSON(u)));
  const bySlug = new Map();
  for (const page of pages) if (Array.isArray(page)) for (const e of page) if (e && e.slug) bySlug.set(e.slug, e);
  return [...bySlug.values()];
}

function buildEvents(raw) {
  const out = [];
  for (const e of raw) {
    const tags = (e.tags || []).map(t => (typeof t === 'object' ? t.label : t) || '');
    const golf = isGolf(e, tags);
    if (!golf && (tags.some(t => /^(sports|esports|games)$/i.test(t)) || SPORT_RE.test(e.title || ''))) continue;
    if (NOISE_RE.test(e.title || '')) continue;
    if (e.endDate && Date.parse(e.endDate) < Date.now() - 12 * 3600 * 1000) continue;
    const all = (e.markets || []).filter(m => !m.closed).map(parseMarket).filter(Boolean);
    // Drop untraded placeholder outcomes ("Company A", "Other" at 50%).
    const markets = all.length > 1 ? all.filter(m => m.vol >= 2000) : all;
    if (!markets.length) continue;
    markets.sort((a, b) => b.p - a.p);
    const vol = num(e.volume) || 0;
    if (!golf && vol < 20000 && !/inflation|cpi|pce|price of|gas hit/i.test(e.title || '')) continue;
    out.push({
      title: e.title,
      slug: e.slug,
      url: `https://polymarket.com/event/${e.slug}`,
      theme: classify(e, tags),
      tags: tags.filter(t => !/hide from new|recurring|rewards|parent for/i.test(t)).slice(0, 5),
      vol,
      v24: num(e.volume24hr) || 0,
      v1w: num(e.volume1wk) || 0,
      created: e.createdAt || e.creationDate || null,
      end: (e.endDate || '').slice(0, 10),
      markets: markets.slice(0, 8),
    });
  }
  return out;
}

async function fetchWhales() {
  const raw = await getJSON(`${DATA}/trades?limit=1000&filterType=CASH&filterAmount=5000&takerOnly=true`);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(t => !SPORT_RE.test(t.title || '') && !NOISE_RE.test(t.title || ''))
    .map(t => ({
      usd: Math.round(t.size * t.price),
      side: t.side,
      outcome: t.outcome,
      price: t.price,
      title: t.title,
      url: t.eventSlug ? `https://polymarket.com/event/${t.eventSlug}` : null,
      ts: t.timestamp,
    }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 40);
}

function headlines(events) {
  const rows = [];
  for (const e of events) for (const m of e.markets) {
    if (m.vol < 150000 || e.theme === 'crypto') continue;
    if (m.d7 !== null && Math.abs(m.d7) >= 0.08) rows.push({ e, m, score: Math.abs(m.d7) * Math.log10(m.vol) });
  }
  rows.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const { e, m } of rows) {
    if (seen.has(e.slug)) continue;
    seen.add(e.slug);
    const dir = m.d7 > 0 ? 'rose' : 'fell';
    const label = e.markets.length > 1 ? `${e.title} — ${m.q}` : e.title;
    out.push({ text: `${label}: odds ${dir} ${Math.abs(Math.round(m.d7 * 100))} pts this week to ${Math.round(m.p * 100)}%`, url: e.url, theme: e.theme, up: m.d7 > 0 });
    if (out.length >= 10) break;
  }
  return out;
}

module.exports = async (req, res) => {
  const started = Date.now();
  try {
    const [raw, whales] = await Promise.all([fetchEvents(), fetchWhales()]);
    const events = buildEvents(raw);

    const themes = {};
    for (const t of [...THEMES, { id: 'other', name: 'Everything Else' }]) themes[t.id] = { name: t.name, events: [] };
    for (const e of events) themes[e.theme].events.push(e);
    for (const t of Object.values(themes)) {
      t.events.sort((a, b) => b.v24 - a.v24 || b.vol - a.vol);
      t.events = t.events.slice(0, t === themes.other ? 30 : 40);
    }

    const flat = [];
    for (const e of events) for (const m of e.markets)
      flat.push({ title: e.title, q: e.markets.length > 1 ? m.q : null, url: e.url, theme: e.theme, ...m });
    const movers = key => flat
      .filter(m => m.vol >= 100000 && m[key] !== null && m.theme !== 'crypto')
      .sort((a, b) => Math.abs(b[key]) - Math.abs(a[key]))
      .slice(0, 25);

    const dayAgo = Date.now() - 3 * 24 * 3600 * 1000;
    const fresh = events
      .filter(e => e.created && Date.parse(e.created) >= dayAgo && e.theme !== 'crypto')
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 30);

    const body = {
      updated: new Date().toISOString(),
      ms: Date.now() - started,
      counts: { scanned: raw.length, kept: events.length },
      headlines: headlines(events),
      movers1d: movers('d1'),
      movers1w: movers('d7'),
      fresh,
      whales,
      themes,
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Edge cache 30 min, serve stale up to a day while refreshing in the background.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    res.status(200).send(JSON.stringify(body));
  } catch (err) {
    res.status(502).json({ error: String(err && err.message || err) });
  }
};
