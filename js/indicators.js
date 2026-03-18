// ── indicators ──────────────────────────────────────────────────────────────────

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i-1] * (1 - k));
  }
  return ema;
}

function calcSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine.slice(25), 9);
  const fullSignal = [...new Array(25).fill(null), ...signal];
  const histogram = macdLine.map((v, i) => fullSignal[i] !== null ? v - fullSignal[i] : null);
  return { macdLine, signal: fullSignal, histogram };
}

function calcRSI(closes, period=14) {
  let gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a,b)=>a+b,0)/period;
  let avgLoss = losses.slice(0, period).reduce((a,b)=>a+b,0)/period;
  let rsis = [];
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period-1) + gains[i]) / period;
    avgLoss = (avgLoss * (period-1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsis.push(100 - (100 / (1 + rs)));
  }
  return rsis;
}

function calcKDJ(highs, lows, closes, period=9) {
  const len = closes.length;
  let K = 50, D = 50;
  let results = [];
  for (let i = period - 1; i < len; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice  = lows.slice(i - period + 1, i + 1);
    const highest = Math.max(...highSlice);
    const lowest  = Math.min(...lowSlice);
    const rsv = highest === lowest ? 50 : (closes[i] - lowest) / (highest - lowest) * 100;
    K = (2/3) * K + (1/3) * rsv;
    D = (2/3) * D + (1/3) * K;
    const J = 3 * K - 2 * D;
    results.push({ K, D, J });
  }
  return results;
}

function calcBollinger(closes, period=20, mult=2) {
  const sma = calcSMA(closes, period);
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: null, mid: null, lower: null, bw: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean)**2, 0) / period);
    const upper = mean + mult * std;
    const lower = mean - mult * std;
    return { upper, mid: mean, lower, bw: (upper - lower) / mean * 100 };
  });
}

function calcOBV(closes, volumes) {
  let obv = 0;
  const obvArr = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i-1]) obv += volumes[i];
    else if (closes[i] < closes[i-1]) obv -= volumes[i];
    obvArr.push(obv);
  }
  return obvArr;
}

function calcCMF(highs, lows, closes, volumes, period=20) {
  const mfv = closes.map((c, i) => {
    const hl = highs[i] - lows[i];
    if (hl === 0) return 0;
    return ((c - lows[i]) - (highs[i] - c)) / hl * volumes[i];
  });
  const cmf = mfv.map((_, i) => {
    if (i < period - 1) return null;
    const mfvSum = mfv.slice(i - period + 1, i + 1).reduce((a,b)=>a+b,0);
    const volSum = volumes.slice(i - period + 1, i + 1).reduce((a,b)=>a+b,0);
    return volSum === 0 ? 0 : mfvSum / volSum;
  });
  return cmf;
}

function calcATR(highs, lows, closes, period=14) {
  const tr = closes.map((c, i) => {
    if (i === 0) return highs[i] - lows[i];
    const prev = closes[i-1];
    return Math.max(highs[i] - lows[i], Math.abs(highs[i] - prev), Math.abs(lows[i] - prev));
  });
  const atrArr = [];
  let atr = tr.slice(0, period).reduce((a,b)=>a+b,0)/period;
  atrArr.push(atr);
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period-1) + tr[i]) / period;
    atrArr.push(atr);
  }
  return { atr: atrArr[atrArr.length-1], atrArr };
}

function calcStochRSI(closes, rsiPeriod=14, stochPeriod=14, kPeriod=3, dPeriod=3) {
  const rsis = calcRSI(closes, rsiPeriod);
  const stochK = rsis.map((_, i) => {
    if (i < stochPeriod - 1) return null;
    const slice = rsis.slice(i - stochPeriod + 1, i + 1);
    const highest = Math.max(...slice);
    const lowest  = Math.min(...slice);
    return highest === lowest ? 50 : (rsis[i] - lowest) / (highest - lowest) * 100;
  }).filter(v => v !== null);
  const k = calcSMA(stochK, kPeriod);
  const d = calcSMA(k.filter(v=>v!==null), dPeriod);
  return { k: k[k.length-1], d: d[d.length-1] };
}

function calcWilliamsR(highs, lows, closes, period=14) {
  const last = closes.length - 1;
  const hh = Math.max(...highs.slice(last - period + 1, last + 1));
  const ll  = Math.min(...lows.slice(last - period + 1, last + 1));
  return ((hh - closes[last]) / (hh - ll)) * -100;
}

function calcCCI(highs, lows, closes, period=20) {
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const smaTP = calcSMA(tp, period);
  const last = tp.length - 1;
  const meanDev = tp.slice(last - period + 1, last + 1).reduce((s,v) => s + Math.abs(v - smaTP[last]), 0) / period;
  return meanDev === 0 ? 0 : (tp[last] - smaTP[last]) / (0.015 * meanDev);
}

function calcVWAP(highs, lows, closes, volumes) {
  let cumTPV = 0, cumVol = 0;
  return closes.map((c, i) => {
    const tp = (highs[i] + lows[i] + c) / 3;
    cumTPV += tp * volumes[i];
    cumVol += volumes[i];
    return cumVol === 0 ? c : cumTPV / cumVol;
  });
}

function calcVolumeSMA(volumes, period=20) {
  return calcSMA(volumes, period);
}

function calcIchimoku(highs, lows, closes) {
  const len = closes.length;
  const high9  = (i) => Math.max(...highs.slice(Math.max(0,i-8), i+1));
  const low9   = (i) => Math.min(...lows.slice(Math.max(0,i-8), i+1));
  const high26 = (i) => Math.max(...highs.slice(Math.max(0,i-25), i+1));
  const low26  = (i) => Math.min(...lows.slice(Math.max(0,i-25), i+1));
  const high52 = (i) => Math.max(...highs.slice(Math.max(0,i-51), i+1));
  const low52  = (i) => Math.min(...lows.slice(Math.max(0,i-51), i+1));
  const last = len - 1;
  const tenkan  = (high9(last)  + low9(last))  / 2;
  const kijun   = (high26(last) + low26(last)) / 2;
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = (high52(last) + low52(last)) / 2;
  const chikou  = closes[last];
  const price   = closes[last];
  return { tenkan, kijun, senkouA, senkouB, chikou, price };
}

