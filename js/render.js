// render.js：只负责“把计算结果翻译成页面展示”。
// 约定：计算逻辑尽量留在 indicators/analysis，这里专注渲染与文案组织。
function makeSignalPill(type) {
  // type -> UI 样式与文字映射，统一所有指标行的“方向标签”。
  const map = {
    bull: ['signal-pill signal-bull', '▲ 利多'],
    bear: ['signal-pill signal-bear', '▼ 利空'],
    neutral: ['signal-pill signal-neutral', '→ 中性'],
  };
  const [cls, label] = map[type] || map.neutral;
  return `<span class="${cls}"><span class="signal-dot"></span>${label}</span>`;
}

function makeBarColor(type) {
  // 给进度条选择颜色（多=绿，空=红，中=黄）。
  return type === 'bull' ? 'green' : type === 'bear' ? 'red' : 'amber';
}

function renderIndicatorRow(id, name, ind) {
  // 单行指标渲染模板：名称 + 强度条 + 解释 + 数值 + 方向 pill。
  const barColor = makeBarColor(ind.type);
  return `
    <div class="indicator-row" id="row-${id}">
      <div class="ind-name">${name}</div>
      <div>
        <div class="ind-bar-wrap">
          <div class="ind-bar ${barColor}" style="width:${ind.bar}%"></div>
        </div>
        <div class="ind-desc" style="margin-top:3px;font-size:11px;color:var(--text-muted)">${ind.desc}</div>
      </div>
      <div class="ind-value">${ind.value}</div>
      ${makeSignalPill(ind.type)}
    </div>`;
}

function renderGroup(containerId, badgeId, indicators, group, nameMap) {
  // 先按分组筛选指标（例如 trend / momentum）。
  const filtered = Object.entries(indicators).filter(([,v]) => v.group === group);
  // 把每个指标对象渲染成一行 HTML。
  const html = filtered.map(([k,v]) => renderIndicatorRow(k, nameMap[k]||k, v)).join('');
  document.getElementById(containerId).innerHTML = html;

  // 统计该分组多空数量，用于右上角徽标快速判断。
  const bulls = filtered.filter(([,v]) => v.type==='bull').length;
  const bears = filtered.filter(([,v]) => v.type==='bear').length;
  const badge = document.getElementById(badgeId);
  if (bulls > bears) { badge.className = 'panel-badge badge-green'; badge.textContent = `${bulls} 利多`; }
  else if (bears > bulls) { badge.className = 'panel-badge badge-red'; badge.textContent = `${bears} 利空`; }
  else { badge.className = 'panel-badge badge-amber'; badge.textContent = '均势'; }
}

function renderFibonacci(fib) {
  // fib 来自 analyzeAll，已包含 levels/swingHigh/swingLow/pct 等关键字段。
  const { levels, swingHigh, swingLow, price, pct, nearestBelow, nearestAbove } = fib;
  // 只展示最常用的几个 Fib 位，避免信息过载。
  const keyLevels = [['0.0','区间低点'],['23.6','浅回调'],['38.2','黄金回调'],['50.0','中位支撑'],['61.8','黄金分割'],['78.6','深回调'],['100.0','区间高点']];
  // 把每个关键位渲染成一个卡片，并高亮“当前价格附近”卡片。
  const levelsHtml = keyLevels.map(([k, label]) => {
    const val = levels[k];
    const isNear = Math.abs(price - val) / price < 0.008;
    const isBelow = price > val;
    const borderCol = isNear ? 'var(--amber)' : isBelow ? 'rgba(0,230,118,0.2)' : 'rgba(255,61,87,0.2)';
    const textCol   = isNear ? 'var(--amber)' : isBelow ? 'var(--green)' : 'var(--red)';
    return `<div style="background:var(--bg2);border:1px solid ${borderCol};border-radius:6px;padding:8px 10px;${isNear?'box-shadow:0 0 8px rgba(255,171,64,0.2)':''}">
      <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono);margin-bottom:3px;">${k}% <span style="color:var(--text-muted);font-size:9px;">${label}</span></div>
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:${textCol};">${fmtPrice(val)}</div>
      ${isNear?`<div style="font-size:10px;color:var(--amber);margin-top:2px;">◀ 当前价位</div>`:''}
    </div>`;
  }).join('');
  document.getElementById('fibLevels').innerHTML = levelsHtml;

  // 百分位条：把当前 pct 限制到 [0,100] 后渲染进度。
  const barPct = Math.min(100, Math.max(0, pct));
  document.getElementById('fibBar').style.width = barPct + '%';
  const barColor = pct > 78.6 ? 'var(--red)' : pct < 23.6 ? 'var(--green)' : 'var(--amber)';
  document.getElementById('fibBar').style.background = barColor;
  document.getElementById('fibCurrentLabel').textContent = `当前 ${pct.toFixed(1)}%`;
  document.getElementById('fibCurrentLabel').style.color = barColor;
  window._lastFibPct = pct;

  // 根据价格所处区间输出可读结论（小白友好文案）。
  let sigType = 'neutral', sigText = '';
  if (pct < 23.6) { sigType = 'bull'; sigText = `价格处于0%-23.6%区间（强支撑区），接近波段低点，超跌反弹概率高。支撑位：${fmtPrice(levels['23.6'])}`; }
  else if (pct < 38.2) { sigType = 'bull'; sigText = `价格处于23.6%-38.2%区间（浅回调区），属于健康回调，多头防守位置。支撑位：${fmtPrice(levels['38.2'])}`; }
  else if (pct < 50) { sigType = 'bull'; sigText = `价格处于38.2%-50%区间（黄金回调区），主力洗盘常见区域，关注止跌企稳。支撑位：${fmtPrice(levels['50.0'])}`; }
  else if (pct < 61.8) { sigType = 'neutral'; sigText = `价格处于50%-61.8%区间（深度回调），多空分歧加大。关键支撑：${fmtPrice(levels['61.8'])}（0.618黄金位）`; }
  else if (pct < 78.6) { sigType = 'bear'; sigText = `价格处于61.8%-78.6%区间（深回调警戒），若跌破61.8%则上涨结构破坏。警戒位：${fmtPrice(levels['78.6'])}`; }
  else if (pct < 100) { sigType = 'bear'; sigText = `价格处于78.6%-100%区间（极度弱势），接近区间高点但结构偏弱，注意假突破。`; }
  else { sigType = 'bull'; sigText = `价格超越区间高点（>100%），进入延伸位，下一目标：127.2%（${fmtPrice(levels['127.2'])}）`; }

  const sigColor = sigType==='bull'?'var(--green)':sigType==='bear'?'var(--red)':'var(--amber)';
  const sigLabel = sigType==='bull'?'▲ 利多':sigType==='bear'?'▼ 利空':'→ 中性';
  document.getElementById('fibSignal').innerHTML = `<span style="color:${sigColor};font-weight:700;font-family:var(--mono);margin-right:8px;">${sigLabel}</span>${sigText}`;

  const badge = document.getElementById('fibBadge');
  badge.textContent = `位于 ${pct.toFixed(1)}% 位`;
  badge.className = `panel-badge ${sigType==='bull'?'badge-green':sigType==='bear'?'badge-red':'badge-amber'}`;
}

function renderVegas(vegas, indicators) {
  // Vegas 模块分两部分：指标行（renderGroup）+ 交易逻辑文字说明。
  renderGroup('vegasList', 'vegasBadge', indicators, 'vegas', nameMap);
  const price = vegas.price;
  const detail = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
      <div><span style="color:var(--text-muted);font-size:11px;">EMA144（下轨）</span><br><span style="font-family:var(--mono);font-size:13px;color:var(--blue);">${fmtPrice(vegas.lower)}</span></div>
      <div><span style="color:var(--text-muted);font-size:11px;">EMA169（上轨）</span><br><span style="font-family:var(--mono);font-size:13px;color:var(--purple);">${fmtPrice(vegas.upper)}</span></div>
      <div><span style="color:var(--text-muted);font-size:11px;">EMA12（快线）</span><br><span style="font-family:var(--mono);font-size:13px;color:var(--amber);">${fmtPrice(vegas.ema12)}</span></div>
      <div><span style="color:var(--text-muted);font-size:11px;">通道宽度</span><br><span style="font-family:var(--mono);font-size:13px;color:var(--text);">${vegas.tunnelWidth.toFixed(2)}%</span></div>
    </div>
    <div style="font-size:12px;color:var(--text-dim);line-height:1.7;">
      <strong style="color:var(--text);font-family:var(--mono);">交易逻辑：</strong>
      ${price > vegas.upper
        ? '价格站上维加斯通道，EMA12在通道上方是最强做多信号。可在价格回踩通道上轨时轻仓做多，止损设在通道内。'
        : price < vegas.lower
        ? '价格跌破维加斯通道，属于强势空头信号。可在价格反弹至通道下轨时做空，止损设在通道内。'
        : '价格在维加斯通道内部震荡，等待EMA12突破通道上轨（做多）或跌破通道下轨（做空）再行动，通道内不建议交易。'}
    </div>`;
  document.getElementById('vegasDetail').innerHTML = detail;
}

function renderElliott(elliott) {
  // elliott 结果由计算层给出，这里负责“阶段 + 置信度 + 风险提示”展示。
  const phaseColor = elliott.phase==='bull'?'var(--green)':elliott.phase==='bear'?'var(--red)':'var(--amber)';
  const confidenceText = elliott.confidence==='high'?'高置信度':elliott.confidence==='medium'?'中置信度':'低置信度';
  const confColor = elliott.confidence==='high'?'var(--green)':elliott.confidence==='medium'?'var(--amber)':'var(--text-muted)';

  const listHtml = `
    <div class="indicator-row">
      <div class="ind-name">波浪阶段</div>
      <div>
        <div class="ind-bar-wrap"><div class="ind-bar ${elliott.phase==='bull'?'green':elliott.phase==='bear'?'red':'amber'}" style="width:${elliott.phase==='bull'?75:elliott.phase==='bear'?25:50}%"></div></div>
        <div style="margin-top:3px;font-size:11px;color:var(--text-muted)">${elliott.desc.slice(0,40)}...</div>
      </div>
      <div class="ind-value" style="color:${confColor};font-size:11px;">${confidenceText}</div>
      <span class="signal-pill ${elliott.phase==='bull'?'signal-bull':elliott.phase==='bear'?'signal-bear':'signal-neutral'}">
        <span class="signal-dot"></span>${elliott.wave}
      </span>
    </div>`;
  document.getElementById('elliottList').innerHTML = listHtml;

  document.getElementById('elliottDetail').innerHTML = `
    <div style="margin-bottom:8px;">
      <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${phaseColor};">${elliott.wave}</span>
      <span style="font-size:11px;color:${confColor};margin-left:10px;font-family:var(--mono);">${confidenceText}</span>
    </div>
    <div style="font-size:12px;color:var(--text-dim);line-height:1.7;">${elliott.desc}</div>
    <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">
      ⚠ 艾略特波浪具有主观性，本结果基于自动化ZigZag识别（共找到 ${elliott.swingCount} 个摆动点），仅供参考，请结合其他指标综合判断。
    </div>`;

  const badge = document.getElementById('elliottBadge');
  badge.textContent = elliott.wave;
  badge.className = `panel-badge ${elliott.phase==='bull'?'badge-green':elliott.phase==='bear'?'badge-red':'badge-amber'}`;
}

function renderScore(indicators) {
  // 汇总总指标数量，并按 bull/bear/neutral 分类计数。
  const all = Object.values(indicators);
  const bulls = all.filter(v => v.type==='bull').length;
  const bears = all.filter(v => v.type==='bear').length;
  const neutral = all.filter(v => v.type==='neutral').length;
  // 只用 bull 与 bear 参与多空比例，neutral 仅作展示计数。
  const total = bulls + bears;
  // longScore 不是收益率，而是“看多信号占比”。
  const longScore = total === 0 ? 50 : Math.round(bulls / total * 100);
  const shortScore = 100 - longScore;

  document.getElementById('scoreBarLong').style.width = longScore + '%';
  document.getElementById('scoreBarShort').style.width = shortScore + '%';
  document.getElementById('scoreLong').textContent = longScore;
  document.getElementById('scoreShort').textContent = shortScore;
  document.getElementById('countBull').textContent = bulls;
  document.getElementById('countBear').textContent = bears;
  document.getElementById('countNeutral').textContent = neutral;

  // 根据分值区间输出最终建议词（LONG/SHORT/WAIT）。
  let verdict = '', verdictColor = 'var(--text-muted)', badgeClass = 'badge-blue', badgeText = '';
  if (longScore >= 70) { verdict = 'LONG'; verdictColor = 'var(--green)'; badgeClass = 'badge-green'; badgeText = '强烈做多'; }
  else if (longScore >= 55) { verdict = 'LONG?'; verdictColor = 'var(--green)'; badgeClass = 'badge-green'; badgeText = '偏多'; }
  else if (shortScore >= 70) { verdict = 'SHORT'; verdictColor = 'var(--red)'; badgeClass = 'badge-red'; badgeText = '强烈做空'; }
  else if (shortScore >= 55) { verdict = 'SHORT?'; verdictColor = 'var(--red)'; badgeClass = 'badge-red'; badgeText = '偏空'; }
  else { verdict = 'WAIT'; verdictColor = 'var(--amber)'; badgeClass = 'badge-amber'; badgeText = '观望'; }

  const el = document.getElementById('scoreVerdict');
  el.textContent = verdict;
  el.style.color = verdictColor;
  const badge = document.getElementById('scoreBadge');
  badge.className = 'panel-badge ' + badgeClass;
  badge.textContent = badgeText;
}

function updateMiniChart(closes, targetId) {
  if (!Array.isArray(closes) || closes.length < 2) return;
  // 折线坐标归一化到固定画布（w=200,h=60），用于顶部小图。
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 200, h = 60;
  const pts = closes.map((c, i) => `${(i / (closes.length-1) * w).toFixed(1)},${(h - (c-min)/range*h*0.85-4).toFixed(1)}`).join(' ');
  const fillPts = `0,${h} ` + pts + ` ${w},${h}`;

  // 起点到终点上涨则用绿色，否则红色。
  const isUp = closes[closes.length-1] > closes[0];
  const color = isUp ? 'var(--green)' : 'var(--red)';

  // 事件页传入 canvas id（如 evMiniChart）时，走 canvas 渲染。
  if (targetId) {
    const canvas = document.getElementById(targetId);
    if (canvas && typeof canvas.getContext === 'function') {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cw = canvas.width || 180;
      const ch = canvas.height || 52;
      const padX = 4;
      const padTop = 4;
      const usableW = Math.max(1, cw - padX * 2);
      const usableH = Math.max(1, ch - 8);

      const points = closes.map((c, i) => ({
        x: padX + (i / (closes.length - 1)) * usableW,
        y: padTop + (1 - (c - min) / range) * usableH
      }));

      ctx.clearRect(0, 0, cw, ch);

      // 先画面积，再画折线，保持和分析页视觉语义一致。
      ctx.beginPath();
      ctx.moveTo(points[0].x, ch - 2);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, ch - 2);
      ctx.closePath();
      ctx.fillStyle = isUp ? 'rgba(0,230,118,0.14)' : 'rgba(255,61,87,0.14)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = isUp ? '#00e676' : '#ff3d57';
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      return;
    }
  }

  // 默认行为：分析页 SVG 小图。
  const lineEl = document.getElementById('miniChartLine');
  const fillEl = document.getElementById('miniChartFill');
  const gradStart = document.querySelector('#chartGrad stop:first-child');
  const gradEnd = document.querySelector('#chartGrad stop:last-child');
  if (!lineEl || !fillEl || !gradStart || !gradEnd) {
    // 某些页面上下文不存在分析页 SVG 时，自动回退到事件页 canvas。
    const evCanvas = document.getElementById('evMiniChart');
    if (!targetId && evCanvas && typeof evCanvas.getContext === 'function') {
      updateMiniChart(closes, 'evMiniChart');
    }
    return;
  }
  lineEl.setAttribute('points', pts);
  lineEl.setAttribute('stroke', color);
  fillEl.setAttribute('points', fillPts);
  gradStart.setAttribute('stop-color', isUp ? '#00e676' : '#ff3d57');
  gradEnd.setAttribute('stop-color', isUp ? '#00e676' : '#ff3d57');
}

function renderFearGreed(value, text) {
  // 恐惧贪婪模块：同一份值同步到弧线、数字、建议、历史条形图等多个区域。
  const num = parseInt(value);

  // 色彩策略：越贪婪越偏绿，越恐惧越偏红。
  let color = 'var(--red)';
  if (num > 75)      color = 'var(--green)';
  else if (num > 55) color = '#8bc34a';
  else if (num > 45) color = 'var(--gold)';
  else if (num > 25) color = '#ff9800';

  const arcPath = document.getElementById('fgArcPath');
  if (arcPath) {
    arcPath.setAttribute('stroke-dashoffset', 220 - (num / 100 * 220));
    arcPath.setAttribute('stroke', color);
  }

  const fgNum = document.getElementById('fgNum');
  if (fgNum) { fgNum.textContent = num; fgNum.style.color = color; }

  const fgValue = document.getElementById('fgValue');
  if (fgValue) { fgValue.textContent = text; fgValue.style.color = color; }

  const fgDesc = document.getElementById('fgDesc');
  if (fgDesc) {
    const descMap = [
      [0,  20,  '极度恐惧 — 历史抄底区，中长线买入良机'],
      [20, 40,  '市场恐惧，情绪悲观，可关注超跌反弹机会'],
      [40, 60,  '市场情绪中性，多空分歧，以技术面为主'],
      [60, 80,  '市场贪婪，追高风险加大，注意止盈'],
      [80, 101, '极度贪婪，FOMO情绪蔓延，高位需谨慎'],
    ];
    const entry = descMap.find(([lo, hi]) => num >= lo && num < hi);
    if (entry) fgDesc.textContent = entry[2];
  }

  const cls = num > 60 ? 'badge-green' : num < 40 ? 'badge-red' : 'badge-amber';
  const fgBadge = document.getElementById('fgBadge');
  if (fgBadge) { fgBadge.textContent = text; fgBadge.className = 'panel-badge ' + cls; }

  const fgCurrent = document.getElementById('fgCurrent');
  if (fgCurrent) { fgCurrent.textContent = num; fgCurrent.style.color = color; }

  const fgStatus = document.getElementById('fgStatus');
  if (fgStatus) { fgStatus.textContent = text; fgStatus.style.color = color; }

  const fgAdvice = document.getElementById('fgAdvice');
  if (fgAdvice) {
    const adviceMap = [
      [0,  20,  '极度恐惧，可关注买入'],
      [20, 40,  '恐慌区，可关注买入'],
      [40, 60,  '中性，跟随趋势'],
      [60, 80,  '贪婪区，注意止盈'],
      [80, 101, '极度贪婪，控制仓位'],
    ];
    const a = adviceMap.find(([lo, hi]) => num >= lo && num < hi);
    if (a) { fgAdvice.textContent = a[2]; fgAdvice.style.color = color; }
  }

  const fgSignal = document.getElementById('fgSignal');
  if (fgSignal) {
    const filled = Math.round(num / 20);
    fgSignal.innerHTML = [1,2,3,4,5].map(i =>
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;background:${i<=filled?color:'rgba(128,128,128,0.2)'}"></span>`
    ).join('');
  }

  // 这里的历史是“演示型拟合历史”，不是后端真实历史序列。
  const histEl = document.getElementById('fgHistory');
  if (histEl) {
    const hist = [];
    let v = Math.max(10, Math.min(90, num - 15 + Math.sin(num) * 8));
    for (let i = 0; i < 14; i++) {
      v = Math.max(5, Math.min(95, v + (Math.sin(i * 1.7 + num * 0.1) * 6) + (num - v) * 0.08));
      hist.push(Math.round(v));
    }
    hist.push(num);
    const maxH = Math.max(...hist);
    histEl.innerHTML = hist.map((h, i) => {
      let bc = 'var(--red)';
      if (h > 75) bc = 'var(--green)';
      else if (h > 55) bc = '#8bc34a';
      else if (h > 45) bc = 'var(--gold)';
      else if (h > 25) bc = '#ff9800';
      const isLast = i === hist.length - 1;
      return `<div style="flex:1;height:${Math.round(h/maxH*100)}%;background:${bc};border-radius:2px 2px 0 0;opacity:${isLast?1:0.6};${isLast?'outline:1px solid '+bc:''}"></div>`;
    }).join('');
  }

  const changeBadge = document.getElementById('fgChangeBadge');
  if (changeBadge) changeBadge.style.display = 'none';

}


