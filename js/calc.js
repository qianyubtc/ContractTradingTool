// calc.js：合约风险计算器（爆仓价、仓位风险、止盈止损、建议）。
let _calcCoin     = 'BTC';
let _calcDir      = 'long';
let _calcMode     = 'cross';
let _calcSLMode   = 'auto';
let _calcPrice    = 0;
let _calcTimer    = null;
let _calcATR      = 0;
let _calcKlines   = null;
let _calcHighs    = [];
let _calcLows     = [];
let _calcCloses   = [];
let _calcVolumes  = [];

async function loadCalcPage() {
  // 计算器页初始化：展示主面板、拉数据、刷新一次结果、启动价格轮询。
  const tipEl  = document.getElementById('calcNoDataTip');
  const mainEl = document.getElementById('calcMain');
  if (tipEl)  tipEl.style.display = 'none';
  if (mainEl) { mainEl.style.display = 'flex'; mainEl.style.flexDirection = 'column'; mainEl.style.gap = '16px'; }

  const symInp = document.getElementById('calcSymbolInput');
  if (symInp && !symInp.value) symInp.value = _calcCoin + '/USDT';

  await calcLoadAllData();

  calcUpdate();

  if (_calcTimer) clearInterval(_calcTimer);
  // 每 5 秒刷新当前价，保证风险指标跟随行情变化。
  _calcTimer = setInterval(async () => {
    try {
      const t = await getTicker(_calcCoin + 'USDT');
      if (t) {
        _calcPrice = parseFloat(t.lastPrice);
        const priceEl = document.getElementById('calcCurrentPrice');
        if (priceEl) priceEl.textContent = '当前价: $' + fmtPrice(_calcPrice);
        calcUpdate();
      }
    } catch(e) {}
  }, 5000);
}

async function calcLoadAllData() {
  // 初次进入计算器时，同时拉 ticker + K 线。
  // ticker 用于当前价显示；K 线用于 ATR 和关键位。
  const symbol   = _calcCoin + 'USDT';
  const interval = '1h';
  try {
    const [ticker, klines] = await Promise.all([
      getTicker(symbol),
      getKlines(symbol, interval, 200)
    ]);

    if (ticker) {
      _calcPrice = parseFloat(ticker.lastPrice);
      const priceEl = document.getElementById('calcCurrentPrice');
      if (priceEl) priceEl.textContent = '当前价: $' + fmtPrice(_calcPrice);
    }

    if (klines && klines.length > 5) {
      _calcKlines = klines;
      _calcHighs   = klines.map(k => parseFloat(k[2]));
      _calcLows    = klines.map(k => parseFloat(k[3]));
      _calcCloses  = klines.map(k => parseFloat(k[4]));
      _calcVolumes = klines.map(k => parseFloat(k[5]));

      // 注意：calcATR 返回 { atr, atrArr } 对象，不是纯数组。
      const atrObj = calcATR(_calcHighs, _calcLows, _calcCloses, 14);
      const lastATR = atrObj?.atr;
      if (lastATR && !isNaN(lastATR)) _calcATR = lastATR;

      const entryEl = document.getElementById('calcEntryPrice');
      if (entryEl && !entryEl.value) entryEl.value = _calcPrice;

      calcRenderSR();
    }
  } catch(e) {
    console.warn('[Calc] data load error:', e);
  }
}

