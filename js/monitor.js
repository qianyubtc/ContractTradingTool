// ── 数据监控模块 ──────────────────────────────────────────────────────────────

let _monTimer = null;
let _monPriceMode = 'up';
let _monAllTickers = [];

// ── 初始化 ────────────────────────────────────────────────────────────────────
async function loadMonitor(force = false) {
  const lastUpdate = document.getElementById('monLastUpdate');
  if (lastUpdate) lastUpdate.textContent = '加载中...';

  // 并行加载所有数据
  try {
    await Promise.allSettled([
      monLoadPriceAlerts(),
      monLoadFundingRate(),
      monLoadLiquidation(),
      monLoadOI(),
      monLoadLSRatio(),
    ]);
    // 黑马信号依赖价格数据，最后计算
    monCalcHorseSignals();
  } catch(e) {}

  const now = new Date();
  if (lastUpdate) lastUpdate.textContent = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')} 更新`;

  // 定时刷新
  if (_monTimer) clearInterval(_monTimer);
  _monTimer = setInterval(() => loadMonitor(), 60000);
}

// ── 价格异动 ──────────────────────────────────────────────────────────────────
async function monLoadPriceAlerts() {
  try {
    const r = await fetch(`${API}/api/proxy?u=${encodeURIComponent(BINANCE_F + '/fapi/v1/ticker/24hr')}`);
    const data = await r.json();

    // 过滤 USDT 永续合约，排除小币种
    _monAllTickers = data
      .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 10000000)
      .map(t => ({
        symbol: t.symbol.replace('USDT', ''),
        price:  parseFloat(t.lastPrice),
        change: parseFloat(t.priceChangePercent),
        volume: parseFloat(t.quoteVolume),
        high:   parseFloat(t.highPrice),
        low:    parseFloat(t.lowPrice),
      }));

    const badge = document.getElementById('monPriceBadge');
    if (badge) { badge.textContent = _monAllTickers.length + ' 个币种'; badge.className = 'panel-badge badge-amber'; }

    monRenderPriceList();
  } catch(e) {}
}

