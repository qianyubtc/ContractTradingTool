// 新闻聚合路由：抓取多个 RSS 源并做关键词过滤与缓存。
const express = require('express');
const router = express.Router();
const { fetch, UA } = require('../services/fetch');
const { cGet, cSet } = require('../services/cache');

// 支持环境变量注入新闻源：
// NEWS_RSS_SOURCES='[{"url":"https://xx/rss","name":"CoinDesk"}]'
// 若未配置则保留占位，方便开发时看出“需要配置”。
let RSS_SOURCES = [
  { url: '', name: '' },
  { url: '', name: '' },
];
try {
  if (process.env.NEWS_RSS_SOURCES) {
    const parsed = JSON.parse(process.env.NEWS_RSS_SOURCES);
    if (Array.isArray(parsed) && parsed.length) {
      RSS_SOURCES = parsed
        .filter(i => i && typeof i.url === 'string' && typeof i.name === 'string')
        .map(i => ({ url: i.url.trim(), name: i.name.trim() }))
        .filter(i => i.url && i.name);
    }
  }
} catch (_) {
  // 配置解析失败时沿用默认占位，避免服务启动直接崩溃。
}

function parseRSS(xml, sourceName) {
  const items = [];
  // 用正则做轻量解析：简单够用，但对异常 XML 容错一般。
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    // title 兼容 CDATA 与纯文本两种写法。
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                   block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    // 过滤空标题，避免前端出现无意义列表项。
    if (title.trim()) {
      items.push({
        title: title.trim(),
        published_at: pubDate ? new Date(pubDate).toISOString() : '',
        source: sourceName,
        url: link.trim()
      });
    }
  }
  // 每个源最多取 8 条，防止单源“刷屏”。
  return items.slice(0, 8);
}

router.get('/news', async (req, res) => {
  const coin = (req.query.coin || 'BTC').toUpperCase();
  const cacheKey = `news_${coin}`;
  // 币种级缓存：BTC 与 ETH 分开缓存，互不污染。
  const cached = cGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    // allSettled 保证“部分源失败不影响全局返回”。
    const results = await Promise.allSettled(
      RSS_SOURCES.map(s =>
        fetch(s.url, { headers: { 'User-Agent': UA } })
          .then(r => r.text())
          .then(xml => parseRSS(xml, s.name))
      )
    );
    let all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    // 关键词兜底：目标币 + 通用加密关键词。
    const keywords = [coin, coin.toLowerCase(), 'crypto', 'bitcoin', 'btc', 'ethereum', 'eth'];
    const filtered = all.filter(item =>
      keywords.some(k => item.title.toLowerCase().includes(k))
    );
    // 如果过滤后太少，退回全量，避免前端几乎没内容。
    const final = (filtered.length >= 3 ? filtered : all).slice(0, 10);
    const resp = { items: final, updated: Date.now() };
    cSet(cacheKey, resp, 120000);
    res.json(resp);
  } catch(e) {
    res.status(502).json({ error: e.message, items: [] });
  }
});

module.exports = router;