async function calcFetchPrice() {
  // custom 模式允许用户输入非预设币种（默认拼接 USDT）。
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

// 计算器核心函数（输入 -> 处理 -> 输出）：
// 输入：保证金、杠杆、方向、模式、入场价、账户余额
// 处理：计算仓位价值、爆仓价、风险等级、SL/TP 与建议
// 输出：刷新页面上所有风险指标与提示
function calcUpdate() {
  const margin    = parseFloat(document.getElementById('calcMargin')?.value || 0);
  const lev       = parseInt(document.getElementById('calcLevSlider')?.value || 10);
  const entryRaw  = parseFloat(document.getElementById('calcEntryPrice')?.value || 0);
  const balance   = parseFloat(document.getElementById('calcBalance')?.value || 0);
  const entry     = entryRaw > 0 ? entryRaw : _calcPrice;

  // 任何核心输入缺失都不计算，避免 NaN 污染整页。
  if (!margin || !lev || !entry) return;

  // 名义仓位价值 = 保证金 * 杠杆。
  const posValue  = margin * lev; 
  // 持仓数量 = 名义仓位 / 入场价。
  const posCoins  = posValue / entry;
  const isCross   = _calcMode === 'cross';
  const isLong    = _calcDir === 'long';
  // mmr = 维持保证金率（这里是简化常量模型，不同交易所会不同）。
  const mmr = 0.005;
  let liqPrice;
  // 爆仓公式分两套：全仓 / 逐仓（这里是简化模型）。
  if (isCross && balance > 0) {
    const totalMargin = balance;
    if (isLong) {
      liqPrice = entry - (totalMargin / posCoins) + entry * mmr;
    } else {
      liqPrice = entry + (totalMargin / posCoins) - entry * mmr;
    }
  } else {
    if (isLong) {
      liqPrice = entry * (1 - 1 / lev + mmr);
    } else {
      liqPrice = entry * (1 + 1 / lev - mmr);
    }
  }

  // 爆仓价不允许出现负值。
  liqPrice = Math.max(0, liqPrice);

  const liqDist    = Math.abs(entry - liqPrice);
  const liqDistPct = (liqDist / entry * 100).toFixed(2);
  // 全仓模式下“真实杠杆”取决于仓位占余额比，而非滑块名义杠杆。
  const realLev    = isCross && balance > 0 ? (posValue / balance).toFixed(1) : lev.toFixed(1);
  const marginRatio = isCross && balance > 0 ? (margin / balance * 100).toFixed(1) : null;
  const maxLoss    = isCross ? balance : margin;
  const maxLossPct = isCross && balance > 0 ? (maxLoss / balance * 100).toFixed(1) : '100';
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

  calcRenderRisk(lev, liqDistPct, marginRatio, isCross, balance, margin, posValue);

  if (_calcSLMode === 'auto') {
    calcRenderAutoSLTP(entry, posValue, isLong);
  } else {
    calcRenderManualSLTP(entry, posValue, isLong);
  }

  calcRenderAdvice(lev, liqDistPct, entry, liqPrice, isLong, isCross, balance, margin, marginRatio);
}

function calcRenderRisk(lev, liqDistPct, marginRatio, isCross, balance, margin, posValue) {
  // 风险等级规则主要由“杠杆 + 爆仓距离”决定，属于经验阈值模型。
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

function calcRenderAutoSLTP(entry, posValue, isLong) {
  // 自动止盈止损采用 ATR 倍数法：SL=1.5ATR，TP=3ATR（固定 RR=1:2）。
  const atr = _calcATR > 0 ? _calcATR : entry * 0.02;
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

  const rrrEl = document.getElementById('calcAutoRRR');
  if (rrrEl) { rrrEl.textContent = '1 : 2.0'; rrrEl.style.color = 'var(--green)'; }
  const atrEl = document.getElementById('calcAutoATR');
  if (atrEl) atrEl.textContent = 'ATR = $' + fmtPrice(atr);
}

function calcRenderManualSLTP(entry, posValue, isLong) {
  // 手动模式下仅做“结果展示与 RR 计算”，不替用户改输入值。
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

function calcRenderSR() {
  // 支撑阻力来源混合：
  // 1) Fib 关键位
  // 2) 指标位（EMA200/VWAP/AVWAP）
  // 3) 最近摆动高低点
  const listEl = document.getElementById('calcSRList');
  if (!listEl) return;

  const closes = _calcCloses.length > 0 ? _calcCloses : (window._lastAnalysisData?.closes || []);
  const highs  = _calcHighs.length  > 0 ? _calcHighs  : (window._lastAnalysisData?.highs  || []);
  const lows   = _calcLows.length   > 0 ? _calcLows   : (window._lastAnalysisData?.lows   || []);
  const indicators = window._lastAnalysisData?.indicators || {};

  if (closes.length < 5) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">加载中...</div>';
    return;
  }
  const price = _calcPrice || closes[closes.length - 1];
  const rows  = [];

  try {
    const fib = calcFibonacci(highs, lows, closes);
    if (fib && fib.levels) {
      const keyLevels = [
        { pct: '23.6', label: 'Fib 23.6%' },
        { pct: '38.2', label: 'Fib 38.2%' },
        { pct: '50.0', label: 'Fib 50%' },
        { pct: '61.8', label: 'Fib 61.8% 黄金位' },
      ];
      keyLevels.forEach(({ pct, label }) => {
        const val = fib.levels[pct];
        if (!val || val <= 0) return;
        rows.push({
          label, price: val,
          type: val < price ? 'support' : 'resistance',
          dist: ((Math.abs(price - val) / price) * 100).toFixed(2)
        });
      });
    }
  } catch(e) {}

  const keyInds = [
    { key: 'ema200', label: 'EMA200' },
    { key: 'vwap',   label: 'VWAP' },
    { key: 'avwap',  label: '锚定VWAP' },
  ];
  keyInds.forEach(({ key, label }) => {
    const ind = indicators?.[key];
    if (!ind || !ind.value) return;
    const val = parseFloat(String(ind.value).replace(/[$,K]/g, ''));
    if (isNaN(val) || val <= 0) return;
    rows.push({
      label, price: val,
      type: val < price ? 'support' : 'resistance',
      dist: ((Math.abs(price - val) / price) * 100).toFixed(2)
    });
  });

  const n = closes.length;
  const swingHighs = [], swingLows = [];
  for (let i = 2; i < n - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2])
      swingHighs.push(highs[i]);
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2])
      swingLows.push(lows[i]);
  }
  const recentHigh = swingHighs.slice(-3).reduce((a,b) => Math.max(a,b), 0);
  const recentLow  = swingLows.slice(-3).reduce((a,b) => Math.min(a,b), Infinity);
  if (recentHigh > 0) rows.push({ label:'近期摆动高点', price:recentHigh, type:'resistance', dist:((Math.abs(price-recentHigh)/price)*100).toFixed(2) });
  if (recentLow < Infinity) rows.push({ label:'近期摆动低点', price:recentLow, type:'support', dist:((Math.abs(price-recentLow)/price)*100).toFixed(2) });

  // 按距离当前价排序，让用户优先看到“最近的关键位”。
  rows.sort((a, b) => parseFloat(a.dist) - parseFloat(b.dist));

  if (rows.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">暂无关键位数据</div>';
    return;
  }

  listEl.innerHTML = rows.slice(0, 8).map(row => {
    const isSup = row.type === 'support';
    const color = isSup ? 'var(--green)' : 'var(--red)';
    return `<div class="calc-sr-row">
      <div>
        <span style="font-size:10px;color:${color};font-family:var(--mono);font-weight:700;margin-right:6px;">${isSup?'支撑':'阻力'}</span>
        <span style="font-size:12px;color:var(--text-dim);">${row.label}</span>
      </div>
      <div style="text-align:right;">
        <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${color};">$${fmtPrice(row.price)}</div>
        <div style="font-size:10px;color:var(--text-muted);">${row.dist}% 距离</div>
      </div>
    </div>`;
  }).join('');
}

