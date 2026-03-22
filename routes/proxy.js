// 安全代理路由：
// 仅允许白名单域名通过，避免前端可被用于任意开放代理。
const express = require('express');
const router = express.Router();
const { fetch, UA } = require('../services/fetch');
const { cGet, cSet } = require('../services/cache');

// 从环境变量读取白名单，格式示例：PROXY_ALLOWED_DOMAINS=api.binance.com,fapi.binance.com
// 未配置时保留空数组，表示默认拒绝（更安全）。
const ALLOWED = (process.env.PROXY_ALLOWED_DOMAINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

router.get('/proxy', async (req, res) => {
  try {
    // 前端把目标 URL 放在 u 参数里：/api/proxy?u=...
    const target = req.query.u;
    if (!target) return res.status(400).json({ error: 'missing u' });
    // 解析 host 进行白名单校验，防止被滥用为开放代理。
    const host = new URL(target).hostname;
    if (!ALLOWED.some(d => host === d || host.endsWith('.'+d)))
      return res.status(403).json({ error: 'domain not allowed' });
    // 直接以 URL 作为缓存 key，同一请求短时内可复用。
    const cached = cGet(target);
    if (cached) return res.json(cached);
    // 透传拉取目标资源，统一带 UA 降低部分站点拦截概率。
    const r = await fetch(target, { headers: { 'User-Agent': UA } });
    if (!r.ok) return res.status(r.status).json({ error: `HTTP ${r.status}` });
    const data = await r.json();
    // 代理结果缓存 30 秒，平衡实时性与外部请求压力。
    cSet(target, data, 30000);
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
