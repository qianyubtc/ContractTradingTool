const express = require('express');
const router = express.Router();
const { fetch } = require('../services/fetch');
const { cGet, cSet } = require('../services/cache');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Referer': 'https://567btc.com/live',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'https://567btc.com'
};

router.get('/live', async (req, res) => {
  const cacheKey = 'live_list';
  const cached = cGet(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await fetch('https://567btc.com/api/live/live_list?token=ed59deccc60f9151ac41f39f08c4a155&type=recommend', { headers: HEADERS });
    const data = await r.json();
    if (data.list) {
      data.list = data.list.filter(item => item.live_status === '1');
    }
    cSet(cacheKey, data, 60000);
    res.json(data);
  } catch(e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