function calcADX(highs, lows, closes, period=14) {
  const len = closes.length;
  let trArr=[], plusDM=[], minusDM=[];
  for (let i=1;i<len;i++) {
    const hl = highs[i]-lows[i];
    const hpc= Math.abs(highs[i]-closes[i-1]);
    const lpc= Math.abs(lows[i]-closes[i-1]);
    trArr.push(Math.max(hl,hpc,lpc));
    const up = highs[i]-highs[i-1];
    const dn = lows[i-1]-lows[i];
    plusDM.push(up>dn && up>0 ? up : 0);
    minusDM.push(dn>up && dn>0 ? dn : 0);
  }
  // Wilder smoothing
  let atr14=trArr.slice(0,period).reduce((a,b)=>a+b,0);
  let p14=plusDM.slice(0,period).reduce((a,b)=>a+b,0);
  let m14=minusDM.slice(0,period).reduce((a,b)=>a+b,0);
  let adxArr=[];
  let dx0 = atr14===0?0:Math.abs((p14/atr14)-(m14/atr14))/((p14/atr14)+(m14/atr14))*100;
  adxArr.push(dx0);
  for(let i=period;i<trArr.length;i++){
    atr14=atr14-atr14/period+trArr[i];
    p14=p14-p14/period+plusDM[i];
    m14=m14-m14/period+minusDM[i];
    const pdi=atr14===0?0:p14/atr14*100;
    const mdi=atr14===0?0:m14/atr14*100;
    const dx=pdi+mdi===0?0:Math.abs(pdi-mdi)/(pdi+mdi)*100;
    adxArr.push(dx);
  }
  // ADX = 14-period Wilder MA of DX
  let adx=adxArr.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<adxArr.length;i++) adx=(adx*(period-1)+adxArr[i])/period;
  const lastIdx=trArr.length-1;
  const atrF=atr14; const p14F=p14; const m14F=m14;
  const pdi=atrF===0?0:p14F/atrF*100;
  const mdi=atrF===0?0:m14F/atrF*100;
  return { adx, pdi, mdi };
}

function calcMFI(highs, lows, closes, volumes, period=14) {
  const tp = closes.map((c,i)=>(highs[i]+lows[i]+c)/3);
  let posFlow=0, negFlow=0;
  for(let i=closes.length-period; i<closes.length; i++){
    const mf = tp[i]*volumes[i];
    if(tp[i]>tp[i-1]) posFlow+=mf; else negFlow+=mf;
  }
  return negFlow===0 ? 100 : 100-(100/(1+posFlow/negFlow));
}

function calcROC(closes, period=12) {
  const last = closes.length-1;
  return closes[last-period]===0?0:(closes[last]-closes[last-period])/closes[last-period]*100;
}

function calcFibonacci(highs, lows, closes, lookback=100) {
  const last = closes.length-1;
  const start = Math.max(0, last-lookback);
  const sliceH = highs.slice(start, last+1);
  const sliceL = lows.slice(start, last+1);
  const swingHigh = Math.max(...sliceH);
  const swingLow  = Math.min(...sliceL);
  const range = swingHigh - swingLow;
  const price = closes[last];
  const levels = {
    '0.0':   swingLow,
    '23.6':  swingLow + range * 0.236,
    '38.2':  swingLow + range * 0.382,
    '50.0':  swingLow + range * 0.500,
    '61.8':  swingLow + range * 0.618,
    '78.6':  swingLow + range * 0.786,
    '100.0': swingHigh,
    '127.2': swingLow + range * 1.272,
    '161.8': swingLow + range * 1.618,
  };
  const pct = (price - swingLow) / range * 100;
  // Find nearest levels
  const levelArr = [0, 23.6, 38.2, 50, 61.8, 78.6, 100];
  let nearestBelow = 0, nearestAbove = 100;
  for(const lv of levelArr) {
    if(lv <= pct) nearestBelow = lv;
    if(lv >= pct && lv < nearestAbove) nearestAbove = lv;
  }
  return { levels, swingHigh, swingLow, price, pct, nearestBelow, nearestAbove, range };
}

function calcVegasTunnel(closes) {
  const ema144 = calcEMA(closes, 144);
  const ema169 = calcEMA(closes, 169);
  const ema12  = calcEMA(closes, 12);
  const ema144v = calcEMA(closes, 144);
  const last = closes.length-1;
  const price = closes[last];
  const upper = ema169[last];
  const lower = ema144[last];
  const mid   = (upper+lower)/2;
  const e12   = ema12[last];
  // Tunnel width as % of price
  const tunnelWidth = Math.abs(upper-lower)/mid*100;
  return { ema144: ema144[last], ema169: ema169[last], ema12: e12, price, upper: Math.max(upper,lower), lower: Math.min(upper,lower), mid, tunnelWidth };
}