function calcRenderAdvice(lev, liqDistPct, entry, liqPrice, isLong, isCross, balance, margin, marginRatio) {
  // 建议系统是规则拼接，不是机器学习模型，核心目标是风险提示。
  const listEl = document.getElementById('calcAdviceList');
  if (!listEl) return;

  const advices = [];
  const dist = parseFloat(liqDistPct);

  if (lev >= 50) {
    advices.push({ icon: '🚨', text: `${lev}倍杠杆极度危险，市场2%波动即可触发强平，强烈建议降至20倍以下` });
  } else if (lev >= 20) {
    advices.push({ icon: '⚠️', text: `${lev}倍杠杆偏高，建议将杠杆控制在10-20倍，降低爆仓风险` });
  } else if (lev <= 5) {
    advices.push({ icon: '✅', text: `${lev}倍低杠杆，风险可控，适合震荡行情稳健操作` });
  } else {
    advices.push({ icon: '📊', text: `${lev}倍杠杆适中，注意配合止损管理` });
  }

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

  if (dist < 5) {
    advices.push({ icon: '🚨', text: `爆仓价仅距当前价${dist}%，极易被瞬间波动触发强平` });
  } else if (dist < 10) {
    advices.push({ icon: '⚠️', text: `爆仓距离${dist}%，市场正常波动可能触及，务必设置止损` });
  } else {
    advices.push({ icon: '✅', text: `爆仓距离${dist}%，相对安全，仍建议设置止损保护利润` });
  }

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

  advices.push({ icon: '💡', text: `建议止损设在爆仓价之前，避免账户归零。推荐使用ATR止损（自动模式）` });

  listEl.innerHTML = advices.map(a =>
    `<div class="calc-advice-item">
      <span class="calc-advice-icon">${a.icon}</span>
      <span>${a.text}</span>
    </div>`
  ).join('');
}

