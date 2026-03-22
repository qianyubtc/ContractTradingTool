// 直播数据路由：从目标站点抓取在线直播间列表并短期缓存。
const express = require('express');
const router = express.Router();
const { fetch } = require('../services/fetch');
const { cGet, cSet } = require('../services/cache');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36';
const LIVE_PROVIDER = (process.env.LIVE_PROVIDER || 'generic').toLowerCase();
const LIVE_PAGE_URL = process.env.LIVE_PAGE_URL || '';
const LIVE_API_URL = process.env.LIVE_API_URL || '';
const LIVE_REFERER = process.env.LIVE_REFERER || '';
const LIVE_ORIGIN = process.env.LIVE_ORIGIN || '';
const LIVE_TOKEN_REGEX = process.env.LIVE_TOKEN_REGEX || 'token=([a-f0-9]{32})';
const LIVE_LIST_PATH = process.env.LIVE_LIST_PATH || 'list';

function readPath(obj, pathExpr) {
  if (!obj || !pathExpr) return undefined;
  return pathExpr.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeLiveList(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((item, idx) => {
    const liveStatus = String(item.live_status ?? item.status ?? item.isLive ?? '1');
    return {
      id: item.id || idx + 1,
      name: item.name || item.userName || item.nickname || '未知主播',
      live_title: item.live_title || item.title || item.topic || '暂无标题',
      live_online_count: toNum(item.live_online_count ?? item.online ?? item.viewers),
      live_view_count: toNum(item.live_view_count ?? item.views ?? item.totalViews),
      avatar: item.avatar || item.avatar_url || item.cover || '',
      live_url: item.live_url || item.url || item.link || '',
      totalFollowerCount: toNum(item.totalFollowerCount ?? item.followers ?? item.fans),
      live_status: liveStatus
    };
  }).filter(i => i.live_status === '1');
}

function calcStats(list) {
  const liveNum = list.length;
  const onlineNum = list.reduce((s, i) => s + toNum(i.live_online_count), 0);
  const viewNum = list.reduce((s, i) => s + toNum(i.live_view_count), 0);
  return { liveNum, onlineNum, viewNum, allNum: liveNum };
}

function getLiveDataMock() {
  // mock 模式用于本地演示：不依赖外部站点，始终返回结构稳定的数据。
  const now = Date.now();
  const list = normalizeLiveList([
    {
      id: 1,
      name: '链上观察员A',
      live_title: 'BTC 短线看多，关注 1h 结构突破',
      live_online_count: 1860,
      live_view_count: 124000,
      totalFollowerCount: 56000,
      avatar: '',
      live_url: 'https://example.com/live/1',
      live_status: '1'
    },
    {
      id: 2,
      name: '合约策略B',
      live_title: 'ETH 震荡偏空，等待反弹做空机会',
      live_online_count: 1320,
      live_view_count: 87000,
      totalFollowerCount: 41000,
      avatar: '',
      live_url: 'https://example.com/live/2',
      live_status: '1'
    },
    {
      id: 3,
      name: '量化电台C',
      live_title: 'SOL/BNB 轮动观察，市场分歧加大',
      live_online_count: 980,
      live_view_count: 53000,
      totalFollowerCount: 28000,
      avatar: '',
      live_url: 'https://example.com/live/3',
      live_status: '1'
    }
  ]);
  return { ...calcStats(list), list, updated: now, source: 'mock' };
}

async function fetchLiveApiJson(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': LIVE_REFERER || LIVE_PAGE_URL,
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': LIVE_ORIGIN
    }
  });
  if (!r.ok) throw new Error(`live api http ${r.status}`);
  return r.json();
}

async function getLiveDataGeneric() {
  if (!LIVE_PAGE_URL || !LIVE_API_URL) {
    throw new Error('live source not configured: LIVE_PAGE_URL/LIVE_API_URL');
  }
  // generic: 先抓页面取 token，再请求 API（兼容常见反爬流程）。
  const pageRes = await fetch(LIVE_PAGE_URL, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' }
  });
  if (!pageRes.ok) throw new Error(`live page http ${pageRes.status}`);
  const html = await pageRes.text();
  const reg = new RegExp(LIVE_TOKEN_REGEX);
  const m = html.match(reg);
  const token = m && m[1] ? m[1] : '';

  // 若 API URL 中含有 {token}，自动替换；否则直接请求。
  const url = token ? LIVE_API_URL.replace('{token}', encodeURIComponent(token)) : LIVE_API_URL;
  const data = await fetchLiveApiJson(url);
  const rawList = readPath(data, LIVE_LIST_PATH);
  const list = normalizeLiveList(rawList);
  return { ...calcStats(list), list };
}

async function getLiveDataJson() {
  if (!LIVE_API_URL) throw new Error('live source not configured: LIVE_API_URL');
  // json: 直接请求 JSON 接口，无需页面抓 token。
  const data = await fetchLiveApiJson(LIVE_API_URL);
  const rawList = readPath(data, LIVE_LIST_PATH);
  const list = normalizeLiveList(rawList);
  return { ...calcStats(list), list };
}

async function getLiveData() {
  if (LIVE_PROVIDER === 'mock') return getLiveDataMock();
  if (LIVE_PROVIDER === 'json') return getLiveDataJson();
  return getLiveDataGeneric();
}

router.get('/live', async (req, res) => {
  // 直播列表更新频率高，缓存 60 秒减少抓取频次。
  const cacheKey = `live_list_${LIVE_PROVIDER}`;
  const cached = cGet(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await getLiveData();
    cSet(cacheKey, data, 60000);
    res.json(data);
  } catch(e) {
    res.status(502).json({ error: e.message, list: [] });
  }
});

module.exports = router;
