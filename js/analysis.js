
// 把情绪数据（恐惧贪婪、资金费率、多空比）+ 技术面信号合成为一个“新闻情绪标签”。
function calcNewsSentiment(indicators, fgData, fundingData, lsData) {
  // 获取展示区域 DOM，若页面不含该模块就直接退出。
  const labelEl = document.getElementById('newsSentLabel');
  const descEl  = document.getElementById('newsSentDesc');
  if (!labelEl || !descEl) return;

  // score 为综合分：>0 偏多，<0 偏空，绝对值越大表示倾向越强。
  let score = 0;
  const reasons = [];

  // 维度1：恐惧贪婪指数（市场整体情绪）
  if (fgData?.status === 'fulfilled' && fgData.value) {
    const fg = parseInt(fgData.value.value);
    if (fg >= 70)      { score += 2; reasons.push(`贪婪指数${fg}(极度贪婪)`); }
    else if (fg >= 55) { score += 1; reasons.push(`贪婪指数${fg}(偏乐观)`); }
    else if (fg <= 25) { score -= 2; reasons.push(`恐惧指数${fg}(极度恐惧)`); }
    else if (fg <= 40) { score -= 1; reasons.push(`恐惧指数${fg}(偏悲观)`); }
  }

  // 维度2：资金费率（合约市场拥挤度）
  if (fundingData?.status === 'fulfilled' && fundingData.value) {
    const fr = parseFloat(fundingData.value[0]?.fundingRate || 0) * 100;
    // fr 已经是“百分比值”（例如 0.0005 -> 0.05，表示 0.05%）。
    const FR_BULL_THRESHOLD_PCT = 0.05;
    const FR_BEAR_THRESHOLD_PCT = -0.02;
    // 使用含等号比较，避免 fr 恰好等于阈值时被误判为“中性”。
    if (fr >= FR_BULL_THRESHOLD_PCT)       { score += 1; reasons.push(`资金费率+${fr.toFixed(3)}%(多头积极)`); }
    else if (fr <= FR_BEAR_THRESHOLD_PCT)  { score -= 1; reasons.push(`资金费率${fr.toFixed(3)}%(空头主导)`); }
  }

  // 维度3：多空账户比（账户层面的方向倾向）
  if (lsData?.status === 'fulfilled' && lsData.value) {
    const ls = parseFloat(lsData.value.longShortRatio || lsData.value[0]?.longShortRatio || 1);
    if (ls > 1.3)      { score += 1; reasons.push(`多空比${ls.toFixed(2)}(多头占优)`); }
    else if (ls < 0.8) { score -= 1; reasons.push(`多空比${ls.toFixed(2)}(空头占优)`); }
  }

  // 维度4：技术指标整体偏向（bull 数量 vs bear 数量）
  if (indicators) {
    const vals = Object.values(indicators);
    const bulls = vals.filter(v => v.type === 'bull').length;
    const bears = vals.filter(v => v.type === 'bear').length;
    const total = bulls + bears || 1;
    const techScore = (bulls - bears) / total;
    if (techScore > 0.3)       { score += 2; reasons.push(`技术面偏多(${bulls}利多/${bears}利空)`); }
    else if (techScore > 0.1)  { score += 1; reasons.push(`技术面略多`); }
    else if (techScore < -0.3) { score -= 2; reasons.push(`技术面偏空(${bears}利空/${bulls}利多)`); }
    else if (techScore < -0.1) { score -= 1; reasons.push(`技术面略空`); }
  }

  let label, color, desc;
  if (score >= 4)       { label = '强烈利多'; color = 'var(--green)'; }
  else if (score >= 2)  { label = '偏多';     color = 'var(--green)'; }
  else if (score >= 1)  { label = '略偏多';   color = '#8bc34a'; }
  else if (score <= -4) { label = '强烈利空'; color = 'var(--red)'; }
  else if (score <= -2) { label = '偏空';     color = 'var(--red)'; }
  else if (score <= -1) { label = '略偏空';   color = '#ff9800'; }
  else                  { label = '中性';     color = 'var(--gold)'; }

  // 描述最多保留 3 条，避免 UI 过长换行影响可读性。
  desc = reasons.slice(0, 3).join('，');
  if (!desc) desc = '数据不足，暂无判断';

  labelEl.textContent = label;
  labelEl.style.color = color;
  descEl.textContent  = desc;
}