function calcElliottWave(closes, highs, lows) {
  const len = closes.length;
  // Find significant swing points using a simple ZigZag approach
  const threshold = 0.03; // 3% swing
  const swings = [];
  let lastSwingPrice = closes[0];
  let lastSwingIdx = 0;
  let direction = 0; // 0=unknown, 1=up, -1=down
  for(let i=5; i<len; i++) {
    const chg = (closes[i]-lastSwingPrice)/lastSwingPrice;
    if(direction === 0) {
      if(Math.abs(chg) > threshold) { direction = chg>0?1:-1; }
    } else if(direction === 1 && chg < -threshold) {
      swings.push({ idx: lastSwingIdx, price: lastSwingPrice, type:'high' });
      direction=-1; lastSwingPrice=closes[i]; lastSwingIdx=i;
    } else if(direction === -1 && chg > threshold) {
      swings.push({ idx: lastSwingIdx, price: lastSwingPrice, type:'low' });
      direction=1; lastSwingPrice=closes[i]; lastSwingIdx=i;
    } else {
      if(direction===1 && closes[i]>lastSwingPrice) { lastSwingPrice=closes[i]; lastSwingIdx=i; }
      if(direction===-1 && closes[i]<lastSwingPrice) { lastSwingPrice=closes[i]; lastSwingIdx=i; }
    }
  }
  swings.push({ idx: len-1, price: closes[len-1], type: direction===1?'high':'low' });

  const price = closes[len-1];
  // Try to identify wave position from last 5 swings
  if(swings.length < 5) return { wave: '?', phase: 'neutral', desc: '数据不足，无法识别波浪', confidence: 'low' };

  const last5 = swings.slice(-5);
  const prices = last5.map(s=>s.price);

  // Impulse wave check (推动浪): alternating low-high-low-high-low or high-low-high-low-high
  // Check uptrend impulse: lows ascending, highs ascending
  const isUpImpulse = last5[0].price < last5[2].price && last5[2].price < last5[4].price &&
                      last5[1].price < last5[3].price;
  const isDownImpulse = last5[0].price > last5[2].price && last5[2].price > last5[4].price &&
                        last5[1].price > last5[3].price;

  const lastSwing = last5[last5.length-1];
  const secondLast = last5[last5.length-2];
  const momentum = (price - secondLast.price) / secondLast.price * 100;

  let wave = '?', phase = 'neutral', desc = '', confidence = 'medium';

  if(isUpImpulse) {
    // In uptrend, determine current wave
    if(lastSwing.type === 'low') {
      // Just finished a corrective wave, likely at wave 4 or about to start wave 5
      wave = '⑤波推进中'; phase = 'bull';
      desc = `上涨推动浪结构完整（①②③④已确认），当前可能处于第⑤浪推升阶段。第⑤浪目标：${fmtPrice(last5[3].price + (last5[3].price - last5[2].price))}`;
      confidence = 'medium';
    } else {
      // At a high, might be wave 3 or 5 top
      const wave3Height = last5[3].price - last5[2].price;
      const wave1Height = last5[1].price - last5[0].price;
      if(wave3Height > wave1Height * 1.618) {
        wave = '③浪顶部'; phase = 'neutral';
        desc = `可能处于第③浪顶部，注意④浪调整（幅度约38.2%-61.8%）。调整目标参考：${fmtPrice(lastSwing.price * 0.9)}附近`;
        confidence = 'medium';
      } else {
        wave = '①③浪中'; phase = 'bull';
        desc = `上涨推动浪进行中，浪幅比例符合推动浪规则，趋势延续信号强。`;
        confidence = 'medium';
      }
    }
  } else if(isDownImpulse) {
    if(lastSwing.type === 'high') {
      wave = '⑤空头浪'; phase = 'bear';
      desc = `下跌推动浪结构完整，当前处于第⑤浪下跌阶段，注意底部反弹。底部支撑参考：${fmtPrice(last5[last5.length-1].price * 0.95)}`;
      confidence = 'medium';
    } else {
      wave = '空头③浪'; phase = 'bear';
      desc = `下跌推动浪进行中，空头结构完整，第③浪往往是跌幅最大的一浪。`;
      confidence = 'medium';
    }
  } else {
    // ABC correction
    const isABC = swings.length >= 3;
    if(isABC) {
      const netMove = price - last5[0].price;
      if(Math.abs(netMove) / last5[0].price < 0.05) {
        wave = 'ABC调整'; phase = 'neutral';
        desc = `价格处于ABC三浪调整结构中，等待调整结束后的方向性突破。`;
        confidence = 'low';
      } else if(momentum > 2) {
        wave = 'B浪反弹'; phase = 'neutral';
        desc = `可能处于B浪反弹阶段，注意该反弹不可持续，警惕C浪下跌。`;
        confidence = 'low';
      } else {
        wave = 'C浪下跌'; phase = 'bear';
        desc = `可能处于C浪下跌阶段，C浪通常与A浪等长。注意寻找支撑后的反转机会。`;
        confidence = 'low';
      }
    }
  }

  return { wave, phase, desc, confidence, swingCount: swings.length, lastSwing, momentum };
}

function signalMeta(type, value, desc) {
  // type: 'bull' | 'bear' | 'neutral'
  return { type, value, desc };
}