function monFilterPrice(mode, btn) {
  _monPriceMode = mode;
  document.querySelectorAll('.mon-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  monRenderPriceList();
}

function monRenderPriceList() {
  const listEl = document.getElementById('monPriceList');
  if (!listEl || !_monAllTickers.length) return;

  let sorted;
  if (_monPriceMode === 'up') {
    sorted = [..._monAllTickers].sort((a,b) => b.change - a.change).slice(0, 15);
  } else if (_monPriceMode === 'down') {
    sorted = [..._monAllTickers].sort((a,b) => a.change - b.change).slice(0, 15);
  } else {
    sorted = [..._monAllTickers].sort((a,b) => b.volume - a.volume).slice(0, 15);
  }

  const maxVal = Math.max(...sorted.map(t => Math.abs(_monPriceMode === 'vol' ? t.volume : t.change)));

  listEl.innerHTML = sorted.map((t, i) => {
    const isUp   = t.change >= 0;
    const color  = isUp ? 'var(--green)' : 'var(--red)';
    const barW   = _monPriceMode === 'vol'
      ? (t.volume / maxVal * 100).toFixed(1)
      : (Math.abs(t.change) / maxVal * 100).toFixed(1);
    const barColor = _monPriceMode === 'vol' ? 'var(--blue)' : (isUp ? 'var(--green)' : 'var(--red)');
    const valText  = _monPriceMode === 'vol'
      ? '$' + fmt(t.volume)
      : (isUp?'+':'') + t.change.toFixed(2) + '%';

    return `<div class="mon-row">
      <span style="font-size:11px;color:var(--text-muted);font-family:var(--mono);width:20px;flex-shrink:0;">${i+1}</span>
      <span class="mon-symbol">${t.symbol}</span>
      <div class="mon-bar-wrap"><div class="mon-bar" style="width:${barW}%;background:${barColor};"></div></div>
      <span class="mon-val" style="color:${_monPriceMode==='vol'?'var(--blue)':color};">${valText}</span>
      <span class="mon-sub">$${fmtPrice(t.price)}</span>
    </div>`;
  }).join('');
}

// ── 资金费率排行 ──────────────────────────────────────────────────────────────
async function monLoadFundingRate() {
  try {
    const r2 = await fetch(`${API}/api/proxy?u=${encodeURIComponent(BINANCE_F + '/fapi/v1/premiumIndex')}`);
    const data = await r2.json();

    const rates = data
      .filter(d => d.symbol.endsWith('USDT'))
      .map(d => ({
        symbol: d.symbol.replace('USDT',''),
        rate: parseFloat(d.lastFundingRate) * 100,
        price: parseFloat(d.markPrice),
      }))
      .filter(d => !isNaN(d.rate))
      .sort((a,b) => Math.abs(b.rate) - Math.abs(a.rate))
      .slice(0, 15);

    const listEl = document.getElementById('monFrList');
    const badge  = document.getElementById('monFrBadge');

    const extreme = rates.filter(r => Math.abs(r.rate) > 0.05).length;
    if (badge) { badge.textContent = extreme + ' 个极端'; badge.className = 'panel-badge ' + (extreme > 0 ? 'badge-red' : 'badge-blue'); }

    if (!listEl) return;
    listEl.innerHTML = rates.map(r => {
      const isHigh = r.rate > 0;
      const color  = r.rate > 0.05 ? 'var(--red)' : r.rate < -0.05 ? 'var(--green)' : r.rate > 0 ? 'var(--gold)' : 'var(--cyan)';
      const barW   = Math.min(100, Math.abs(r.rate) / 0.2 * 100).toFixed(1);
      const tip    = r.rate > 0.05 ? '多头过热' : r.rate < -0.05 ? '空头过热' : '';
      return `<div class="mon-row">
        <span class="mon-symbol">${r.symbol}</span>
        <div class="mon-bar-wrap"><div class="mon-bar" style="width:${barW}%;background:${color};"></div></div>
        <span class="mon-val" style="color:${color};">${r.rate > 0?'+':''}${r.rate.toFixed(4)}%</span>
        <span class="mon-sub" style="color:${color};">${tip}</span>
      </div>`;
    }).join('');
  } catch(e) {}
}

// ── 大额清算 ──────────────────────────────────────────────────────────────────
async function monLoadLiquidation() {
  try {
    const symbols = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT'];
    const results = await Promise.allSettled(
      symbols.map(s => fetch(`${API}/api/proxy?u=${encodeURIComponent(BINANCE_F + '/fapi/v1/forceOrders?symbol=' + s + '&limit=10')}`).then(r=>r.json()))
    );

    const orders = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        r.value.forEach(o => {
          orders.push({
            symbol: symbols[i].replace('USDT',''),
            side: o.side,
            price: parseFloat(o.price),
            qty: parseFloat(o.origQty),
            value: parseFloat(o.price) * parseFloat(o.origQty),
            time: o.time,
          });
        });
      }
    });

    orders.sort((a,b) => b.value - a.value);
    const top = orders.slice(0, 12);

    const listEl = document.getElementById('monLiqList');
    const badge  = document.getElementById('monLiqBadge');
    const total  = orders.reduce((s,o) => s + o.value, 0);
    if (badge) { badge.textContent = '$' + fmt(total) + ' 清算'; badge.className = 'panel-badge badge-red'; }

    if (!listEl) return;
    listEl.innerHTML = top.map(o => {
      const isBuy  = o.side === 'BUY';
      const color  = isBuy ? 'var(--green)' : 'var(--red)';
      const label  = isBuy ? '多头爆仓' : '空头爆仓';
      const time   = new Date(o.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
      return `<div class="mon-row">
        <span class="mon-symbol">${o.symbol}</span>
        <span style="font-size:10px;color:${color};font-family:var(--mono);font-weight:700;width:60px;flex-shrink:0;">${label}</span>
        <span style="flex:1;font-family:var(--mono);font-size:12px;color:var(--text-dim);">$${fmtPrice(o.price)}</span>
        <span class="mon-val" style="color:${color};">$${fmt(o.value)}</span>
        <span class="mon-sub">${time}</span>
      </div>`;
    }).join('');
  } catch(e) {}
}

