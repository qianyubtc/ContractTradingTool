// ── 合约计算器模块 ────────────────────────────────────────────────────────────

let _calcCoin     = 'BTC';
let _calcDir      = 'long';
let _calcMode     = 'cross';   // cross / isolated
let _calcSLMode   = 'auto';    // auto / manual
let _calcPrice    = 0;
let _calcTimer    = null;
let _calcATR      = 0;

// ── 初始化 ────────────────────────────────────────────────────────────────────
async function loadCalcPage() {
  // 检查是否有分析数据
  const hasData = _lastAnalysisData && _lastAnalysisData.closes && _lastAnalysisData.closes.length > 0;
  const tipEl  = document.getElementById('calcNoDataTip');
  const mainEl = document.getElementById('calcMain');
  if (tipEl)  tipEl.style.display  = hasData ? 'none' : 'block';
  if (mainEl) mainEl.style.display = hasData ? 'block' : 'none';
  if (!hasData) return;

  // 从分析数据提取ATR
  if (_lastAnalysisData.indicators?.atr) {
    const atrVal = parseFloat(_lastAnalysisData.indicators.atr.value);
    if (!isNaN(atrVal)) _calcATR = atrVal;
  }

  // 获取当前价格
  await calcFetchPrice();

  // 填入当前价
  const entryEl = document.getElementById('calcEntryPrice');
  if (entryEl && !entryEl.value) entryEl.value = _calcPrice;

  calcUpdate();
  calcRenderSR();

  // 定时刷新价格
  if (_calcTimer) clearInterval(_calcTimer);
  _calcTimer = setInterval(async () => {
    await calcFetchPrice();
    calcUpdate();
    const priceEl = document.getElementById('calcCurrentPrice');
    if (priceEl) priceEl.textContent = '当前价: $' + fmtPrice(_calcPrice);
  }, 5000);
}

async function calcFetchPrice() {
  try {
    const sym = _calcCoin === 'custom'
      ? (document.getElementById('calcCustomSymbol')?.value?.toUpperCase() || 'BTC') + 'USDT'
      : _calcCoin + 'USDT';
    const t = await getTicker(sym);
    if (t) {
      _calcPrice = parseFloat(t.lastPrice);
      const priceEl = document.getElementById('calcCurrentPrice');
      if (priceEl) priceEl.textContent = '当前价: $' + fmtPrice(_calcPrice);
    }
  } catch(e) {}
}

