// ── 事件合约模块 ──────────────────────────────────────────────────────────────

// 状态
let _evCoin = 'BTC';
let _evDuration = 10; // 分钟
let _evKlines = null;
let _evTicker = null;
let _evSettleTimer = null;

// ── 账户管理 ──────────────────────────────────────────────────────────────────
function evGetAccount() {
  try {
    const saved = localStorage.getItem('ev_account');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return { balance: 1000, totalPnl: 0, wins: 0, losses: 0, followWins: 0, followLosses: 0 };
}

function evSaveAccount(acc) {
  localStorage.setItem('ev_account', JSON.stringify(acc));
}

function evGetOrders() {
  try {
    return JSON.parse(localStorage.getItem('ev_orders') || '[]');
  } catch(e) { return []; }
}

function evSaveOrders(orders) {
  localStorage.setItem('ev_orders', JSON.stringify(orders));
}

function evGetHistory() {
  try {
    return JSON.parse(localStorage.getItem('ev_history') || '[]');
  } catch(e) { return []; }
}

function evSaveHistory(hist) {
  // 최대 50개
  localStorage.setItem('ev_history', JSON.stringify(hist.slice(0, 50)));
}

// ── 初始化 ────────────────────────────────────────────────────────────────────
async function loadEventPage() {
  evUpdateBalance();
  evUpdateStats();
  evRenderActiveOrders();
  evRenderHistory();
  await evLoadMarketData();
  evCalcSuggestion();
  evStartSettleLoop();
}

async function evLoadMarketData() {
  const symbol = _evCoin + 'USDT';
  try {
    const interval = _evDuration <= 10 ? '1m' : _evDuration <= 30 ? '5m' : _evDuration <= 60 ? '15m' : '1h';
    const [ticker, klines] = await Promise.all([
      getTicker(symbol),
      getKlines(symbol, interval, 100)
    ]);
    _evTicker = ticker;
    _evKlines = klines;
    evRenderPrice();
  } catch(e) {}
}

// ── 行情渲染 ──────────────────────────────────────────────────────────────────
function evRenderPrice() {
  if (!_evTicker) return;
  const t = _evTicker;
  const price = parseFloat(t.lastPrice);
  const change = parseFloat(t.priceChangePercent);
  const isUp = change >= 0;

  const priceEl = document.getElementById('evPrice');
  if (priceEl) {
    priceEl.textContent = '$' + fmtPrice(price);
    priceEl.style.color = isUp ? 'var(--green)' : 'var(--red)';
  }
  const changeEl = document.getElementById('evChange');
  if (changeEl) {
    changeEl.textContent = (isUp ? '+' : '') + change.toFixed(2) + '% ' + (isUp ? '▲' : '▼');
    changeEl.className = 'price-change ' + (isUp ? 'up' : 'down');
  }
  const highEl = document.getElementById('evHigh');
  if (highEl) highEl.textContent = '$' + fmtPrice(parseFloat(t.highPrice));
  const lowEl = document.getElementById('evLow');
  if (lowEl) lowEl.textContent = '$' + fmtPrice(parseFloat(t.lowPrice));
  const volEl = document.getElementById('evVol');
  if (volEl) volEl.textContent = '$' + fmt(parseFloat(t.quoteVolume));

  // 미니차트
  if (_evKlines && _evKlines.length > 0) {
    const closes = _evKlines.map(k => parseFloat(k[4]));
    updateMiniChart(closes.slice(-60), 'evMiniChart');
  }
}

// ── 系统方向建议 ──────────────────────────────────────────────────────────────
function evCalcSuggestion() {
  const dirEl    = document.getElementById('evDirection');
  const confEl   = document.getElementById('evConfidence');
  const reasonEl = document.getElementById('evReasons');
  const badgeEl  = document.getElementById('evSugBadge');

  if (!_evKlines || _evKlines.length < 20) {
    if (dirEl) dirEl.textContent = '数据不足';
    return;
  }

  const { indicators } = analyzeAll(_evKlines);
  const closes  = _evKlines.map(k => parseFloat(k[4]));
  const highs   = _evKlines.map(k => parseFloat(k[2]));
  const lows    = _evKlines.map(k => parseFloat(k[3]));
  const volumes = _evKlines.map(k => parseFloat(k[5]));
  const last    = closes.length - 1;
  const price   = closes[last];

  let score = 0;
  const bullReasons = [];
  const bearReasons = [];

  // 时间维度权重
  const isShort  = _evDuration <= 10;
  const isMid    = _evDuration <= 60;

  // ── 短期动量指标 ─────────────────────────────────────────────────
  // RSI
  const rsiVal = indicators.rsi;
  if (rsiVal) {
    const r = parseFloat(rsiVal.value);
    if (!isNaN(r)) {
      if (r > 55)      { score += isShort ? 2 : 1; bullReasons.push(`RSI强势(${r.toFixed(0)})`); }
      else if (r < 45) { score -= isShort ? 2 : 1; bearReasons.push(`RSI弱势(${r.toFixed(0)})`); }
    }
  }

  // MACD
  const macdVal = indicators.macd;
  if (macdVal) {
    if (macdVal.type === 'bull') { score += isShort ? 2 : 1; bullReasons.push('MACD金叉'); }
    else if (macdVal.type === 'bear') { score -= isShort ? 2 : 1; bearReasons.push('MACD死叉'); }
  }

  // StochRSI
  const stochVal = indicators.stochrsi;
  if (stochVal) {
    if (stochVal.type === 'bull') { score += 1; bullReasons.push('StochRSI超卖金叉'); }
    else if (stochVal.type === 'bear') { score -= 1; bearReasons.push('StochRSI超买死叉'); }
  }

  // KDJ
  const kdjVal = indicators.kdj;
  if (kdjVal) {
    if (kdjVal.type === 'bull') { score += 1; bullReasons.push('KDJ金叉'); }
    else if (kdjVal.type === 'bear') { score -= 1; bearReasons.push('KDJ死叉'); }
  }

  // ── 中期趋势指标（非短期时加权）─────────────────────────────────
  if (!isShort) {
    // EMA
    const emaVal = indicators.ema;
    if (emaVal) {
      if (emaVal.type === 'bull') { score += 2; bullReasons.push('EMA多头排列'); }
      else if (emaVal.type === 'bear') { score -= 2; bearReasons.push('EMA空头排列'); }
    }

    // Bollinger
    const bollVal = indicators.boll;
    if (bollVal) {
      if (bollVal.type === 'bull') { score += 1; bullReasons.push('布林带下轨支撑'); }
      else if (bollVal.type === 'bear') { score -= 1; bearReasons.push('布林带上轨压力'); }
    }

    // ADX
    const adxVal = indicators.adx;
    if (adxVal && adxVal.type !== 'neutral') {
      if (adxVal.type === 'bull') { score += 1; bullReasons.push('ADX趋势增强'); }
    }

    // VWAP
    const vwapVal = indicators.vwap;
    if (vwapVal) {
      if (vwapVal.type === 'bull') { score += 1; bullReasons.push('价格在VWAP上方'); }
      else if (vwapVal.type === 'bear') { score -= 1; bearReasons.push('价格在VWAP下方'); }
    }
  }

  // ── 长期指标（仅1天时）─────────────────────────────────────────
  if (!isMid) {
    const ichVal = indicators.ichimoku;
    if (ichVal) {
      if (ichVal.type === 'bull') { score += 2; bullReasons.push('一目均衡表看多'); }
      else if (ichVal.type === 'bear') { score -= 2; bearReasons.push('一目均衡表看空'); }
    }

    const wyckoffVal = indicators.wyckoff;
    if (wyckoffVal) {
      if (wyckoffVal.type === 'bull') { score += 1; bullReasons.push(`威科夫${wyckoffVal.value}`); }
      else if (wyckoffVal.type === 'bear') { score -= 1; bearReasons.push(`威科夫${wyckoffVal.value}`); }
    }
  }

  // ── 价格行为 PA ─────────────────────────────────────────────────
  const paVal = indicators.pa;
  if (paVal) {
    if (paVal.type === 'bull') { score += 2; bullReasons.push(`PA结构看多(${paVal.value})`); }
    else if (paVal.type === 'bear') { score -= 2; bearReasons.push(`PA结构看空(${paVal.value})`); }
  }

  // ── 成交量 ─────────────────────────────────────────────────────
  const volVal = indicators.volume;
  if (volVal) {
    if (volVal.type === 'bull') { score += 1; bullReasons.push('成交量放大确认'); }
    else if (volVal.type === 'bear') { score -= 1; bearReasons.push('成交量萎缩'); }
  }

  // ── 综合评分 ────────────────────────────────────────────────────
  const allVals = Object.values(indicators);
  const totalBulls = allVals.filter(v => v.type === 'bull').length;
  const totalBears = allVals.filter(v => v.type === 'bear').length;
  const techBias = totalBulls - totalBears;
  if (techBias >= 5)       { score += 2; bullReasons.push(`综合指标偏多(${totalBulls}利多)`); }
  else if (techBias <= -5) { score -= 2; bearReasons.push(`综合指标偏空(${totalBears}利空)`); }

  // ── 判断结果 ────────────────────────────────────────────────────
  let direction, dirColor, confidence, confColor;

  if (score >= 6)       { direction = '▲ 看涨'; dirColor = 'var(--green)'; confidence = '强烈'; confColor = 'var(--green)'; }
  else if (score >= 3)  { direction = '▲ 看涨'; dirColor = 'var(--green)'; confidence = '一般'; confColor = '#8bc34a'; }
  else if (score >= 1)  { direction = '▲ 看涨'; dirColor = '#8bc34a';     confidence = '偏弱'; confColor = 'var(--gold)'; }
  else if (score <= -6) { direction = '▼ 看跌'; dirColor = 'var(--red)';  confidence = '强烈'; confColor = 'var(--red)'; }
  else if (score <= -3) { direction = '▼ 看跌'; dirColor = 'var(--red)';  confidence = '一般'; confColor = '#ff9800'; }
  else if (score <= -1) { direction = '▼ 看跌'; dirColor = '#ff9800';     confidence = '偏弱'; confColor = 'var(--gold)'; }
  else                  { direction = '→ 观望'; dirColor = 'var(--gold)'; confidence = '信号不明'; confColor = 'var(--gold)'; }

  // 理由（取最相关的3条）
  const reasons = score >= 0
    ? [...bullReasons.slice(0, 3), ...bearReasons.slice(0, 1)]
    : [...bearReasons.slice(0, 3), ...bullReasons.slice(0, 1)];

  if (dirEl)    { dirEl.textContent = direction; dirEl.style.color = dirColor; }
  if (confEl)   { confEl.textContent = confidence; confEl.style.color = confColor; }
  if (reasonEl) reasonEl.textContent = reasons.join(' · ') || '指标信号不明朗';

  const badgeClass = score > 2 ? 'badge-green' : score < -2 ? 'badge-red' : 'badge-amber';
  const badgeText  = score > 2 ? '建议看涨' : score < -2 ? '建议看跌' : '建议观望';
  if (badgeEl) { badgeEl.textContent = badgeText; badgeEl.className = 'panel-badge ' + badgeClass; }

  // 存储供下单使用
  window._evSuggestion = { direction: score > 0 ? 'up' : score < 0 ? 'down' : 'neutral', score, confidence };
}

// ── 下单逻辑 ──────────────────────────────────────────────────────────────────
function evSetAmount(val) {
  const inp = document.getElementById('evAmount');
  if (inp) { inp.value = val; evUpdateAmountDisplay(); }
}

function evUpdateAmountDisplay() {
  const amt = parseFloat(document.getElementById('evAmount')?.value || 10);
  const win = (amt * 1.8).toFixed(2);
  const amtEl = document.getElementById('evAmountShow');
  const winEl = document.getElementById('evWinShow');
  if (amtEl) amtEl.textContent = amt;
  if (winEl) winEl.textContent = win;
}

function evPlaceOrder(direction) {
  if (!_evTicker) { alert('行情数据未加载，请稍后'); return; }

  const amtInput = document.getElementById('evAmount');
  const amount   = parseFloat(amtInput?.value || 10);
  if (isNaN(amount) || amount <= 0) { alert('请输入有效金额'); return; }

  const acc = evGetAccount();
  if (amount > acc.balance) { alert(`余额不足，当前余额 ${acc.balance.toFixed(2)} USDT`); return; }

  const entryPrice = parseFloat(_evTicker.lastPrice);
  const expireAt   = Date.now() + _evDuration * 60 * 1000;
  const suggestion = window._evSuggestion;
  const followSug  = suggestion && suggestion.direction === direction;

  const order = {
    id: Date.now(),
    coin: _evCoin,
    direction,
    amount,
    entryPrice,
    duration: _evDuration,
    expireAt,
    followSuggestion: followSug,
    suggestionDir: suggestion?.direction || 'neutral',
  };

  // 扣除余额
  acc.balance = parseFloat((acc.balance - amount).toFixed(2));
  evSaveAccount(acc);

  // 存储订单
  const orders = evGetOrders();
  orders.push(order);
  evSaveOrders(orders);

  evUpdateBalance();
  evRenderActiveOrders();

  // 反馈
  const dirText = direction === 'up' ? '▲ 买涨' : '▼ 买跌';
  const timeText = _evDuration >= 1440 ? '1天' : _evDuration >= 60 ? '1小时' : _evDuration + '分钟';
  showToast(`已下单 ${dirText} ${_evCoin} · ${amount} USDT · ${timeText}后结算`);
}

// ── 结算逻辑 ──────────────────────────────────────────────────────────────────
function evStartSettleLoop() {
  if (_evSettleTimer) clearInterval(_evSettleTimer);
  _evSettleTimer = setInterval(() => {
    evCheckSettle();
    evUpdateCountdowns();
  }, 1000);
}

async function evCheckSettle() {
  const orders = evGetOrders();
  if (orders.length === 0) return;

  const now = Date.now();
  const expired = orders.filter(o => now >= o.expireAt);
  if (expired.length === 0) return;

  // 获取当前价格
  const btcPrice = _evCoin === 'BTC' ? parseFloat(_evTicker?.lastPrice || 0) : null;
  const ethPrice = _evCoin === 'ETH' ? parseFloat(_evTicker?.lastPrice || 0) : null;

  // 对于其他币种的订单也需要价格
  const priceMap = {};
  if (_evTicker) priceMap[_evCoin] = parseFloat(_evTicker.lastPrice);

  const acc = evGetAccount();
  const hist = evGetHistory();
  const remaining = [];

  for (const order of orders) {
    if (now < order.expireAt) { remaining.push(order); continue; }

    // 结算价格
    let exitPrice = priceMap[order.coin];
    if (!exitPrice) {
      // 需要重新获取
      try {
        const t = await getTicker(order.coin + 'USDT');
        exitPrice = parseFloat(t.lastPrice);
        priceMap[order.coin] = exitPrice;
      } catch(e) { remaining.push(order); continue; }
    }

    const priceUp = exitPrice > order.entryPrice;
    const won = (order.direction === 'up' && priceUp) || (order.direction === 'down' && !priceUp);
    const pnl = won ? parseFloat((order.amount * 0.8).toFixed(2)) : -order.amount;

    acc.balance = parseFloat((acc.balance + (won ? order.amount + pnl : 0)).toFixed(2));
    acc.totalPnl = parseFloat((acc.totalPnl + pnl).toFixed(2));
    if (won) acc.wins++; else acc.losses++;
    if (order.followSuggestion) {
      if (won) acc.followWins++; else acc.followLosses++;
    }

    hist.unshift({
      ...order,
      exitPrice,
      won,
      pnl,
      settledAt: now,
    });

    // 通知
    const dirText = order.direction === 'up' ? '▲买涨' : '▼买跌';
    const result  = won ? `✅ +${pnl} USDT` : `❌ -${order.amount} USDT`;
    showToast(`${order.coin} ${dirText} 已结算 ${result}`);
  }

  evSaveAccount(acc);
  evSaveHistory(hist);
  evSaveOrders(remaining);

  evUpdateBalance();
  evUpdateStats();
  evRenderActiveOrders();
  evRenderHistory();
}

function evUpdateCountdowns() {
  const orders = evGetOrders();
  orders.forEach(order => {
    const el = document.getElementById(`ev-countdown-${order.id}`);
    if (!el) return;
    const remaining = Math.max(0, order.expireAt - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = remaining > 0
      ? `${mins}:${secs.toString().padStart(2, '0')}`
      : '结算中...';
  });
}

// ── 渲染函数 ──────────────────────────────────────────────────────────────────
function evUpdateBalance() {
  const acc = evGetAccount();
  const el = document.getElementById('evBalance');
  if (el) {
    el.textContent = acc.balance.toFixed(2);
    el.style.color = acc.balance >= 1000 ? 'var(--gold)' : acc.balance >= 500 ? 'var(--green)' : 'var(--red)';
  }
}

function evUpdateStats() {
  const acc = evGetAccount();
  const hist = evGetHistory();
  const total = acc.wins + acc.losses;
  const winRate = total > 0 ? (acc.wins / total * 100).toFixed(1) + '%' : '--';
  const followTotal = acc.followWins + acc.followLosses;
  const followRate  = followTotal > 0 ? (acc.followWins / followTotal * 100).toFixed(1) + '%' : '--';

  const pnlEl = document.getElementById('evTotalPnl');
  if (pnlEl) {
    pnlEl.textContent = (acc.totalPnl >= 0 ? '+' : '') + acc.totalPnl.toFixed(2);
    pnlEl.style.color = acc.totalPnl >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const wrEl = document.getElementById('evWinRate');
  if (wrEl) wrEl.textContent = winRate;
  const frEl = document.getElementById('evFollowRate');
  if (frEl) frEl.textContent = followRate;
  const ttEl = document.getElementById('evTotalTrades');
  if (ttEl) ttEl.textContent = total;
}

function evRenderActiveOrders() {
  const orders = evGetOrders();
  const listEl  = document.getElementById('evActiveList');
  const badgeEl = document.getElementById('evActiveBadge');
  if (badgeEl) badgeEl.textContent = orders.length + '笔';

  if (!listEl) return;
  if (orders.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">暂无持仓</div>';
    return;
  }

  listEl.innerHTML = orders.map(order => {
    const dirColor = order.direction === 'up' ? 'var(--green)' : 'var(--red)';
    const dirText  = order.direction === 'up' ? '▲ 买涨' : '▼ 买跌';
    const timeText = order.duration >= 1440 ? '1天' : order.duration >= 60 ? '1小时' : order.duration + '分';
    const entryFmt = fmtPrice(order.entryPrice);
    const followBadge = order.followSuggestion
      ? '<span style="font-size:9px;background:rgba(240,185,11,0.15);color:var(--gold);border:1px solid rgba(240,185,11,0.3);padding:1px 6px;border-radius:10px;margin-left:4px;">跟随建议</span>'
      : '';

    return `<div class="ev-position-row">
      <div style="display:flex;flex-direction:column;gap:3px;flex:1;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${dirColor};">${dirText}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--text-muted);">${order.coin}USDT</span>
          ${followBadge}
        </div>
        <div style="font-size:11px;color:var(--text-muted);font-family:var(--mono);">
          入场 $${entryFmt} · ${order.amount} USDT · ${timeText}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--mono);font-size:16px;font-weight:700;color:var(--gold);" id="ev-countdown-${order.id}">--:--</div>
        <div style="font-size:10px;color:var(--text-muted);">剩余时间</div>
      </div>
    </div>`;
  }).join('');
}

function evRenderHistory() {
  const hist   = evGetHistory();
  const listEl  = document.getElementById('evHistList');
  const badgeEl = document.getElementById('evHistBadge');
  if (badgeEl) badgeEl.textContent = hist.length + '笔';

  if (!listEl) return;
  if (hist.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">暂无历史</div>';
    return;
  }

  listEl.innerHTML = hist.slice(0, 20).map(order => {
    const dirText  = order.direction === 'up' ? '▲涨' : '▼跌';
    const dirColor = order.direction === 'up' ? 'var(--green)' : 'var(--red)';
    const pnlColor = order.won ? 'var(--green)' : 'var(--red)';
    const pnlText  = order.won ? `+${order.pnl.toFixed(2)}` : order.pnl.toFixed(2);
    const timeStr  = new Date(order.settledAt).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const followBadge = order.followSuggestion
      ? '<span style="font-size:9px;color:var(--gold);">★</span>'
      : '';

    return `<div class="ev-hist-row">
      <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:${dirColor};">${dirText}</span>
      <div>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-dim);">${order.coin} ${order.amount}U ${followBadge}</span>
        <span class="ev-hist-time" style="font-size:10px;color:var(--text-muted);margin-left:6px;">${timeStr}</span>
      </div>
      <span class="ev-hist-entry" style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">$${fmtPrice(order.entryPrice)}→$${fmtPrice(order.exitPrice)}</span>
      <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:${pnlColor};">${pnlText}</span>
      <span style="font-size:11px;">${order.won ? '✅' : '❌'}</span>
    </div>`;
  }).join('');
}

// ── 切换操作 ──────────────────────────────────────────────────────────────────
function evSelectCoin(coin) {
  _evCoin = coin;
  document.getElementById('evBtnBTC')?.classList.toggle('active', coin === 'BTC');
  document.getElementById('evBtnETH')?.classList.toggle('active', coin === 'ETH');
  document.getElementById('evUpCoin').textContent   = coin + ' 涨';
  document.getElementById('evDownCoin').textContent = coin + ' 跌';
  evLoadMarketData().then(() => evCalcSuggestion());
}

function evSelectDuration(mins) {
  _evDuration = mins;
  document.querySelectorAll('.ev-time-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.duration) === mins);
  });
  evLoadMarketData().then(() => evCalcSuggestion());
}

function evResetAccount() {
  if (!confirm('确认重置账户？所有数据将清空，余额恢复1000 USDT')) return;
  localStorage.removeItem('ev_account');
  localStorage.removeItem('ev_orders');
  localStorage.removeItem('ev_history');
  evUpdateBalance();
  evUpdateStats();
  evRenderActiveOrders();
  evRenderHistory();
  showToast('账户已重置，余额恢复 1000 USDT');
}

// ── Toast 通知 ────────────────────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById('evToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'evToast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--border2);color:var(--text);font-size:13px;padding:10px 20px;border-radius:var(--r-lg);z-index:9998;font-family:var(--mono);white-space:nowrap;box-shadow:var(--shadow);transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// ── 金额输入监听 ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const amtInput = document.getElementById('evAmount');
  if (amtInput) amtInput.addEventListener('input', evUpdateAmountDisplay);
  evUpdateAmountDisplay();
});
