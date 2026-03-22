// 合约衍生数据路由：资金费率、持仓量、多空比、强平订单。
const express = require('express');
const router = express.Router();
const { fetch, UA } = require('../services/fetch');

router.get('/funding', async (req, res) => {
  try {
    // limit=1 只取最新一条资金费率，响应更快。
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,{headers:{'User-Agent':UA}});
    // 失败时返回空数组，前端按 N/A 处理。
    res.json(r.ok ? await r.json() : []);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/oi', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,{headers:{'User-Agent':UA}});
    // OI 返回对象，失败时用空对象占位。
    res.json(r.ok ? await r.json() : {});
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/ls', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,{headers:{'User-Agent':UA}});
    // 多空比接口返回数组，通常前端只取第一项。
    res.json(r.ok ? await r.json() : []);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/force', async (req, res) => {
  try {
    const symbol = (req.query.symbol||'BTCUSDT').toUpperCase();
    const r = await fetch(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=100`,{headers:{'User-Agent':UA}});
    // 强平记录拉取失败不阻断页面，返回空列表降级。
    res.json(r.ok ? await r.json() : []);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