function analyzeAll(klines) {
  if (!klines || klines.length < 5) throw new Error('该币种刚上线，暂无足够K线数据，请稍后再试');
  const opens   = klines.map(k => parseFloat(k[1]));
  const highs   = klines.map(k => parseFloat(k[2]));
  const lows    = klines.map(k => parseFloat(k[3]));
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const last = closes.length - 1;
  const price = closes[last];

  const indicators = {};

  // ─ MACD ─
  const { macdLine, signal, histogram } = calcMACD(closes);
  const macdVal = macdLine[last];
  const sigVal = signal[last];
  const histVal = histogram[last];
  const histPrev = histogram[last-1];
  let macdType = 'neutral';
  let macdDesc = `MACD ${fmt(macdVal,4)} / Signal ${fmt(sigVal,4)}`;
  if (macdVal > sigVal && histVal > histPrev) macdType = 'bull';
  else if (macdVal < sigVal && histVal < histPrev) macdType = 'bear';
  indicators.macd = { ...signalMeta(macdType, fmt(macdVal,4), macdDesc), bar: macdType==='bull'?75:macdType==='bear'?25:50, group:'trend' };

  // ─ EMA Cross ─
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, Math.min(200, closes.length));
  const e20 = ema20[last], e50 = ema50[last], e200 = ema200[last];
  let emaType = 'neutral', emaBar = 50;
  let emaDesc = `EMA20:${fmtPrice(e20)} / EMA50:${fmtPrice(e50)}`;
  if (price > e20 && e20 > e50 && e50 > e200) { emaType = 'bull'; emaBar = 80; emaDesc = '多头排列'; }
  else if (price < e20 && e20 < e50 && e50 < e200) { emaType = 'bear'; emaBar = 20; emaDesc = '空头排列'; }
  else if (price > e50) { emaType = 'bull'; emaBar = 65; emaDesc = `价格在EMA50上方`; }
  else { emaType = 'bear'; emaBar = 35; emaDesc = `价格在EMA50下方`; }
  indicators.ema = { ...signalMeta(emaType, `${fmtPrice(e20)}`, emaDesc), bar: emaBar, group:'trend' };

  // ─ EMA200 (Golden/Death Cross) ─
  const e200Prev = ema200[last-1] || e200, e50Prev = ema50[last-1] || e50;
  let crossType = 'neutral', crossBar = 50, crossDesc = `EMA200: ${fmtPrice(e200)}`;
  if (price > e200) { crossType = 'bull'; crossBar = 70; crossDesc = `价格上方黄金区域`; }
  else { crossType = 'bear'; crossBar = 30; crossDesc = `价格跌破200均线`; }
  indicators.ema200 = { ...signalMeta(crossType, fmtPrice(e200), crossDesc), bar: crossBar, group:'trend' };

  // ─ Bollinger Bands ─
  const boll = calcBollinger(closes, Math.min(20, closes.length));
  const bollLast = boll[last];
  let bollType = 'neutral', bollBar = 50, bollDesc = '数据不足';
  let bw = 0;
  if (bollLast && bollLast.upper != null) {
    const { upper, mid, lower } = bollLast;
    bw = bollLast.bw || 0;
    const pct = (price - lower) / (upper - lower);
    if (pct > 0.85) { bollType = 'bear'; bollBar = 25; bollDesc = '价格触碰上轨，超买'; }
    else if (pct < 0.15) { bollType = 'bull'; bollBar = 75; bollDesc = '价格触碰下轨，超卖'; }
    else if (pct > 0.5) { bollType = 'bull'; bollBar = 60; bollDesc = `BB%B: ${(pct*100).toFixed(0)}%`; }
    else { bollType = 'bear'; bollBar = 40; bollDesc = `BB%B: ${(pct*100).toFixed(0)}%`; }
    indicators.boll = { ...signalMeta(bollType, `${(pct*100).toFixed(0)}%`, bollDesc), bar: bollBar, group:'trend' };
  } else {
    indicators.boll = { ...signalMeta('neutral', 'N/A', '数据不足'), bar: 50, group:'trend' };
  }

  // ─ RSI ─
  const rsis = calcRSI(closes);
  const rsi = rsis[rsis.length-1];
  const rsiPrev = rsis[rsis.length-2];
  let rsiType = 'neutral', rsiBar = 50, rsiDesc = `RSI: ${rsi.toFixed(1)}`;
  if (rsi < 30) { rsiType = 'bull'; rsiBar = 80; rsiDesc = `超卖区间 (${rsi.toFixed(1)})`; }
  else if (rsi > 70) { rsiType = 'bear'; rsiBar = 20; rsiDesc = `超买区间 (${rsi.toFixed(1)})`; }
  else if (rsi < 50 && rsi > rsiPrev) { rsiType = 'bull'; rsiBar = 60; rsiDesc = `由下向上穿越50`; }
  else if (rsi > 50 && rsi < rsiPrev) { rsiType = 'bear'; rsiBar = 40; rsiDesc = `由上向下穿越50`; }
  else if (rsi > 50) { rsiType = 'bull'; rsiBar = 62; rsiDesc = `强势区间`; }
  else { rsiType = 'bear'; rsiBar = 38; rsiDesc = `弱势区间`; }
  indicators.rsi = { ...signalMeta(rsiType, rsi.toFixed(1), rsiDesc), bar: Math.min(100, Math.max(0, rsi)), group:'momentum' };

  // ─ KDJ ─
  const kdjArr = calcKDJ(highs, lows, closes);
  const { K, D, J } = kdjArr[kdjArr.length-1];
  const kdjPrev = kdjArr[kdjArr.length-2];
  let kdjType = 'neutral', kdjBar = 50, kdjDesc = `K:${K.toFixed(1)} D:${D.toFixed(1)} J:${J.toFixed(1)}`;
  if (K > D && kdjPrev.K <= kdjPrev.D && K < 80) { kdjType = 'bull'; kdjBar = 75; kdjDesc = `KDJ金叉`; }
  else if (K < D && kdjPrev.K >= kdjPrev.D && K > 20) { kdjType = 'bear'; kdjBar = 25; kdjDesc = `KDJ死叉`; }
  else if (J < 0) { kdjType = 'bull'; kdjBar = 82; kdjDesc = `J值超卖 (${J.toFixed(1)})`; }
  else if (J > 100) { kdjType = 'bear'; kdjBar = 18; kdjDesc = `J值超买 (${J.toFixed(1)})`; }
  else if (K > D) { kdjType = 'bull'; kdjBar = 60; kdjDesc = `K线在D线上方`; }
  else { kdjType = 'bear'; kdjBar = 40; kdjDesc = `K线在D线下方`; }
  indicators.kdj = { ...signalMeta(kdjType, `K${K.toFixed(0)}`, kdjDesc), bar: kdjBar, group:'momentum' };

  // ─ Stochastic RSI ─
  const { k: srsiK, d: srsiD } = calcStochRSI(closes);
  let srsiType = 'neutral', srsiBar = 50, srsiDesc = `StochRSI K:${srsiK?.toFixed(1)||'--'}`;
  if (srsiK !== null) {
    if (srsiK < 20) { srsiType = 'bull'; srsiBar = 78; srsiDesc = `超卖 (K:${srsiK.toFixed(1)})`; }
    else if (srsiK > 80) { srsiType = 'bear'; srsiBar = 22; srsiDesc = `超买 (K:${srsiK.toFixed(1)})`; }
    else if (srsiK > srsiD && srsiK < 50) { srsiType = 'bull'; srsiBar = 62; srsiDesc = `金叉上行`; }
    else if (srsiK < srsiD && srsiK > 50) { srsiType = 'bear'; srsiBar = 38; srsiDesc = `死叉下行`; }
    else { srsiBar = srsiK; }
  }
  indicators.stochrsi = { ...signalMeta(srsiType, srsiK?.toFixed(1)||'--', srsiDesc), bar: srsiBar, group:'momentum' };

  // ─ Williams %R ─
  const wr = calcWilliamsR(highs, lows, closes);
  let wrType = 'neutral', wrBar = 50, wrDesc = `WR: ${wr.toFixed(1)}`;
  if (wr < -80) { wrType = 'bull'; wrBar = 80; wrDesc = `超卖区间 (${wr.toFixed(1)})`; }
  else if (wr > -20) { wrType = 'bear'; wrBar = 20; wrDesc = `超买区间 (${wr.toFixed(1)})`; }
  else { wrBar = Math.abs(wr); wrDesc = `WR: ${wr.toFixed(1)}`; }
  indicators.williamsr = { ...signalMeta(wrType, wr.toFixed(1), wrDesc), bar: wrBar, group:'momentum' };

  // ─ CCI ─
  const cci = calcCCI(highs, lows, closes);
  let cciType = 'neutral', cciBar = 50, cciDesc = `CCI: ${cci.toFixed(0)}`;
  if (cci < -100) { cciType = 'bull'; cciBar = 75; cciDesc = `超卖 (${cci.toFixed(0)})`; }
  else if (cci > 100) { cciType = 'bear'; cciBar = 25; cciDesc = `超买 (${cci.toFixed(0)})`; }
  else if (cci > 0) { cciType = 'bull'; cciBar = 58; cciDesc = `正向区间`; }
  else { cciType = 'bear'; cciBar = 42; cciDesc = `负向区间`; }
  indicators.cci = { ...signalMeta(cciType, cci.toFixed(0), cciDesc), bar: cciBar, group:'momentum' };

  // ─ OBV ─
  const obv = calcOBV(closes, volumes);
  const obvSMA = calcSMA(obv, 20);
  const obvLast = obv[last];
  const obvSMALast = obvSMA[last];
  let obvType = 'neutral', obvBar = 50, obvDesc = `OBV vs MA20`;
  if (obvLast > obvSMALast * 1.02) { obvType = 'bull'; obvBar = 70; obvDesc = `OBV突破均线，资金流入`; }
  else if (obvLast < obvSMALast * 0.98) { obvType = 'bear'; obvBar = 30; obvDesc = `OBV跌破均线，资金流出`; }
  else { obvDesc = `OBV：${fmt(obvLast,0)}`; }
  indicators.obv = { ...signalMeta(obvType, fmt(obvLast,0), obvDesc), bar: obvBar, group:'volume' };

  // ─ Volume vs MA ─
  const volSMA20 = calcVolumeSMA(volumes, 20);
  const volRatio = volumes[last] / volSMA20[last];
  let volType = 'neutral', volBar = 50, volDesc = `成交量：${fmt(volumes[last],2)}`;
  if (volRatio > 1.5 && closes[last] > closes[last-1]) { volType = 'bull'; volBar = 78; volDesc = `放量上涨 (${(volRatio*100).toFixed(0)}%)`; }
  else if (volRatio > 1.5 && closes[last] < closes[last-1]) { volType = 'bear'; volBar = 22; volDesc = `放量下跌 (${(volRatio*100).toFixed(0)}%)`; }
  else if (volRatio < 0.6) { volDesc = `缩量震荡`; }
  else { volBar = Math.min(100, volRatio*50); }
  indicators.volume = { ...signalMeta(volType, `×${volRatio.toFixed(2)}`, volDesc), bar: volBar, group:'volume' };

  // ─ CMF ─
  const cmf = calcCMF(highs, lows, closes, volumes);
  const cmfLast = cmf[last];
  let cmfType = 'neutral', cmfBar = 50, cmfDesc = `CMF: ${cmfLast?.toFixed(3)||'--'}`;
  if (cmfLast !== null) {
    if (cmfLast > 0.1) { cmfType = 'bull'; cmfBar = 72; cmfDesc = `资金持续流入`; }
    else if (cmfLast < -0.1) { cmfType = 'bear'; cmfBar = 28; cmfDesc = `资金持续流出`; }
    else if (cmfLast > 0) { cmfType = 'bull'; cmfBar = 55; }
    else { cmfType = 'bear'; cmfBar = 45; }
  }
  indicators.cmf = { ...signalMeta(cmfType, cmfLast?.toFixed(3)||'--', cmfDesc), bar: cmfBar, group:'volume' };

  // ─ VWAP ─
  const vwap = calcVWAP(highs, lows, closes, volumes);
  const vwapLast = vwap[last];
  let vwapType = 'neutral', vwapBar = 50, vwapDesc = `VWAP: ${fmtPrice(vwapLast)}`;
  if (price > vwapLast * 1.01) { vwapType = 'bull'; vwapBar = 68; vwapDesc = `价格在VWAP上方`; }
  else if (price < vwapLast * 0.99) { vwapType = 'bear'; vwapBar = 32; vwapDesc = `价格在VWAP下方`; }
  indicators.vwap = { ...signalMeta(vwapType, fmtPrice(vwapLast), vwapDesc), bar: vwapBar, group:'volume' };

  // ─ ATR ─
  const { atr } = calcATR(highs, lows, closes);
  const atrPct = atr / price * 100;
  let atrType = 'neutral', atrBar = 50, atrDesc = `ATR: ${fmtPrice(atr)} (${atrPct.toFixed(2)}%)`;
  if (atrPct > 3) { atrType = 'bear'; atrBar = 20; atrDesc = `高波动 (${atrPct.toFixed(2)}%)`; }
  else if (atrPct < 0.8) { atrDesc = `低波动 (${atrPct.toFixed(2)}%)`; }
  else { atrBar = Math.min(80, atrPct * 20); }
  indicators.atr = { ...signalMeta(atrType, `${atrPct.toFixed(2)}%`, atrDesc), bar: atrBar, group:'volatility' };

  // ─ Bollinger Width ─
  const bw_val = bw || 0;
  let bwType = 'neutral', bwBar = 50, bwDesc = `带宽: ${bw_val.toFixed(2)}%`;
  if (bw_val < 3) { bwDesc = `带宽极窄，蓄势待发`; bwBar = 50; }
  else if (bw_val > 10) { bwType = 'bear'; bwBar = 25; bwDesc = `带宽极宽，高波动期`; }
  else { bwBar = Math.min(80, bw_val * 6); }
  indicators.bw = { ...signalMeta(bwType, `${bw_val.toFixed(2)}%`, bwDesc), bar: bwBar, group:'volatility' };

  // ─ Donchian Channel ─
  const dcPeriod = 20;
  const dcHigh = Math.max(...highs.slice(last - dcPeriod + 1, last + 1));
  const dcLow  = Math.min(...lows.slice(last - dcPeriod + 1, last + 1));
  const dcPct  = (price - dcLow) / (dcHigh - dcLow);
  let dcType = 'neutral', dcBar = Math.round(dcPct * 100), dcDesc = `DC%: ${(dcPct*100).toFixed(0)}%`;
  if (dcPct > 0.85) { dcType = 'bear'; dcDesc = `接近通道上轨`; }
  else if (dcPct < 0.15) { dcType = 'bull'; dcDesc = `接近通道下轨`; }
  else if (dcPct > 0.5) { dcType = 'bull'; dcDesc = `通道中上区间`; }
  else { dcType = 'bear'; dcDesc = `通道中下区间`; }
  indicators.donchian = { ...signalMeta(dcType, `${(dcPct*100).toFixed(0)}%`, dcDesc), bar: dcBar, group:'volatility' };

  // ─ Ichimoku ─
  const ichi = calcIchimoku(highs, lows, closes);
  const aboveCloud = ichi.price > Math.max(ichi.senkouA, ichi.senkouB);
  const belowCloud = ichi.price < Math.min(ichi.senkouA, ichi.senkouB);
  const inCloud    = !aboveCloud && !belowCloud;
  const tkCross    = ichi.tenkan > ichi.kijun;
  let ichiType = 'neutral', ichiBar = 50, ichiDesc = '';
  if (aboveCloud && tkCross) { ichiType = 'bull'; ichiBar = 80; ichiDesc = `价格在云层上方，转换线上穿基准线`; }
  else if (aboveCloud)       { ichiType = 'bull'; ichiBar = 65; ichiDesc = `价格在云层上方（多头区域）`; }
  else if (belowCloud && !tkCross) { ichiType = 'bear'; ichiBar = 20; ichiDesc = `价格在云层下方，转换线下穿基准线`; }
  else if (belowCloud)       { ichiType = 'bear'; ichiBar = 35; ichiDesc = `价格在云层下方（空头区域）`; }
  else                       { ichiType = 'neutral'; ichiBar = 50; ichiDesc = `价格在云层内（震荡区间）`; }
  indicators.ichimoku = { ...signalMeta(ichiType, aboveCloud?'云上':belowCloud?'云下':'云中', ichiDesc), bar: ichiBar, group:'supp' };

  // ─ ADX ─
  const { adx, pdi, mdi } = calcADX(highs, lows, closes);
  let adxType = 'neutral', adxBar = 50, adxDesc = `ADX:${adx.toFixed(1)} +DI:${pdi.toFixed(1)} -DI:${mdi.toFixed(1)}`;
  if (adx > 25 && pdi > mdi) { adxType = 'bull'; adxBar = 75; adxDesc = `趋势强劲，多头主导 (ADX:${adx.toFixed(1)})`; }
  else if (adx > 25 && mdi > pdi) { adxType = 'bear'; adxBar = 25; adxDesc = `趋势强劲，空头主导 (ADX:${adx.toFixed(1)})`; }
  else if (adx < 20) { adxDesc = `趋势弱，市场盘整 (ADX:${adx.toFixed(1)})`; }
  else { adxBar = Math.min(80, adx*2); }
  indicators.adx = { ...signalMeta(adxType, adx.toFixed(1), adxDesc), bar: Math.min(100,adxBar), group:'supp' };

  // ─ MFI ─
  const mfi = calcMFI(highs, lows, closes, volumes);
  let mfiType = 'neutral', mfiBar = mfi, mfiDesc = `MFI: ${mfi.toFixed(1)}`;
  if (mfi < 20) { mfiType = 'bull'; mfiDesc = `资金超卖区间 (${mfi.toFixed(1)})`; }
  else if (mfi > 80) { mfiType = 'bear'; mfiDesc = `资金超买区间 (${mfi.toFixed(1)})`; }
  else if (mfi > 50) { mfiType = 'bull'; mfiDesc = `资金净流入 (${mfi.toFixed(1)})`; }
  else { mfiType = 'bear'; mfiDesc = `资金净流出 (${mfi.toFixed(1)})`; }
  indicators.mfi = { ...signalMeta(mfiType, mfi.toFixed(1), mfiDesc), bar: Math.min(100,Math.max(0,mfi)), group:'supp' };

  // ─ ROC ─
  const roc = calcROC(closes, 12);
  let rocType = 'neutral', rocBar = 50, rocDesc = `ROC(12): ${roc.toFixed(2)}%`;
  if (roc > 5) { rocType = 'bull'; rocBar = 78; rocDesc = `动能强劲上升 (${roc.toFixed(2)}%)`; }
  else if (roc > 1) { rocType = 'bull'; rocBar = 62; rocDesc = `价格上涨动能 (${roc.toFixed(2)}%)`; }
  else if (roc < -5) { rocType = 'bear'; rocBar = 22; rocDesc = `动能强劲下降 (${roc.toFixed(2)}%)`; }
  else if (roc < -1) { rocType = 'bear'; rocBar = 38; rocDesc = `价格下跌动能 (${roc.toFixed(2)}%)`; }
  else { rocDesc = `动能趋近零轴 (${roc.toFixed(2)}%)`; }
  indicators.roc = { ...signalMeta(rocType, `${roc.toFixed(2)}%`, rocDesc), bar: rocBar, group:'supp' };

  // ─ MA System (5/10/20/60/120) ─
  const ma5   = calcSMA(closes, 5);
  const ma10  = calcSMA(closes, 10);
  const ma20  = calcSMA(closes, 20);
  const ma60  = calcSMA(closes, 60);
  const ma120 = calcSMA(closes, 120);
  const m5=ma5[last], m10=ma10[last], m20=ma20[last], m60=ma60[last], m120=ma120[last];

  // MA5 vs MA10
  let ma510Type = m5>m10?'bull':'bear';
  indicators.ma510 = { ...signalMeta(ma510Type, `${fmtPrice(m5)}`, m5>m10?'MA5上穿MA10 金叉':'MA5下穿MA10 死叉'), bar: m5>m10?68:32, group:'masys' };

  // MA20 vs MA60
  let ma2060Type = m20>m60?'bull':'bear';
  indicators.ma2060 = { ...signalMeta(ma2060Type, `${fmtPrice(m20)}`, m20>m60?'MA20上穿MA60 中期金叉':'MA20下穿MA60 中期死叉'), bar: m20>m60?72:28, group:'masys' };

  // MA60 vs MA120
  let ma60120Type = m60>m120?'bull':'bear';
  indicators.ma60120 = { ...signalMeta(ma60120Type, `${fmtPrice(m60)}`, m60>m120?'MA60上穿MA120 长期金叉':'MA60下穿MA120 长期死叉'), bar: m60>m120?76:24, group:'masys' };

  // Full MA arrangement
  const fullBull = price>m5 && m5>m10 && m10>m20 && m20>m60 && m60>m120;
  const fullBear = price<m5 && m5<m10 && m10<m20 && m20<m60 && m60<m120;
  let maArrangeType = fullBull?'bull':fullBear?'bear':'neutral';
  let maArrangeDesc = fullBull?'五线多头完美排列，趋势极强':fullBear?'五线空头完美排列，趋势极弱':'均线排列混乱，处于震荡整理';
  indicators.maArrange = { ...signalMeta(maArrangeType, fullBull?'多排':fullBear?'空排':'混乱', maArrangeDesc), bar: fullBull?90:fullBear?10:50, group:'masys' };

  // Price vs MA120 (long-term trend)
  let ma120Type = price>m120?'bull':'bear';
  indicators.ma120 = { ...signalMeta(ma120Type, fmtPrice(m120), price>m120?'价格站上MA120长期均线':'价格跌破MA120长期均线'), bar: price>m120?70:30, group:'masys' };

  // Vegas Tunnel
  const vegas = calcVegasTunnel(closes);
  const vegasBull = price > vegas.upper;
  const vegasBear = price < vegas.lower;
  const vegasIn   = !vegasBull && !vegasBear;
  let vegTrendType = vegasBull?'bull':vegasBear?'bear':'neutral';
  let vegTrendDesc = vegasBull?'价格突破通道上轨，强势多头':vegasBear?'价格跌破通道下轨，强势空头':'价格在通道内震荡，等待方向';
  indicators.vegasTrend = { ...signalMeta(vegTrendType, fmtPrice(vegas.ema144), vegTrendDesc), bar: vegasBull?78:vegasBear?22:50, group:'vegas' };

  const ema12Cross = vegas.ema12 > vegas.upper ? 'bull' : vegas.ema12 < vegas.lower ? 'bear' : 'neutral';
  const ema12CrossDesc = vegas.ema12 > vegas.upper ? 'EMA12突破通道，趋势加速' : vegas.ema12 < vegas.lower ? 'EMA12跌破通道，下跌加速' : 'EMA12在通道内，方向待定';
  indicators.vegasEma12 = { ...signalMeta(ema12Cross, fmtPrice(vegas.ema12), ema12CrossDesc), bar: ema12Cross==='bull'?75:ema12Cross==='bear'?25:50, group:'vegas' };

  // Elliott Wave
  const elliott = calcElliottWave(closes, highs, lows);

  return { indicators, closes, highs, lows, volumes, price, ema20, ema50, ema200, fib: calcFibonacci(highs, lows, closes), vegas, elliott, m5, m10, m20, m60, m120 };
}


