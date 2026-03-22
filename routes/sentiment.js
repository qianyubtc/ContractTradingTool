// 情绪与社区数据路由：恐惧贪婪、CoinGecko 单币信息、趋势榜、全局市场。
const express = require('express');
const router = express.Router();
const { fetchJSON } = require('../services/fetch');

const CG_IDS = {
  btc:'bitcoin',eth:'ethereum',bnb:'binancecoin',sol:'solana',
  xrp:'ripple',doge:'dogecoin',ada:'cardano',avax:'avalanche-2',
  link:'chainlink',dot:'polkadot',ltc:'litecoin',matic:'matic-network',
  near:'near',arb:'arbitrum',op:'optimism'
};

router.get('/fg', async (req, res) => {
  // 恐惧贪婪更新频率低，缓存 5 分钟足够。
  try { res.json(await fetchJSON('https://api.alternative.me/fng/?limit=1', 300000)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/cg', async (req, res) => {
  try {
    // coin 只允许字母数字，避免路径注入和异常字符请求。
    const coin = (req.query.coin||'bitcoin').toLowerCase();
    if (!/^[a-z0-9]+$/.test(coin)) return res.status(400).json({ error: 'invalid coin' });
    // 支持简写别名（btc/eth/...），未命中时按原值直传。
    const id = CG_IDS[coin] || coin;
    res.json(await fetchJSON(
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=false&sparkline=false`,
      300000
    ));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/trending', async (req, res) => {
  // 热门榜接口：适合监控页/情绪页做热门话题展示。
  try { res.json(await fetchJSON('https://api.coingecko.com/api/v3/search/trending', 300000)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/global', async (req, res) => {
  // 全局市值、主导率等宏观指标。
  try { res.json(await fetchJSON('https://api.coingecko.com/api/v3/global', 300000)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
