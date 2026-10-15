// Proxies Polymarket CLOB price history for sparklines (last 30 days, ~2 points a day).
module.exports = async (req, res) => {
  const token = String(req.query.token || '');
  if (!/^\d{10,100}$/.test(token)) return res.status(400).json({ error: 'bad token' });
  try {
    const r = await fetch(`https://clob.polymarket.com/prices-history?market=${token}&interval=1m&fidelity=720`);
    const j = await r.json();
    const pts = (j.history || []).map(h => [h.t, h.p]);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(pts);
  } catch (err) {
    res.status(502).json({ error: String(err && err.message || err) });
  }
};
