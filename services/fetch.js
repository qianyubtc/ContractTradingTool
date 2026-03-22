// fetch 服务层：统一 User-Agent + TTL 缓存，减少重复请求与外部限流风险。
const fetch = require('node-fetch');
const { cGet, cSet } = require('./cache');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36';

async function fetchJSON(url, ttlMs = 15000) {
  // 优先走缓存：相同 URL 在 TTL 内直接复用。
  const cached = cGet(url);
  if (cached) return cached;
  // 统一超时与 UA，避免调用方在各处重复写样板代码。
  const r = await fetch(url, { headers: { 'User-Agent': UA }, timeout: 10000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  // 成功才写缓存，防止错误响应污染缓存。
  cSet(url, data, ttlMs);
  return data;
}

module.exports = { fetch, fetchJSON, UA };
