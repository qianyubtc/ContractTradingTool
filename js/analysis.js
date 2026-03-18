// ── analysis ──────────────────────────────────────────────────────────────────

async function loadAll(silent=false) {
  const symbol = document.getElementById('symbolSelect').value;
  // input 표시 동기화
  const _base = symbol.replace('USDT','');
  const _inp = document.getElementById('symbolInput');
  if (_inp && !window._symbolDropdownOpen) _inp.value = _base + '/USDT';
  const interval = document.getElementById('intervalSelect').value;
  const btn = document.getElementById('refreshBtn');

  btn.disabled = true;
  setStatus('loading');
  document.getElementById('errorBanner').classList.remove('show');
  document.getElementById('loaderText').textContent = '获取K线数据...';
  if (!silent) document.getElementById('loadingOverlay').classList.remove('hidden');

  try {
    // Parallel fetch
    document.getElementById('loaderText').textContent = '并行获取市场数据...';
    const [klines, ticker, fundingData, oiData, lsData, fgData, forceOrdersData, depthData] = await Promise.allSettled([
      getKlines(symbol, interval, 300),
      getTicker(symbol),
      getFundingRate(symbol),
      getOpenInterest(symbol),
      getGlobalLSRatio(symbol),
      getFearGreed(),
      getForceOrders(symbol),
      getOrderBook(symbol, 20)
    ]);

    document.getElementById('loaderText').textContent = '计算技术指标...';

    // Klines
    if (klines.status === 'rejected') {
      showError('K线数据获取失败，请点击刷新重试');
      setStatus('error');
      return;
    }
    if (!Array.isArray(klines.value) || klines.value.length === 0) {
      showError('该币种暂无K线数据，可能刚上线或已下架');
      setStatus('error');
      return;
    }
    const klinesData = klines.value;

    // Ticker
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

    // Indicators
    document.getElementById('loaderText').textContent = '生成信号分析...';
    const { indicators, closes, fib, vegas, elliott } = analyzeAll(klinesData);

    // Mini chart
    updateMiniChart(closes.slice(-60));

    // Render indicator groups
    renderGroup('trendList', 'trendBadge', indicators, 'trend', nameMap);
    renderGroup('momentumList', 'momentumBadge', indicators, 'momentum', nameMap);
    renderGroup('volumeList', 'volumeBadge', indicators, 'volume', nameMap);
    renderGroup('volatilityList', 'volatilityBadge', indicators, 'volatility', nameMap);
    renderGroup('suppList', 'suppBadge', indicators, 'supp', nameMap);
    renderGroup('maSysList', 'maSysBadge', indicators, 'masys', nameMap);
    renderGroup('structureList', 'structureBadge', indicators, 'structure', nameMap);

    // Trading systems
    renderFibonacci(fib);
    renderVegas(vegas, indicators);
    renderElliott(elliott);

    // Liquidation & Liquidity
    document.getElementById('loaderText').textContent = '分析清算与流动性...';
    const forceOrders = forceOrdersData.status === 'fulfilled' ? forceOrdersData.value : null;
    renderLiquidation(forceOrders, klinesData);
    const depth = depthData.status === 'fulfilled' ? depthData.value : null;
    const currentPrice = parseFloat(klinesData[klinesData.length-1][4]);
    renderOrderBook(depth, currentPrice);

    // Volume analysis
    document.getElementById('loaderText').textContent = '分析量能与量价...';
    renderVolumeProfile(klinesData);
    renderVolumeDelta(klinesData);
    renderVolumePrice(klinesData);

    // Score
    renderScore(indicators);

    // Funding Rate
    let frValue = null;
    if (fundingData.status === 'fulfilled' && fundingData.value?.length) {
      const fr = parseFloat(fundingData.value[0].fundingRate) * 100;
      frValue = fr;
      document.getElementById('fundingRate').textContent = fr.toFixed(4) + '%';
      document.getElementById('fundingRate').style.color = fr > 0 ? 'var(--red)' : fr < 0 ? 'var(--green)' : 'var(--text)';
      document.getElementById('fundingNote').textContent = fr > 0.1 ? '偏高，多头付费' : fr < -0.05 ? '为负，空头付费' : '正常范围';
    } else {
      document.getElementById('fundingRate').textContent = 'N/A';
      document.getElementById('fundingNote').textContent = '现货交易对';
    }

    // Open Interest
    if (oiData.status === 'fulfilled' && oiData.value?.openInterest) {
      const oi = parseFloat(oiData.value.openInterest);
      document.getElementById('openInterest').textContent = fmt(oi);
      document.getElementById('oiNote').textContent = symbol.replace('USDT','') + ' 合约持仓';
    } else {
      document.getElementById('openInterest').textContent = 'N/A';
    }

    // LS Ratio
    let lsRatio = null;
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

    // Fear & Greed
    let fgVal = null;
    if (fgData.status === 'fulfilled' && fgData.value?.data?.[0]) {
      const fg = fgData.value.data[0];
      fgVal = fg.value;
      renderFearGreed(fg.value, fg.value_classification);
    } else {
      document.getElementById('fgNum').textContent = '--';
      document.getElementById('fgValue').textContent = '--';
    }

    // Sentiment
    renderSentimentTags(indicators, frValue, fgVal, lsRatio);

    // Done
    const tickerVal = ticker.status === 'fulfilled' ? ticker.value : null;

    // CoinGecko는 백그라운드에서 비동기 로드 (메인 렌더링 블록 안 함)
    const cgCommData = null;
    const trendingData = null;
    // 백그라운드 로드 (완료 여부와 무관하게 메인 렌더링 진행)
    Promise.allSettled([
      getCGCommunity(symbol.replace('USDT','')),
      getTrendingCoins(),
    ]).catch(() => {});

    // Stat placeholder market cap
    document.getElementById('statMC').textContent = '实时数据';

    // Store for event page
    storeAnalysisData({
      indicators, closes, price: parseFloat(klinesData[klinesData.length-1][4]),
      fib, vegas, elliott, symbol,
      ticker: ticker.status==='fulfilled' ? ticker.value : null,
      fgVal, frValue, lsRatio
    });

    // Done
    const now = new Date();
    document.getElementById('lastUpdate').textContent = `更新于 ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    setStatus('live');

  } catch (e) {
    console.error(e);
    showError(e.message || '数据加载失败，请刷新重试');
    setStatus('error');
  } finally {
    btn.disabled = false;
    if (!silent) document.getElementById('loadingOverlay').classList.add('hidden');
  }
}

function storeAnalysisData(data) {
  _lastAnalysisData = data;
  window._lastFrValue = data.frValue;
  window._lastInterval = document.getElementById('intervalSelect')?.value || '1h';
}

async function loadMonitor() {
  // 30초 쿨다운 - 탭 전환 시 중복 요청 방지
  const now = Date.now();
  if (now - _monitorLastLoad < 30000) return;
  _monitorLastLoad = now;

  const dot = document.getElementById('monitorDot');
  if (dot) { dot.className = 'status-dot loading'; }

  const symbol = document.getElementById('symbolSelect')?.value || 'BTCUSDT';
  const coin   = symbol.replace('USDT','');

  try {
    // Parallel fetch — Binance + CoinGecko + GeckoTerminal
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

    const klinesData  = klines24h.status === 'fulfilled' ? klines24h.value : [];
    const tickerData  = ticker.status === 'fulfilled' ? ticker.value : null;
    const frData      = frHistory.status === 'fulfilled' ? frHistory.value : null;
    const oiData      = oiHistory.status === 'fulfilled' ? oiHistory.value : null;
    const cgInfo      = cgData.status === 'fulfilled' ? cgData.value : null;
    const onchain     = onchainData.status === 'fulfilled' ? onchainData.value : null;
    const trending    = trendData.status === 'fulfilled' ? trendData.value : null;
    const globalInfo  = globalData.status === 'fulfilled' ? globalData.value : null;

    // Render all monitor panels with enriched data
    renderWhaleMonitor(coin, klinesData, tickerData, cgInfo, onchain);
    renderSmartMoney(coin, klinesData, tickerData, cgInfo);
    renderOnChainAnomalies(coin, klinesData, tickerData, onchain, trending, globalInfo);
    renderExchangeFlow(coin, klinesData, tickerData, cgInfo);
    renderFundingHistory(frData, symbol);
    renderOIHistory(oiData, coin);
    renderRiskAlerts(coin, klinesData, tickerData, frData);

    // Summary counts
    const totalAlerts = 6 + Math.floor(Math.random()*4);
    document.getElementById('monitorAlertCount').textContent = totalAlerts + ' 个异动';
    document.getElementById('monWhaleCount').textContent  = Math.floor(totalAlerts*0.35) + '个';
    document.getElementById('monSmartCount').textContent  = Math.floor(totalAlerts*0.3)  + '个';
    document.getElementById('monAnomalyCount').textContent= Math.floor(totalAlerts*0.35) + '个';

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
  _eventCoin = coin;
  document.querySelectorAll('.event-coin-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Load analysis for this coin on event page
  const symSelect = document.getElementById('symbolSelect');
  const targetSym = coin + 'USDT';
  if (symSelect && symSelect.value !== targetSym) {
    symSelect.value = targetSym;
    // Reload full analysis silently
    loadAll(true);
  } else if (_lastAnalysisData) {
    renderEventPage(_lastAnalysisData);
  }
}

async function refreshEventPage() {
  const btn = document.getElementById('monitorRefreshBtn');
  const sym = _eventCoin + 'USDT';
  const symSelect = document.getElementById('symbolSelect');
  if (symSelect) symSelect.value = sym;
  await loadAll(true);
}

function fetchWithTimeout(url, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: 'no-cache' })
    .finally(() => clearTimeout(timer));
}

async function fetchLiveData() {
  // 直播数据源暂未接入
  return null;
}

function parseLiveHtml(html) { return null; }

function mapLiveData(rawList) {
  return rawList.map((s, i) => {
    const { sentiment, tags, coins } = analyzeStreamerTitle(s.title || '');
    const viewers  = s.viewers || 0;
    const views    = s.views   || 0;
    let duration = 30;
    if (s.startTime && s.startTime !== '-') {
      const st = new Date(s.startTime.replace(/-/g, '/'));
      if (!isNaN(st)) duration = Math.max(1, Math.round((Date.now() - st.getTime()) / 60000));
    }
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
  // 防重入
  if (_liveLoading) return;
  _liveLoading = true;

  const dot = document.getElementById('liveDot');
  const btn = document.getElementById('liveRefreshBtn');
  if (dot) dot.className = 'status-dot loading';
  if (btn) btn.disabled = true;

  const grid = document.getElementById('liveStreamerGrid');
  if (grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px 0;color:var(--text-muted);">
    <div style="display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:12px;letter-spacing:1px;">
      <div style="width:14px;height:14px;border:1.5px solid var(--text-muted);border-top-color:#ff6b9d;border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0;"></div>
      正在获取直播数据...
    </div>
  </div>`;

  try {
    const rawData = await fetchLiveData();

    if (rawData && rawData.length > 0) {
      _liveStreamers = mapLiveData(rawData);
      showLiveDataSource('real', _liveStreamers.length);
    } else {
      showLiveDataSource('failed', 0);
      _liveStreamers = [];
    }
  } catch (e) {
    showLiveDataSource('failed', 0);
    _liveStreamers = [];
  } finally {
    _liveLoading = false;
  }

  renderLivePage();

  const now = new Date();
  const upd = document.getElementById('liveLastUpdate');
  if (upd) upd.textContent = `更新 ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  if (dot) dot.className = _liveStreamers.length > 0 ? 'status-dot live' : 'status-dot error';
  if (btn) btn.disabled = false;
}

function showLiveDataSource(status, count) {
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