// ── 新增交易系统指标 ──────────────────────────────────────────────────────────

// 抛物线SAR
function calcParabolicSAR(highs, lows, step=0.02, max=0.2) {
  const n = highs.length;
  const sar = new Array(n).fill(0);
  let bull = true;
  let af = step;
  let ep = lows[0];
  sar[0] = highs[0];

  for (let i = 1; i < n; i++) {
    const prevSar = sar[i-1];
    if (bull) {
      sar[i] = prevSar + af * (ep - prevSar);
      sar[i] = Math.min(sar[i], lows[i-1], i >= 2 ? lows[i-2] : lows[i-1]);
      if (lows[i] < sar[i]) {
        bull = false; af = step; ep = lows[i]; sar[i] = ep;
      } else {
        if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + step, max); }
      }
    } else {
      sar[i] = prevSar + af * (ep - prevSar);
      sar[i] = Math.max(sar[i], highs[i-1], i >= 2 ? highs[i-2] : highs[i-1]);
      if (highs[i] > sar[i]) {
        bull = true; af = step; ep = highs[i]; sar[i] = ep;
      } else {
        if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + step, max); }
      }
    }
  }
  return { sar, bull };
}

// Aroon 指标
function calcAroon(highs, lows, period=25) {
  const n = highs.length;
  const aroonUp = new Array(n).fill(null);
  const aroonDown = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    const sliceH = highs.slice(i - period, i + 1);
    const sliceL = lows.slice(i - period, i + 1);
    const highIdx = sliceH.indexOf(Math.max(...sliceH));
    const lowIdx  = sliceL.indexOf(Math.min(...sliceL));
    aroonUp[i]   = ((highIdx) / period) * 100;
    aroonDown[i] = ((lowIdx)  / period) * 100;
  }
  return { aroonUp, aroonDown };
}