// ── 主计算逻辑 ────────────────────────────────────────────────────────────────
function calcUpdate() {
  const margin    = parseFloat(document.getElementById('calcMargin')?.value || 0);
  const lev       = parseInt(document.getElementById('calcLevSlider')?.value || 10);
  const entryRaw  = parseFloat(document.getElementById('calcEntryPrice')?.value || 0);
  const balance   = parseFloat(document.getElementById('calcBalance')?.value || 0);
  const entry     = entryRaw > 0 ? entryRaw : _calcPrice;

  if (!margin || !lev || !entry) return;

  const posValue  = margin * lev;                          // 仓位价值
  const posCoins  = posValue / entry;                      // 持仓数量
  const isCross   = _calcMode === 'cross';
  const isLong    = _calcDir === 'long';

  // 爆仓价计算
  // 逐仓: liqPrice = entry × (1 - 1/lev + 维持保证金率) ≈ entry × (1 - 1/lev + 0.005)
  // 全仓: 用账户余额计算
  const mmr = 0.005; // 维持保证金率 0.5%
  let liqPrice;
  if (isCross && balance > 0) {
    // 全仓爆仓价: 账户余额全部亏完的价格
    const totalMargin = balance;
    if (isLong) {
      liqPrice = entry - (totalMargin / posCoins) + entry * mmr;
    } else {
      liqPrice = entry + (totalMargin / posCoins) - entry * mmr;
    }
  } else {
    // 逐仓
    if (isLong) {
      liqPrice = entry * (1 - 1 / lev + mmr);
    } else {
      liqPrice = entry * (1 + 1 / lev - mmr);
    }
  }

  liqPrice = Math.max(0, liqPrice);

  const liqDist    = Math.abs(entry - liqPrice);
  const liqDistPct = (liqDist / entry * 100).toFixed(2);

  // 实际杠杆（全仓）
  const realLev    = isCross && balance > 0 ? (posValue / balance).toFixed(1) : lev.toFixed(1);
  const marginRatio = isCross && balance > 0 ? (margin / balance * 100).toFixed(1) : null;

  // 最大亏损（逐仓=保证金全亏；全仓=账户余额）
  const maxLoss    = isCross ? balance : margin;
  const maxLossPct = isCross && balance > 0 ? (maxLoss / balance * 100).toFixed(1) : '100';

  // 渲染核心结果
  const setEl = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (color) el.style.color = color;
  };

  setEl('calcLiqPrice',      '$' + fmtPrice(liqPrice), 'var(--red)');
  setEl('calcLiqDist',       '距爆仓 ' + liqDistPct + '%');
  setEl('calcPositionValue', '$' + fmt(posValue));
  setEl('calcPositionCoins', posCoins.toFixed(4) + ' ' + _calcCoin);
  setEl('calcRealLev',       realLev + 'x');
  setEl('calcMarginRatio',   marginRatio ? '占余额 ' + marginRatio + '%' : '保证金模式');
  setEl('calcMaxLoss',       '-$' + fmt(maxLoss), 'var(--red)');
  setEl('calcMaxLossPct',    '亏损 ' + maxLossPct + '%');

  // 风险评级
  calcRenderRisk(lev, liqDistPct, marginRatio, isCross, balance, margin, posValue);

  // 止损止盈
  if (_calcSLMode === 'auto') {
    calcRenderAutoSLTP(entry, posValue, isLong);
  } else {
    calcRenderManualSLTP(entry, posValue, isLong);
  }

  // 综合建议
  calcRenderAdvice(lev, liqDistPct, entry, liqPrice, isLong, isCross, balance, margin, marginRatio);
}

// ── 风险评级 ──────────────────────────────────────────────────────────────────
function calcRenderRisk(lev, liqDistPct, marginRatio, isCross, balance, margin, posValue) {
  const dist = parseFloat(liqDistPct);
  let level, color, text;

  if (lev >= 50 || dist < 5) {
    level = '极高风险'; color = 'var(--red)';
    text = '杠杆过高或爆仓价过近，极易被强平。强烈建议降低杠杆或减少仓位。';
  } else if (lev >= 20 || dist < 10) {
    level = '高风险'; color = '#ff9800';
    text = '杠杆较高，市场正常波动即可触发强平。请设置合理止损。';
  } else if (lev >= 10 || dist < 20) {
    level = '中等风险'; color = 'var(--gold)';
    text = '风险适中，建议配合止损单控制回撤。';
  } else {
    level = '低风险'; color = 'var(--green)';
    text = '杠杆适中，爆仓距离充足，仓位管理较为合理。';
  }

  const badgeEl = document.getElementById('calcRiskBadge');
  if (badgeEl) {
    badgeEl.textContent = level;
    badgeEl.className = 'panel-badge ' + (lev >= 50 ? 'badge-red' : lev >= 20 ? 'badge-amber' : lev >= 10 ? 'badge-amber' : 'badge-green');
  }

  const barEl = document.getElementById('calcRiskBar');
  if (barEl) {
    barEl.innerHTML = `<span style="color:${color};font-weight:700;font-family:var(--mono);">${level}</span> — ${text}`;
    barEl.style.borderLeft = '3px solid ' + color;
  }
}