function renderLSRatio(longPct, shortPct) {
  // longPct/shortPct 是 0~1 比例值，这里转成百分比显示。
  const lp = parseFloat(longPct) * 100;
  const sp = parseFloat(shortPct) * 100;
  document.getElementById('lsBarLong').style.width = lp.toFixed(1) + '%';
  document.getElementById('lsLong').textContent = lp.toFixed(1) + '%';
  document.getElementById('lsShort').textContent = sp.toFixed(1) + '%';
  document.getElementById('lsRatioVal').textContent = (lp/sp).toFixed(2);
  document.getElementById('lsRatioVal').style.color = lp > sp ? 'var(--green)' : 'var(--red)';
}

function renderSentimentTags(indicators, fundingRate, fgVal, lsRatio) {
  // 标签法则：把复杂指标翻译为简短标签，面向快速阅读。
  const tags = [];
  const all = Object.values(indicators);
  const bulls = all.filter(v => v.type==='bull').length;
  const bears = all.filter(v => v.type==='bear').length;
  // bulls/bears 是后续“交易建议文案”的主依据。

  // 第一层：均线体系标签（优先放在前面，便于用户第一眼看到趋势结构）。
  if (indicators.ema?.type === 'bull' && indicators.ema200?.type === 'bull')
    tags.push({ text: '均线多头排列', cls: 'badge-green' });
  else if (indicators.ema?.type === 'bear' && indicators.ema200?.type === 'bear')
    tags.push({ text: '均线空头排列', cls: 'badge-red' });
  else if (indicators.ema?.type === 'bull')
    tags.push({ text: '均线短期偏多', cls: 'badge-green' });
  else if (indicators.ema?.type === 'bear')
    tags.push({ text: '均线短期偏空', cls: 'badge-red' });

  if (indicators.ema200?.type === 'bull')
    tags.push({ text: 'EMA200多头支撑', cls: 'badge-green' });
  else if (indicators.ema200?.type === 'bear')
    tags.push({ text: '跌破EMA200', cls: 'badge-red' });

  if (indicators.maArrange?.type === 'bull')
    tags.push({ text: '五线多头完美排列', cls: 'badge-green' });
  else if (indicators.maArrange?.type === 'bear')
    tags.push({ text: '五线空头完美排列', cls: 'badge-red' });

  if (indicators.ma2060?.type === 'bull')
    tags.push({ text: 'MA20/60中期金叉', cls: 'badge-green' });
  else if (indicators.ma2060?.type === 'bear')
    tags.push({ text: 'MA20/60中期死叉', cls: 'badge-red' });

  if (indicators.ma510?.type === 'bull')
    tags.push({ text: 'MA5/10短期金叉', cls: 'badge-green' });
  else if (indicators.ma510?.type === 'bear')
    tags.push({ text: 'MA5/10短期死叉', cls: 'badge-red' });

  if (indicators.ichimoku?.type === 'bull')
    tags.push({ text: '一目云层上方', cls: 'badge-green' });
  else if (indicators.ichimoku?.type === 'bear')
    tags.push({ text: '一目云层下方', cls: 'badge-red' });
  else if (indicators.ichimoku?.type === 'neutral')
    tags.push({ text: '一目云内震荡', cls: 'badge-amber' });

  // 第二层：趋势强度标签（ADX）。
  if (indicators.adx) {
    const adxVal = parseFloat(indicators.adx.value);
    if (adxVal > 30 && indicators.adx.type === 'bull')
      tags.push({ text: `ADX强势多头(${adxVal.toFixed(0)})`, cls: 'badge-green' });
    else if (adxVal > 30 && indicators.adx.type === 'bear')
      tags.push({ text: `ADX强势空头(${adxVal.toFixed(0)})`, cls: 'badge-red' });
    else if (adxVal < 20)
      tags.push({ text: `ADX盘整弱势(${adxVal.toFixed(0)})`, cls: 'badge-amber' });
  }

  if (indicators.macd?.type === 'bull') tags.push({ text: 'MACD金叉', cls: 'badge-green' });
  else if (indicators.macd?.type === 'bear') tags.push({ text: 'MACD死叉', cls: 'badge-red' });
  else tags.push({ text: 'MACD中性', cls: 'badge-amber' });

  if (indicators.boll?.type === 'bull')
    tags.push({ text: '布林带下轨支撑', cls: 'badge-green' });
  else if (indicators.boll?.type === 'bear')
    tags.push({ text: '布林带上轨压力', cls: 'badge-red' });
  if (parseFloat(indicators.bw?.value) < 3)
    tags.push({ text: '布林带收缩蓄势', cls: 'badge-blue' });
  else if (parseFloat(indicators.bw?.value) > 10)
    tags.push({ text: '布林带极度扩张', cls: 'badge-amber' });

  if (indicators.vegasTrend?.type === 'bull')
    tags.push({ text: '维加斯通道多头', cls: 'badge-green' });
  else if (indicators.vegasTrend?.type === 'bear')
    tags.push({ text: '维加斯通道空头', cls: 'badge-red' });
  else if (indicators.vegasTrend?.type === 'neutral')
    tags.push({ text: '维加斯通道内震荡', cls: 'badge-amber' });

  // 第三层：动量过热/过冷标签。
  if (indicators.rsi) {
    const rv = parseFloat(indicators.rsi.value);
    if (rv < 30) tags.push({ text: `RSI超卖(${rv.toFixed(0)})`, cls: 'badge-green' });
    else if (rv > 70) tags.push({ text: `RSI超买(${rv.toFixed(0)})`, cls: 'badge-red' });
    else if (rv > 50) tags.push({ text: `RSI强势区(${rv.toFixed(0)})`, cls: 'badge-green' });
    else tags.push({ text: `RSI弱势区(${rv.toFixed(0)})`, cls: 'badge-red' });
  }

  // 第四层：短线摆动指标补充（KDJ/StochRSI/WR/CCI/ROC）。
  if (indicators.kdj?.type === 'bull') tags.push({ text: 'KDJ金叉', cls: 'badge-green' });
  else if (indicators.kdj?.type === 'bear') tags.push({ text: 'KDJ死叉', cls: 'badge-red' });

  if (indicators.stochrsi?.type === 'bull')
    tags.push({ text: 'StochRSI超卖金叉', cls: 'badge-green' });
  else if (indicators.stochrsi?.type === 'bear')
    tags.push({ text: 'StochRSI超买死叉', cls: 'badge-red' });

  if (indicators.williamsr?.type === 'bull')
    tags.push({ text: 'WR超卖区间', cls: 'badge-green' });
  else if (indicators.williamsr?.type === 'bear')
    tags.push({ text: 'WR超买区间', cls: 'badge-red' });

  if (indicators.cci?.type === 'bull')
    tags.push({ text: `CCI超卖(${indicators.cci.value})`, cls: 'badge-green' });
  else if (indicators.cci?.type === 'bear')
    tags.push({ text: `CCI超买(${indicators.cci.value})`, cls: 'badge-red' });

  if (indicators.roc?.type === 'bull')
    tags.push({ text: `ROC正向动能(${indicators.roc.value})`, cls: 'badge-green' });
  else if (indicators.roc?.type === 'bear')
    tags.push({ text: `ROC负向动能(${indicators.roc.value})`, cls: 'badge-red' });

  // 第五层：量价与资金流标签（Volume/OBV/CMF/MFI/VWAP）。
  if (indicators.volume?.type === 'bull') tags.push({ text: '放量上涨', cls: 'badge-green' });
  else if (indicators.volume?.type === 'bear') tags.push({ text: '放量下跌', cls: 'badge-red' });

  if (indicators.obv?.type === 'bull') tags.push({ text: 'OBV资金流入', cls: 'badge-green' });
  else if (indicators.obv?.type === 'bear') tags.push({ text: 'OBV资金流出', cls: 'badge-red' });

  if (indicators.cmf?.type === 'bull')
    tags.push({ text: 'CMF资金持续流入', cls: 'badge-green' });
  else if (indicators.cmf?.type === 'bear')
    tags.push({ text: 'CMF资金持续流出', cls: 'badge-red' });

  if (indicators.mfi?.type === 'bull')
    tags.push({ text: `MFI超卖(${indicators.mfi.value})`, cls: 'badge-green' });
  else if (indicators.mfi?.type === 'bear')
    tags.push({ text: `MFI超买(${indicators.mfi.value})`, cls: 'badge-red' });

  if (indicators.vwap?.type === 'bull')
    tags.push({ text: 'VWAP上方多头', cls: 'badge-green' });
  else if (indicators.vwap?.type === 'bear')
    tags.push({ text: 'VWAP下方空头', cls: 'badge-red' });

  if (indicators.donchian?.type === 'bull')
    tags.push({ text: '唐奇安通道下轨', cls: 'badge-green' });
  else if (indicators.donchian?.type === 'bear')
    tags.push({ text: '唐奇安通道上轨', cls: 'badge-red' });

  // 第六层：波动环境标签（ATR / Fib 区间）。
  if (indicators.atr) {
    const atrVal = parseFloat(indicators.atr.value);
    if (atrVal > 3) tags.push({ text: `ATR高波动(${atrVal.toFixed(1)}%)`, cls: 'badge-amber' });
    else if (atrVal < 0.8) tags.push({ text: `ATR低波动(${atrVal.toFixed(1)}%)`, cls: 'badge-blue' });
  }

  if (indicators.vegasTrend) { 
    const fibPct = window._lastFibPct;
    if (fibPct !== undefined) {
      if (fibPct < 38.2)
        tags.push({ text: `斐波那契支撑区(${fibPct.toFixed(1)}%)`, cls: 'badge-green' });
      else if (fibPct > 61.8)
        tags.push({ text: `斐波那契压力区(${fibPct.toFixed(1)}%)`, cls: 'badge-red' });
      else if (fibPct >= 38.2 && fibPct <= 61.8)
        tags.push({ text: `斐波那契黄金区(${fibPct.toFixed(1)}%)`, cls: 'badge-amber' });
    }
  }

  if (indicators.vegasEma12?.type === 'bull')
    tags.push({ text: 'EMA12突破维加斯通道', cls: 'badge-green' });
  else if (indicators.vegasEma12?.type === 'bear')
    tags.push({ text: 'EMA12跌破维加斯通道', cls: 'badge-red' });

  // 第七层：情绪面标签（资金费率/多空比/恐惧贪婪）。
  if (fundingRate !== null) {
    // analysis.js 已将原始小数 fundingRate 转为“百分比数值”：
    // 例如原始 0.000123 -> 0.0123（表示 0.0123%），这里直接用，不再 *100。
    const fr = parseFloat(fundingRate);
    if (fr > 0.1) tags.push({ text: `资金费率偏高 ${fr.toFixed(3)}%`, cls: 'badge-red' });
    else if (fr > 0.05) tags.push({ text: `资金费率偏高 ${fr.toFixed(3)}%`, cls: 'badge-amber' });
    else if (fr < -0.05) tags.push({ text: `资金费率为负 ${fr.toFixed(3)}%`, cls: 'badge-green' });
    else tags.push({ text: `资金费率正常 ${fr.toFixed(3)}%`, cls: 'badge-blue' });
  }

  if (lsRatio !== null) {
    if (lsRatio > 1.3) tags.push({ text: `多空比偏多(${lsRatio.toFixed(2)})`, cls: 'badge-green' });
    else if (lsRatio < 0.77) tags.push({ text: `多空比偏空(${lsRatio.toFixed(2)})`, cls: 'badge-red' });
    else tags.push({ text: `多空比均衡(${lsRatio.toFixed(2)})`, cls: 'badge-blue' });
  }

  if (fgVal !== null) {
    const fv = parseInt(fgVal);
    if (fv > 75) tags.push({ text: `极度贪婪(${fv})`, cls: 'badge-red' });
    else if (fv > 60) tags.push({ text: `市场贪婪(${fv})`, cls: 'badge-amber' });
    else if (fv < 25) tags.push({ text: `极度恐惧(${fv})`, cls: 'badge-green' });
    else if (fv < 40) tags.push({ text: `市场恐惧(${fv})`, cls: 'badge-amber' });
    else tags.push({ text: `情绪中性(${fv})`, cls: 'badge-blue' });
  }

  // 展示优先级：强信号（绿/红）优先，提示类（黄/蓝）靠后。
  const order = { 'badge-green': 0, 'badge-red': 1, 'badge-amber': 2, 'badge-blue': 3 };
  tags.sort((a, b) => (order[a.cls]||3) - (order[b.cls]||3));

  const html = tags.map(t =>
    `<span class="sentiment-tag ${t.cls}" style="border:1px solid;opacity:0.95;font-size:12px;">${t.text}</span>`
  ).join('');
  document.getElementById('sentimentTags').innerHTML = html || '<span style="color:var(--text-muted)">暂无信号</span>';

  // longScore 只反映“方向一致性”，不代表胜率或收益。
  const longScore = bulls / (bulls + bears || 1) * 100;
  const macdSig   = indicators.macd?.type;
  const rsiVal    = indicators.rsi ? parseFloat(indicators.rsi.value) : 50;
  const emaSig    = indicators.ema?.type;
  const ema200Sig = indicators.ema200?.type;
  const bollSig   = indicators.boll?.type;

  // 最终建议是规则文案，不是自动下单信号。
  let advice = '';
  if (longScore >= 70) {
    advice = `多数指标共振看多（利多${bulls}项 / 利空${bears}项）。` +
      (macdSig === 'bull' ? 'MACD金叉确认，' : '') +
      (rsiVal < 50 ? `RSI尚未超买(${rsiVal.toFixed(0)})，上行空间充足，` : '') +
      (ema200Sig === 'bull' ? 'EMA200强势支撑，' : '') +
      `建议顺势轻仓做多，在关键支撑位设置止损，分批建仓降低风险。`;
  } else if (longScore <= 30) {
    advice = `多数指标共振看空（利空${bears}项 / 利多${bulls}项）。` +
      (macdSig === 'bear' ? 'MACD死叉压制，' : '') +
      (rsiVal > 50 ? `RSI尚未超卖(${rsiVal.toFixed(0)})，下行风险仍存，` : '') +
      (ema200Sig === 'bear' ? '跌破EMA200，趋势转弱，' : '') +
      `建议观望或轻仓做空，严格设置止损，避免重仓逆势操作。`;
  } else if (longScore >= 55) {
    advice = `指标偏多但信号不强烈（利多${bulls} / 利空${bears} / 中性${all.length - bulls - bears}）。` +
      (bollSig === 'bull' ? '布林带下轨提供支撑，' : '') +
      `可轻仓试多，重点关注能否有效守住关键均线，不建议重仓追涨。`;
  } else if (longScore <= 45) {
    advice = `指标略偏空但分歧较大（利空${bears} / 利多${bulls} / 中性${all.length - bulls - bears}）。` +
      `建议以观望为主，等待方向明朗。` +
      (bollSig === 'bear' ? '布林带上轨有压力，短线谨慎追多。' : '');
  } else {
    advice = `多空信号基本均衡（利多${bulls} / 利空${bears} / 中性${all.length - bulls - bears}），市场处于震荡整理阶段。` +
      `建议等待趋势突破信号出现，重点关注成交量是否能有效配合方向性行情。`;
  }
  document.getElementById('tradingAdvice').textContent = advice;
}