// 肯特纳通道
function calcKeltner(highs, lows, closes, emaPeriod=20, atrPeriod=10, mult=2) {
  const ema = calcEMA(closes, emaPeriod);
  const atr = calcATR(highs, lows, closes, atrPeriod);
  return closes.map((_, i) => ({
    upper: ema[i] != null && atr[i] != null ? ema[i] + mult * atr[i] : null,
    mid:   ema[i],
    lower: ema[i] != null && atr[i] != null ? ema[i] - mult * atr[i] : null,
  }));
}

// 顾比复合均线 GMMA
function calcGMMA(closes) {
  // 短期：3,5,8,10,12,15
  // 长期：30,35,40,45,50,60
  const short = [3,5,8,10,12,15].map(p => calcEMA(closes, p));
  const long  = [30,35,40,45,50,60].map(p => calcEMA(closes, p));
  const last = closes.length - 1;
  const shortVals = short.map(e => e[last]).filter(v => v != null);
  const longVals  = long.map(e => e[last]).filter(v => v != null);
  const shortAvg = shortVals.reduce((a,b)=>a+b,0) / shortVals.length;
  const longAvg  = longVals.reduce((a,b)=>a+b,0)  / longVals.length;
  const shortSpread = (Math.max(...shortVals) - Math.min(...shortVals)) / shortAvg * 100;
  const longSpread  = (Math.max(...longVals)  - Math.min(...longVals))  / longAvg  * 100;
  return { shortAvg, longAvg, shortSpread, longSpread, shortVals, longVals };
}