// ── 自动止损止盈（ATR） ───────────────────────────────────────────────────────
function calcRenderAutoSLTP(entry, posValue, isLong) {
  const atr = _calcATR > 0 ? _calcATR : entry * 0.02; // 无ATR时用2%估算
  const slDist = atr * 1.5;
  const tpDist = atr * 3;

  const sl = isLong ? entry - slDist : entry + slDist;
  const tp = isLong ? entry + tpDist : entry - tpDist;

  const slPct  = (slDist / entry * 100).toFixed(2);
  const tpPct  = (tpDist / entry * 100).toFixed(2);
  const slLoss = (posValue * slDist / entry).toFixed(2);
  const tpGain = (posValue * tpDist / entry).toFixed(2);

  const setEl = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (color) el.style.color = color;
  };

  setEl('calcAutoSL',     '$' + fmtPrice(sl),    'var(--red)');
  setEl('calcAutoSLDist', '距离 ' + slPct + '%');
  setEl('calcAutoTP',     '$' + fmtPrice(tp),    'var(--green)');
  setEl('calcAutoTPDist', '距离 ' + tpPct + '%');
  setEl('calcAutoSLLoss', '-$' + slLoss,         'var(--red)');
  setEl('calcAutoTPGain', '+$' + tpGain,         'var(--green)');
}

// ── 手动止损止盈 ──────────────────────────────────────────────────────────────
function calcRenderManualSLTP(entry, posValue, isLong) {
  const slPrice = parseFloat(document.getElementById('calcManualSL')?.value || 0);
  const tpPrice = parseFloat(document.getElementById('calcManualTP')?.value || 0);

  const setEl = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (color) el.style.color = color;
  };

  if (slPrice > 0 && entry > 0) {
    const slDist = Math.abs(entry - slPrice);
    const slPct  = (slDist / entry * 100).toFixed(2);
    const slLoss = (posValue * slDist / entry).toFixed(2);
    setEl('calcManualSLLoss', '-$' + slLoss, 'var(--red)');
    setEl('calcManualSLPct',  slPct + '% 距离');
    setEl('calcSLDist',       '$' + fmtPrice(slDist));
  }

  if (tpPrice > 0 && entry > 0) {
    const tpDist = Math.abs(entry - tpPrice);
    const tpPct  = (tpDist / entry * 100).toFixed(2);
    const tpGain = (posValue * tpDist / entry).toFixed(2);
    setEl('calcManualTPGain', '+$' + tpGain, 'var(--green)');
    setEl('calcManualTPPct',  tpPct + '% 距离');
  }

  if (slPrice > 0 && tpPrice > 0 && entry > 0) {
    const slDist = Math.abs(entry - slPrice);
    const tpDist = Math.abs(entry - tpPrice);
    const rrr    = (tpDist / slDist).toFixed(2);
    const rrrEl  = document.getElementById('calcRRR');
    if (rrrEl) {
      rrrEl.textContent = '1 : ' + rrr;
      rrrEl.style.color = parseFloat(rrr) >= 2 ? 'var(--green)' : parseFloat(rrr) >= 1 ? 'var(--gold)' : 'var(--red)';
    }
  }
}

