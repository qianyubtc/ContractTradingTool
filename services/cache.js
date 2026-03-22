// 进程内最小 TTL 缓存（重启即丢失），适合低复杂度接口缓存。
const cache = new Map();

function cGet(key) {
  const v = cache.get(key);
  if (!v) return null;
  // 惰性过期：读取时发现过期才删除，代码简单且足够轻量。
  if (Date.now() > v.exp) { cache.delete(key); return null; }
  return v.data;
}

function cSet(key, data, ttlMs) {
  // exp 存绝对时间戳，读取判断无需再做复杂计算。
  cache.set(key, { data, exp: Date.now() + ttlMs });
}

module.exports = { cGet, cSet };
