// 拉取可交易币种列表。
// 注意：当远端接口不可用时会自动降级到内置热门币种，确保页面可用。
async function loadSymbolList() {
  try {
    // 这里目前是占位请求（u 为空），通常会失败并走 catch 的默认币种逻辑。
    const r = await fetch(`${API}/api/proxy?u=${encodeURIComponent('')}`);
    if (!r.ok) return;
    const d = await r.json();
    const popular = ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC','MATIC','NEAR','ARB','OP'];
    // 仅保留“USDT 永续 + 正在交易”的合约，避免无效标的进入下拉框。
    window._allSymbols = (d.symbols || [])
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL')
      .map(s => ({ symbol: s.symbol, base: s.baseAsset }))
      // 去重：避免同一 symbol 重复出现。
      .filter((s, i, arr) => arr.findIndex(x => x.symbol === s.symbol) === i)
      // 排序策略：先热门币，再按字母序，兼顾实用与可查找性。
      .sort((a, b) => {
        const ai = popular.indexOf(a.base), bi = popular.indexOf(b.base);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.base.localeCompare(b.base);
      });
  } catch(e) {
    // 后备方案：固定热门币，保证页面最差也能用。
    window._allSymbols = ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC','MATIC','NEAR','ARB','OP']
      .map(b => ({ symbol: b+'USDT', base: b }));
  }
}

function renderSymbolDropdown(items) {
  // 把可选币种渲染成下拉列表（最多显示 80 项，避免过长卡顿）。
  const dd = document.getElementById('symbolDropdown');
  if (!dd) return;
  const current = document.getElementById('symbolSelect').value;
  if (!items.length) {
    dd.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted);">无匹配结果</div>';
    return;
  }
  dd.innerHTML = items.slice(0, 80).map(s => `
    <div class="symbol-dropdown-item ${s.symbol === current ? 'active' : ''}"
         onmousedown="selectSymbol('${s.symbol}','${s.base}')">
      <span class="sym-name">${s.base}</span>
      <span style="color:var(--text-muted);font-size:11px;">/USDT</span>
    </div>
  `).join('');
}

function openSymbolDropdown() {
  // 输入框聚焦时显示完整列表，并把下拉定位到输入框正下方。
  const inp = document.getElementById('symbolInput');
  if (!inp) return;
  let dd = document.getElementById('symbolDropdown');
  if (dd && dd.parentElement !== document.body) {
    document.body.appendChild(dd);
  }
  if (!dd) return;
  window._symbolDropdownOpen = true;
  inp.value = '';
  inp.placeholder = '搜索币种...';
  const rect = inp.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.zIndex = '999999';
  dd.style.display = 'block';
  renderSymbolDropdown(window._allSymbols);
}

function filterSymbols(val) {
  // 统一清洗用户输入（去除 / - 空格），提高检索命中率。
  const dd = document.getElementById('symbolDropdown');
  if (!dd) return;
  window._symbolDropdownOpen = true;
  dd.style.display = 'block';
  const q = val.toUpperCase().replace('/','').replace('-','').replace(' ','');
  const filtered = !q ? window._allSymbols : window._allSymbols.filter(s =>
    s.base.startsWith(q) || s.symbol.startsWith(q)
  );
  renderSymbolDropdown(filtered);
}

function selectSymbol(symbol, base) {
  // 用户选择后：同步隐藏 select + 可见 input，并立即触发主分析刷新。
  if (!symbol || symbol.trim() === '') return;
  document.getElementById('symbolSelect').value = symbol;
  const inp = document.getElementById('symbolInput');
  inp.value = base + '/USDT';
  inp.placeholder = base + '/USDT';
  closeSymbolDropdown();
  loadAll();
}

function closeSymbolDropdown() {
  window._symbolDropdownOpen = false;
  const dd = document.getElementById('symbolDropdown');
  const inp = document.getElementById('symbolInput');
  if (!dd || !inp) return;
  dd.style.display = 'none';
  const sym = document.getElementById('symbolSelect').value;
  const base = sym.replace('USDT','');
  inp.value = base + '/USDT';
  inp.placeholder = base + '/USDT';
}

