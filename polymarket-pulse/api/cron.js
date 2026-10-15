// Daily Vercel cron: re-warms the data endpoint so the first visitor of the day gets fresh numbers.
module.exports = async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const r = await fetch(`https://${host}/api/data?warm=${Date.now()}`).catch(() => null);
  res.status(200).json({ ok: !!(r && r.ok), at: new Date().toISOString() });
};