// ── 支撑阻力位（来自分析数据） ────────────────────────────────────────────────
function calcRenderSR() {
  const listEl = document.getElementById('calcSRList');
  if (!listEl) return;

  if (!_lastAnalysisData) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">请先在合约分析页加载数据</div>';
    return;
  }

  const { indicators, closes, highs, lows } = _lastAnalysisData;
  const price = _calcPrice || closes[closes.length - 1];
  const rows  = [];

  // 斐波那契关键位
  if (indicators?.lmtPct !== undefined || window._lastFibPct !== undefined) {
    try {
      const { calcFibonacci } = window;
      const fib = calcFibonacci(highs, lows, closes);
      if (fib && fib.levels) {
        const keyLevels = [
          { pct: '23.6', label: 'Fib 23.6%' },
          { pct: '38.2', label: 'Fib 38.2%' },
          { pct: '50.0', label: 'Fib 50.0%' },
          { pct: '61.8', label: 'Fib 61.8%（黄金位）' },
        ];
        keyLevels.forEach(({ pct, label }) => {
          const val = fib.levels[pct];
          if (!val) return;
          const isSupport = val < price;
          rows.push({
            label,
            price: val,
            type: isSupport ? 'support' : 'resistance',
            dist: ((Math.abs(price - val) / price) * 100).toFixed(2)
          });
        });
      }
    } catch(e) {}
  }

  // EMA关键位
  const emaList = [
    { key: 'ema200', label: 'EMA200' },
    { key: 'vwap',   label: 'VWAP' },
  ];
  emaList.forEach(({ key, label }) => {
    const ind = indicators?.[key];
    if (!ind || !ind.value) return;
    const val = parseFloat(ind.value.replace(/[$,]/g, ''));
    if (isNaN(val) || val <= 0) return;
    rows.push({
      label,
      price: val,
      type: val < price ? 'support' : 'resistance',
      dist: ((Math.abs(price - val) / price) * 100).toFixed(2)
    });
  });

  // 摆동고점/저점
  const n = closes.length;
  let swingH = 0, swingL = Infinity;
  for (let i = 2; i < n - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      if (highs[i] > swingH) swingH = highs[i];
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      if (lows[i] < swingL) swingL = lows[i];
    }
  }
  if (swingH > 0) rows.push({ label: '近期摆动高点', price: swingH, type: 'resistance', dist: ((Math.abs(price - swingH) / price) * 100).toFixed(2) });
  if (swingL < Infinity) rows.push({ label: '近期摆动低点', price: swingL, type: 'support', dist: ((Math.abs(price - swingL) / price) * 100).toFixed(2) });

  // 거리순 정렬
  rows.sort((a, b) => parseFloat(a.dist) - parseFloat(b.dist));

  if (rows.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">暂无关键位数据</div>';
    return;
  }

  listEl.innerHTML = rows.slice(0, 8).map(row => {
    const isSupport = row.type === 'support';
    const color = isSupport ? 'var(--green)' : 'var(--red)';
    const tag   = isSupport ? '支撑' : '阻力';
    return `<div class="calc-sr-row">
      <div>
        <span style="font-size:10px;color:${color};font-family:var(--mono);font-weight:700;margin-right:6px;">${tag}</span>
        <span style="font-size:12px;color:var(--text-dim);">${row.label}</span>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${color};">$${fmtPrice(row.price)}</div>
        <div style="font-size:10px;color:var(--text-muted);">${row.dist}% 距离</div>
      </div>
    </div>`;
  }).join('');
}

// ── 综合建议 ──────────────────────────────────────────────────────────────────
function calcRenderAdvice(lev, liqDistPct, entry, liqPrice, isLong, isCross, balance, margin, marginRatio) {
  const listEl = document.getElementById('calcAdviceList');
  if (!listEl) return;

  const advices = [];
  const dist = parseFloat(liqDistPct);

  // 杠杆建议
  if (lev >= 50) {
    advices.push({ icon: '🚨', text: `${lev}倍杠杆极度危险，市场2%波动即可触发强平，强烈建议降至20倍以下` });
  } else if (lev >= 20) {
    advices.push({ icon: '⚠️', text: `${lev}倍杠杆偏高，建议将杠杆控制在10-20倍，降低爆仓风险` });
  } else if (lev <= 5) {
    advices.push({ icon: '✅', text: `${lev}倍低杠杆，风险可控，适合震荡行情稳健操作` });
  } else {
    advices.push({ icon: '📊', text: `${lev}倍杠杆适中，注意配合止损管理` });
  }

  // 仓位占比建议
  if (marginRatio) {
    const pct = parseFloat(marginRatio);
    if (pct > 50) {
      advices.push({ icon: '🚨', text: `保证金占账户${pct}%，重仓风险极高，建议单笔不超过账户20%` });
    } else if (pct > 20) {
      advices.push({ icon: '⚠️', text: `保证金占账户${pct}%，仓位偏重，建议控制在10-20%` });
    } else {
      advices.push({ icon: '✅', text: `保证金占账户${pct}%，仓位合理` });
    }
  }

  // 爆仓距离建议
  if (dist < 5) {
    advices.push({ icon: '🚨', text: `爆仓价仅距当前价${dist}%，极易被瞬间波动触发强平` });
  } else if (dist < 10) {
    advices.push({ icon: '⚠️', text: `爆仓距离${dist}%，市场正常波动可能触及，务必设置止损` });
  } else {
    advices.push({ icon: '✅', text: `爆仓距离${dist}%，相对安全，仍建议设置止损保护利润` });
  }

  // 技术面建议
  if (_lastAnalysisData?.indicators) {
    const inds = _lastAnalysisData.indicators;
    const bulls = Object.values(inds).filter(v => v.type === 'bull').length;
    const bears = Object.values(inds).filter(v => v.type === 'bear').length;
    if (isLong && bears > bulls) {
      advices.push({ icon: '⚠️', text: `技术指标偏空(${bears}利空/${bulls}利多)，做多需谨慎，逆势操作风险较高` });
    } else if (!isLong && bulls > bears) {
      advices.push({ icon: '⚠️', text: `技术指标偏多(${bulls}利多/${bears}利空)，做空需谨慎，逆势操作风险较高` });
    } else {
      advices.push({ icon: '✅', text: `技术指标与方向一致，顺势交易` });
    }
  }

  // 止损建议
  advices.push({ icon: '💡', text: `建议止损设在爆仓价之前，避免账户归零。推荐使用ATR止损（自动模式）` });

  listEl.innerHTML = advices.map(a =>
    `<div class="calc-advice-item">
      <span class="calc-advice-icon">${a.icon}</span>
      <span>${a.text}</span>
    </div>`
  ).join('');
}