function calcSelectCoin(coin) {
  _calcCoin = coin;
  document.getElementById('calcBtnBTC')?.classList.toggle('active', coin === 'BTC');
  document.getElementById('calcBtnETH')?.classList.toggle('active', coin === 'ETH');
  document.getElementById('calcBtnCustom')?.classList.toggle('active', coin === 'custom');
  const customInput = document.getElementById('calcCustomSymbol');
  if (customInput) customInput.style.display = coin === 'custom' ? 'block' : 'none';
  calcFetchPrice().then(calcUpdate);
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

function calcOpenDropdown() {
  const inp = document.getElementById('calcSymbolInput');
  const dd  = document.getElementById('calcSymbolDropdown');
  if (!inp || !dd) return;

  const symbols = window._allSymbols || [];
  if (symbols.length === 0) {
    dd.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">加载中...</div>';
  } else {
    calcRenderDropdown(symbols.slice(0, 30));
  }

  const rect = inp.getBoundingClientRect();
  dd.style.top    = (rect.bottom + window.scrollY + 2) + 'px';
  dd.style.left   = rect.left + 'px';
  dd.style.width  = rect.width + 'px';
  dd.style.display = 'block';
}

function calcFilterSymbols(val) {
  const symbols = window._allSymbols || [];
  const q = val.toUpperCase().replace('/', '').replace('USDT','');
  const filtered = q
    ? symbols.filter(s => s.base.includes(q) || s.symbol.includes(q))
    : symbols.slice(0, 30);
  calcRenderDropdown(filtered.slice(0, 30));

  const dd = document.getElementById('calcSymbolDropdown');
  if (dd) dd.style.display = 'block';
}

function calcRenderDropdown(symbols) {
  const dd = document.getElementById('calcSymbolDropdown');
  if (!dd) return;
  dd.innerHTML = symbols.map(s =>
    `<div class="symbol-dropdown-item" onmousedown="calcSelectSymbol('${s.base}')">
      <span class="sym-name">${s.base}</span>
      <span style="color:var(--text-muted);font-size:11px;">/USDT</span>
    </div>`
  ).join('');
}

function calcSelectSymbol(base) {
  _calcCoin = base;
  const inp = document.getElementById('calcSymbolInput');
  if (inp) inp.value = base + '/USDT';
  const hidden = document.getElementById('calcCoinValue');
  if (hidden) hidden.value = base;
  calcCloseDropdown();
  _calcKlines = null; _calcHighs = []; _calcLows = []; _calcCloses = []; _calcVolumes = [];
  const entryEl = document.getElementById('calcEntryPrice');
  if (entryEl) entryEl.value = '';
  calcLoadAllData().then(calcUpdate);
}

function calcCloseDropdown() {
  const dd = document.getElementById('calcSymbolDropdown');
  if (dd) dd.style.display = 'none';
}
