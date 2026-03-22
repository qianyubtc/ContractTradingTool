// 市场基础行情路由：ticker / klines / depth。
// 设计思路：优先 Binance，多次失败后回退 OKX，尽量保证可用性。
const express = require('express');
const router = express.Router();
const { fetch, fetchJSON, UA } = require('../services/fetch');

const OKX_IV = { '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D','1w':'1W' };

// 获取 24h ticker：先 Binance，多线路失败再用 OKX 并转换字段格式。
async function fetchTicker(symbol) {
  // 先把 BTCUSDT -> BTC，用于 OKX 的 instId 拼接。
  const coin = symbol.replace('USDT', '');
  // Binance 多线路兜底，任意一路成功即返回。
  for (const url of [
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
    `https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
    `https://api2.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
  ]) {
    try { const d = await fetchJSON(url, 8000); if (d?.lastPrice) return d; } catch {}
  }
  // Binance 全部失败后再走 OKX，并把字段转成前端熟悉的 Binance 风格。
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

// 获取 K 线：同样先 Binance，再回退 OKX，并把返回格式标准化为 Binance 风格数组。
async function fetchKlines(symbol, interval, limit = 300) {
  const coin = symbol.replace('USDT', '');
  // 不识别的周期默认回退到 1H，避免请求参数非法。
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
  // OKX 接口最大数量有限，limit 做上限保护。
  const d = await fetchJSON(`https://www.okx.com/api/v5/market/candles?instId=${coin}-USDT&bar=${okxIv}&limit=${Math.min(limit,300)}`, 15000);
  return d.data.reverse().map(k => [parseInt(k[0]),k[1],k[2],k[3],k[4],k[5],parseInt(k[0])+3600000,k[7],0,'0','0','0']);
}

router.get('/ticker', async (req, res) => {
  // 默认 BTCUSDT，避免调用方漏传参数导致 500。
  try { res.json(await fetchTicker((req.query.symbol||'BTCUSDT').toUpperCase())); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/klines', async (req, res) => {
  try {
    res.json(await fetchKlines(
      (req.query.symbol||'BTCUSDT').toUpperCase(),
      req.query.interval||'1h',
      parseInt(req.query.limit||'300') // 字符串参数转数字
    ));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/depth', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const limit = req.query.limit||'20';
    // 先走合约深度，再回退现货深度。
    for (const url of [
      `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=${limit}`,
      `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`,
    ]) {
      try { const r = await fetch(url,{headers:{'User-Agent':UA}}); if(r.ok) return res.json(await r.json()); } catch {}
    }
    // 两个源都失败时返回空深度，前端会走“不可用”展示。
    res.json({bids:[],asks:[]});
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