// ── 持仓量异动 ────────────────────────────────────────────────────────────────
async function monLoadOI() {
  try {
    const symbols = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','MATICUSDT','LTCUSDT'];
    const results = await Promise.allSettled(
      symbols.map(s =>
        fetch(`${API}/api/proxy?u=${encodeURIComponent(BINANCE_F + '/futures/data/openInterestHist?symbol=' + s + '&period=5m&limit=2')}`)
          .then(r => r.json())
      )
    );

    const oiChanges = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length >= 2) {
        const latest = parseFloat(r.value[r.value.length-1].sumOpenInterest);
        const prev   = parseFloat(r.value[0].sumOpenInterest);
        const pct    = (latest - prev) / prev * 100;
        if (Math.abs(pct) > 0.3) {
          oiChanges.push({
            symbol: symbols[i].replace('USDT',''),
            oi: latest,
            change: pct,
          });
        }
      }
    });

    oiChanges.sort((a,b) => Math.abs(b.change) - Math.abs(a.change));

    const listEl = document.getElementById('monOIList');
    const badge  = document.getElementById('monOIBadge');
    if (badge) { badge.textContent = oiChanges.length + ' 个异动'; badge.className = 'panel-badge badge-purple'; }

    if (!listEl) return;
    if (oiChanges.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无明显OI异动</div>';
      return;
    }

    listEl.innerHTML = oiChanges.map(o => {
      const isUp   = o.change >= 0;
      const color  = isUp ? 'var(--green)' : 'var(--red)';
      const label  = isUp ? '主力建仓' : '主力离场';
      const barW   = Math.min(100, Math.abs(o.change) / 5 * 100).toFixed(1);
      return `<div class="mon-row">
        <span class="mon-symbol">${o.symbol}</span>
        <div class="mon-bar-wrap"><div class="mon-bar" style="width:${barW}%;background:${color};"></div></div>
        <span class="mon-val" style="color:${color};">${isUp?'+':''}${o.change.toFixed(2)}%</span>
        <span class="mon-sub" style="color:${color};">${label}</span>
      </div>`;
    }).join('');
  } catch(e) {}
}