function renderLiquidation(forceOrders, klines) {
  // 清算模块：统计近一小时多/空强平规模，结合 ATR 估算风险区间。
  const closes  = klines.map(k => parseFloat(k[4]));
  const highs   = klines.map(k => parseFloat(k[2]));
  const lows    = klines.map(k => parseFloat(k[3]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const price   = closes[closes.length - 1];
  const { atr }  = calcATR(highs, lows, closes);

  let longLiq = 0, shortLiq = 0;
  const now = Date.now();
  const oneHour = 3600000;
  if (forceOrders && forceOrders.length) {
    // 有真实强平数据时：按 side 区分多空爆仓金额。
    forceOrders.forEach(o => {
      if (now - o.time > oneHour) return;
      const val = parseFloat(o.origQty) * parseFloat(o.price);
      if (o.side === 'SELL') longLiq += val;
      else shortLiq += val;
    });
  } else {
    // 无真实数据时：退化为基于近期波动和成交量的估算值（演示用途）。
    const recentVol = volumes.slice(-12).reduce((a,b)=>a+b,0);
    const avgVol = volumes.slice(-50,-12).reduce((a,b)=>a+b,0)/38;
    const volSurge = recentVol / (avgVol * 12);
    const estBase = price * avgVol * 0.02;
    longLiq  = estBase * (volSurge > 1.5 ? volSurge * 0.6 : 0.4);
    shortLiq = estBase * (volSurge > 1.5 ? volSurge * 0.4 : 0.6);
  }

  const total = longLiq + shortLiq;
  const longPct  = total > 0 ? longLiq  / total * 100 : 50;
  const shortPct = total > 0 ? shortLiq / total * 100 : 50;

  document.getElementById('liqLong').textContent  = '$' + fmt(longLiq);
  document.getElementById('liqShort').textContent = '$' + fmt(shortLiq);
  document.getElementById('liqTotal').textContent = '$' + fmt(total);

  let intensity = 'LOW', intensityColor = 'var(--text-muted)';
  if (total > 50e6)       { intensity = 'EXTREME'; intensityColor = 'var(--red)'; }
  else if (total > 10e6)  { intensity = 'HIGH';    intensityColor = 'var(--amber)'; }
  else if (total > 2e6)   { intensity = 'MEDIUM';  intensityColor = 'var(--blue)'; }
  document.getElementById('liqIntensity').textContent = intensity;
  document.getElementById('liqIntensity').style.color = intensityColor;
  document.getElementById('liqLevel').textContent = total > 0 ? '实时数据' : '估算数据';

  document.getElementById('liqLongBar').style.width  = longPct.toFixed(1)  + '%';
  document.getElementById('liqShortBar').style.width = shortPct.toFixed(1) + '%';

  const dominates = longLiq > shortLiq ? '多头' : '空头';
  const domColor  = longLiq > shortLiq ? 'var(--red)' : 'var(--green)';
  let liqSignalText = '';
  if (longPct > 65) {
    liqSignalText = `<span style="color:var(--red);font-weight:700;font-family:var(--mono);">▼ 多头主导清算</span> — 大量多头仓位被强平，说明市场在下跌中。短期可能出现反弹（多头被清出局），但要注意恐慌情绪持续。`;
  } else if (shortPct > 65) {
    liqSignalText = `<span style="color:var(--green);font-weight:700;font-family:var(--mono);">▲ 空头主导清算</span> — 大量空头仓位被强平（轧空），价格加速上涨。注意追涨风险，等待回落再介入。`;
  } else {
    liqSignalText = `<span style="color:var(--amber);font-weight:700;font-family:var(--mono);">→ 双向清算均衡</span> — 多空清算量相当，市场双向震荡。等待一方清算量明显放大后再判断方向。`;
  }
  document.getElementById('liqSignal').innerHTML = liqSignalText;

  const badge = document.getElementById('liqBadge');
  badge.textContent = intensity + ' · ' + dominates + '被清';
  badge.className = `panel-badge ${intensity==='EXTREME'?'badge-red':intensity==='HIGH'?'badge-amber':'badge-blue'}`;

  renderHeatmap(price, atr, longPct, shortPct, closes, highs, lows);
}

function renderHeatmap(price, atr, longPct, shortPct, closes, highs, lows) {
  // 构建“当前价上下 ±3ATR”价格区间，切成 12 档做清算热力估算。
  const range = atr * 3;
  const step  = range * 2 / 12;
  const levels = [];
  for (let i = 0; i < 13; i++) {
    levels.push(price + range - i * step);
  }

  // 每一档估算多/空清算密度：离当前价越远密度衰减（distFactor）。
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const lvlPrice = (levels[i] + levels[i+1]) / 2;
    const distPct  = (lvlPrice - price) / price * 100;
    const distFactor = Math.exp(-Math.abs(distPct) / 1.5);
    const longDens  = lvlPrice < price ? distFactor * (longPct / 50)  : distFactor * 0.15;
    const shortDens = lvlPrice > price ? distFactor * (shortPct / 50) : distFactor * 0.15;
    rows.push({ price: lvlPrice, longDens, shortDens, distPct, isCurrent: Math.abs(distPct) < (step/price*100/2) });
  }

  const maxDens = Math.max(...rows.map(r => Math.max(r.longDens, r.shortDens)));

  // 条形颜色：价格上方偏空清（绿系），下方偏多清（红系）。
  const html = rows.map(r => {
    const longW  = (r.longDens  / maxDens * 100).toFixed(1);
    const shortW = (r.shortDens / maxDens * 100).toFixed(1);
    const totalDens = r.longDens + r.shortDens;
    const longR  = Math.round(r.longDens  / (totalDens||1) * 255);
    const shortG = Math.round(r.shortDens / (totalDens||1) * 255);
    const alpha  = (totalDens / maxDens * 0.8 + 0.05).toFixed(2);
    const isAbove = r.price > price;
    const barColor = isAbove
      ? `rgba(0,${shortG},${Math.round(shortG*0.3)},${alpha})`
      : `rgba(${longR},${Math.round(longR*0.15)},${Math.round(longR*0.2)},${alpha})`;
    const isCur = Math.abs(r.distPct) < 0.4;
    return `<div class="heatmap-row">
      <div class="heatmap-label" style="${isCur?'color:var(--amber);font-weight:700':''}">${fmtPrice(r.price)}</div>
      <div class="heatmap-bar-wrap">
        <div class="heatmap-bar" style="width:${Math.max(parseFloat(longW),parseFloat(shortW))}%;background:${barColor};">
          <span style="font-size:9px;color:rgba(255,255,255,0.6);font-family:var(--mono);">${isAbove?'空清':'多清'}</span>
        </div>
        ${isCur?`<div class="heatmap-current-marker" style="left:${Math.max(parseFloat(longW),parseFloat(shortW))*0.5}%"></div>`:''}
      </div>
      <div class="heatmap-val" style="color:${isAbove?'var(--green)':'var(--red)'};">${r.distPct.toFixed(2)}%</div>
    </div>`;
  }).join('');
  document.getElementById('heatmapContainer').innerHTML = html;
  document.getElementById('heatBadge').textContent = `±${(atr/price*100*3).toFixed(2)}% 范围`;
}

function renderOrderBook(depth, price) {
  // 订单簿模块核心：展示前几档买卖盘、价差、2%范围深度比与大单墙。
  if (!depth || !depth.bids || !depth.asks) {
    document.getElementById('askBook').innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">订单簿数据不可用（现货交易对）</div>';
    document.getElementById('liqDepthBadge').textContent = 'N/A';
    return;
  }

  // UI 只展示前 8 档，既能看结构又不至于拥挤。
  const bids = depth.bids.slice(0, 8).map(b => ({ price: parseFloat(b[0]), size: parseFloat(b[1]) }));
  const asks = depth.asks.slice(0, 8).map(a => ({ price: parseFloat(a[0]), size: parseFloat(a[1]) })).reverse();

  const maxBidSize = Math.max(...bids.map(o => o.size));
  const maxAskSize = Math.max(...asks.map(o => o.size));

  const askHtml = asks.map(a => {
    const barW = (a.size / maxAskSize * 100).toFixed(1);
    const val  = a.price * a.size;
    const isWall = a.size > maxAskSize * 0.5;
    return `<div class="ob-row" style="${isWall?'background:rgba(255,61,87,0.06);border-radius:4px;':''}">
      <div class="ob-price" style="color:var(--red)">${fmtPrice(a.price)}</div>
      <div class="ob-bar-wrap"><div class="ob-bar" style="width:${barW}%;background:rgba(255,61,87,${isWall?0.5:0.25})"></div></div>
      <div class="ob-size" style="${isWall?'color:var(--red)':''}">${fmt(a.size,2)} ${isWall?'🧱':''}</div>
    </div>`;
  }).join('');

  const bidHtml = bids.map(b => {
    const barW = (b.size / maxBidSize * 100).toFixed(1);
    const isWall = b.size > maxBidSize * 0.5;
    return `<div class="ob-row" style="${isWall?'background:rgba(0,230,118,0.06);border-radius:4px;':''}">
      <div class="ob-price" style="color:var(--green)">${fmtPrice(b.price)}</div>
      <div class="ob-bar-wrap"><div class="ob-bar" style="width:${barW}%;background:rgba(0,230,118,${isWall?0.5:0.25})"></div></div>
      <div class="ob-size" style="${isWall?'color:var(--green)':''}">${fmt(b.size,2)} ${isWall?'🧱':''}</div>
    </div>`;
  }).join('');

  document.getElementById('askBook').innerHTML = askHtml;
  document.getElementById('bidBook').innerHTML = bidHtml;

  const bestAsk = parseFloat(depth.asks[0][0]);
  const bestBid = parseFloat(depth.bids[0][0]);
  // spread 越小通常表示流动性越好。
  const spread  = bestAsk - bestBid;
  const spreadPct = (spread / bestBid * 100).toFixed(4);
  document.getElementById('obSpread').textContent = `${fmtPrice(spread)} (${spreadPct}%)`;

  const priceLow  = price * 0.98;
  const priceHigh = price * 1.02;
  const bidDepth2 = depth.bids.filter(b => parseFloat(b[0]) >= priceLow)
    .reduce((s, b) => s + parseFloat(b[0]) * parseFloat(b[1]), 0);
  const askDepth2 = depth.asks.filter(a => parseFloat(a[0]) <= priceHigh)
    .reduce((s, a) => s + parseFloat(a[0]) * parseFloat(a[1]), 0);

  document.getElementById('bidDepth2').textContent = '$' + fmt(bidDepth2);
  document.getElementById('askDepth2').textContent = '$' + fmt(askDepth2);

  // depthRatio>1 买盘更厚，<1 卖盘更厚。
  const depthRatio = askDepth2 > 0 ? (bidDepth2 / askDepth2).toFixed(2) : '--';
  document.getElementById('depthRatio').textContent = depthRatio;
  const drNum = parseFloat(depthRatio);
  document.getElementById('depthRatio').style.color = drNum > 1.2 ? 'var(--green)' : drNum < 0.8 ? 'var(--red)' : 'var(--amber)';
  document.getElementById('depthRatioNote').textContent = drNum > 1.2 ? '买盘较强' : drNum < 0.8 ? '卖盘较强' : '供需均衡';

  const biggestBid = depth.bids.reduce((m, b) => parseFloat(b[1]) > parseFloat(m[1]) ? b : m, depth.bids[0]);
  document.getElementById('maxBid').textContent = fmt(parseFloat(biggestBid[1]), 2);
  document.getElementById('maxBidPrice').textContent = '$' + fmtPrice(parseFloat(biggestBid[0]));

  const walls = [];
  const maxSize = Math.max(maxBidSize, maxAskSize);
  depth.bids.slice(0, 20).forEach(b => { if (parseFloat(b[1]) > maxSize * 0.4) walls.push({ side:'买', price: parseFloat(b[0]), size: parseFloat(b[1]) }); });
  depth.asks.slice(0, 20).forEach(a => { if (parseFloat(a[1]) > maxSize * 0.4) walls.push({ side:'卖', price: parseFloat(a[0]), size: parseFloat(a[1]) }); });
  document.getElementById('obWall').textContent = walls.length ? `${walls.length}个大单墙` : '暂无大单墙';

  let liqSig = '';
  if (drNum > 1.3) liqSig = `<strong style="color:var(--green);font-family:var(--mono);">▲ 买盘强势</strong> — 2%范围内买盘深度是卖盘的${drNum}倍，做市商支撑力度强，短期下跌空间有限。`;
  else if (drNum < 0.7) liqSig = `<strong style="color:var(--red);font-family:var(--mono);">▼ 卖盘强势</strong> — 2%范围内卖盘深度是买盘的${(1/drNum).toFixed(2)}倍，上方抛压较重，短期上涨阻力大。`;
  else liqSig = `<strong style="color:var(--amber);font-family:var(--mono);">→ 供需均衡</strong> — 买卖盘深度比例均衡，市场双向流动性良好，等待方向性突破信号。`;
  if (walls.length) liqSig += ` 检测到 <strong style="color:var(--amber)">${walls.length}个大单墙</strong>：${walls.map(w=>`${w.side}墙@${fmtPrice(w.price)}`).join('、')}`;
  document.getElementById('liquiditySignal').innerHTML = liqSig;

  const badge = document.getElementById('liqDepthBadge');
  badge.textContent = drNum > 1.2 ? '买盘偏强' : drNum < 0.8 ? '卖盘偏强' : '供需均衡';
  badge.className = `panel-badge ${drNum > 1.2 ? 'badge-green' : drNum < 0.8 ? 'badge-red' : 'badge-amber'}`;
}

function calcVolumeProfile(klines, bins=16) {
  // 成交量分布（VP）：把价格区间分桶，累计每桶成交量并区分买卖倾向。
  const highs   = klines.map(k => parseFloat(k[2]));
  const lows    = klines.map(k => parseFloat(k[3]));
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const opens   = klines.map(k => parseFloat(k[1]));

  const priceHigh = Math.max(...highs);
  const priceLow  = Math.min(...lows);
  const step = (priceHigh - priceLow) / bins;
  const profile = Array.from({length: bins}, (_, i) => ({
    priceMin: priceLow + i * step,
    priceMax: priceLow + (i+1) * step,
    buyVol: 0, sellVol: 0, totalVol: 0
  }));

  // 简化分配：阳线偏买量、阴线偏卖量（70/30），用于近似订单流。
  klines.forEach((k, i) => {
    const open = opens[i], close = closes[i], vol = volumes[i];
    const bin = Math.min(bins-1, Math.floor((closes[i] - priceLow) / step));
    if (bin < 0) return;
    const isBullish = close >= open;
    profile[bin].buyVol  += isBullish ? vol * 0.7 : vol * 0.3;
    profile[bin].sellVol += isBullish ? vol * 0.3 : vol * 0.7;
    profile[bin].totalVol += vol;
  });

  const maxVol = Math.max(...profile.map(p => p.totalVol));
  const poc = profile.reduce((m, p) => p.totalVol > m.totalVol ? p : m, profile[0]);
  return { profile, maxVol, poc, priceHigh, priceLow, step };
}

function renderVolumeProfile(klines) {
  // 展示 POC（最大成交量价格带）及当前价相对位置。
  const price = parseFloat(klines[klines.length-1][4]);
  const { profile, maxVol, poc } = calcVolumeProfile(klines, 16);

  const html = [...profile].reverse().map(p => {
    const pct     = (p.totalVol / maxVol * 100).toFixed(1);
    const isPOC   = p === poc;
    const isCur   = price >= p.priceMin && price <= p.priceMax;
    const buyPct  = p.totalVol > 0 ? p.buyVol  / p.totalVol * 100 : 50;
    const sellPct = p.totalVol > 0 ? p.sellVol / p.totalVol * 100 : 50;
    const midPrice = (p.priceMin + p.priceMax) / 2;
    return `<div class="vp-row" style="${isPOC?'background:rgba(255,171,64,0.06);border-radius:4px;padding:2px 4px;':isCur?'background:rgba(64,196,255,0.05);border-radius:4px;padding:2px 4px;':''}">
      <div class="vp-price" style="${isPOC?'color:var(--amber);font-weight:700':isCur?'color:var(--blue)':''}">${fmtPrice(midPrice)}${isPOC?' POC':''}${isCur?' ◀':''}</div>
      <div class="vp-bar-wrap" style="display:flex;gap:1px">
        <div class="vp-bar" style="width:${(buyPct/100*parseFloat(pct)).toFixed(1)}%;background:rgba(0,230,118,0.5)"></div>
        <div class="vp-bar" style="width:${(sellPct/100*parseFloat(pct)).toFixed(1)}%;background:rgba(255,61,87,0.4)"></div>
      </div>
      <div class="vp-vol">${fmt(p.totalVol,0)}</div>
    </div>`;
  }).join('');
  document.getElementById('vpContainer').innerHTML = html;

  const pocPct = (poc.priceMin + poc.priceMax) / 2;
  const abovePOC = price > pocPct;
  const badge = document.getElementById('vpBadge');
  badge.textContent = `POC: ${fmtPrice(pocPct)}`;
  badge.className = `panel-badge ${abovePOC ? 'badge-green' : 'badge-red'}`;
}

function renderVolumeDelta(klines) {
  // Volume Delta：估算主动买卖差，观察短期资金偏向。
  const opens   = klines.map(k => parseFloat(k[1]));
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const last = klines.length - 1;

  // 根据 K 线实体强弱估算 buyVol/sellVol。
  const deltas = klines.map((k, i) => {
    const open = opens[i], close = closes[i], vol = volumes[i];
    const bull = close >= open;
    const bodyPct = Math.abs(close - open) / (parseFloat(k[2]) - parseFloat(k[3]) || 1);
    const buyVol  = vol * (bull ? 0.5 + bodyPct * 0.4 : 0.5 - bodyPct * 0.4);
    const sellVol = vol - buyVol;
    return { buyVol, sellVol, delta: buyVol - sellVol, vol, isBull: bull };
  });

  const last5 = deltas.slice(-5);
  const buyVol5  = last5.reduce((s, d) => s + d.buyVol,  0);
  const sellVol5 = last5.reduce((s, d) => s + d.sellVol, 0);
  const delta5   = buyVol5 - sellVol5;
  document.getElementById('buyVol5').textContent  = fmt(buyVol5);
  document.getElementById('sellVol5').textContent = fmt(sellVol5);
  document.getElementById('volDelta').textContent = (delta5 > 0 ? '+' : '') + fmt(delta5);
  document.getElementById('volDelta').style.color = delta5 > 0 ? 'var(--green)' : 'var(--red)';

  const obvArr = [];
  let obv = 0;
  deltas.forEach(d => { obv += d.delta; obvArr.push(obv); });
  const obvRecent = obvArr.slice(-10);
  const obvSlope  = (obvRecent[obvRecent.length-1] - obvRecent[0]) / (Math.abs(obvRecent[0]) || 1) * 100;
  const trendEl   = document.getElementById('volTrend');
  if (obvSlope > 5) { trendEl.textContent = '净流入'; trendEl.style.color = 'var(--green)'; }
  else if (obvSlope < -5) { trendEl.textContent = '净流出'; trendEl.style.color = 'var(--red)'; }
  else { trendEl.textContent = '均衡'; trendEl.style.color = 'var(--amber)'; }

  const last20 = deltas.slice(-20);
  const maxVol20 = Math.max(...last20.map(d => d.vol));
  const html = last20.map((d, i) => {
    const buyPct  = (d.buyVol  / maxVol20 * 100).toFixed(1);
    const sellPct = (d.sellVol / maxVol20 * 100).toFixed(1);
    const lbl     = i === 19 ? '最新' : `-${19-i}`;
    return `<div class="delta-row">
      <div class="delta-label">${lbl}</div>
      <div class="delta-track">
        <div class="delta-buy"  style="width:${buyPct}%"></div>
        <div class="delta-sell" style="width:${sellPct}%"></div>
      </div>
      <div class="delta-pct" style="color:${d.delta>0?'var(--green)':'var(--red)'}">${d.delta>0?'+':''}${fmt(d.delta,0)}</div>
    </div>`;
  }).join('');
  document.getElementById('deltaContainer').innerHTML = html;

  const badge = document.getElementById('deltaBadge');
  badge.textContent = delta5 > 0 ? '买盘主导' : '卖盘主导';
  badge.className   = `panel-badge ${delta5 > 0 ? 'badge-green' : 'badge-red'}`;
}

function renderVolumePrice(klines) {
  // 量价分析：聚合背离、突破、量能变化、大单与缩量信号。
  const opens   = klines.map(k => parseFloat(k[1]));
  const highs   = klines.map(k => parseFloat(k[2]));
  const lows    = klines.map(k => parseFloat(k[3]));
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const last = closes.length - 1;
  const price = closes[last];

  const indicators = {};

  const priceUp5   = closes[last] > closes[last-5];
  const volUp5     = volumes[last] > volumes[last-5];
  const priceTrend = closes[last] - closes[last-5];
  const volSMA20   = calcSMA(volumes, 20)[last];
  const volRatio   = volumes[last] / (volSMA20 || 1);
  let divType = 'neutral', divDesc = '';
  if (priceUp5 && !volUp5) { divType = 'bear'; divDesc = '价格上涨但量能萎缩，顶背离风险'; }
  else if (!priceUp5 && volUp5) { divType = 'bull'; divDesc = '价格下跌但量能放大，可能吸筹'; }
  else if (priceUp5 && volUp5) { divType = 'bull'; divDesc = '价量同步上涨，趋势健康'; }
  else { divType = 'bear'; divDesc = '价量同步下跌，趋势偏弱'; }
  indicators.vpDiv = { type: divType, value: volRatio.toFixed(2)+'×', desc: divDesc, bar: divType==='bull'?70:divType==='bear'?30:50, group:'vpa' };

  const highest20 = Math.max(...closes.slice(last-20, last));
  const breakout  = closes[last] > highest20 * 0.995 && volRatio > 1.5;
  const breakdown = closes[last] < Math.min(...closes.slice(last-20,last)) * 1.005 && volRatio > 1.5;
  let boType = 'neutral', boDesc = `成交量 ${volRatio.toFixed(2)}× 均量`;
  if (breakout)  { boType = 'bull'; boDesc = `放量突破20日高点，强势信号`; }
  else if (breakdown) { boType = 'bear'; boDesc = `放量跌破20日低点，弱势信号`; }
  indicators.volBreak = { type: boType, value: volRatio.toFixed(2)+'×', desc: boDesc, bar: boType==='bull'?78:boType==='bear'?22:volRatio*20, group:'vpa' };

  const recentVols  = volumes.slice(-5);
  const avgVol5     = recentVols.reduce((a,b)=>a+b,0)/5;
  const prevVol5    = volumes.slice(-10,-5).reduce((a,b)=>a+b,0)/5;
  const volChange   = (avgVol5 - prevVol5) / (prevVol5 || 1) * 100;
  let vcType = 'neutral', vcDesc = '';
  if (volChange > 30)       { vcType = 'bull'; vcDesc = `近5根量能放大${volChange.toFixed(0)}%，市场活跃`; }
  else if (volChange < -30) { vcType = 'bear'; vcDesc = `近5根量能萎缩${Math.abs(volChange).toFixed(0)}%，观望情绪浓`; }
  else { vcDesc = `量能变化 ${volChange.toFixed(0)}%，保持平稳`; }
  indicators.volChange = { type: vcType, value: volChange.toFixed(0)+'%', desc: vcDesc, bar: Math.min(90, Math.max(10, 50+volChange)), group:'vpa' };

  const bigCandles = klines.slice(-20).filter((k, i) => {
    const vol = parseFloat(k[5]);
    return vol > volSMA20 * 2;
  });
  const bigBull = bigCandles.filter(k => parseFloat(k[4]) >= parseFloat(k[1])).length;
  const bigBear = bigCandles.filter(k => parseFloat(k[4]) <  parseFloat(k[1])).length;
  let bigType = 'neutral', bigDesc = `近20根中 ${bigCandles.length} 根超量K线`;
  if (bigBull > bigBear && bigCandles.length > 0) { bigType = 'bull'; bigDesc = `${bigBull}根超量阳线，主力买入信号`; }
  else if (bigBear > bigBull && bigCandles.length > 0) { bigType = 'bear'; bigDesc = `${bigBear}根超量阴线，主力抛售信号`; }
  indicators.bigTrade = { type: bigType, value: `${bigCandles.length}根`, desc: bigDesc, bar: bigType==='bull'?72:bigType==='bear'?28:50, group:'vpa' };

  const last3Vols  = volumes.slice(-3);
  const last3Avg   = last3Vols.reduce((a,b)=>a+b,0)/3;
  const last3Price = closes[last] - closes[last-3];
  const isLowVol   = last3Avg < volSMA20 * 0.7;
  let shrinkType = 'neutral', shrinkDesc = '';
  if (isLowVol && last3Price > 0)      { shrinkType = 'bear'; shrinkDesc = `缩量反弹，上涨不可信，警惕假突破`; }
  else if (isLowVol && last3Price < 0) { shrinkType = 'bull'; shrinkDesc = `缩量下跌，抛压有限，跌势趋缓`; }
  else if (!isLowVol && last3Price > 0) { shrinkType = 'bull'; shrinkDesc = `放量上涨，趋势健康，多头有力`; }
  else { shrinkType = 'bear'; shrinkDesc = `放量下跌，抛压较重，空头主导`; }
  indicators.volShrink = { type: shrinkType, value: (last3Avg/volSMA20*100).toFixed(0)+'%', desc: shrinkDesc, bar: shrinkType==='bull'?68:shrinkType==='bear'?32:50, group:'vpa' };

  const nameMapVpa = { vpDiv:'量价背离', volBreak:'放量突破', volChange:'量能变化', bigTrade:'大单信号', volShrink:'缩量分析' };
  const listHtml = Object.entries(indicators).map(([k, v]) => renderIndicatorRow(k, nameMapVpa[k]||k, v)).join('');
  document.getElementById('vpaList').innerHTML = listHtml;

  const bulls = Object.values(indicators).filter(v=>v.type==='bull').length;
  const bears = Object.values(indicators).filter(v=>v.type==='bear').length;
  let conclusion = '';
  if (bulls >= 4) {
    conclusion = `<span style="color:var(--green);font-weight:700;font-family:var(--mono);">▲ 量价强势做多</span><br>多项量价指标共振看多：量能充沛、价量配合良好。建议顺势做多，可在回踩时分批建仓。`;
  } else if (bears >= 4) {
    conclusion = `<span style="color:var(--red);font-weight:700;font-family:var(--mono);">▼ 量价弱势做空</span><br>量价出现多项空头信号：量能配合下跌或出现背离。建议谨慎，等待量能企稳后再判断。`;
  } else if (bulls > bears) {
    conclusion = `<span style="color:var(--green);font-weight:700;font-family:var(--mono);">↑ 量价略偏多</span><br>量价信号整体偏向多头，但信号强度一般。轻仓试多，重点观察是否能放量突破关键压力位。`;
  } else if (bears > bulls) {
    conclusion = `<span style="color:var(--red);font-weight:700;font-family:var(--mono);">↓ 量价略偏空</span><br>量价信号偏向空头，但不够强烈。建议观望或减仓，等待量能明确配合再行动。`;
  } else {
    conclusion = `<span style="color:var(--amber);font-weight:700;font-family:var(--mono);">→ 量价信号中性</span><br>多空量价信号均衡，市场处于震荡整理阶段。等待成交量的方向性突破来确认趋势。`;
  }
  document.getElementById('vpaConclusion').innerHTML = conclusion;

  const badge = document.getElementById('vpaBadge');
  badge.textContent = bulls > bears ? `${bulls} 多头量价` : bears > bulls ? `${bears} 空头量价` : '中性';
  badge.className = `panel-badge ${bulls > bears ? 'badge-green' : bears > bulls ? 'badge-red' : 'badge-amber'}`;
}

function classifyNews(title, votes) {
  const t = title.toLowerCase();
  const bullKw = ['surge','rally','rise','gain','bullish','break','high','buy','adoption','launch','partnership','upgrade','approve','etf','inflow','record','growth','positive','support','recover','pump','moon','ath'];
  const bearKw = ['drop','fall','crash','plunge','bearish','low','sell','ban','hack','exploit','lawsuit','regulation','fine','liquidat','outflow','fear','dump','decline','lose','warning','risk','concern','down','tumble','slump'];
  let bullScore = 0, bearScore = 0;
  bullKw.forEach(k => { if (t.includes(k)) bullScore++; });
  bearKw.forEach(k => { if (t.includes(k)) bearScore++; });
  if (votes) {
    bullScore += (votes.liked    || 0) * 0.5;
    bearScore += (votes.disliked || 0) * 0.5;
    bullScore += (votes.bullish  || 0) * 1.5;
    bearScore += (votes.bearish  || 0) * 1.5;
  }
  if (bullScore > bearScore + 0.5) return 'bull';
  if (bearScore > bullScore + 0.5) return 'bear';
  return 'neutral';
}

function generateSyntheticNews(coin, interval, indicators) {
  const now = new Date().toISOString();
  const items = [];
  const hoursAgo = (h) => new Date(Date.now() - h*3600000).toISOString();

  if (!indicators) return items;

  const macd = indicators.macd, rsi = indicators.rsi, ema = indicators.ema;
  const kdj  = indicators.kdj,  boll = indicators.boll, ema200 = indicators.ema200;
  const obv  = indicators.obv,  vol  = indicators.volume;

  if (macd?.type === 'bull')
    items.push({ title: `${coin} MACD金叉确认，短期上行动能增强`, source: 'TA Signal', time: hoursAgo(0.5), sentiment: 'bull', impact: 2 });
  else if (macd?.type === 'bear')
    items.push({ title: `${coin} MACD死叉出现，注意下行风险`, source: 'TA Signal', time: hoursAgo(0.5), sentiment: 'bear', impact: 2 });

  if (rsi && parseFloat(rsi.value) < 35)
    items.push({ title: `${coin} RSI进入超卖区间(${rsi.value})，反弹概率提升`, source: 'RSI Alert', time: hoursAgo(1), sentiment: 'bull', impact: 2 });
  else if (rsi && parseFloat(rsi.value) > 70)
    items.push({ title: `${coin} RSI超买(${rsi.value})，高位回调风险加大`, source: 'RSI Alert', time: hoursAgo(1), sentiment: 'bear', impact: 2 });

  if (ema200?.type === 'bull')
    items.push({ title: `${coin} 站稳200日均线，长期趋势看涨`, source: 'EMA Monitor', time: hoursAgo(2), sentiment: 'bull', impact: 3 });
  else if (ema200?.type === 'bear')
    items.push({ title: `${coin} 跌破200日均线支撑，长期偏空`, source: 'EMA Monitor', time: hoursAgo(2), sentiment: 'bear', impact: 3 });

  if (kdj?.type === 'bull')
    items.push({ title: `${coin} KDJ金叉，短线做多信号出现`, source: 'KDJ Signal', time: hoursAgo(1.5), sentiment: 'bull', impact: 1 });
  else if (kdj?.type === 'bear')
    items.push({ title: `${coin} KDJ死叉，短线谨慎做多`, source: 'KDJ Signal', time: hoursAgo(1.5), sentiment: 'bear', impact: 1 });

  if (vol?.type === 'bull')
    items.push({ title: `${coin} 放量上涨确认，主力资金介入迹象明显`, source: 'Vol Tracker', time: hoursAgo(0.8), sentiment: 'bull', impact: 2 });
  else if (vol?.type === 'bear')
    items.push({ title: `${coin} 放量下跌，需警惕主力出货可能`, source: 'Vol Tracker', time: hoursAgo(0.8), sentiment: 'bear', impact: 2 });

  if (boll?.type === 'bull')
    items.push({ title: `${coin} 触及布林带下轨，技术超卖反弹机会`, source: 'BB Alert', time: hoursAgo(1.2), sentiment: 'bull', impact: 1 });
  else if (boll?.type === 'bear')
    items.push({ title: `${coin} 触及布林带上轨，注意短线回调风险`, source: 'BB Alert', time: hoursAgo(1.2), sentiment: 'bear', impact: 1 });

  if (obv?.type === 'bull')
    items.push({ title: `${coin} OBV持续上升，链上资金流向偏多`, source: 'OBV Monitor', time: hoursAgo(2), sentiment: 'bull', impact: 2 });
  else if (obv?.type === 'bear')
    items.push({ title: `${coin} OBV下行背离，资金悄然撤离`, source: 'OBV Monitor', time: hoursAgo(2), sentiment: 'bear', impact: 2 });

  const tfContext = {
    '15m': `${coin} 短期15分钟级别波动加剧，注意止损位置`,
    '1h':  `${coin} 小时级别关键支撑位测试，多空博弈激烈`,
    '4h':  `${coin} 4小时级别趋势分析：中期方向即将明朗`,
    '1d':  `${coin} 日线级别大趋势判断：长期持有者保持关注`,
  };
  items.push({ title: tfContext[interval]||tfContext['1h'], source: 'Market Watch', time: hoursAgo(0.2), sentiment: 'neutral', impact: 1 });

  return items;
}

// 事件页渲染主函数：
// 输入：analysis 阶段缓存的数据（指标、价格、情绪、结构信息）
// 处理：计算事件维度权重并生成方向/置信度文案
// 输出：更新事件页所有模块（价格、信号、策略、结论）
function renderEventPage(data) {
  // 事件页渲染总入口：把 analysis 缓存数据转成“CALL/PUT 决策面板”。
  if (!data) return;
  const { indicators, closes, price, fib, vegas, elliott, ticker, fgVal, frValue, lsRatio, symbol } = data;
  const coin = (symbol || 'BTCUSDT').replace('USDT','');

  document.getElementById('eventSymbol').textContent = coin + ' / USDT';
  if (ticker) {
    const chg = parseFloat(ticker.priceChangePercent || 0);
    document.getElementById('eventPriceVal').textContent = '$' + fmtPrice(price);
    document.getElementById('eventPriceVal').style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('eventPriceChg').textContent = (chg>=0?'+':'')+chg.toFixed(2)+'% 24H';
    document.getElementById('eventPriceChg').style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
  }

  if (closes && closes.length > 1) {
    const sp = closes.slice(-40);
    const mn = Math.min(...sp), mx = Math.max(...sp), rng = mx - mn || 1;
    const pts = sp.map((v,i) => `${(i/(sp.length-1)*178).toFixed(1)},${(50-(v-mn)/rng*46).toFixed(1)}`).join(' ');
    const fillPts = `0,52 ${pts} 178,52`;
    const el = document.getElementById('eventSparkLine');
    const ef = document.getElementById('eventSparkFill');
    if (el) { el.setAttribute('points', pts); el.setAttribute('stroke', price > sp[0] ? 'var(--green)' : 'var(--red)'); }
    if (ef) ef.setAttribute('points', fillPts);
  }

  // 六维评分模型：趋势/动量/量能/结构/情绪/波浪。
  const dims = buildEventDimensions(indicators, fib, vegas, elliott, fgVal, frValue, lsRatio, price, closes);
  const totalBull = dims.reduce((s,d) => s + (d.score > 0 ? d.score : 0), 0);
  const totalBear = dims.reduce((s,d) => s + (d.score < 0 ? Math.abs(d.score) : 0), 0);
  const totalMax  = dims.reduce((s,d) => s + d.weight, 0);
  const netScore  = (totalBull - totalBear) / totalMax;
  const confidence = Math.abs(netScore) * 100;

  const allInd = Object.values(indicators || {});
  const bullCount    = allInd.filter(v => v.type === 'bull').length;
  const bearCount    = allInd.filter(v => v.type === 'bear').length;
  const neutralCount = allInd.filter(v => v.type === 'neutral').length;
  const indTotal     = bullCount + bearCount + neutralCount || 1;

  document.getElementById('eventBullCount').textContent = bullCount;
  document.getElementById('eventBearCount').textContent = bearCount;
  document.getElementById('eventNeutralCount').textContent = neutralCount;
  document.getElementById('eventBullBar').style.width = (bullCount/indTotal*100).toFixed(1) + '%';
  document.getElementById('eventBearBar').style.width = (bearCount/indTotal*100).toFixed(1) + '%';
  document.getElementById('eventNeutralBar').style.width = (neutralCount/indTotal*100).toFixed(1) + '%';

  const CIRC = 301;
  const bullArc = CIRC * (bullCount / indTotal);
  const bearArc = CIRC * (bearCount / indTotal);
  document.getElementById('eventDonutBull').setAttribute('stroke-dashoffset', (CIRC - bullArc).toFixed(1));
  document.getElementById('eventDonutBear').setAttribute('stroke-dashoffset', (CIRC - bearArc).toFixed(1));
  document.getElementById('eventDonutBull').setAttribute('stroke', netScore > 0 ? 'var(--green)' : 'var(--red)');
  const pct = Math.round(confidence);
  document.getElementById('eventDonutPct').textContent = pct + '%';
  document.getElementById('eventDonutPct').setAttribute('fill', netScore > 0 ? 'var(--green)' : netScore < 0 ? 'var(--red)' : 'var(--text)');

  const badge = document.getElementById('eventScoreBadge');
  badge.textContent = `CALL ${bullCount} / PUT ${bearCount} / 中性 ${neutralCount}`;
  badge.className = `panel-badge ${netScore > 0.15 ? 'badge-green' : netScore < -0.15 ? 'badge-red' : 'badge-amber'}`;

  // netScore 决定方向，confidence 决定置信强度展示。
  let callPut = '观望', dirColor = 'var(--amber)', dirIcon = '⊡', confText = '';
  if (netScore > 0.25)       { callPut = 'CALL ▲ 看涨'; dirColor = 'var(--green)'; dirIcon = '▲'; confText = `多维度共振看多，强烈建议买入 CALL 合约。置信度 ${pct}%`; }
  else if (netScore > 0.10)  { callPut = 'CALL ↑ 偏多'; dirColor = 'var(--green)'; dirIcon = '↑'; confText = `多头信号偏强，可考虑 CALL 方向，置信度 ${pct}%，建议轻仓`; }
  else if (netScore < -0.25) { callPut = 'PUT ▼ 看跌';  dirColor = 'var(--red)';   dirIcon = '▼'; confText = `多维度共振看空，强烈建议买入 PUT 合约。置信度 ${pct}%`; }
  else if (netScore < -0.10) { callPut = 'PUT ↓ 偏空';  dirColor = 'var(--red)';   dirIcon = '↓'; confText = `空头信号偏强，可考虑 PUT 方向，置信度 ${pct}%，建议轻仓`; }
  else                       { callPut = '观望 WAIT';    dirColor = 'var(--amber)'; dirIcon = '⊡'; confText = `多空信号分歧，建议等待明确信号后再入场，置信度 ${pct}%`; }

  document.getElementById('eventDirection').textContent = callPut;
  document.getElementById('eventDirection').style.color = dirColor;
  document.getElementById('eventConfidence').textContent = pct + '%';
  document.getElementById('eventConfidence').style.color = dirColor;
  document.getElementById('eventStrength').textContent = confidence > 40 ? '强' : confidence > 20 ? '中' : '弱';
  document.getElementById('eventStrength').style.color = dirColor;

  document.getElementById('eventVerdictIcon').textContent = dirIcon;
  document.getElementById('eventVerdictDir').textContent = callPut;
  document.getElementById('eventVerdictDir').style.color = dirColor;
  document.getElementById('eventVerdictConf').textContent = confText;
  document.getElementById('eventVerdictPanel').style.borderLeftColor = dirColor;

  const verdictBadge = document.getElementById('eventVerdictBadge');
  verdictBadge.textContent = netScore > 0.1 ? '买入 CALL' : netScore < -0.1 ? '买入 PUT' : '建议观望';
  verdictBadge.className = `panel-badge ${netScore > 0.1 ? 'badge-green' : netScore < -0.1 ? 'badge-red' : 'badge-amber'}`;

  // closes 至少要有 2 根才能计算“相邻收盘波动率”，否则使用默认值防止 NaN 传播。
  const hasEnoughCloses = Array.isArray(closes) && closes.length >= 2;
  const lastClose = hasEnoughCloses ? parseFloat(closes[closes.length - 1]) : NaN;
  const prevClose = hasEnoughCloses ? parseFloat(closes[closes.length - 2]) : NaN;
  const atrPct = (price > 0 && Number.isFinite(lastClose) && Number.isFinite(prevClose))
    ? (Math.abs(lastClose - prevClose) / price * 100)
    : 1.5;
  const baseRatio = Math.max(1.3, Math.min(2.8, 2.5 - atrPct * 0.2));
  const payoutWin = (100 * baseRatio).toFixed(0);
  document.getElementById('evPayoutWin').textContent = `+${payoutWin} USDT`;
  document.getElementById('evPayoutRatio').textContent = `赔率约 ${baseRatio.toFixed(2)}×（实时波动）`;

  const interval = window._lastInterval || '1h';
  const expiryMap = { '15m':'5-15分钟', '1h':'30分钟-1小时', '4h':'1-4小时', '1d':'4-24小时' };
  const expirySugg = expiryMap[interval] || '30分钟-1小时';
  document.getElementById('eventExpiry').textContent = expirySugg;
  document.getElementById('evExpiryTip').innerHTML =
    `<strong style="color:var(--amber);font-family:var(--mono);">⏱ 建议到期时间：${expirySugg}</strong><br>
    基于当前 ${interval} 时间框架分析。注意：事件合约<strong>不能提前平仓</strong>，到期自动结算。
    ${confidence > 40 ? '置信度较高，可选择稍短的到期时间以锁定利润。' : '置信度一般，建议选择稍长的到期时间，给趋势更多确认时间。'}
    最低保费 5 USDT，建议单次操作不超过总资金 5%。`;

  document.getElementById('evVolContext').textContent =
    `当前 ${coin} ATR波动率约 ${atrPct.toFixed(2)}%，${atrPct > 2 ? '波动较大，赔付比率相对较低，但获利机会多' : atrPct < 0.8 ? '波动较小，赔付比率可能偏高，适合等待突破' : '波动适中，赔付比率合理'}。预估赔付比率区间：${(baseRatio-0.3).toFixed(2)}× ~ ${(baseRatio+0.3).toFixed(2)}×`;

  const dimHtml = dims.map(d => {
    const fill = d.score > 0 ? 'var(--green)' : d.score < 0 ? 'var(--red)' : 'var(--text-muted)';
    const barW  = Math.min(100, Math.abs(d.score / d.weight * 100)).toFixed(0);
    return `<div class="dim-row">
      <div class="dim-name">${d.name}</div>
      <div class="dim-track"><div class="dim-fill" style="width:${barW}%;background:${fill}"></div></div>
      <div class="dim-score" style="color:${fill}">${d.score > 0 ? '+' : ''}${d.score.toFixed(1)}</div>
      <span class="signal-pill ${d.score > 0.5 ? 'signal-bull' : d.score < -0.5 ? 'signal-bear' : 'signal-neutral'}">
        <span class="signal-dot"></span>${d.score > 0.5 ? 'CALL' : d.score < -0.5 ? 'PUT' : '中性'}
      </span>
    </div>`;
  }).join('');
  document.getElementById('dimList').innerHTML = dimHtml;
  document.getElementById('dimBadge').textContent = `${dims.length}个维度`;

  const keySigs = buildKeySigs(indicators, fgVal, frValue, netScore);
  const keySigHtml = keySigs.map(s =>
    `<div class="key-sig-item ${s.type}">
      <div class="key-sig-icon">${s.icon}</div>
      <div class="key-sig-text">${s.text}</div>
      <div class="key-sig-weight">权重 ×${s.weight}</div>
    </div>`
  ).join('');
  document.getElementById('keySigList').innerHTML = keySigHtml;
  document.getElementById('keySigBadge').textContent = `${keySigs.filter(s=>s.type!=='neutral').length}个关键信号`;

  document.getElementById('eventRiskNote').innerHTML =
    `<strong style="color:var(--amber);">⚠ 事件合约风险提示</strong><br>
    不能提前平仓，需持有至到期。最大亏损 = 保费本金（每日上限10,000 USDT）。
    ${confidence < 25 ? '<br><strong style="color:var(--red)">当前置信度低，建议观望不入场。</strong>' : ''}
    ${Math.abs(parseFloat(frValue||0)) > 0.15 ? `<br>资金费率偏高(${parseFloat(frValue||0).toFixed(3)}%)，多头持仓成本增加，做多需谨慎。` : ''}`;

  document.getElementById('eventReasoning').innerHTML = buildEventReasoning(dims, indicators, coin, callPut, pct, netScore, fgVal, frValue, baseRatio);

  renderEventStrategy(indicators, netScore, price, coin, baseRatio, expirySugg);
}

function buildEventDimensions(indicators, fib, vegas, elliott, fgVal, frValue, lsRatio, price, closes) {
  // 返回统一结构：[{name, score, weight, label}]，供上层做总分加权。
  const dims = [];
  if (!indicators) return dims;

  let trendScore = 0;
  if (indicators.ema?.type === 'bull') trendScore += 1;
  else if (indicators.ema?.type === 'bear') trendScore -= 1;
  if (indicators.ema200?.type === 'bull') trendScore += 1.5;
  else if (indicators.ema200?.type === 'bear') trendScore -= 1.5;
  if (indicators.maArrange?.type === 'bull') trendScore += 1;
  else if (indicators.maArrange?.type === 'bear') trendScore -= 1;
  if (indicators.ichimoku?.type === 'bull') trendScore += 0.8;
  else if (indicators.ichimoku?.type === 'bear') trendScore -= 0.8;
  dims.push({ name:'趋势', score: trendScore, weight: 4.3, label: trendScore > 1 ? '强多' : trendScore < -1 ? '强空' : trendScore > 0 ? '偏多' : trendScore < 0 ? '偏空' : '中性' });

  let momScore = 0;
  const rsiVal = indicators.rsi ? parseFloat(indicators.rsi.value) : 50;
  if (rsiVal < 35) momScore += 1.5; else if (rsiVal > 65) momScore -= 1.5;
  else if (rsiVal > 50) momScore += 0.5; else momScore -= 0.5;
  if (indicators.macd?.type === 'bull') momScore += 1.2; else if (indicators.macd?.type === 'bear') momScore -= 1.2;
  if (indicators.kdj?.type === 'bull') momScore += 0.8; else if (indicators.kdj?.type === 'bear') momScore -= 0.8;
  if (indicators.stochrsi?.type === 'bull') momScore += 0.6; else if (indicators.stochrsi?.type === 'bear') momScore -= 0.6;
  dims.push({ name:'动量', score: momScore, weight: 4.1, label: momScore > 1.5 ? '强多' : momScore < -1.5 ? '强空' : momScore > 0 ? '偏多' : momScore < 0 ? '偏空' : '中性' });

  let volScore = 0;
  if (indicators.obv?.type === 'bull') volScore += 1; else if (indicators.obv?.type === 'bear') volScore -= 1;
  if (indicators.volume?.type === 'bull') volScore += 1.2; else if (indicators.volume?.type === 'bear') volScore -= 1.2;
  if (indicators.cmf?.type === 'bull') volScore += 0.8; else if (indicators.cmf?.type === 'bear') volScore -= 0.8;
  if (indicators.mfi?.type === 'bull') volScore += 0.6; else if (indicators.mfi?.type === 'bear') volScore -= 0.6;
  dims.push({ name:'成交量', score: volScore, weight: 3.6, label: volScore > 1 ? '资金流入' : volScore < -1 ? '资金流出' : '均衡' });

  let structScore = 0;
  if (indicators.boll?.type === 'bull') structScore += 0.8; else if (indicators.boll?.type === 'bear') structScore -= 0.8;
  if (indicators.donchian?.type === 'bull') structScore += 0.6; else if (indicators.donchian?.type === 'bear') structScore -= 0.6;
  if (fib && fib.pct < 38.2) structScore += 1; else if (fib && fib.pct > 61.8) structScore -= 1;
  if (vegas) { if (price > vegas.upper) structScore += 1; else if (price < vegas.lower) structScore -= 1; }
  dims.push({ name:'结构位置', score: structScore, weight: 3.4, label: structScore > 0.8 ? '支撑区' : structScore < -0.8 ? '压力区' : '中性区' });

  let sentScore = 0;
  if (fgVal !== null) { const fv = parseInt(fgVal); if (fv < 30) sentScore += 1; else if (fv > 70) sentScore -= 1; }
  if (lsRatio !== null) { if (lsRatio > 1.3) sentScore += 0.5; else if (lsRatio < 0.77) sentScore -= 0.5; }
  if (frValue !== null) { const fr = parseFloat(frValue); if (fr < -0.05) sentScore += 0.8; else if (fr > 0.1) sentScore -= 0.5; }
  dims.push({ name:'市场情绪', score: sentScore, weight: 2.3, label: sentScore > 0.5 ? '偏恐惧(利多)' : sentScore < -0.5 ? '贪婪(利空)' : '中性' });

  let waveScore = 0;
  if (elliott) {
    if (elliott.phase === 'bull') waveScore += 1.2; else if (elliott.phase === 'bear') waveScore -= 1.2;
  }
  if (indicators.adx) {
    const adxV = parseFloat(indicators.adx.value);
    if (adxV > 25 && indicators.adx.type === 'bull') waveScore += 0.8;
    else if (adxV > 25 && indicators.adx.type === 'bear') waveScore -= 0.8;
  }
  dims.push({ name:'波浪/ADX', score: waveScore, weight: 2.0, label: waveScore > 0.5 ? '推动浪多' : waveScore < -0.5 ? '推动浪空' : '调整中' });

  return dims;
}

function buildKeySigs(indicators, fgVal, frValue, netScore) {
  // 关键证据列表：提取“最能解释方向”的少量高权重信号。
  const sigs = [];
  if (!indicators) return sigs;

  if (indicators.ema200?.type === 'bull') sigs.push({ type:'bull', icon:'▲', text:`价格站稳EMA200(${indicators.ema200.value})，长期趋势确认看涨`, weight:3 });
  else if (indicators.ema200?.type === 'bear') sigs.push({ type:'bear', icon:'▼', text:`价格跌破EMA200(${indicators.ema200.value})，长期趋势偏空`, weight:3 });

  if (indicators.macd?.type === 'bull') sigs.push({ type:'bull', icon:'↑', text:`MACD金叉信号，动能转多，柱状图${indicators.macd.desc}`, weight:2 });
  else if (indicators.macd?.type === 'bear') sigs.push({ type:'bear', icon:'↓', text:`MACD死叉信号，动能转空，${indicators.macd.desc}`, weight:2 });

  const rsiV = indicators.rsi ? parseFloat(indicators.rsi.value) : 50;
  if (rsiV < 30) sigs.push({ type:'bull', icon:'⟲', text:`RSI超卖(${rsiV.toFixed(0)})，超跌反弹概率高，历史上此区间胜率较高`, weight:2 });
  else if (rsiV > 70) sigs.push({ type:'bear', icon:'⟳', text:`RSI超买(${rsiV.toFixed(0)})，高位回调风险，注意止盈`, weight:2 });

  if (indicators.volume?.type === 'bull') sigs.push({ type:'bull', icon:'▣', text:`放量上涨(${indicators.volume.value})，主力资金参与，趋势可信度高`, weight:2 });
  else if (indicators.volume?.type === 'bear') sigs.push({ type:'bear', icon:'▣', text:`放量下跌(${indicators.volume.value})，卖盘积极，下行动能强`, weight:2 });

  if (fgVal !== null) {
    const fv = parseInt(fgVal);
    if (fv < 25) sigs.push({ type:'bull', icon:'◎', text:`恐惧贪婪指数极低(${fv})，市场极度恐惧往往是逆向做多良机`, weight:1 });
    else if (fv > 75) sigs.push({ type:'bear', icon:'◎', text:`恐惧贪婪指数极高(${fv})，极度贪婪区间需警惕顶部反转`, weight:1 });
  }

  if (frValue !== null) {
    const fr = parseFloat(frValue);
    if (fr < -0.05) sigs.push({ type:'bull', icon:'◈', text:`资金费率为负(${fr.toFixed(3)}%)，空头付费，轧空行情概率增加`, weight:2 });
    else if (fr > 0.15) sigs.push({ type:'bear', icon:'◈', text:`资金费率过高(${fr.toFixed(3)}%)，多头过度拥挤，注意回调清仓`, weight:2 });
  }

  if (indicators.ichimoku?.type === 'bull') sigs.push({ type:'bull', icon:'⬡', text:`一目均衡云上方运行，价格处于多头主导区域`, weight:1.5 });
  else if (indicators.ichimoku?.type === 'bear') sigs.push({ type:'bear', icon:'⬡', text:`一目均衡云下方运行，价格处于空头主导区域`, weight:1.5 });

  sigs.sort((a,b) => b.weight - a.weight);
  return sigs.slice(0, 7);
}

function buildEventReasoning(dims, indicators, coin, callPut, pct, netScore, fgVal, frValue, baseRatio) {
  // 生成“自然语言推理说明”，用于事件页解释区块。
  const rsiV = indicators?.rsi ? parseFloat(indicators.rsi.value) : 50;
  const isUP = netScore > 0;
  const frNum = parseFloat(frValue||0);

  let html = `<div style="margin-bottom:12px;">
    <strong style="color:${isUP?'var(--green)':netScore<0?'var(--red)':'var(--amber)'};font-family:var(--mono);">
      ${isUP?'▲':'▼'} 综合预测：${dir}（置信度 ${pct.toFixed(0)}%）
    </strong>
  </div>`;

  html += `<div style="margin-bottom:10px;padding-left:12px;border-left:2px solid var(--border);">
    <strong style="color:var(--text-dim);font-size:12px;">一、趋势分析</strong><br>
    <span style="font-size:12px;">${coin}当前${indicators?.ema?.type==='bull'?'均线呈多头排列，价格运行于主要均线上方':'均线偏空，价格承压于主要均线下方'}。${indicators?.ema200?.type==='bull'?'EMA200作为长期趋势确认指标当前偏多，长线支撑明确。':'跌破EMA200构成长期压力。'}${indicators?.maArrange?.type==='bull'?' 五线多头完美排列，趋势极强。':indicators?.maArrange?.type==='bear'?' 五线空头排列，趋势极弱。':''}</span>
  </div>`;

  html += `<div style="margin-bottom:10px;padding-left:12px;border-left:2px solid var(--border);">
    <strong style="color:var(--text-dim);font-size:12px;">二、动量判断</strong><br>
    <span style="font-size:12px;">RSI当前${rsiV.toFixed(0)}，${rsiV<30?'处于超卖区间，反弹信号较强':rsiV>70?'处于超买区间，回调风险加大':'处于中性区间'}。MACD${indicators?.macd?.type==='bull'?'金叉，柱状图转正，短期动能偏多':indicators?.macd?.type==='bear'?'死叉，柱状图转负，动能偏空':'信号中性'}。KDJ${indicators?.kdj?.type==='bull'?'金叉确认多':indicators?.kdj?.type==='bear'?'死叉确认空':'中性'}。</span>
  </div>`;

  html += `<div style="margin-bottom:10px;padding-left:12px;border-left:2px solid var(--border);">
    <strong style="color:var(--text-dim);font-size:12px;">三、成交量验证</strong><br>
    <span style="font-size:12px;">${indicators?.volume?.type==='bull'?'近期放量上涨，量价配合良好，多头有力':indicators?.volume?.type==='bear'?'放量下跌，空头主导':indicators?.obv?.type==='bull'?'OBV持续上升，资金整体净流入':'成交量信号中性，趋势可信度一般'}。CMF${indicators?.cmf?.type==='bull'?'显示资金持续流入，机构底部吸筹':indicators?.cmf?.type==='bear'?'显示资金流出，需警惕主力出货':'资金流向中性'}。</span>
  </div>`;

  html += `<div style="margin-bottom:10px;padding-left:12px;border-left:2px solid var(--border);">
    <strong style="color:var(--text-dim);font-size:12px;">四、情绪与合约数据</strong><br>
    <span style="font-size:12px;">${fgVal?`恐惧贪婪指数${fgVal}，${parseInt(fgVal)<30?'市场极度恐惧，历史上往往是中线买入时机':parseInt(fgVal)>70?'市场极度贪婪，注意风险':' 情绪中性'}。`:''}${frValue?`资金费率${parseFloat(frValue).toFixed(4)}%，${parseFloat(frValue)>0.1?'多头拥挤，警惕轧多':parseFloat(frValue)<-0.05?'空头付费，轧空行情概率增加':'属于正常范围'}。`:''}</span>
  </div>`;

  html = html.replace('一、趋势分析</strong><br>', `一、趋势分析（支撑 ${isUP?'CALL':'PUT'} 方向）</strong><br>`);

  html += `<div style="padding:10px 14px;background:rgba(245,166,35,0.07);border:1px solid rgba(245,166,35,0.2);border-radius:var(--r);margin-top:8px;">
    <strong style="color:var(--amber);font-family:var(--mono);font-size:11px;">⚡ 事件合约操作建议（无止损机制）</strong><br>
    <span style="font-size:12px;color:var(--text-dim);">
      ${isUP
        ? `综合指标看多，建议选择 <strong style="color:var(--green)">CALL 合约</strong>。注意：事件合约不能提前平仓，请确认好保费金额（最低5 USDT）。预估赔付约 ${(baseRatio||1.8).toFixed(2)}×，即盈利 ${(((baseRatio||1.8)-1)*100).toFixed(0)}%。${pct>50?'置信度较高，可适当增加保费':'置信度中等，建议小额试探'}。资金费率：${frNum.toFixed(4)}%。`
        : netScore < 0
        ? `综合指标看空，建议选择 <strong style="color:var(--red)">PUT 合约</strong>。注意：事件合约不能提前平仓，请确认好保费金额（最低5 USDT）。预估赔付约 ${(baseRatio||1.8).toFixed(2)}×，即盈利 ${(((baseRatio||1.8)-1)*100).toFixed(0)}%。${pct>50?'置信度较高，可适当增加保费':'置信度中等，建议小额试探'}。`
        : `当前多空信号均衡，建议不入场。等待某一方向信号明显强化后再操作，事件合约无法止损，模糊信号下入场风险极高。`}
    </span>
  </div>`;

  return html;
}

function renderEventStrategy(indicators, netScore, price, coin, baseRatio, expirySugg) {
  // 策略参考卡：把方向、RSI、Fib、资金费率、到期时间做模板化展示。
  const fr = parseFloat(window._lastFrValue||0);
  const fibPct = window._lastFibPct||50;
  const rsiV   = indicators?.rsi ? parseFloat(indicators.rsi.value) : 50;

  const strategies = [
    {
      name: 'CALL/PUT 趋势',
      desc: netScore > 0.15
        ? `趋势向上，买入 CALL。等待价格小幅回调企稳后入场，预估赔付 ${(baseRatio||1.8).toFixed(2)}×`
        : netScore < -0.15
        ? `趋势向下，买入 PUT。等待小幅反弹至压力位后入场，预估赔付 ${(baseRatio||1.8).toFixed(2)}×`
        : '趋势不明朗，不建议入场，等待方向突破后跟进',
      type: netScore > 0.15 ? 'bull' : netScore < -0.15 ? 'bear' : 'neutral',
      bar: Math.min(90, Math.abs(netScore) * 220),
    },
    {
      name: 'RSI超买超卖',
      desc: rsiV < 30
        ? `RSI超卖(${rsiV.toFixed(0)})，买入CALL博反弹，此区间历史胜率>65%，赔付比率可能较高`
        : rsiV > 70
        ? `RSI超买(${rsiV.toFixed(0)})，买入PUT博回调，注意入场时机选低赔付比率窗口`
        : `RSI(${rsiV.toFixed(0)})中性区，RSI策略暂无明确信号`,
      type: rsiV < 30 ? 'bull' : rsiV > 70 ? 'bear' : 'neutral',
      bar: Math.min(80, Math.abs(rsiV - 50) * 1.5),
    },
    {
      name: '斐波那契位',
      desc: `当前处于${fibPct.toFixed(1)}%回调位。${fibPct < 38.2 ? '强支撑区，CALL胜率历史偏高' : fibPct > 61.8 ? '深度回调压力区，PUT胜率偏高' : '黄金区间，需配合其他指标确认方向'}`,
      type: fibPct < 38.2 ? 'bull' : fibPct > 61.8 ? 'bear' : 'neutral',
      bar: 55,
    },
    {
      name: '资金费率反转',
      desc: fr < -0.05
        ? `资金费率负值(${fr.toFixed(3)}%)，空头极度拥挤，买入CALL博轧空，风险回报比极高`
        : fr > 0.15
        ? `资金费率极高(${fr.toFixed(3)}%)，多头过度拥挤，买入PUT博踩踏行情`
        : `资金费率(${fr.toFixed(3)}%)正常，此策略无明确信号`,
      type: fr < -0.05 ? 'bull' : fr > 0.15 ? 'bear' : 'neutral',
      bar: Math.min(80, Math.abs(fr) * 400),
    },
    {
      name: '到期时间选择',
      desc: `建议到期：${expirySugg||'30分钟-1小时'}。${Math.abs(netScore)>0.3?'信号强，选短期快速兑现':'信号中等，选稍长到期时间等待趋势确认'}。⚠ 不能提前平仓，最大亏损=保费`,
      type: 'neutral',
      bar: 45,
    },
  ];

  const html = strategies.map(s => `
    <div class="indicator-row">
      <div class="ind-name">${s.name}</div>
      <div>
        <div class="ind-bar-wrap"><div class="ind-bar ${s.type==='bull'?'green':s.type==='bear'?'red':'amber'}" style="width:${Math.max(5,s.bar)}%"></div></div>
        <div class="ind-desc" style="margin-top:3px;">${s.desc}</div>
      </div>
      <div></div>
      ${makeSignalPill(s.type)}
    </div>`).join('');
  document.getElementById('eventStrategyRef').innerHTML = html;
}

function monitorItem(level, icon, title, detail, badge, badgeCls) {
  // 监控卡片通用模板：减少各监控模块重复拼接 HTML。
  return `<div class="monitor-item">
    <div class="monitor-dot ${level}"></div>
    <div class="monitor-content">
      <div class="monitor-title">${icon} ${title}</div>
      <div class="monitor-detail">${detail}</div>
      <div class="monitor-meta">${new Date().toLocaleTimeString('zh-CN')} · 实时监控</div>
    </div>
    <span class="monitor-badge ${badgeCls}" style="border:1px solid">${badge}</span>
  </div>`;
}

function renderWhaleMonitor(coin, klines, ticker, cgInfo, onchain) {
  // 鲸鱼监控：基于成交量、价格、链上大额交易做“疑似大资金行为”提示。
  const price  = ticker ? parseFloat(ticker.lastPrice) : 0;
  const vol24h = ticker ? parseFloat(ticker.quoteVolume) : 0;
  const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;

  const vols = klines.map(k => parseFloat(k[5]));
  const avgVol = vols.slice(0,-1).reduce((a,b)=>a+b,0) / (vols.length-1 || 1);
  const lastVol = vols[vols.length-1] || 0;
  const volRatio = lastVol / (avgVol || 1);

  let html = '';
  // 阈值规则属于经验值，不同币种可后续改为动态阈值。
  if (vol24h > 5e9) {
    html += monitorItem('high','🐳', `${coin}检测到超大额成交量`, `24小时成交量 $${fmt(vol24h)}，是正常水平的${(vol24h/2e9).toFixed(1)}倍，疑似机构建仓行为。价格变动方向：${change>0?'上行':'下行'} ${Math.abs(change).toFixed(2)}%`, '超大额', 'badge-red');
  }
  if (volRatio > 1.8) {
    html += monitorItem('medium','🐳', `${coin}近期放量异动`, `当前成交量是近期平均的${volRatio.toFixed(1)}倍。${change>0?'放量上涨，主力买入迹象':'放量下跌，主力出货迹象'}，建议关注后续持续性。`, '放量', 'badge-amber');
  }
  html += monitorItem('low','📊', `${coin}大单挂单监控`, `当前价格 $${fmtPrice(price)}。大单挂单在关键支撑/压力位聚集，${change>0?`上方压力位参考 $${fmtPrice(price*1.02)}`:`下方支撑位参考 $${fmtPrice(price*0.98)}`}。实时订单簿数据请参考流动性分析模块。`, '监控中', 'badge-blue');

  html += monitorItem('info','🏦', `${coin}交易所净流量`, `基于24h价格变动 ${change>0?'+':''}${change.toFixed(2)}% 推算：${change>0?'净流出（用户提币做多）':'净流入（资金存入交易所，可能获利了结）'}。大额提币通常表示长期持有意愿增强。`, change>0?'净流出':'净流入', change>0?'badge-green':'badge-red');

  if (cgInfo?.community_data) {
    const cd = cgInfo.community_data;
    const twFollowers = cd.twitter_followers || 0;
    const redditSubs  = cd.reddit_subscribers || 0;
    html += monitorItem('info','👥', `${coin}社区活跃度`, `Twitter关注 ${fmt(twFollowers)}，Reddit订阅 ${fmt(redditSubs)}。社区热度${twFollowers>1e6?'极高，市场关注度强':'中等'}。CoinGecko ${cgInfo.market_data?.market_cap_rank?`市值排名 #${cgInfo.market_data.market_cap_rank}`:'--'}。`, '实时数据', 'badge-blue');
  }

  // 如果拿到链上数据，则优先展示链上证据（可信度更高）。
  if (onchain?.data?.length > 0) {
    const trades = onchain.data.slice(0,3);
    const buyCount  = trades.filter(t => t.attributes?.kind === 'buy').length;
    const sellCount = trades.filter(t => t.attributes?.kind === 'sell').length;
    const totalUSD  = trades.reduce((s,t) => s + parseFloat(t.attributes?.volume_in_usd||0), 0);
    html += monitorItem(
      totalUSD > 5e5 ? 'high' : 'medium',
      '🔗',
      `${coin} 链上DEX大额交易（实时）`,
      `最近3笔大额交易总计 $${fmt(totalUSD)}，${buyCount>sellCount?'买入主导（'+buyCount+'买/'+sellCount+'卖）':'卖出主导（'+sellCount+'卖/'+buyCount+'买）'}。数据来源：GeckoTerminal链上实时数据。`,
      `$${fmt(totalUSD)}`,
      totalUSD > 5e5 ? 'badge-red' : 'badge-amber'
    );
  }

  document.getElementById('whaleBody').innerHTML = html;
  const whaleBadge = document.getElementById('whaleBadge');
  whaleBadge.textContent = onchain?.data?.length > 0 ? `${onchain.data.length}笔链上大单` : (change>0?'净流出':'净流入');
  whaleBadge.className = `panel-badge ${change>0?'badge-green':'badge-red'}`;
}

function renderSmartMoney(coin, klines, ticker, cgInfo) {
  // 聪明钱模块：核心看 OBV 与价格是否背离 + 关键 K 线形态。
  const closes = klines.map(k => parseFloat(k[4]));
  const opens  = klines.map(k => parseFloat(k[1]));
  const vols   = klines.map(k => parseFloat(k[5]));
  const last   = closes.length - 1;
  const price  = closes[last] || 0;
  const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;

  let obv = 0;
  const obvArr = [0];
  for (let i = 1; i < closes.length; i++) {
    obv += closes[i] > closes[i-1] ? vols[i] : closes[i] < closes[i-1] ? -vols[i] : 0;
    obvArr.push(obv);
  }
  const obvSlope = obvArr[last] - obvArr[Math.max(0,last-12)];
  const priceSlope = closes[last] - closes[Math.max(0,last-12)];
  // 背离定义：价格方向与 OBV 方向相反。
  const isDivergence = (obvSlope > 0 && priceSlope < 0) || (obvSlope < 0 && priceSlope > 0);

  let html = '';
  html += monitorItem(
    isDivergence ? 'high' : 'low',
    '🧠',
    `${coin}聪明钱OBV背离${isDivergence?'（异常）':'（正常）'}`,
    isDivergence
      ? `价格${priceSlope>0?'上涨':'下跌'}但OBV方向相反，典型聪明钱背离信号。历史数据显示此后1-3天内往往出现反转。请结合其他指标验证。`
      : `价格与OBV方向一致，${obvSlope>0?'量价齐升，聪明钱跟进多头':'量价齐跌，聪明钱确认空头'}。趋势可信度较高。`,
    isDivergence ? '背离' : '同步',
    isDivergence ? 'badge-red' : 'badge-green'
  );

  for (let i = Math.max(0, last-3); i <= last; i++) {
    const isBullEngulf = opens[i] < closes[i-1] && closes[i] > opens[i-1] && closes[i] > opens[i];
    const isBearEngulf = opens[i] > closes[i-1] && closes[i] < opens[i-1] && closes[i] < opens[i];
    if (isBullEngulf) {
      html += monitorItem('medium','🕯️', `${coin}出现看涨吞没形态`, `第${i+1}根K线出现看涨吞没，买方力量强劲吸收所有卖盘。聪明钱在此价位积极买入，短期看涨概率增加。`, '看涨形态', 'badge-green');
      break;
    }
    if (isBearEngulf) {
      html += monitorItem('medium','🕯️', `${coin}出现看跌吞没形态`, `第${i+1}根K线出现看跌吞没，卖方力量强劲覆盖所有买盘。聪明钱可能在此高位出货，短期看跌概率增加。`, '看跌形态', 'badge-red');
      break;
    }
  }

  html += monitorItem('info','💡', `${coin}机构持仓动向`, `根据近${klines.length}根K线数据分析：${change>0?'价格持续上涨，大概率有机构底部布局，做多信号':'价格持续下跌，可能有机构在顶部减仓'}。建议配合资金费率和持仓量变化综合判断。`, '推算值', 'badge-blue');

  if (cgInfo?.market_data) {
    const md = cgInfo.market_data;
    const ath = md.ath?.usd || 0;
    const cur = closes[closes.length-1] || 0;
    const athPct = ath > 0 ? ((cur-ath)/ath*100).toFixed(1) : '--';
    const mc = md.market_cap?.usd || 0;
    const cirSup = md.circulating_supply || 0;
    html += monitorItem(
      Math.abs(parseFloat(athPct)) < 20 ? 'high' : 'info',
      '📈',
      `${coin} CoinGecko 市场数据`,
      `市值 $${fmt(mc)}，流通量 ${fmt(cirSup)} ${coin}。距历史高点 ${athPct}%（ATH: $${fmtPrice(ath)}）。${parseFloat(athPct) > -20 ? '价格接近历史高点，注意回调风险' : parseFloat(athPct) < -60 ? '深度回调，历史上可能存在机会' : '价格处于中间区间'}。`,
      `ATH ${athPct}%`,
      Math.abs(parseFloat(athPct)) < 20 ? 'badge-amber' : 'badge-blue'
    );
  }

  document.getElementById('smartBody').innerHTML = html;
  document.getElementById('smartBadge').textContent = isDivergence ? '⚠ 背离' : '正常';
  document.getElementById('smartBadge').className = `panel-badge ${isDivergence?'badge-red':'badge-green'}`;
}

function renderOnChainAnomalies(coin, klines, ticker, onchain, trending, globalInfo) {
  // 异常模块：优先捕捉“统计异常”（Z 分数）与“大波动”。
  const price  = ticker ? parseFloat(ticker.lastPrice) : 0;
  const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const vol    = ticker ? parseFloat(ticker.quoteVolume) : 0;

  let html = '';
  const vols   = klines.map(k => parseFloat(k[5]));
  const avgVol = vols.reduce((a,b)=>a+b,0)/vols.length;
  const stdVol = Math.sqrt(vols.reduce((s,v)=>(s+(v-avgVol)**2),0)/vols.length);
  const lastVol = vols[vols.length-1] || 0;
  // Z-Score > 2 视为异常放量（经验阈值）。
  const zScore  = (lastVol - avgVol) / (stdVol || 1);

  if (Math.abs(zScore) > 2) {
    html += monitorItem('high','⚡', `${coin}成交量异常放大`, `当前成交量Z-Score = ${zScore.toFixed(2)}（>2为异常）。${zScore>0?'超常成交量配合价格上涨，强烈上涨信号':'超常成交量配合价格下跌，恐慌抛售信号'}。此类异动往往预示短期趋势加速。`, `Z:${zScore.toFixed(1)}`, zScore>0?'badge-green':'badge-red');
  }

  if (Math.abs(change) > 3) {
    html += monitorItem('high','🌊', `${coin}价格大幅波动`, `24小时涨跌幅 ${change>0?'+':''}${change.toFixed(2)}%，超过±3%异动阈值。${change>0?'上涨突破可能触发大量空头止损（轧空）':'下跌可能触发大量多头止损清算（踩踏）'}，流动性风险增加。`, `${change.toFixed(1)}%`, Math.abs(change)>5?'badge-red':'badge-amber');
  }

  html += monitorItem('medium','🔍', `${coin}链上活跃地址`, `基于价格波动推算：${vol>1e9?'链上活跃度较高，大量地址参与交易':'链上活跃度一般，散户参与度低'}。${change>0?'新地址涌入通常预示散户追涨，需警惕顶部':'地址活跃度下降可能预示底部整固'}。`, '推算值', 'badge-blue');

  html += monitorItem('info','🏛️', `${coin}合约持仓异动`, `基于资金费率和价格联动分析：${change>0&&lastVol>avgVol?'多头持仓量增加，做多意愿强烈，但需注意多头过度拥挤风险':'空头可能在布局，或多头在止盈出场'}。持仓量数据请参考合约数据模块。`, '分析中', 'badge-blue');

  if (trending?.coins?.length > 0) {
    const top5 = trending.coins.slice(0,5).map(tc => tc.item?.symbol || '').filter(Boolean).join(' · ');
    const isCoinTrending = trending.coins.some(tc => tc.item?.symbol?.toUpperCase() === coin);
    html += monitorItem(
      isCoinTrending ? 'high' : 'info',
      '🔥',
      `CoinGecko 实时热门币种`,
      `当前热门：${top5}。${isCoinTrending ? coin + '正在CoinGecko热门榜，关注度极高！市场情绪活跃' : coin + '未在热门榜，市场主要关注其他币种'}。热门榜通常预示短期波动加剧。`,
      isCoinTrending ? '热门中' : '未上榜',
      isCoinTrending ? 'badge-amber' : 'badge-blue'
    );
  }

  if (globalInfo?.data) {
    const gd = globalInfo.data;
    const btcDom = (gd.market_cap_percentage?.btc || 0).toFixed(1);
    const ethDom = (gd.market_cap_percentage?.eth || 0).toFixed(1);
    const totalMc = gd.total_market_cap?.usd || 0;
    const mcChange = (gd.market_cap_change_percentage_24h_usd || 0).toFixed(2);
    html += monitorItem(
      Math.abs(parseFloat(mcChange)) > 3 ? 'medium' : 'info',
      '🌐',
      `全球加密市场实时状态`,
      `总市值 $${fmt(totalMc)}（24H ${mcChange>0?'+':''}${mcChange}%），BTC占比 ${btcDom}%，ETH占比 ${ethDom}%。${parseFloat(mcChange)>3?'市场整体大涨，风险偏好上升':parseFloat(mcChange)<-3?'市场整体大跌，恐慌情绪蔓延':'市场整体平稳'}。`,
      `${mcChange>0?'+':''}${mcChange}%`,
      Math.abs(parseFloat(mcChange)) > 3 ? 'badge-amber' : 'badge-blue'
    );
  }

  if (onchain?.data?.length > 0) {
    const trades = onchain.data;
    const largestUSD = Math.max(...trades.map(t => parseFloat(t.attributes?.volume_in_usd||0)));
    html += monitorItem(
      largestUSD > 1e6 ? 'high' : 'medium',
      '⛓️',
      `${coin} 链上DEX巨额单笔交易`,
      `检测到 ${trades.length} 笔超大额DEX交易，最大单笔 $${fmt(largestUSD)}。链上大额交易通常预示机构资金移动或大型套利行为，需密切关注后续价格方向。`,
      `最大 $${fmt(largestUSD)}`,
      largestUSD > 1e6 ? 'badge-red' : 'badge-amber'
    );
  }

  document.getElementById('anomalyBody').innerHTML = html;
  document.getElementById('anomalyBadge').textContent = Math.abs(zScore)>2 ? '⚠ 异常' : '正常';
  document.getElementById('anomalyBadge').className = `panel-badge ${Math.abs(zScore)>2?'badge-red':'badge-green'}`;
}

function renderExchangeFlow(coin, klines, ticker, cgInfo) {
  // 交易所流向模块：当前是估算模型（基于涨跌与成交量推算净流入/流出）。
  const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const vol    = ticker ? parseFloat(ticker.quoteVolume) : 0;
  const price  = ticker ? parseFloat(ticker.lastPrice) : 0;

  const inflowEst  = vol * (change < 0 ? 0.55 : 0.42);
  const outflowEst = vol - inflowEst;
  const netFlow    = outflowEst - inflowEst;
  const isNetOut   = netFlow > 0;

  let html = '';
  html += monitorItem(
    isNetOut ? 'low' : 'medium',
    '🏦',
    `${coin}交易所资金净${isNetOut?'流出':'流入'}`,
    `估算净${isNetOut?'流出':'流入'} $${fmt(Math.abs(netFlow))}。${isNetOut?'净流出通常表示用户提走${coin}至冷钱包，看涨信号（减少抛压）':'净流入可能表示用户准备出售，需结合价格方向判断'}。`,
    isNetOut ? '净流出' : '净流入',
    isNetOut ? 'badge-green' : 'badge-amber'
  );

  html += monitorItem('info','⚖️', `${coin}期现基差监控`, `当前价格 $${fmtPrice(price)}。期货合约价格通常与现货存在基差，${change>0?'上涨行情中期货溢价往往增大，反映多头预期':'下跌行情中基差收窄甚至倒挂，反映空头情绪'}。建议关注资金费率作为期现基差参考。`, '监控中', 'badge-blue');

  html += monitorItem('low','💰', `稳定币铸造动向`, `稳定币（USDT/USDC）大量铸造通常预示场外资金入场准备买币，是中期看涨信号。当前无法直接获取链上数据，建议参考CryptoQuant等链上数据平台获取准确数据。`, '参考值', 'badge-blue');

  html += monitorItem('info','🔄', `${coin}矿工持仓动向`, `矿工通常在价格高位出售${coin}以覆盖成本。基于当前价格水平，${price>50000?'高价区间矿工可能有出售意愿，关注矿工钱包转移':'价格偏低区间矿工通常选择囤积，抛压较小'}。`, '分析', 'badge-blue');

  if (cgInfo?.tickers?.length > 0) {
    const topExchanges = cgInfo.tickers.slice(0,3).map(t => `${t.market?.name}($${fmt(parseFloat(t.converted_volume?.usd||0))})`).join(' · ');
    html += monitorItem('info','🏛️', `${coin} 主要交易所成交分布`, `Top交易所：${topExchanges}。流动性集中分析可帮助判断大额抛压来自哪个平台。`, 'CoinGecko', 'badge-blue');
  }

  if (cgInfo?.developer_data) {
    const dd = cgInfo.developer_data;
    const commits = (dd.commit_count_4_weeks || 0);
    html += monitorItem('info','👨‍💻', `${coin} 开发者活跃度`, `近4周代码提交 ${commits} 次，${commits>20?'开发活跃，项目持续迭代，基本面支撑强':commits>5?'开发正常':' 开发相对不活跃'}。Stars: ${fmt(dd.stars||0)}，Forks: ${fmt(dd.forks||0)}。`, `${commits}次提交`, commits>20?'badge-green':'badge-blue');
  }

  document.getElementById('flowBody').innerHTML = html;
  document.getElementById('flowBadge').textContent = isNetOut ? '净流出' : '净流入';
  document.getElementById('flowBadge').className = `panel-badge ${isNetOut?'badge-green':'badge-amber'}`;
}

function renderFundingHistory(frData, symbol) {
  // 资金费率历史：展示最近样本趋势和均值，判断拥挤度是否持续。
  const container = document.getElementById('frHistBody');
  if (!frData || !frData.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px;">现货交易对无资金费率数据</div>';
    document.getElementById('frHistBadge').textContent = 'N/A';
    return;
  }

  const recent = frData.slice(-12);
  // 注意：frData 来自交易所原始接口，fundingRate 是小数（如 0.0001 = 0.01%）。
  // 因此这里需要 *100 转成“百分比数值”再展示。
  const maxFr  = Math.max(...recent.map(r => Math.abs(parseFloat(r.fundingRate) * 100)));
  const avgFr  = recent.reduce((s, r) => s + parseFloat(r.fundingRate) * 100, 0) / recent.length;

  let html = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;font-family:var(--mono);">近${recent.length}期资金费率趋势（均值 ${avgFr.toFixed(4)}%）</div>`;
  html += recent.map(r => {
    const frPct = parseFloat(r.fundingRate) * 100;
    const barW = maxFr > 0 ? Math.abs(frPct) / maxFr * 80 : 0;
    const time = new Date(r.fundingTime).toLocaleTimeString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const col  = frPct > 0 ? 'var(--red)' : 'var(--green)';
    return `<div class="fr-bar-row">
      <div class="fr-label">${time}</div>
      <div class="fr-track">
        ${frPct >= 0
          ? `<div class="fr-bar-pos" style="width:${barW}%;background:rgba(240,56,74,0.5)"></div>`
          : `<div class="fr-bar-neg" style="width:${barW}%;background:rgba(0,217,126,0.5)"></div>`}
      </div>
      <div class="fr-val" style="color:${col}">${frPct > 0 ? '+' : ''}${frPct.toFixed(4)}%</div>
    </div>`;
  }).join('');

  container.innerHTML = html;
  const trend = avgFr > 0.05 ? '持续偏高' : avgFr < -0.02 ? '持续为负' : '正常';
  document.getElementById('frHistBadge').textContent = trend;
  document.getElementById('frHistBadge').className = `panel-badge ${avgFr>0.05?'badge-red':avgFr<-0.02?'badge-green':'badge-blue'}`;
}

function renderOIHistory(oiData, coin) {
  // OI 历史：重点看“总持仓变化方向 + 变化幅度”，辅助判断新资金进出。
  const container = document.getElementById('oiHistBody');
  if (!oiData || !oiData.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px;">现货交易对无持仓量数据</div>';
    document.getElementById('oiHistBadge').textContent = 'N/A';
    return;
  }

  const recent = oiData.slice(-16);
  const vals   = recent.map(r => parseFloat(r.sumOpenInterest));
  const maxV   = Math.max(...vals);
  const minV   = Math.min(...vals);
  const range  = maxV - minV || 1;
  const trend  = vals[vals.length-1] > vals[0] ? '持仓增加' : '持仓减少';
  const trendPct = ((vals[vals.length-1] - vals[0]) / vals[0] * 100).toFixed(2);

  let html = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;font-family:var(--mono);">近${recent.length}小时持仓量（${trend} ${trendPct}%）</div>`;
  html += `<div style="display:flex;align-items:flex-end;gap:3px;height:60px;margin-bottom:10px;">`;
  html += vals.map((v, i) => {
    const h   = Math.max(4, Math.round((v - minV) / range * 52));
    const col = v > vals[Math.max(0,i-1)] ? 'rgba(0,217,126,0.6)' : 'rgba(240,56,74,0.5)';
    return `<div style="flex:1;height:${h}px;background:${col};border-radius:2px 2px 0 0;" title="${fmt(v)}"></div>`;
  }).join('');
  html += `</div>`;
  html += `<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);font-family:var(--mono);">
    <span>低 ${fmt(minV)}</span><span>高 ${fmt(maxV)}</span>
  </div>`;
  html += `<div style="margin-top:10px;padding:9px 12px;background:var(--bg2);border-radius:var(--r);font-size:12px;color:var(--text-dim);">
    ${trend === '持仓增加' ? `持仓量上升 ${trendPct}%，说明新资金持续流入市场。${vals[vals.length-1]>vals[0]*1.05?'大幅增加表明市场投机情绪浓厚':'温和增加说明趋势健康'}。` : `持仓量下降 ${Math.abs(parseFloat(trendPct))}%，说明资金在撤离市场或多空双方在平仓。若伴随价格下跌则为多头出逃信号。`}
  </div>`;

  container.innerHTML = html;
  document.getElementById('oiHistBadge').textContent = trend;
  document.getElementById('oiHistBadge').className = `panel-badge ${trend==='持仓增加'?'badge-green':'badge-red'}`;
}

function renderRiskAlerts(coin, klines, ticker, frData) {
  // 风险预警是“规则引擎”：按阈值组合输出高/中/低风险项。
  const change  = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const vol24h  = ticker ? parseFloat(ticker.quoteVolume) : 0;
  const price   = ticker ? parseFloat(ticker.lastPrice) : 0;
  // frData 的 fundingRate 仍是原始小数，这里转换成百分比数值后再做阈值判断。
  const frPctLast  = frData?.length ? parseFloat(frData[frData.length-1]?.fundingRate || 0) * 100 : 0;

  // alerts 每项包含：级别、名称、解释、条形强度、方向色。
  const alerts = [];
  if (Math.abs(change) > 5)  alerts.push({ level:'high',   name:'大幅价格异动',   desc:`24H涨跌 ${change.toFixed(2)}%，超过5%预警线，市场波动剧烈，建议降低仓位。`, bar:Math.min(100,Math.abs(change)*10), type:'bear' });
  if (frPctLast > 0.15)      alerts.push({ level:'high',   name:'资金费率过高',   desc:`资金费率${frPctLast.toFixed(4)}%，多头拥挤，极端情况下可能引发多杀多踩踏行情。`, bar:Math.min(100, frPctLast * 500), type:'bear' });
  if (frPctLast < -0.1)      alerts.push({ level:'medium', name:'资金费率极负',   desc:`资金费率${frPctLast.toFixed(4)}%，空头极度拥挤，小幅上涨可能触发连环轧空。`, bar:70, type:'bull' });
  if (vol24h > 5e9)          alerts.push({ level:'medium', name:'超高成交量',     desc:`24H成交量 $${fmt(vol24h)}，远超正常水平，大资金活跃，方向可信度高。`, bar:60, type:'neutral' });
  if (Math.abs(change) < 0.5 && vol24h < 1e8) alerts.push({ level:'low', name:'流动性不足', desc:'成交量极低，市场流动性差，大额订单可能造成较大滑点，不建议大仓位操作。', bar:40, type:'bear' });

  alerts.push({ level:'low', name:'强平风险监控', desc:`${Math.abs(change)>3?'当前波动较大，高杠杆仓位存在强平风险。建议杠杆不超过5倍，设置合理止损。':'市场波动正常，强平风险可控。建议持续关注关键价格位。'}`, bar: 30, type:'neutral' });
  alerts.push({ level:'low', name:'黑天鹅预警',   desc:'持续监控中。黑天鹅事件（交易所宕机、重大黑客攻击、监管政策突变）无法通过技术指标预测，建议分散风险、保持安全边际。', bar:20, type:'neutral' });

  const listHtml = alerts.map(a => `
    <div class="indicator-row">
      <div class="ind-name" style="display:flex;align-items:center;gap:6px;">
        <div class="monitor-dot ${a.level}" style="flex-shrink:0"></div>
        ${a.name}
      </div>
      <div>
        <div class="ind-bar-wrap"><div class="ind-bar ${a.type==='bull'?'green':a.type==='bear'?'red':'amber'}" style="width:${a.bar}%"></div></div>
        <div class="ind-desc" style="margin-top:3px">${a.desc}</div>
      </div>
      <div></div>
      <span class="signal-pill ${a.type==='bull'?'signal-bull':a.type==='bear'?'signal-bear':'signal-neutral'}">
        <span class="signal-dot"></span>${a.level==='high'?'高风险':a.level==='medium'?'中风险':'低风险'}
      </span>
    </div>`).join('');

  document.getElementById('riskAlerts').innerHTML = listHtml;

  const highRisks = alerts.filter(a => a.level === 'high').length;
  const badge = document.getElementById('riskBadge');
  badge.textContent = highRisks > 0 ? `${highRisks}个高风险` : '风险可控';
  badge.className = `panel-badge ${highRisks>0?'badge-red':alerts.filter(a=>a.level==='medium').length>0?'badge-amber':'badge-green'}`;

  document.getElementById('riskConclusion').textContent =
    highRisks > 0
      ? `当前检测到 ${highRisks} 项高风险信号，建议降低仓位至正常的50%以下，设置严格止损，避免重仓操作。关键风险点：${alerts.filter(a=>a.level==='high').map(a=>a.name).join('、')}。`
      : `当前风险等级可控，无重大异常信号。但加密市场波动剧烈，建议始终保持合理仓位，设置止损，不使用超过10倍杠杆。`;
}

function renderLivePage() {
  // 直播页渲染：先过滤、排序，再渲染统计与卡片。
  let data = [..._liveStreamers];

  if (_liveFilter !== 'all') {
    data = data.filter(s => s.coins.includes(_liveFilter));
  }

  // 支持按热度/在线/观看/弹幕多维排序。
  const sortFn = {
    score:   (a,b) => b.score - a.score,
    viewers: (a,b) => b.viewers - a.viewers,
    views:   (a,b) => b.views - a.views,
    danmaku: (a,b) => b.danmaku - a.danmaku,
  };
  data.sort(sortFn[_liveSort] || sortFn.score);

  
  const totalViewers = _liveSummary.totalViewers || data.reduce((s,d) => s+d.viewers, 0);
  const totalDanmaku = data.reduce((s,d) => s+d.danmaku, 0);
  const avgSent      = data.length ? Math.round(data.reduce((s,d)=>s+d.sentiment,0)/data.length) : 55;
  const bullPct      = avgSent;
  const bearPct      = 100 - avgSent;
  const onlineCount  = _liveSummary.online || data.length;

  const setEl = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('liveOnlineCount',   `${onlineCount} 位主播在线`);
  setEl('liveTotalViewers',  fmt(totalViewers));
  setEl('liveTotalDanmaku',  fmt(totalDanmaku) + ' (估算)');
  setEl('liveOverallSentiment', avgSent > 60 ? '看多' : avgSent < 40 ? '看空' : '中性');
  const sentEl = document.getElementById('liveOverallSentiment');
  if (sentEl) sentEl.style.color = avgSent > 60 ? 'var(--green)' : avgSent < 40 ? 'var(--red)' : 'var(--amber)';

  const bull1 = document.getElementById('liveOverallBull');
  if (bull1) bull1.style.width = bullPct + '%';

  setEl('liveOverallBullPct', `看多 ${bullPct}%`);
  setEl('liveOverallBearPct', `看空 ${bearPct}%`);

  const tagCount = {};
  data.forEach(s => s.tags.forEach(t => tagCount[t] = (tagCount[t]||0) + s.viewers));
  const hotTopic = Object.entries(tagCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || '--';
  setEl('liveHotTopic', `#${hotTopic}`);

  const grid = document.getElementById('liveStreamerGrid');
  if (!grid) return;

  if (data.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:32px 20px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:32px;margin-bottom:10px;opacity:0.4;">◐</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--text);letter-spacing:1px;margin-bottom:6px;">
            广场直播 · 数据获取中
          </div>
          <div style="font-size:12px;color:var(--text-muted);">
            暂无直播数据，请点击重新加载
          </div>
        </div>

        <button onclick="loadLivePage()" style="margin-top:12px;padding:10px 24px;border-radius:6px;background:rgba(255,107,157,0.12);border:1px solid rgba(255,107,157,0.3);color:#ff6b9d;font-family:var(--mono);font-size:12px;cursor:pointer;letter-spacing:1px;">
          ⟳ 重新加载
        </button>
      </div>
    </div>`;
    renderLiveSentiment(data);
    renderLiveTagCloud(data);
    return;
  }

  const COLORS = [
    'background:rgba(255,171,64,0.15);color:var(--amber)',
    'background:rgba(0,217,126,0.12);color:var(--green)',
    'background:rgba(61,158,255,0.12);color:var(--blue)',
    'background:rgba(155,114,255,0.12);color:var(--purple)',
    'background:rgba(255,107,157,0.12);color:#ff6b9d',
    'background:rgba(0,200,224,0.12);color:var(--cyan)',
  ];

  const maxScore = Math.max(...data.map(x=>x.score), 1);

  const cards = data.map((s, i) => {
    const rank      = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const avatarStyle = COLORS[i % COLORS.length];
    const sentColor = s.sentiment > 60 ? 'var(--green)' : s.sentiment < 40 ? 'var(--red)' : 'var(--amber)';
    const sentLabel = s.sentiment > 60 ? '看多' : s.sentiment < 40 ? '看空' : '中性';
    const durationStr = s.duration >= 60
      ? `${Math.floor(s.duration/60)}h${s.duration%60}m`
      : `${s.duration}min`;

    const tagsHtml = s.tags.slice(0,3).map(t => {
      const cls = (t==='BTC'||t==='ETH') ? 'bull'
        : (t.includes('空')||t.includes('跌')||t.includes('看空')) ? 'bear'
        : t === '事件合约' ? 'hot' : '';
      return `<span class="streamer-tag ${cls}">#${t}</span>`;
    }).join('');

    const linkHref = s.link || `https://www.binance.com/zh-CN/square/audio`;
    const cardClick = s.link ? `onclick="window.open('${linkHref}','_blank')" style="cursor:pointer;"` : '';

    return `<div class="streamer-card ${rankClass}" ${cardClick} title="点击进入直播间：${s.name}">
      <div class="streamer-header">
        <div class="streamer-rank">${rankLabel}</div>
        <div class="streamer-avatar" style="${avatarStyle};border-radius:50%;">
          ${s.avatar}
        </div>
        <div class="streamer-info">
          <div class="streamer-name">${s.name}${s.isReal ? '' : ''}</div>
          <div class="streamer-topic" title="${s.topic}">${s.topic}</div>
        </div>
        <span class="live-badge">LIVE</span>
      </div>

      <div class="streamer-stats">
        <div class="streamer-stat">
          <div class="streamer-stat-val" style="color:#ff6b9d">${fmt(s.viewers)}</div>
          <div class="streamer-stat-lbl">在线人数</div>
        </div>
        <div class="streamer-stat">
          <div class="streamer-stat-val" style="color:var(--blue)">${fmt(s.views)}</div>
          <div class="streamer-stat-lbl">观看次数</div>
        </div>
        <div class="streamer-stat">
          <div class="streamer-stat-val" style="color:var(--amber)">${durationStr}</div>
          <div class="streamer-stat-lbl">直播时长</div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="streamer-sentiment" style="flex:1;margin-right:10px;">
          <span style="font-size:10px;color:var(--text-muted)">情绪</span>
          <div class="streamer-sentiment-bar">
            <div class="streamer-sentiment-bull" style="width:${s.sentiment}%"></div>
            <div class="streamer-sentiment-bear" style="width:${100-s.sentiment}%"></div>
          </div>
          <span style="font-family:var(--mono);font-size:10px;color:${sentColor};width:30px;text-align:right;">${sentLabel}</span>
        </div>
        ${s.link ? `<a href="${linkHref}" target="_blank" onclick="event.stopPropagation()" style="font-family:var(--mono);font-size:9px;color:#ff6b9d;text-decoration:none;padding:2px 6px;border:1px solid rgba(255,107,157,0.3);border-radius:3px;background:rgba(255,107,157,0.08);">进入 ↗</a>` : ''}
      </div>

      <div class="streamer-tags">${tagsHtml}</div>

      <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;margin-top:2px;">
        <span style="color:var(--text-muted)">热度 ${Math.round(s.score/1000)}K</span>
        <span style="color:${sentColor}">评分 ${Math.round(s.score/maxScore*100)}</span>
        
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = cards;
  renderLiveSentiment(data);
  renderLiveTagCloud(data);
}

function renderLiveSentiment(data) {
  // 统计“看多/看空/中性”主播与观众占比，输出简报。
  const body = document.getElementById('liveSentBody');
  if (!body) return;

  const bullStreamers = data.filter(s => s.sentiment > 60);
  const bearStreamers = data.filter(s => s.sentiment < 40);
  const neutStreamers = data.filter(s => s.sentiment >= 40 && s.sentiment <= 60);
  const totalV = data.reduce((s,d)=>s+d.viewers, 0) || 1;
  const bullV  = bullStreamers.reduce((s,d)=>s+d.viewers, 0);
  const bearV  = bearStreamers.reduce((s,d)=>s+d.viewers, 0);

  const rows = [
    { label:'看多主播', count:bullStreamers.length, viewers:bullV, pct:(bullV/totalV*100).toFixed(0), color:'var(--green)' },
    { label:'看空主播', count:bearStreamers.length, viewers:bearV, pct:((data.reduce((s,d)=>s+d.viewers,0)-bullV-bearStreamers.reduce((s,d)=>s+d.viewers,0))/totalV*100).toFixed(0), color:'var(--text-muted)' },
    { label:'中性主播', count:neutStreamers.length, viewers:neutStreamers.reduce((s,d)=>s+d.viewers,0), pct:(neutStreamers.reduce((s,d)=>s+d.viewers,0)/totalV*100).toFixed(0), color:'var(--text-muted)' },
  ];

  const html = `
    <div style="margin-bottom:12px;">
      ${rows.map(r => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="font-size:12px;color:${r.color};width:70px;flex-shrink:0;">${r.label}</div>
        <div style="flex:1;height:5px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;">
          <div style="height:100%;background:${r.color};width:${r.pct}%;transition:width 0.8s;border-radius:3px;"></div>
        </div>
        <div style="font-family:var(--mono);font-size:11px;color:${r.color};width:40px;text-align:right;">${r.count}人</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text-muted);width:50px;text-align:right;">${fmt(r.viewers)}观</div>
      </div>`).join('')}
    </div>
    <div style="padding:9px 12px;background:var(--bg2);border-radius:var(--r);font-size:12px;color:var(--text-dim);line-height:1.7;">
      <strong style="color:${bullV > totalV*0.5 ? 'var(--green)' : 'var(--red)'};">
        ${bullV > totalV*0.5 ? '广场整体看多' : '广场整体看空或中性'}
      </strong> —
      ${(bullV/totalV*100).toFixed(0)}%的在线观众正在收看看多直播。
      ${bullStreamers.length > 0 ? `人气最高的看多主播：${bullStreamers.sort((a,b)=>b.viewers-a.viewers)[0]?.name}（${fmt(bullStreamers[0]?.viewers)}人在线）。` : ''}
      ${bearStreamers.length > 0 ? `看空主播代表：${bearStreamers.sort((a,b)=>b.viewers-a.viewers)[0]?.name}。` : ''}
    </div>`;

  body.innerHTML = html;
  document.getElementById('liveSentBadge').textContent = `${data.length}个直播间`;
}

function renderLiveTagCloud(data) {
  // 话题云按“观看人数”加权，字体越大表示话题越热。
  const tagCloud = document.getElementById('liveTagCloud');
  const liveInsight = document.getElementById('liveInsight');
  if (!tagCloud) return;

  const tagData = {};
  data.forEach(s => {
    s.tags.forEach(t => {
      tagData[t] = tagData[t] || { count:0, viewers:0, bullish:0 };
      tagData[t].count++;
      tagData[t].viewers += s.viewers;
      if (s.sentiment > 60) tagData[t].bullish++;
    });
  });

  const sorted = Object.entries(tagData).sort((a,b) => b[1].viewers - a[1].viewers);
  const maxV   = sorted[0]?.[1].viewers || 1;

  const html = sorted.slice(0, 18).map(([tag, info]) => {
    const size  = Math.round(9 + (info.viewers / maxV) * 8);
    const bull  = info.count > 0 ? info.bullish / info.count : 0.5;
    const style = bull > 0.6
      ? 'background:var(--green-dim);color:var(--green);border-color:rgba(0,217,126,0.3)'
      : bull < 0.4
      ? 'background:var(--red-dim);color:var(--red);border-color:rgba(240,56,74,0.3)'
      : 'background:rgba(255,255,255,0.04);color:var(--text-dim);border-color:var(--border2)';
    return `<span style="padding:4px 10px;border-radius:10px;font-family:var(--mono);font-size:${size}px;border:1px solid;${style};cursor:default;" title="${fmt(info.viewers)}人观看">
      #${tag} <span style="font-size:9px;opacity:0.7">${fmt(info.viewers)}</span>
    </span>`;
  }).join('');

  tagCloud.innerHTML = html;

  const topTag = sorted[0]?.[0] || 'BTC';
  const topSent = sorted[0]?.[1];
  const topBull = topSent ? topSent.bullish / topSent.count * 100 : 50;
  liveInsight.textContent =
    `当前广场最热话题是 #${topTag}，聚集 ${fmt(sorted[0]?.[1].viewers||0)} 名观众。` +
    `${topBull > 60 ? `广场主播普遍对 #${topTag} 持看多观点（${topBull.toFixed(0)}%看多）` : topBull < 40 ? `广场主播对 #${topTag} 整体偏空` : '多空观点分歧'}`+
    `。弹幕最活跃的话题：${sorted.slice(0,3).map(([t])=>'#'+t).join('、')}。`;

  document.getElementById('liveTagBadge').textContent = `${sorted.length}个话题`;
}

function openBrief() {
  // 打开简报弹窗并锁定页面滚动，避免背景误滚。
  document.getElementById('briefModal').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeBrief() {
  // 关闭弹窗后恢复页面滚动。
  document.getElementById('briefModal').style.display = 'none';
  document.body.style.overflow = '';
}

function copyBrief() {
  // 复制的是纯文本版本，便于发到聊天工具或笔记系统。
  const content = document.getElementById('briefContent');
  const plainText = getBriefPlainText(_lastAnalysisData);
  navigator.clipboard.writeText(plainText).then(() => {
    const btn = document.getElementById('copyBriefBtn');
    btn.textContent = '✓ 已复制';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = '复制全文'; btn.style.color = ''; }, 2000);
  });
}

function getBriefPlainText(data) {
  // 纯文本简报：强调“可读 + 可粘贴 + 结构固定”。
  const { indicators, price, symbol, fgVal, frValue, lsRatio, closes } = data;
  const coin   = (symbol||'BTCUSDT').replace('USDT','');
  const allInd = Object.values(indicators||{});
  const bulls  = allInd.filter(v=>v.type==='bull').length;
  const bears  = allInd.filter(v=>v.type==='bear').length;
  const rsiV   = indicators?.rsi ? parseFloat(indicators.rsi.value) : 50;
  const change = data.ticker ? parseFloat(data.ticker.priceChangePercent||0) : 0;
  const now    = new Date().toLocaleString('zh-CN');

  return `【${coin}/USDT 市场简报】${now}

价格：$${fmtPrice(price)}（24H ${change>=0?'+':''}${change.toFixed(2)}%）
综合信号：利多${bulls}项 / 利空${bears}项 / 中性${allInd.length-bulls-bears}项

【趋势】
- 均线：${indicators?.ema?.type==='bull'?'多头排列 ▲':'空头排列 ▼'}
- EMA200：${indicators?.ema200?.type==='bull'?'价格在上方，长期偏多':'跌破，长期偏空'}
- MACD：${indicators?.macd?.type==='bull'?'金叉，动能转多':'死叉，动能转空'}

【动量】
- RSI：${rsiV.toFixed(0)}（${rsiV<30?'超卖':rsiV>70?'超买':'中性区间'}）
- KDJ：${indicators?.kdj?.type==='bull'?'金叉':'死叉'}
- Stoch RSI：${indicators?.stochrsi?.type==='bull'?'超卖反弹':'超买回调'}

【成交量】
- OBV：${indicators?.obv?.type==='bull'?'资金流入':'资金流出'}
- 量价：${indicators?.volume?.type==='bull'?'放量上涨':'放量下跌'}

【合约市场】
- 资金费率：${frValue?(parseFloat(frValue).toFixed(4)+'%'):'N/A'}
- 多空比：${lsRatio?lsRatio.toFixed(2):'N/A'}
- 恐惧贪婪：${fgVal||'--'}

【斐波那契】当前位于${(window._lastFibPct||50).toFixed(1)}%回调位
【维加斯通道】${indicators?.vegasTrend?.type==='bull'?'价格在通道上方（强势）':indicators?.vegasTrend?.type==='bear'?'价格在通道下方（弱势）':'通道内震荡'}

【综合结论】
${bulls > bears*1.3 ? '多头信号占优，市场动能偏强，可考虑做多方向。' : bears > bulls*1.3 ? '空头信号占优，市场承压，建议谨慎或观望。' : '多空信号分歧，建议等待方向明朗。'}

以上数据仅供参考，不构成投资建议。`;
}

function generateBrief(data) {
  // 生成可复制的图文简报（用于快速分享当前市场结论）。
  const { indicators, price, symbol, fgVal, frValue, lsRatio, closes } = data;
  const coin     = (symbol||'BTCUSDT').replace('USDT','');
  const allInd   = Object.values(indicators||{});
  const bulls    = allInd.filter(v=>v.type==='bull').length;
  const bears    = allInd.filter(v=>v.type==='bear').length;
  const neutral  = allInd.length - bulls - bears;
  const rsiV     = indicators?.rsi ? parseFloat(indicators.rsi.value) : 50;
  const change   = data.ticker ? parseFloat(data.ticker.priceChangePercent||0) : 0;
  const vol24h   = data.ticker ? parseFloat(data.ticker.quoteVolume||0) : 0;
  const now      = new Date();
  const tf       = window._lastInterval || '1h';
  const tfText   = { '15m':'15分钟', '1h':'1小时', '4h':'4小时', '1d':'日线' }[tf] || '1小时';
  const frNum    = frValue ? parseFloat(frValue) : 0;
  const fibPct   = window._lastFibPct || 50;

  // longScore 是“技术面偏向分”，用于映射 LONG/SHORT/WAIT 文案。
  const longScore = bulls / (bulls + bears || 1) * 100;
  let verdict = '', verdictColor = 'var(--amber)', verdictBg = 'rgba(245,166,35,0.08)';
  if (longScore >= 65)      { verdict = '强烈做多 LONG'; verdictColor = 'var(--green)';  verdictBg = 'rgba(0,217,126,0.08)'; }
  else if (longScore >= 55) { verdict = '偏多 LONG?';    verdictColor = 'var(--green)';  verdictBg = 'rgba(0,217,126,0.05)'; }
  else if (longScore <= 35) { verdict = '强烈做空 SHORT'; verdictColor = 'var(--red)';    verdictBg = 'rgba(240,56,74,0.08)'; }
  else if (longScore <= 45) { verdict = '偏空 SHORT?';   verdictColor = 'var(--red)';    verdictBg = 'rgba(240,56,74,0.05)'; }
  else                       { verdict = '观望 WAIT';     verdictColor = 'var(--amber)';  verdictBg = 'rgba(245,166,35,0.08)'; }

  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  document.getElementById('briefTimestamp').textContent = ts;

  // sections 分块拼装，最后统一写入 briefContent。
  const sections = [];

  sections.push(`
    <div style="background:${verdictBg};border:1px solid ${verdictColor}40;border-radius:var(--r);padding:16px 18px;margin-bottom:16px;text-align:center;">
      <div style="font-family:var(--mono);font-size:10px;color:var(--text-muted);letter-spacing:2px;margin-bottom:8px;">${coin}/USDT · ${tfText} · ${ts}</div>
      <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:${verdictColor};letter-spacing:2px;margin-bottom:6px;">${verdict}</div>
      <div style="font-size:13px;color:var(--text-dim);">综合信号 <span style="color:var(--green)">${bulls}利多</span> / <span style="color:var(--red)">${bears}利空</span> / <span style="color:var(--text-muted)">${neutral}中性</span></div>
    </div>`);

  sections.push(`
    <div class="brief-section">
      <div class="brief-section-title">行情速览</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
        <div style="text-align:center;"><div style="font-family:var(--mono);font-size:16px;font-weight:700;color:${change>=0?'var(--green)':'var(--red)'};">$${fmtPrice(price)}</div><div style="font-size:10px;color:var(--text-muted)">当前价格</div></div>
        <div style="text-align:center;"><div style="font-family:var(--mono);font-size:14px;font-weight:700;color:${change>=0?'var(--green)':'var(--red)'};">${change>=0?'+':''}${change.toFixed(2)}%</div><div style="font-size:10px;color:var(--text-muted)">24H涨跌</div></div>
        <div style="text-align:center;"><div style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--blue);">$${fmt(vol24h)}</div><div style="font-size:10px;color:var(--text-muted)">24H成交量</div></div>
      </div>
    </div>`);

  // 关键指标清单：只挑“读者最关心”的代表项进入简报。
  const indRows = [
    ['MACD',      indicators?.macd,    'MACD金叉',    'MACD死叉'],
    ['EMA均线',   indicators?.ema,     '多头排列',    '空头排列'],
    ['EMA200',    indicators?.ema200,  '长期多头支撑', '跌破长期均线'],
    ['RSI',       indicators?.rsi,     `超卖(${rsiV.toFixed(0)})`, `超买(${rsiV.toFixed(0)})`],
    ['KDJ',       indicators?.kdj,     'KDJ金叉',     'KDJ死叉'],
    ['布林带',    indicators?.boll,    '下轨支撑',    '上轨压力'],
    ['OBV',       indicators?.obv,     '资金流入',    '资金流出'],
    ['成交量',    indicators?.volume,  '放量上涨',    '放量下跌'],
    ['一目云',    indicators?.ichimoku,'云层上方',    '云层下方'],
    ['ADX',       indicators?.adx,     '趋势强劲多头','趋势强劲空头'],
    ['维加斯通道',indicators?.vegasTrend,'通道上方',  '通道下方'],
  ].filter(r => r[1]);

  const indHtml = indRows.map(([name, ind, bullLabel, bearLabel]) => {
    const color = ind.type==='bull' ? 'var(--green)' : ind.type==='bear' ? 'var(--red)' : 'var(--text-muted)';
    const icon  = ind.type==='bull' ? '▲' : ind.type==='bear' ? '▼' : '→';
    const label = ind.type==='bull' ? bullLabel : ind.type==='bear' ? bearLabel : '中性';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">
      <span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);width:70px;flex-shrink:0;">${name}</span>
      <span style="font-size:10px;color:${color};flex:1;">${icon} ${label}</span>
      <span class="brief-tag" style="background:${ind.type==='bull'?'rgba(0,217,126,0.1)':ind.type==='bear'?'rgba(240,56,74,0.1)':'rgba(255,255,255,0.04)'};color:${color};border:1px solid ${color}40;">${ind.type==='bull'?'利多':ind.type==='bear'?'利空':'中性'}</span>
    </div>`;
  }).join('');

  sections.push(`
    <div class="brief-section">
      <div class="brief-section-title">技术指标 (${indRows.filter(r=>r[1]?.type==='bull').length}多/${indRows.filter(r=>r[1]?.type==='bear').length}空)</div>
      ${indHtml}
    </div>`);

  sections.push(`
    <div class="brief-section">
      <div class="brief-section-title">合约市场</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="padding:8px 10px;background:var(--bg3);border-radius:5px;">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px;">资金费率</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${frNum>0.1?'var(--red)':frNum<-0.05?'var(--green)':'var(--text)'};">${frNum.toFixed(4)}%</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${frNum>0.1?'偏高，多头付费':frNum<-0.05?'为负，空头付费':'正常范围'}</div>
        </div>
        <div style="padding:8px 10px;background:var(--bg3);border-radius:5px;">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px;">恐惧贪婪指数</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${fgVal&&parseInt(fgVal)<30?'var(--green)':fgVal&&parseInt(fgVal)>70?'var(--red)':'var(--amber)'};">${fgVal||'--'}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${fgVal?(parseInt(fgVal)<25?'极度恐惧':parseInt(fgVal)<40?'恐惧':parseInt(fgVal)<60?'中性':parseInt(fgVal)<75?'贪婪':'极度贪婪'):'--'}</div>
        </div>
        <div style="padding:8px 10px;background:var(--bg3);border-radius:5px;">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px;">多空比</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${lsRatio&&lsRatio>1.2?'var(--green)':lsRatio&&lsRatio<0.8?'var(--red)':'var(--text)'};">${lsRatio?lsRatio.toFixed(3):'N/A'}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${lsRatio?(lsRatio>1.2?'多头偏强':lsRatio<0.8?'空头偏强':'均衡'):'--'}</div>
        </div>
        <div style="padding:8px 10px;background:var(--bg3);border-radius:5px;">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px;">斐波那契位置</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${fibPct<38.2?'var(--green)':fibPct>61.8?'var(--red)':'var(--amber)'};">${fibPct.toFixed(1)}%</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${fibPct<38.2?'支撑区':fibPct>61.8?'压力区':'黄金区间'}</div>
        </div>
      </div>
    </div>`);

  // 结论段采用模板化规则，保证风格稳定、可快速对比。
  let conclusion = '';
  if (longScore >= 65) {
    conclusion = `多维度技术指标共振看多（${bulls}项利多 vs ${bears}项利空）。${indicators?.ema200?.type==='bull'?'EMA200长期支撑有效，':''}${rsiV<50?`RSI(${rsiV.toFixed(0)})未超买，上行空间充足，`:''}${indicators?.macd?.type==='bull'?'MACD金叉确认，':''}建议顺势轻仓做多，在关键支撑位设置止损。`;
  } else if (longScore <= 35) {
    conclusion = `空头信号占主导（${bears}项利空 vs ${bulls}项利多）。${indicators?.ema200?.type==='bear'?'跌破EMA200，长期趋势转弱，':''}${rsiV>50?`RSI(${rsiV.toFixed(0)})尚未超卖，下行空间仍存，`:''}建议谨慎，可轻仓做空或观望。`;
  } else {
    conclusion = `多空信号分歧（${bulls}多/${bears}空/${neutral}中性），市场处于震荡整理阶段。建议等待方向性突破信号出现后再入场，不建议重仓操作。`;
  }
  conclusion += ` 当前资金费率${frNum.toFixed(4)}%${frNum>0.1?'，多头拥挤需警惕':frNum<-0.05?'，空头拥挤轧空概率增加':'，合约成本正常'}。`;

  sections.push(`
    <div style="background:${verdictBg};border:1px solid ${verdictColor}40;border-radius:var(--r);padding:14px 16px;">
      <div style="font-family:var(--mono);font-size:10px;color:${verdictColor};letter-spacing:2px;margin-bottom:8px;">▸ 综合结论</div>
      <div style="font-size:13px;color:var(--text);line-height:1.8;">${conclusion}</div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;">
        ⚠ 以上分析仅供参考，不构成投资建议。加密货币市场波动剧烈，请控制仓位，设置止损。
      </div>
    </div>`);

  document.getElementById('briefContent').innerHTML = sections.join('');
}


function renderNewsSentiment(news, coin) {
  // 新闻情绪：关键词 + 投票混合判定，输出利多/利空占比与结论。
  if (!news || news.length === 0) {
    document.getElementById('newsListContainer').innerHTML =
      '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无消息数据</div>';
    document.getElementById('newsSentBadge').textContent = '无数据';
    document.getElementById('newsSentBadge').className = 'panel-badge badge-amber';
    return;
  }

  // 关键词表是启发式词典，可按项目需要逐步扩充。
  const bullKw = ['surge','rally','bull','breakout','soar','gain','high','up','rise','positive','adopt','approve','launch','partnership','buy','long','green','support','growth','record'];
  const bearKw = ['crash','dump','bear','drop','fall','low','down','decline','negative','ban','hack','scam','sell','short','red','risk','fear','loss','liquidat','warning'];

  let bulls = 0, bears = 0, neutrals = 0;
  // 只分析前 15 条，兼顾实时性与性能。
  const analyzed = news.slice(0, 15).map(item => {
    const title = (item.title || '').toLowerCase();
    const pos = item.votes?.positive || 0;
    const neg = item.votes?.negative || 0;
    let sent = 'neutral';
    // 判定优先级：外部已给情绪 > 投票差 > 关键词匹配。
    if (item._sentiment) {
      sent = item._sentiment;
    } else if (pos > neg + 2) {
      sent = 'bull';
    } else if (neg > pos + 2) {
      sent = 'bear';
    } else {
      const bScore = bullKw.filter(k => title.includes(k)).length;
      const nScore = bearKw.filter(k => title.includes(k)).length;
      if (bScore > nScore) sent = 'bull';
      else if (nScore > bScore) sent = 'bear';
    }
    if (sent === 'bull') bulls++;
    else if (sent === 'bear') bears++;
    else neutrals++;
    return { ...item, _sent: sent };
  });

  const total = bulls + bears + neutrals || 1;
  const bullPct = Math.round(bulls / total * 100);
  const bearPct = Math.round(bears / total * 100);
  const neutPct = 100 - bullPct - bearPct;
  // score>0 偏多，<0 偏空，用于生成总标签。
  const score = bullPct - bearPct;

  let sentColor = 'var(--gold)';
  let sentLabel = '中性';
  let sentClass = 'badge-amber';
  let conclusion = '';
  if (score >= 30)       { sentColor = 'var(--green)'; sentLabel = '消息偏多'; sentClass = 'badge-green'; conclusion = `近期消息面整体偏多，${bullPct}% 的新闻传递积极信号，市场情绪乐观。`; }
  else if (score >= 10)  { sentColor = 'var(--green)'; sentLabel = '略偏多';   sentClass = 'badge-green'; conclusion = `消息面略偏积极，多空消息并存，以多头情绪为主。`; }
  else if (score <= -30) { sentColor = 'var(--red)';   sentLabel = '消息偏空'; sentClass = 'badge-red';   conclusion = `近期消息面整体偏空，${bearPct}% 的新闻传递负面信号，情绪谨慎。`; }
  else if (score <= -10) { sentColor = 'var(--red)';   sentLabel = '略偏空';   sentClass = 'badge-red';   conclusion = `消息面略偏消极，需关注负面信号是否持续发酵。`; }
  else                   { conclusion = `消息面多空均衡，市场情绪相对中性，暂无明显方向性信号。`; }

  const scoreEl = document.getElementById('newsSentScore');
  if (scoreEl) { scoreEl.textContent = score > 0 ? '+' + score : score; scoreEl.style.color = sentColor; }

  const bullBar = document.getElementById('newsBullBar');
  const neutBar = document.getElementById('newsNeutBar');
  const bearBar = document.getElementById('newsBearBar');
  if (bullBar) bullBar.style.width = bullPct + '%';
  if (neutBar) neutBar.style.width = neutPct + '%';
  if (bearBar) bearBar.style.width = bearPct + '%';

  const bullPctEl = document.getElementById('newsBullPct');
  const neutPctEl = document.getElementById('newsNeutPct');
  const bearPctEl = document.getElementById('newsBearPct');
  if (bullPctEl) bullPctEl.textContent = `利多 ${bullPct}%`;
  if (neutPctEl) neutPctEl.textContent = `中性 ${neutPct}%`;
  if (bearPctEl) bearPctEl.textContent = `利空 ${bearPct}%`;

  const conclusionEl = document.getElementById('newsSentConclusion');
  if (conclusionEl) { conclusionEl.textContent = conclusion; conclusionEl.style.color = sentColor; }

  const badge = document.getElementById('newsSentBadge');
  if (badge) { badge.textContent = sentLabel; badge.className = 'panel-badge ' + sentClass; }
  const listEl = document.getElementById('newsListContainer');
  if (!listEl) return;
  listEl.innerHTML = analyzed.map(item => {
    const sc = item._sent === 'bull' ? 'var(--green)' : item._sent === 'bear' ? 'var(--red)' : 'var(--text-muted)';
    const icon = item._sent === 'bull' ? '▲' : item._sent === 'bear' ? '▼' : '→';
    const src = item.source?.title || item.source?.domain || '未知来源';
    const time = item.published_at ? new Date(item.published_at).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    return `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="color:${sc};font-size:12px;font-weight:700;flex-shrink:0;margin-top:2px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:var(--text);line-height:1.5;margin-bottom:3px;">${item.title}</div>
        <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono);">${src} · ${time}</div>
      </div>
    </div>`;
  }).join('');
}