// TD Sequential 计数
function calcTDSequential(closes) {
  const n = closes.length;
  const setup = new Array(n).fill(0);
  let count = 0;
  for (let i = 4; i < n; i++) {
    if (closes[i] < closes[i-4]) {
      count = count > 0 ? count + 1 : 1;
    } else if (closes[i] > closes[i-4]) {
      count = count < 0 ? count - 1 : -1;
    } else {
      count = 0;
    }
    setup[i] = Math.abs(count) <= 9 ? count : (count > 0 ? 9 : -9);
  }
  const last = setup[n-1];
  const prev = setup[n-2];
  return { setup, lastCount: last, isExhausted: Math.abs(last) >= 9 };
}

// 价格行为 - BOS/MSS/FVG 检测
function calcPriceAction(highs, lows, closes) {
  const n = closes.length;
  const last = n - 1;

  // 找最近的摆动高点和低点
  let swingHighs = [], swingLows = [];
  for (let i = 2; i < n - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      swingHighs.push({ idx: i, price: highs[i] });
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      swingLows.push({ idx: i, price: lows[i] });
    }
  }

  // 最近的摆动点
  const lastSwingHigh = swingHighs[swingHighs.length - 1];
  const lastSwingLow  = swingLows[swingLows.length - 1];
  const price = closes[last];

  // BOS 检测 (突破结构)
  let bos = null;
  if (lastSwingHigh && price > lastSwingHigh.price) bos = 'bull';
  if (lastSwingLow  && price < lastSwingLow.price)  bos = 'bear';

  // FVG 检测 (公平价值缺口)
  let fvg = null;
  if (last >= 2) {
    const gap = lows[last] - highs[last-2];
    const gapDown = highs[last] - lows[last-2];  // 修정
    if (gap > 0) fvg = { type: 'bull', size: gap, price: (lows[last] + highs[last-2]) / 2 };
    else if (lows[last-2] - highs[last] > 0) fvg = { type: 'bear', size: lows[last-2] - highs[last], price: (lows[last-2] + highs[last]) / 2 };
  }

  // 订单块 OB 检测
  let ob = null;
  for (let i = last - 1; i >= Math.max(0, last - 10); i--) {
    if (closes[i] < closes[i-1] && closes[last] > highs[i]) {
      ob = { type: 'bull', price: lows[i], high: highs[i] };
      break;
    }
    if (closes[i] > closes[i-1] && closes[last] < lows[i]) {
      ob = { type: 'bear', price: highs[i], low: lows[i] };
      break;
    }
  }

  return { bos, fvg, ob, lastSwingHigh, lastSwingLow };
}

