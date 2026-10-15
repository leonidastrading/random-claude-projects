# Polymarket Pulse

Daily dashboard of Polymarket prediction markets: oil, war and geopolitics, the Fed and macro, inflation, elections, AI and tech, crypto, golf. Sports are excluded except golf.

- `api/data.js` pulls live Polymarket data (Gamma and Data APIs), filters and groups it by theme, and finds the week's biggest moves, new markets and whale trades. It is cached at the edge for 30 minutes.
- `api/history.js` returns 30-day price history for the sparklines.
- `api/cron.js` is the daily Vercel cron (11:00 UTC) that re-warms the data.
- `brief.json` holds the written analyst brief. A daily Claude scheduled task rewrites and redeploys it.
- `index.html` is the dashboard. It has no build step.

Data comes from Polymarket's public API. Prices are crowd probabilities, not facts. Not financial advice.