// K 线是整个分析流程的核心输入数据（后续指标全部基于它计算）。
async function getKlines(symbol, interval, limit=300) {
  const r = await fetchTimeout(`${API}/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, 10000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function getTicker(symbol) {
  // symbol 非法时直接返回，避免发起无效请求。
  if (!symbol || symbol.trim() === '') return null;
  const r = await fetchTimeout(`${API}/api/ticker?symbol=${encodeURIComponent(symbol)}`, 10000);
  if (!r.ok) return null;
  return r.json();
}

async function getFundingRate(symbol) {
  // “失败返回 null”而不是 throw，避免非关键接口导致全局流程中断。
  try {
    const r = await fetchTimeout(`${API}/api/funding?symbol=${symbol}`, 10000);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function getOpenInterest(symbol) {
  // OI 数据用于监控和情绪辅助，不可用时可降级。
  try {
    const r = await fetchTimeout(`${API}/api/oi?symbol=${symbol}`, 10000);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function getTopLSRatio(symbol) {
  // 该接口当前仅供扩展，主流程中并未强依赖。
  try {
    return fetchTimeout(`${API}/api/proxy?u=${encodeURIComponent(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=5m&limit=1`)}`, 10000).then(r=>r.ok?r.json():null);
  } catch { return null; }
}

async function getGlobalLSRatio(symbol) {
  // 返回数组结构（通常取第 0 项），调用方需做判空。
  try {
    const r = await fetchTimeout(`${API}/api/ls?symbol=${symbol}`, 10000);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function getFearGreed() {
  // 恐惧贪婪属于慢频数据，失败时不影响核心行情分析。
  try {
    const r = await fetchTimeout(`${API}/api/fg`, 10000);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function getForceOrders(symbol) {
  // 强平数据经常受限流/权限影响，失败时保持 null 即可。
  try {
    const r = await fetchTimeout(`${API}/api/force?symbol=${symbol}`, 10000);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function getOrderBook(symbol, limit=20) {
  // 订单簿深度是“增强信息”，并非硬依赖。
  try {
    const r = await fetchTimeout(`${API}/api/depth?symbol=${symbol}&limit=${limit}`, 10000);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function getCGCommunity(coin) {
  // CoinGecko 社区数据有 5 分钟前端缓存，减少重复请求和限流风险。
  if (!coin || !/^[a-zA-Z0-9]+$/.test(coin)) return null;
  const cacheKey = 'cg_' + coin;
  const cached = _cgCache[cacheKey];
  if (cached && Date.now() - cached.ts < 300000) return cached.data;
  try {
    const r = await fetchTimeout(`${API}/api/cg?coin=${coin.toLowerCase()}`, 10000);
    if (!r.ok) return null;
    const result = await r.json();
    _cgCache[cacheKey] = { data: result, ts: Date.now() };
    return result;
  } catch { return null; }
}

async function getOnchainTrades(coin) {
  // 仅对有预设池地址的币种生效，其他币种直接返回 null。
  const poolMap = {
    BTC:  'eth_0xcbcdf9626bc03e24f779434178a73a0b4bad62ed',
    ETH:  'eth_0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8',
    SOL:  null,
    MATIC:'eth_0x99ac8ca7087fa4a2a1fb6357269965a2014adc58',
  };
  const pool = poolMap[coin];
  if (!pool) return null;
  try {
    const [net, addr] = pool.split('_');
    return await fetchJSON(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${addr}/trades?trade_volume_in_usd_greater_than=100000`);
  } catch { return null; }
}

async function getTrendingCoins() {
  // 这里的缓存属于前端内存缓存，刷新页面后会丢失。
  if (_trendingCache && Date.now() - _trendingTs < 300000) return _trendingCache;
  try {
    const r = await fetchTimeout(`${API}/api/trending`, 10000);
    if (!r.ok) return null;
    const data = await r.json();
    _trendingCache = data; _trendingTs = Date.now();
    return data;
  } catch { return null; }
}

async function getGlobalMarket() {
  // 与 trending 一样，做 5 分钟内存缓存。
  if (_globalCache && Date.now() - _globalTs < 300000) return _globalCache;
  try {
    const r = await fetchTimeout(`${API}/api/global`, 10000);
    if (!r.ok) return null;
    const data = await r.json();
    _globalCache = data; _globalTs = Date.now();
    return data;
  } catch { return null; }
}

async function getAggTrades(symbol, limit=50) {
  // 主动返回 []，方便调用方直接 map/filter，不必额外判空。
  try {
    const r = await fetchTimeout(`${API}/api/proxy?u=${encodeURIComponent(`https://api.binance.com/api/v3/aggTrades?symbol=${symbol}&limit=${limit}`)}`, 10000);
    return r.ok ? r.json() : [];
  } catch { return []; }
}

async function getBinanceAnnouncements(coin) {
  return null;
}

async function getNewsCV(coin, interval) {
  // interval -> 回看窗口小时数映射，用于筛掉太旧的新闻。
  const hoursMap = { '15m':1, '1h':6, '4h':24, '1d':168 };
  const hours = hoursMap[interval] || 6;
  try {
    const data = await fetchJSON(`https://cryptocurrency.cv/api/news?ticker=${coin}&limit=20`);
    const cutoff = Date.now() - hours * 3600000;
    const items  = (data.articles || data || []).filter(a => {
      const t = a.published_at || a.publishedAt || a.date || a.time;
      return !t || new Date(t).getTime() > cutoff;
    });
    return { results: items.slice(0, 15), source: 'CryptoCV', hours };
  } catch { return null; }
}

async function getNewsPanic(coin, interval) {
  // CryptoPanic 免费 token 仅示例用途，生产环境建议替换为自有 key。
  const hoursMap = { '15m':1, '1h':6, '4h':24, '1d':168 };
  const hours = hoursMap[interval] || 6;
  try {
    const coinSlug = coin.toLowerCase();
    const data = await fetchJSON(`https://cryptopanic.com/api/free/v1/posts/?auth_token=free&currencies=${coin}&kind=news&public=true`);
    const cutoff = Date.now() - hours * 3600000;
    const items = (data.results || []).filter(r => new Date(r.published_at).getTime() > cutoff);
    return { results: items.slice(0, 12), source: 'CryptoPanic', hours };
  } catch { return null; }
}

async function getNewsAlternative() {
  try {
    const data = await fetchJSON('https://api.alternative.me/v1/ticker/?limit=1&convert=USD'); // via Worker
    return data;
  } catch { return null; }
}

async function getNewsForSentiment(coin = 'BTC') {
  // 聚合多个新闻源并统一字段，供前端情绪模块直接消费。
  try {
    const [cv, panic] = await Promise.allSettled([
      getNewsCV(coin, '1h'),
      getNewsPanic(coin, '1h'),
    ]);
    const cvItems    = cv.status === 'fulfilled' && cv.value?.results ? cv.value.results : [];
    const panicItems = panic.status === 'fulfilled' && panic.value?.results ? panic.value.results : [];
    // 统一字段结构，避免不同源字段名不一致导致渲染报错。
    const normalize = (items, source) => items.map(item => ({
      title: item.title || item.headline || '',
      published_at: item.published_at || item.publishedAt || item.date || '',
      source: { title: source },
      votes: { positive: item.votes?.positive || 0, negative: item.votes?.negative || 0 },
      url: item.url || ''
    }));
    const all = [...normalize(panicItems, 'CryptoPanic'), ...normalize(cvItems, 'CryptoCV')];
    return all.slice(0, 20);
  } catch(e) {
    return [];
  }
}