// 威科夫阶段识别
function calcWyckoff(closes, volumes, highs, lows) {
  const n = closes.length;
  const last = n - 1;
  const lookback = Math.min(50, n - 1);

  const recentCloses  = closes.slice(last - lookback);
  const recentVols    = volumes.slice(last - lookback);
  const recentHighs   = highs.slice(last - lookback);
  const recentLows    = lows.slice(last - lookback);

  const priceRange = Math.max(...recentHighs) - Math.min(...recentLows);
  const pricePos   = (closes[last] - Math.min(...recentLows)) / priceRange;
  const avgVol     = recentVols.reduce((a,b)=>a+b,0) / recentVols.length;
  const recentVol  = volumes.slice(last-5).reduce((a,b)=>a+b,0) / 5;
  const volRatio   = recentVol / avgVol;

  const priceChange10 = (closes[last] - closes[last-10]) / closes[last-10] * 100;
  const priceChange30 = (closes[last] - closes[Math.max(0,last-30)]) / closes[Math.max(0,last-30)] * 100;

  let phase = 'unknown', desc = '', type = 'neutral';

  if (pricePos < 0.25 && volRatio > 1.2 && priceChange10 > -3) {
    phase = 'Accumulation'; desc = '吸筹阶段：价格处于低位区，成交量放大，主力可能在建仓'; type = 'bull';
  } else if (pricePos < 0.35 && priceChange10 > 2 && volRatio > 1.0) {
    phase = 'Markup'; desc = '拉升阶段：价格从低位启动，成交量配合，上涨趋势形成中'; type = 'bull';
  } else if (pricePos > 0.75 && volRatio > 1.3 && priceChange10 < 3) {
    phase = 'Distribution'; desc = '派发阶段：价格处于高位区，成交量异常，主力可能在出货'; type = 'bear';
  } else if (pricePos > 0.65 && priceChange10 < -2 && volRatio > 1.0) {
    phase = 'Markdown'; desc = '下跌阶段：价格从高位回落，下跌趋势确立中'; type = 'bear';
  } else {
    phase = 'Ranging'; desc = '震荡阶段：价格在区间内波动，方向不明朗，等待突破信号'; type = 'neutral';
  }

  return { phase, desc, type, pricePos, volRatio };
}

// 唐奇安通道
function calcDonchian(highs, lows, period=20) {
  const n = highs.length;
  return highs.map((_, i) => {
    if (i < period - 1) return { upper: null, lower: null, mid: null };
    const sliceH = highs.slice(i - period + 1, i + 1);
    const sliceL = lows.slice(i - period + 1, i + 1);
    const upper = Math.max(...sliceH);
    const lower = Math.min(...sliceL);
    return { upper, lower, mid: (upper + lower) / 2 };
  });
}

// 锚定VWAP (从近期低点/高点锚定)
function calcAnchoredVWAP(highs, lows, closes, volumes) {
  const n = closes.length;
  const lookback = Math.min(50, n);
  // 找近期最低点作为锚点
  let anchorIdx = n - lookback;
  let minLow = lows[anchorIdx];
  for (let i = anchorIdx; i < n; i++) {
    if (lows[i] < minLow) { minLow = lows[i]; anchorIdx = i; }
  }
  // 从锚点计算VWAP
  let cumTP = 0, cumVol = 0;
  const avwap = new Array(n).fill(null);
  for (let i = anchorIdx; i < n; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTP  += tp * volumes[i];
    cumVol += volumes[i];
    avwap[i] = cumVol > 0 ? cumTP / cumVol : null;
  }
  return { avwap, anchorIdx, anchorPrice: lows[anchorIdx] };
}