// ── 交互操作 ──────────────────────────────────────────────────────────────────
function calcSelectCoin(coin) {
  _calcCoin = coin;
  ['BTC','ETH','Custom'].forEach(c => {
    const btn = document.getElementById('calcBtn' + c);
    if (btn) btn.classList.toggle('active', c.toLowerCase() === coin);
  });
  const customInput = document.getElementById('calcCustomSymbol');
  if (customInput) customInput.style.display = coin === 'custom' ? 'block' : 'none';
  if (coin !== 'custom') {
    calcFetchPrice().then(calcUpdate);
  }
}

function calcOnCustomSymbol() {
  clearTimeout(calcOnCustomSymbol._t);
  calcOnCustomSymbol._t = setTimeout(() => calcFetchPrice().then(calcUpdate), 800);
}

function calcSelectDir(dir) {
  _calcDir = dir;
  document.getElementById('calcBtnLong')?.classList.toggle('active', dir === 'long');
  document.getElementById('calcBtnShort')?.classList.toggle('active', dir === 'short');
  calcUpdate();
}

function calcSelectMode(mode) {
  _calcMode = mode;
  document.getElementById('calcBtnCross')?.classList.toggle('active', mode === 'cross');
  document.getElementById('calcBtnIsolated')?.classList.toggle('active', mode === 'isolated');
  const balRow = document.getElementById('calcBalanceRow');
  if (balRow) balRow.style.display = mode === 'cross' ? 'block' : 'none';
  calcUpdate();
}

function calcSelectSLMode(mode) {
  _calcSLMode = mode;
  document.getElementById('calcSLBtnAuto')?.classList.toggle('active', mode === 'auto');
  document.getElementById('calcSLBtnManual')?.classList.toggle('active', mode === 'manual');
  const autoArea   = document.getElementById('calcSLAutoArea');
  const manualArea = document.getElementById('calcSLManualArea');
  if (autoArea)   autoArea.style.display   = mode === 'auto'   ? 'block' : 'none';
  if (manualArea) manualArea.style.display = mode === 'manual' ? 'block' : 'none';
  calcUpdate();
}

function calcLevSliderChange() {
  const lev = document.getElementById('calcLevSlider')?.value;
  const display = document.getElementById('calcLevDisplay');
  if (display) display.textContent = lev + 'x';
  calcUpdate();
}

function calcSetLev(lev) {
  const slider = document.getElementById('calcLevSlider');
  if (slider) slider.value = lev;
  const display = document.getElementById('calcLevDisplay');
  if (display) display.textContent = lev + 'x';
  calcUpdate();
}

function calcSetMarginPct(pct) {
  const balance = parseFloat(document.getElementById('calcBalance')?.value || 0);
  if (!balance) return;
  const marginEl = document.getElementById('calcMargin');
  if (marginEl) marginEl.value = (balance * pct / 100).toFixed(2);
  calcUpdate();
}

function calcUseCurrentPrice() {
  if (!_calcPrice) return;
  const entryEl = document.getElementById('calcEntryPrice');
  if (entryEl) entryEl.value = _calcPrice;
  calcUpdate();
}