// ── 多空比监控 ────────────────────────────────────────────────────────────────
async function monLoadLSRatio() {
  try {
    const symbols = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT'];
    const results = await Promise.allSettled(
      symbols.map(s =>
        fetch(`${API}/api/proxy?u=${encodeURIComponent(BINANCE_F + '/futures/data/globalLongShortAccountRatio?symbol=' + s + '&period=5m&limit=1')}`)
          .then(r => r.json())
      )
    );

    const listEl = document.getElementById('monLSList');
    const badge  = document.getElementById('monLSBadge');
    if (badge) badge.textContent = symbols.length + ' 个币种';

    if (!listEl) return;
    const rows = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 0) {
        const d = r.value[0];
        const ratio = parseFloat(d.longShortRatio);
        const longPct  = parseFloat(d.longAccount) * 100;
        const shortPct = parseFloat(d.shortAccount) * 100;
        rows.push({
          symbol: symbols[i].replace('USDT',''),
          ratio, longPct, shortPct,
        });
      }
    });

    listEl.innerHTML = rows.map(r => {
      const extreme = r.ratio > 1.5 ? '多头过热' : r.ratio < 0.7 ? '空头过热' : '';
      const exColor = r.ratio > 1.5 ? 'var(--red)' : r.ratio < 0.7 ? 'var(--green)' : '';
      return `<div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;font-family:var(--mono);margin-bottom:4px;">
          <span style="font-weight:700;color:var(--text);">${r.symbol}</span>
          <span style="color:var(--text-muted);">多空比 <span style="color:var(--text);font-weight:700;">${r.ratio.toFixed(2)}</span>${extreme ? ' · <span style="color:'+exColor+'">'+extreme+'</span>' : ''}</span>
        </div>
        <div class="ls-bar-track" style="height:16px;">
          <div class="ls-bar-long" style="width:${r.longPct.toFixed(1)}%;font-size:9px;">${r.longPct.toFixed(1)}%</div>
          <div class="ls-bar-short" style="font-size:9px;">${r.shortPct.toFixed(1)}%</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

// ── 黑马信号 ──────────────────────────────────────────────────────────────────
function monCalcHorseSignals() {
  const listEl = document.getElementById('monHorseList');
  const badge  = document.getElementById('monHorseBadge');
  if (!listEl) return;

  if (!_monAllTickers.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">等待价格数据加载...</div>';
    return;
  }

  // 计算均量（用成交量排名位置估算）
  const sorted = [..._monAllTickers].sort((a,b) => b.volume - a.volume);
  const medianVol = sorted[Math.floor(sorted.length / 2)].volume;

  const scores = _monAllTickers.map(t => {
    let score = 0;
    const signals = [];

    // 1. 价格涨幅 (权重高)
    if (t.change > 10)      { score += 4; signals.push('🚀涨幅' + t.change.toFixed(1) + '%'); }
    else if (t.change > 5)  { score += 2; signals.push('📈涨幅' + t.change.toFixed(1) + '%'); }
    else if (t.change > 3)  { score += 1; signals.push('↑涨幅' + t.change.toFixed(1) + '%'); }
    else if (t.change < -10){ score += 2; signals.push('💥跌幅' + t.change.toFixed(1) + '%'); }

    // 2. 成交量放大
    const volRatio = t.volume / medianVol;
    if (volRatio > 10)      { score += 4; signals.push('🔥量能' + volRatio.toFixed(0) + 'x'); }
    else if (volRatio > 5)  { score += 3; signals.push('📊量能' + volRatio.toFixed(0) + 'x'); }
    else if (volRatio > 3)  { score += 2; signals.push('量能' + volRatio.toFixed(1) + 'x'); }
    else if (volRatio > 2)  { score += 1; }

    // 3. 排除大币种（BTC ETH BNB 不算黑马）
    const majorCoins = ['BTC','ETH','BNB','XRP','ADA','SOL'];
    if (majorCoins.includes(t.symbol)) score -= 2;

    // 4. 涨幅+量能共振加分
    if (t.change > 5 && volRatio > 3) { score += 3; signals.push('⚡共振'); }

    // 5. 价格在当日高点附近（突破）
    const highPct = (t.price - t.low) / (t.high - t.low || 1) * 100;
    if (highPct > 90) { score += 1; signals.push('近日高点'); }

    return { ...t, score, signals, volRatio };
  });

  // 取综合评分最高的10个
  const horses = scores
    .filter(t => t.score >= 3 && t.change > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 10);

  if (badge) {
    badge.textContent = horses.length + ' 个信号';
    badge.className = 'panel-badge ' + (horses.length > 0 ? 'badge-red' : 'badge-amber');
  }

  if (horses.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无明显黑马信号，市场整体平稳</div>';
    return;
  }

  const maxScore = horses[0].score;
  listEl.innerHTML = horses.map((t, i) => {
    const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1) + '.';
    const barW = (t.score / maxScore * 100).toFixed(1);
    const changeColor = t.change >= 0 ? 'var(--green)' : 'var(--red)';
    return `<div class="horse-row">
      <span class="horse-rank">${rankEmoji}</span>
      <div class="horse-score-wrap">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span class="horse-symbol">${t.symbol}/USDT</span>
          <span style="font-size:11px;color:var(--text-muted);font-family:var(--mono);">信号强度 ${t.score}分</span>
        </div>
        <div class="horse-score-bar" style="width:${barW}%;"></div>
        <div class="horse-signals">
          ${t.signals.map(s => '<span class="horse-signal-tag">' + s + '</span>').join('')}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--text);">$${fmtPrice(t.price)}</div>
        <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:${changeColor};">${t.change>=0?'+':''}${t.change.toFixed(2)}%</div>
        <div style="font-size:10px;color:var(--text-muted);">量能${t.volRatio.toFixed(1)}x</div>
      </div>
    </div>`;
  }).join('');
}
