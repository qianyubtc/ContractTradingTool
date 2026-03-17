const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');

const app  = express();
const PORT = 3000;

// CORS - 모든 응답에 헤더 추가
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());

const cache = new Map();
function cGet(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() > v.exp) { cache.delete(key); return null; }
  return v.data;
}
function cSet(key, data, ttlMs) {
  cache.set(key, { data, exp: Date.now() + ttlMs });
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36';

async function fetchJSON(url, ttlMs = 15000) {
  const cached = cGet(url);
  if (cached) return cached;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, timeout: 10000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  cSet(url, data, ttlMs);
  return data;
}

const OKX_IV = { '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D','1w':'1W' };

async function fetchTicker(symbol) {
  const coin = symbol.replace('USDT', '');
  for (const url of [
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
    `https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
    `https://api2.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
  ]) {
    try { const d = await fetchJSON(url, 8000); if (d?.lastPrice) return d; } catch {}
  }
  const d = await fetchJSON(`https://www.okx.com/api/v5/market/ticker?instId=${coin}-USDT`, 8000);
  const t = d.data[0];
  const last = parseFloat(t.last), open = parseFloat(t.open24h);
  return {
    symbol, lastPrice: t.last,
    priceChange: (last - open).toFixed(4),
    priceChangePercent: (((last - open) / open) * 100).toFixed(2),
    highPrice: t.high24h, lowPrice: t.low24h,
    quoteVolume: t.volCcy24h, volume: t.vol24h,
  };
}

async function fetchKlines(symbol, interval, limit = 300) {
  const coin = symbol.replace('USDT', '');
  const okxIv = OKX_IV[interval] || '1H';
  for (const url of [
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  ]) {
    try {
      const data = await fetchJSON(url, 15000);
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {}
  }
  const d = await fetchJSON(`https://www.okx.com/api/v5/market/candles?instId=${coin}-USDT&bar=${okxIv}&limit=${Math.min(limit,300)}`, 15000);
  return d.data.reverse().map(k => [parseInt(k[0]),k[1],k[2],k[3],k[4],k[5],parseInt(k[0])+3600000,k[7],0,'0','0','0']);
}

app.get('/ping', (req, res) => res.json({ ok: true, t: Date.now() }));

app.get('/api/ticker', async (req, res) => {
  try { res.json(await fetchTicker((req.query.symbol||'BTCUSDT').toUpperCase())); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/klines', async (req, res) => {
  try {
    res.json(await fetchKlines(
      (req.query.symbol||'BTCUSDT').toUpperCase(),
      req.query.interval||'1h',
      parseInt(req.query.limit||'300')
    ));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/funding', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,{headers:{'User-Agent':UA}});
    res.json(r.ok ? await r.json() : []);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/oi', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,{headers:{'User-Agent':UA}});
    res.json(r.ok ? await r.json() : {});
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/ls', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,{headers:{'User-Agent':UA}});
    res.json(r.ok ? await r.json() : []);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/depth', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const limit = req.query.limit||'20';
    for (const url of [
      `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=${limit}`,
      `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`,
    ]) {
      try { const r = await fetch(url,{headers:{'User-Agent':UA}}); if(r.ok) return res.json(await r.json()); } catch {}
    }
    res.json({bids:[],asks:[]});
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/force', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=100`,{headers:{'User-Agent':UA}});
    res.json(r.ok ? await r.json() : []);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/fg', async (req, res) => {
  try { res.json(await fetchJSON('https://api.alternative.me/fng/?limit=1', 300000)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/cg', async (req, res) => {
  try {
    const cgIds = {btc:'bitcoin',eth:'ethereum',bnb:'binancecoin',sol:'solana',xrp:'ripple',doge:'dogecoin',ada:'cardano',avax:'avalanche-2',link:'chainlink',dot:'polkadot',ltc:'litecoin',matic:'matic-network',near:'near',arb:'arbitrum',op:'optimism'};
    const coin = (req.query.coin||'bitcoin').toLowerCase();
    const id = cgIds[coin] || coin;
    res.json(await fetchJSON(`https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=false&sparkline=false`, 300000));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/trending', async (req, res) => {
  try { res.json(await fetchJSON('https://api.coingecko.com/api/v3/search/trending', 300000)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/global', async (req, res) => {
  try { res.json(await fetchJSON('https://api.coingecko.com/api/v3/global', 300000)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/news', async (req, res) => {
  const coin = (req.query.coin||'BTC').toUpperCase();
  const ck = 'news:'+coin;
  const hit = cGet(ck);
  if (hit) return res.json(hit);
  const results = [];
  for (const url of [
    `https://cryptocurrency.cv/api/news?ticker=${coin}&limit=15`,
    `https://cryptopanic.com/api/free/v1/posts/?auth_token=free&currencies=${coin}&kind=news&public=true`,
  ]) {
    try {
      const r = await fetch(url,{headers:{'User-Agent':UA}});
      if (!r.ok) continue;
      const d = await r.json();
      (d.articles||d.results||[]).slice(0,12).forEach(a=>results.push({title:a.title||'',url:a.url||a.link||'',source:a.source||a.domain||'News',time:a.published_at||a.date||''}));
      if (results.length >= 8) break;
    } catch {}
  }
  const payload = { results, coin, total: results.length };
  cSet(ck, payload, 300000);
  res.json(payload);
});

const PROXY_ALLOWED = ['api.binance.com','fapi.binance.com','api.coingecko.com','api.alternative.me','api.geckoterminal.com'];
app.get('/api/proxy', async (req, res) => {
  try {
    const target = req.query.u;
    if (!target) return res.status(400).json({ error: 'missing u' });
    const host = new URL(target).hostname;
    if (!PROXY_ALLOWED.some(d => host === d || host.endsWith('.'+d)))
      return res.status(403).json({ error: 'domain not allowed' });
    const cached = cGet(target);
    if (cached) return res.json(cached);
    const r = await fetch(target,{headers:{'User-Agent':UA}});
    if (!r.ok) return res.status(r.status).json({ error: `HTTP ${r.status}` });
    const data = await r.json();
    cSet(target, data, 30000);
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`CTBox API running on port ${PORT}`));