function setEl(id, val, prop='textContent') {
  // 通用 DOM 赋值工具：减少重复 null 判断代码。
  const el = document.getElementById(id);
  if (el) el[prop] = val;
}
function setElHTML(id, val) { setEl(id, val, 'innerHTML'); }
function setElClass(id, val) { const el = document.getElementById(id); if(el) el.className = val; }


// 分析页主流程（输入 -> 计算 -> 输出）：
// 1) 输入：并行获取 K 线、Ticker、资金费率、持仓、多空比等数据
// 2) 计算：调用 analyzeAll 生成完整指标信号
// 3) 输出：把各模块渲染到页面并缓存结果供 event/calc 页面复用
async function loadAll(silent=false) {
  // 读取用户当前选择的交易对（例如 BTCUSDT）。
  const symbol = document.getElementById('symbolSelect').value;
  // 为了在输入框里显示成更友好的 BTC/USDT 形式，这里取基础币名。
  const _base = symbol.replace('USDT','');
  const _inp = document.getElementById('symbolInput');
  // 当下拉搜索框未展开时，才自动改写输入框，避免打断用户输入。
  if (_inp && !window._symbolDropdownOpen) _inp.value = _base + '/USDT';
  // 读取时间周期（15m/1h/4h/...），后续会影响 K 线和指标计算结果。
  const interval = document.getElementById('intervalSelect').value;
  const btn = document.getElementById('refreshBtn');

  // 进入加载状态：禁用按钮，防止用户重复点击触发并发请求。
  btn.disabled = true;
  setStatus('loading');
  document.getElementById('errorBanner')?.classList.remove('show');
  document.getElementById('loaderText').textContent = '获取K线数据...';
  if (!silent) document.getElementById('loadingOverlay').classList.remove('hidden');

  try {
    document.getElementById('loaderText').textContent = '并行获取市场数据...';
    const coin = symbol.replace('USDT','').replace('BUSD','');
    // 并行拉取全部所需数据，避免串行等待导致页面加载过慢。
    // Promise.allSettled 的好处：单个接口失败不会直接让整个流程抛错。
    const [klines, ticker, fundingData, oiData, lsData, fgData, forceOrdersData, depthData] = await Promise.allSettled([
      // 1) K线：主输入（最重要）
      getKlines(symbol, interval, 300),
      // 2) Ticker：顶部价格信息
      getTicker(symbol),
      // 3) 资金费率：合约拥挤度
      getFundingRate(symbol),
      // 4) OI：持仓规模
      getOpenInterest(symbol),
      // 5) 多空账户比
      getGlobalLSRatio(symbol),
      // 6) 恐惧贪婪指数
      getFearGreed(),
      // 7) 强平订单
      getForceOrders(symbol),
      // 8) 订单簿深度
      getOrderBook(symbol, 20),
    ]);

    document.getElementById('loaderText').textContent = '计算技术指标...';

    // K 线是后续所有指标的根数据，必须优先校验。
    if (klines.status === 'rejected') {
      showError('K线数据获取失败，请点击刷新重试');
      setStatus('error');
      return;
    }
    // 防止“接口成功但返回空数组”的场景。
    if (!Array.isArray(klines.value) || klines.value.length === 0) {
      showError('该币种暂无K线数据，可能刚上线或已下架');
      setStatus('error');
      return;
    }
    const klinesData = klines.value;

    // Ticker 主要用于顶部行情展示，不影响核心指标计算。
    if (ticker.status === 'fulfilled') {
      const t = ticker.value;
      const change = parseFloat(t.priceChangePercent);
      const isUp = change >= 0;
      document.getElementById('priceSymbol').textContent = symbol.replace('USDT', '/USDT');
      document.getElementById('priceValue').textContent = '$' + fmtPrice(parseFloat(t.lastPrice));
      document.getElementById('priceValue').style.color = isUp ? 'var(--green)' : 'var(--red)';
      const changeEl = document.getElementById('priceChange');
      changeEl.textContent = (isUp?'+':'') + change.toFixed(2) + '%  ' + (isUp?'▲':'▼') + ' $' + fmtPrice(Math.abs(parseFloat(t.priceChange)));
      changeEl.className = 'price-change ' + (isUp?'up':'down');
      document.getElementById('stat24h').textContent = '$' + fmtPrice(parseFloat(t.highPrice));
      document.getElementById('stat24l').textContent = '$' + fmtPrice(parseFloat(t.lowPrice));
      document.getElementById('stat24v').textContent = '$' + fmt(parseFloat(t.quoteVolume));
    }

    document.getElementById('loaderText').textContent = '生成信号分析...';
    // 进入计算引擎：把原始 K 线转成结构化指标对象。
    const { indicators, closes, highs, lows, volumes, fib, vegas, elliott } = analyzeAll(klinesData);

    // 迷你图只取最近 60 根，兼顾响应速度与走势可读性。
    updateMiniChart(closes.slice(-60));

    // 下面按功能分区渲染，核心思想是“先算完，再按模块展示”。
    renderGroup('trendList', 'trendBadge', indicators, 'trend', nameMap);
    renderGroup('momentumList', 'momentumBadge', indicators, 'momentum', nameMap);
    renderGroup('volumeList', 'volumeBadge', indicators, 'volume', nameMap);
    renderGroup('volatilityList', 'volatilityBadge', indicators, 'volatility', nameMap);
    renderGroup('suppList', 'suppBadge', indicators, 'supp', nameMap);
    renderGroup('maSysList', 'maSysBadge', indicators, 'masys', nameMap);
    renderGroup('structureList', 'structureBadge', indicators, 'structure', nameMap);

    renderFibonacci(fib);
    renderVegas(vegas, indicators);
    renderElliott(elliott);

    document.getElementById('loaderText').textContent = '分析清算与流动性...';
    // 额外市场结构模块（清算/订单簿/量价）使用独立数据渲染。
    const forceOrders = forceOrdersData.status === 'fulfilled' ? forceOrdersData.value : null;
    renderLiquidation(forceOrders, klinesData);
    const depth = depthData.status === 'fulfilled' ? depthData.value : null;
    // 当前价直接取最后一根 K 线收盘价，避免 ticker 与 K 线时间差导致偏移。
    const currentPrice = parseFloat(klinesData[klinesData.length-1][4]);
    renderOrderBook(depth, currentPrice);

    document.getElementById('loaderText').textContent = '分析量能与量价...';
    renderVolumeProfile(klinesData);
    renderVolumeDelta(klinesData);
    renderVolumePrice(klinesData);

    // 综合评分是对 indicators 的二次聚合，用于快速判断市场偏向。
    renderScore(indicators);

    let frValue = null;
    // 资金费率：正值一般代表多头付费，负值代表空头付费。
    if (fundingData.status === 'fulfilled' && fundingData.value?.length) {
      const fr = parseFloat(fundingData.value[0].fundingRate) * 100;
      frValue = fr;
      document.getElementById('fundingRate').textContent = fr.toFixed(4) + '%';
      document.getElementById('fundingRate').style.color = fr > 0 ? 'var(--red)' : fr < 0 ? 'var(--green)' : 'var(--text)';
      const fundingNoteEl = document.getElementById('fundingNote'); if(fundingNoteEl) fundingNoteEl.textContent = fr > 0.1 ? '偏高，多头付费' : fr < -0.05 ? '为负，空头付费' : '正常范围';
    } else {
      document.getElementById('fundingRate').textContent = 'N/A';
      document.getElementById('fundingNote').textContent = '现货交易对';
    }

    // 持仓量（OI）用于判断资金是否进场。
    if (oiData.status === 'fulfilled' && oiData.value?.openInterest) {
      const oi = parseFloat(oiData.value.openInterest);
      document.getElementById('openInterest').textContent = fmt(oi);
      const oiNoteEl = document.getElementById('oiNote'); if(oiNoteEl) oiNoteEl.textContent = symbol.replace('USDT','') + ' 合约持仓';
    } else {
      document.getElementById('openInterest').textContent = 'N/A';
    }

    let lsRatio = null;
    // 多空账户比用于情绪辅助，不直接决定涨跌，但可提供拥挤度参考。
    if (lsData.status === 'fulfilled' && lsData.value?.length) {
      const ls = lsData.value[0];
      const lp = parseFloat(ls.longAccount);
      const sp = parseFloat(ls.shortAccount);
      lsRatio = lp / sp;
      renderLSRatio(lp, sp);
    } else {
      document.getElementById('lsRatioVal').textContent = 'N/A';
      document.getElementById('lsLong').textContent = '--';
      document.getElementById('lsShort').textContent = '--';
    }
    let fgVal = null;
    // 恐惧贪婪指数用于宏观情绪补充。
    if (fgData.status === 'fulfilled' && fgData.value?.data?.[0]) {
      const fg = fgData.value.data[0];
      fgVal = fg.value;
      renderFearGreed(fg.value, fg.value_classification);
    } else {
      document.getElementById('fgNum').textContent = '--';
      document.getElementById('fgValue').textContent = '--';
    }

    // 将技术面 + 情绪面标签汇总渲染成“易读标签”。
    renderSentimentTags(indicators, frValue, fgVal, lsRatio);

    // 预留：社区与趋势数据请求（当前只触发预热，不直接参与本函数渲染）。
    const tickerVal = ticker.status === 'fulfilled' ? ticker.value : null;
    const cgCommData = null;
    const trendingData = null;
    Promise.allSettled([
      getCGCommunity(symbol.replace('USDT','')),
      getTrendingCoins(),
    ]).catch(() => {});

    document.getElementById('statMC').textContent = '实时数据';

    // 持久化本次分析结果，供“事件页 / 计算器页”复用，避免重复计算。
    storeAnalysisData({
      indicators, closes, highs, lows, volumes,
      price: parseFloat(klinesData[klinesData.length-1][4]),
      fib, vegas, elliott, symbol,
      ticker: ticker.status==='fulfilled' ? ticker.value : null,
      fgVal, frValue, lsRatio
    });

    // 更新时间戳仅用于 UI 提示，不参与计算。
    const now = new Date();
    document.getElementById('lastUpdate').textContent = `更新于 ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    setStatus('live');

  } catch (e) {
    console.error(e);
    showError(e.message || '数据加载失败，请刷新重试');
    setStatus('error');
  } finally {
    // finally 一定会执行，保证按钮和遮罩状态回收。
    btn.disabled = false;
    if (!silent) document.getElementById('loadingOverlay').classList.add('hidden');
  }
}

// 保存最近一次分析结果，其他页面（事件/计算器）会复用这份数据。
function storeAnalysisData(data) {
  // 主缓存对象：事件页、计算器会读取这一份结果。
  _lastAnalysisData = data;
  // 一些跨页面轻量字段直接挂到 window，便于老代码兼容。
  window._lastFrValue = data.frValue;
  window._lastInterval = document.getElementById('intervalSelect')?.value || '1h';
}

async function loadMonitor() {
  // 30 秒节流：避免重复进入监控页时不断打接口。
  const now = Date.now();
  if (now - _monitorLastLoad < 30000) return;
  _monitorLastLoad = now;

  const dot = document.getElementById('monitorDot');
  if (dot) { dot.className = 'status-dot loading'; }
  if (!dot) return;

  // 监控页当前币种沿用分析页选择。
  const symbol = document.getElementById('symbolSelect')?.value || 'BTCUSDT';
  const coin   = symbol.replace('USDT','');

  try {
    // 并行拉取监控页所有数据源（资金费率历史、OI历史、链上、趋势、全局）。
    const [frHistory, oiHistory, klines24h, ticker, cgData, onchainData, trendData, globalData] = await Promise.allSettled([
      fetchTimeout(`${API}/api/proxy?u=${encodeURIComponent(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=24`)}`, 10000).then(r=>r.ok?r.json():null).catch(()=>null),
      fetchTimeout(`${API}/api/proxy?u=${encodeURIComponent(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=24`)}`, 10000).then(r=>r.ok?r.json():null).catch(()=>null),
      fetchTimeout(`${API}/api/klines?symbol=${symbol}&interval=1h&limit=48`, 10000).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetchTimeout(`${API}/api/ticker?symbol=${symbol}`, 10000).then(r=>r.ok?r.json():null).catch(()=>null),
      getCGCommunity(coin),
      getOnchainTrades(coin),
      getTrendingCoins(),
      getGlobalMarket(),
    ]);

    // 对 Promise.allSettled 结果做统一解包，失败项会变成 null/[]。
    const klinesData  = klines24h.status === 'fulfilled' ? klines24h.value : [];
    const tickerData  = ticker.status === 'fulfilled' ? ticker.value : null;
    const frData      = frHistory.status === 'fulfilled' ? frHistory.value : null;
    const oiData      = oiHistory.status === 'fulfilled' ? oiHistory.value : null;
    const cgInfo      = cgData.status === 'fulfilled' ? cgData.value : null;
    const onchain     = onchainData.status === 'fulfilled' ? onchainData.value : null;
    const trending    = trendData.status === 'fulfilled' ? trendData.value : null;
    const globalInfo  = globalData.status === 'fulfilled' ? globalData.value : null;

    // 各监控卡片独立渲染，即使某个模块数据缺失也不会阻断其他模块。
    renderWhaleMonitor(coin, klinesData, tickerData, cgInfo, onchain);
    renderSmartMoney(coin, klinesData, tickerData, cgInfo);
    renderOnChainAnomalies(coin, klinesData, tickerData, onchain, trending, globalInfo);
    renderExchangeFlow(coin, klinesData, tickerData, cgInfo);
    renderFundingHistory(frData, symbol);
    renderOIHistory(oiData, coin);
    renderRiskAlerts(coin, klinesData, tickerData, frData);

    // 这里是演示型聚合统计（非严格计算），用于页面快速展示“异动数量”。
    const totalAlerts = 6 + Math.floor(Math.random()*4);
    document.getElementById('monitorAlertCount').textContent = totalAlerts + ' 个异动';
    document.getElementById('monWhaleCount').textContent  = Math.floor(totalAlerts*0.35) + '个';
    document.getElementById('monSmartCount').textContent  = Math.floor(totalAlerts*0.3)  + '个';
    document.getElementById('monAnomalyCount').textContent= Math.floor(totalAlerts*0.35) + '个';

    // 风险级别按 24h 涨跌幅绝对值粗略划分。
    const riskEl = document.getElementById('monRiskLevel');
    const change = tickerData ? Math.abs(parseFloat(tickerData.priceChangePercent)) : 0;
    const risk   = change > 5 ? '高' : change > 2 ? '中' : '低';
    riskEl.textContent = risk + '风险';
    riskEl.style.color = risk === '高' ? 'var(--red)' : risk === '中' ? 'var(--amber)' : 'var(--green)';

    if (dot) dot.className = 'status-dot live';
  } catch(e) {
    console.error(e);
    if (dot) dot.className = 'status-dot error';
  }
}

function setEventCoin(coin, btn) {
  // 事件页换币后，和分析页币种保持同步，确保数据口径一致。
  _eventCoin = coin;
  document.querySelectorAll('.event-coin-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const symSelect = document.getElementById('symbolSelect');
  const targetSym = coin + 'USDT';
  if (symSelect && symSelect.value !== targetSym) {
    symSelect.value = targetSym;
    loadAll(true);
  } else if (_lastAnalysisData) {
    renderEventPage(_lastAnalysisData);
  }
}

async function refreshEventPage() {
  // 强制按事件页当前币种重新跑一遍分析主流程。
  const btn = document.getElementById('monitorRefreshBtn');
  const sym = _eventCoin + 'USDT';
  const symSelect = document.getElementById('symbolSelect');
  if (symSelect) symSelect.value = sym;
  await loadAll(true);
}

function fetchWithTimeout(url, ms = 6000) {
  // analysis.js 内部版本的超时请求（与 utils.js 类似，保留兼容）。
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: 'no-cache' })
    .finally(() => clearTimeout(timer));
}

async function fetchLiveData() {
  return null;
}

function parseLiveHtml(html) { return null; }

function mapLiveData(rawList) {
  // 把直播源原始数据转换成前端统一结构（含情绪标签和排序分）。
  return rawList.map((s, i) => {
    const { sentiment, tags, coins } = analyzeStreamerTitle(s.title || '');
    const viewers  = s.viewers || 0;
    const views    = s.views   || 0;
    let duration = 30;
    if (s.startTime && s.startTime !== '-') {
      const st = new Date(s.startTime.replace(/-/g, '/'));
      if (!isNaN(st)) duration = Math.max(1, Math.round((Date.now() - st.getTime()) / 60000));
    }
    // 弹幕量为估算值（当前无真实字段时用于视觉表现）。
    const danmaku = Math.round(viewers * (0.8 + Math.random() * 0.6));
    const avatar  = (s.name || 'X').slice(0, 2);
    const score   = viewers * 1.0 + danmaku * 3 + views * 0.05;
    return {
      id: i + 1, name: s.name || `主播${i+1}`,
      avatar, topic: s.title || '加密货币直播',
      tags, coins, sentiment, viewers, views, danmaku,
      duration, followers: 0, score,
      startTime: s.startTime || '',
      link: s.link || '',
      isReal: true,
    };
  });
}

async function loadLivePage() {
  // 防重入：避免连续点击导致并发请求与 UI 抖动。
  if (_liveLoading) return;
  _liveLoading = true;

  const grid = document.getElementById('liveStreamerGrid');
  if (grid) grid.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px 0;">加载中...</div>';

  try {
    // 直播页数据由后端 /api/live 聚合提供。
    const r = await fetch(API + '/api/live');
    const data = await r.json();

    if (data && data.list) {
      renderLiveStats(data);
      renderLiveStreamers(data.list);
    } else {
      if (grid) grid.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px 0;">暂无直播数据</div>';
    }
  } catch(e) {
    if (grid) grid.innerHTML = '<div style="color:var(--red);font-size:13px;padding:20px 0;">获取数据失败，请稍后重试</div>';
  } finally {
    _liveLoading = false;
  }
}

function renderLiveStats(data) {
  // 这里主要渲染顶部统计与“多空情绪占比”概览。
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('liveCount',  data.liveNum || 0);
  setEl('liveOnline', fmt(data.onlineNum || 0));
  setEl('liveViews',  fmt(data.viewNum || 0));
  setEl('liveAll',    data.allNum || 0);

  const badge = document.getElementById('liveBadge');
  if (badge) { badge.textContent = (data.liveNum || 0) + ' 个直播中'; badge.className = 'panel-badge badge-green'; }

  const onlineBadge = document.getElementById('liveOnlineBadge');
  if (onlineBadge) onlineBadge.textContent = (data.liveNum || 0) + ' 人直播中';

  const list = data.list || [];
  let longCount = 0, shortCount = 0, neutralCount = 0;
  const longKw  = ['多','看多','做多','买入','涨','long','bull','up'];
  const shortKw = ['空','看空','做空','卖出','跌','short','bear','down'];

  // 通过标题关键词做简易情绪分类（启发式，不是 NLP 模型）。
  list.forEach(item => {
    const title = (item.live_title || '').toLowerCase();
    const isLong  = longKw.some(k => title.includes(k));
    const isShort = shortKw.some(k => title.includes(k));
    if (isLong && !isShort)       longCount++;
    else if (isShort && !isLong)  shortCount++;
    else                          neutralCount++;
  });

  const total = list.length || 1;
  const longPct  = Math.round(longCount  / total * 100);
  const shortPct = Math.round(shortCount / total * 100);

  const longBar  = document.getElementById('liveLongBar');
  const shortBar = document.getElementById('liveShortBar');
  if (longBar)  longBar.style.width  = longPct + '%';
  if (shortBar) shortBar.style.width = shortPct + '%';

  setEl('liveLongCount',    longCount);
  setEl('liveShortCount',   shortCount);
  setEl('liveNeutralCount', '中性 ' + neutralCount + ' 人');

  const dirBadge = document.getElementById('liveDirBadge');
  let dirText, dirClass, conclusion;
  if (longCount > shortCount * 1.5) {
    dirText = '多头主导'; dirClass = 'badge-green';
    conclusion = '当前在线主播中看多方向占主导（' + longPct + '%），市场整体情绪偏乐观。结合技术指标综合判断，多头信号偏强。';
  } else if (shortCount > longCount * 1.5) {
    dirText = '空头主导'; dirClass = 'badge-red';
    conclusion = '当前在线主播中看空方向占主导（' + shortPct + '%），市场整体情绪偏悲观。需注意回调风险。';
  } else {
    dirText = '多空分歧'; dirClass = 'badge-amber';
    conclusion = '当前主播多空方向分歧较大，市场情绪中性。建议等待方向明朗后再入场。';
  }
  if (dirBadge) { dirBadge.textContent = dirText; dirBadge.className = 'panel-badge ' + dirClass; }
  const conclusionEl = document.getElementById('liveDirConclusion');
  if (conclusionEl) conclusionEl.textContent = conclusion;
}

function renderLiveStreamers(list) {
  // 主播列表按在线人数降序，展示“当前热度”。
  const grid = document.getElementById('liveStreamerGrid');
  if (!grid) return;
  if (!list || list.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px 0;">暂无在线主播</div>';
    return;
  }

  list.sort((a, b) => parseInt(b.live_online_count || 0) - parseInt(a.live_online_count || 0));

  const longKw  = ['多','看多','做多','买入','涨','long','bull'];
  const shortKw = ['空','看空','做空','卖出','跌','short','bear'];

  grid.innerHTML = list.map((item, idx) => {
    const title    = item.live_title || '暂无标题';
    const online   = item.live_online_count || 0;
    const views    = item.live_view_count   || 0;
    const avatar   = item.avatar || '';
    const liveUrl  = item.live_url || '';
    const followers = fmt(item.totalFollowerCount || 0);

    const t = title.toLowerCase();
    const isLong  = longKw.some(k => t.includes(k));
    const isShort = shortKw.some(k => t.includes(k));
    let dirLabel = '', dirColor = 'var(--text-muted)';
    if (isLong && !isShort)      { dirLabel = '▲ 看多'; dirColor = 'var(--green)'; }
    else if (isShort && !isLong) { dirLabel = '▼ 看空'; dirColor = 'var(--red)'; }
    else                         { dirLabel = '→ 中性'; dirColor = 'var(--gold)'; }

    const rankColor = idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'var(--text-muted)';

    // 有直播链接时卡片可点击跳转。
    const clickHandler = liveUrl ? 'window.open("' + liveUrl + '","_blank")' : '';
    return '<div class="streamer-card" style="cursor:' + (liveUrl?'pointer':'default') + ';" onclick="' + clickHandler + '">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
        '<div style="position:relative;flex-shrink:0;">' +
          '<img src="' + avatar + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;background:var(--bg3);" onerror="this.src=\'\';this.style.opacity=0">' +
          '<div style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:var(--red);border:2px solid var(--bg1);"></div>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (item.name || item.userName || '未知主播') + '</span>' +
            (idx < 3 ? '<span style="font-size:10px;font-weight:700;color:' + rankColor + '">TOP' + (idx+1) + '</span>' : '') +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">粉丝 ' + followers + '</div>' +
        '</div>' +
        '<div style="font-family:var(--mono);font-size:12px;font-weight:700;color:' + dirColor + ';flex-shrink:0;">' + dirLabel + '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + title + '">' + title + '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;font-family:var(--mono);">' +
        '<span style="color:var(--red);display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:var(--red);display:inline-block;animation:pulse-dot 1.5s infinite;"></span>' + fmt(parseInt(online)) + ' 在线</span>' +
        '<span style="color:var(--text-muted);">👁 ' + (typeof views === 'string' ? views : fmt(views)) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

// 注意：此函数被下方同名函数覆盖，保留是历史兼容代码。
function showLiveDataSource(status, count) {
  const badge = document.getElementById('liveSentBadge');
  if (!badge) return;
  if (status === 'real') {
    badge.textContent = count + '个直播间';
  } else {
    badge.textContent = '加载中...';
  }
}

function showLiveDataSource(status, count) {
  // 实际生效版本：除文案外还会同步更新样式。
  const badge = document.getElementById('liveSentBadge');
  if (!badge) return;
  if (status === 'real') {
    badge.textContent = `${count}个直播间`;
    badge.style.color = '#ff6b9d';
    badge.style.background = 'rgba(255,107,157,0.1)';
    badge.style.borderColor = 'rgba(255,107,157,0.2)';
  } else {
    badge.textContent = '加载中...';
    badge.style.color = 'var(--text-muted)';
    badge.style.background = 'rgba(255,255,255,0.04)';
    badge.style.borderColor = 'var(--border2)';
  }
}

function setSortLive(sort, btn) {
  _liveSort = sort;
  document.querySelectorAll('.live-sort-btn').forEach(b => {
    b.style.background = 'var(--bg3)';
    b.style.borderColor = 'var(--border2)';
    b.style.color = 'var(--text-muted)';
  });
  btn.style.background = 'rgba(255,107,157,0.12)';
  btn.style.borderColor = 'rgba(255,107,157,0.3)';
  btn.style.color = '#ff6b9d';
  renderLivePage();
}

function filterLive(filter, btn) {
  _liveFilter = filter;
  document.querySelectorAll('.live-filter-btn').forEach(b => {
    b.style.background = 'var(--bg3)';
    b.style.borderColor = 'var(--border2)';
    b.style.color = 'var(--text-muted)';
  });
  btn.style.background = 'rgba(255,107,157,0.12)';
  btn.style.borderColor = 'rgba(255,107,157,0.3)';
  btn.style.color = '#ff6b9d';
  renderLivePage();
}

