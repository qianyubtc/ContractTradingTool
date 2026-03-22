// indicators.js：项目的“计算引擎”。
// 这里负责把 K 线转成一组可读的交易信号（bull/bear/neutral + 解释文本）。

function calcEMA(data, period) {
  // EMA 权重系数：周期越短，k 越大，对最新价格更敏感。
  const k = 2 / (period + 1);
  // EMA 的第一个值通常用首个价格初始化。
  let ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    // 标准 EMA 递推公式：新值 = 当前价*k + 前EMA*(1-k)
    ema.push(data[i] * k + ema[i-1] * (1 - k));
  }
  return ema;
}

function calcSMA(data, period) {
  // SMA 每个点都取“过去 period 根”的简单平均。
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function calcMACD(closes) {
  // MACD = EMA12 - EMA26；Signal 是 MACD 再做 EMA9。
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  // 主线：短均线 - 长均线，正值通常表示短期强于长期。
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  // 注意：signal 只有在 macdLine 有足够长度后才有意义，所以这里从 slice(25) 开始。
  const signal = calcEMA(macdLine.slice(25), 9);
  // 把前面缺失的 signal 位补成 null，保证数组长度与 macdLine 对齐。
  const fullSignal = [...new Array(25).fill(null), ...signal];
  // 柱状图 = 主线 - 信号线，常用于观察动能变化速度。
  const histogram = macdLine.map((v, i) => fullSignal[i] !== null ? v - fullSignal[i] : null);
  return { macdLine, signal: fullSignal, histogram };
}

function calcRSI(closes, period=14) {
  // RSI 核心是“平均涨幅 vs 平均跌幅”的强弱比。
  let gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  // 先拿前 period 段做初始平均值（Wilder 经典做法）。
  let avgGain = gains.slice(0, period).reduce((a,b)=>a+b,0)/period;
  let avgLoss = losses.slice(0, period).reduce((a,b)=>a+b,0)/period;
  let rsis = [];
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period-1) + gains[i]) / period;
    avgLoss = (avgLoss * (period-1) + losses[i]) / period;
    // 避免除 0：当 avgLoss 为 0 时按极强多头处理。
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsis.push(100 - (100 / (1 + rs)));
  }
  return rsis;
}

function calcKDJ(highs, lows, closes, period=9) {
  // KDJ 先算 RSV，再对 K/D 做平滑。
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
  // 布林带：中轨=SMA，上下轨=中轨±mult*标准差。
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
  // OBV 思路：涨就加量、跌就减量，用“量能累计方向”衡量主力偏向。
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
  // CMF（Chaikin Money Flow）：结合位置与成交量衡量资金净流入/流出。
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
  // ATR 是“真实波动范围”的平滑值，常用于止损/波动率判断。
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
  // 返回“最后一个 ATR”与“完整 ATR 序列”两种形态，方便不同函数使用。
  return { atr: atrArr[atrArr.length-1], atrArr };
}

function calcStochRSI(closes, rsiPeriod=14, stochPeriod=14, kPeriod=3, dPeriod=3) {
  // StochRSI = 对 RSI 再做一次随机指标归一化，敏感度比 RSI 更高。
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
  // Williams %R 范围通常在 [-100, 0]，越接近 0 越接近“近期高位”。
  const last = closes.length - 1;
  const hh = Math.max(...highs.slice(last - period + 1, last + 1));
  const ll  = Math.min(...lows.slice(last - period + 1, last + 1));
  return ((hh - closes[last]) / (hh - ll)) * -100;
}

function calcCCI(highs, lows, closes, period=20) {
  // CCI 衡量价格偏离“典型价格均值”的程度。
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const smaTP = calcSMA(tp, period);
  const last = tp.length - 1;
  const meanDev = tp.slice(last - period + 1, last + 1).reduce((s,v) => s + Math.abs(v - smaTP[last]), 0) / period;
  return meanDev === 0 ? 0 : (tp[last] - smaTP[last]) / (0.015 * meanDev);
}

function calcVWAP(highs, lows, closes, volumes) {
  // VWAP 累积均价：更接近“市场平均持仓成本”的概念。
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
  // 一目均衡表这里用简化实现，输出关键线位用于区域判断。
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
  // ADX 不判断方向，只判断“趋势强不强”；方向由 +DI/-DI 对比给出。
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
  let adx=adxArr.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<adxArr.length;i++) adx=(adx*(period-1)+adxArr[i])/period;
  // 输出最后时刻的 ADX / +DI / -DI，给上层打分使用。
  const lastIdx=trArr.length-1;
  const atrF=atr14; const p14F=p14; const m14F=m14;
  const pdi=atrF===0?0:p14F/atrF*100;
  const mdi=atrF===0?0:m14F/atrF*100;
  return { adx, pdi, mdi };
}

function calcMFI(highs, lows, closes, volumes, period=14) {
  // MFI 可理解为“带成交量权重的 RSI”。
  const tp = closes.map((c,i)=>(highs[i]+lows[i]+c)/3);
  let posFlow=0, negFlow=0;
  for(let i=closes.length-period; i<closes.length; i++){
    const mf = tp[i]*volumes[i];
    if(tp[i]>tp[i-1]) posFlow+=mf; else negFlow+=mf;
  }
  return negFlow===0 ? 100 : 100-(100/(1+posFlow/negFlow));
}

function calcROC(closes, period=12) {
  // ROC：与 period 根前比较的涨跌幅百分比。
  const last = closes.length-1;
  return closes[last-period]===0?0:(closes[last]-closes[last-period])/closes[last-period]*100;
}

function calcFibonacci(highs, lows, closes, lookback=100) {
  // 在 lookback 区间内寻找 swing high/low，然后计算常用 Fib 回撤位与扩展位。
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
  // pct 表示当前价位于区间中的百分位（0%=区间低点，100%=区间高点）。
  const pct = (price - swingLow) / range * 100;
  const levelArr = [0, 23.6, 38.2, 50, 61.8, 78.6, 100];
  let nearestBelow = 0, nearestAbove = 100;
  for(const lv of levelArr) {
    if(lv <= pct) nearestBelow = lv;
    if(lv >= pct && lv < nearestAbove) nearestAbove = lv;
  }
  return { levels, swingHigh, swingLow, price, pct, nearestBelow, nearestAbove, range };
}

function calcVegasTunnel(closes) {
  // Vegas Tunnel 常用 EMA144/169 作为“趋势通道”，EMA12 作为快线参考。
  const ema144 = calcEMA(closes, 144);
  const ema169 = calcEMA(closes, 169);
  const ema12  = calcEMA(closes, 12);
  // 保留变量以兼容历史逻辑（当前未使用）。
  const ema144v = calcEMA(closes, 144);
  const last = closes.length-1;
  const price = closes[last];
  const upper = ema169[last];
  const lower = ema144[last];
  const mid   = (upper+lower)/2;
  const e12   = ema12[last];
  const tunnelWidth = Math.abs(upper-lower)/mid*100;
  return { ema144: ema144[last], ema169: ema169[last], ema12: e12, price, upper: Math.max(upper,lower), lower: Math.min(upper,lower), mid, tunnelWidth };
}

function calcElliottWave(closes, highs, lows) {
  // 这里是启发式波浪识别，不是严格艾略特形态学引擎。
  const len = closes.length;
  // threshold 控制“拐点敏感度”：越小越容易识别出摆动点。
  const threshold = 0.03;
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
  // 波段太少时直接返回低置信度，避免误导性结论。
  if(swings.length < 5) return { wave: '?', phase: 'neutral', desc: '数据不足，无法识别波浪', confidence: 'low' };

  const last5 = swings.slice(-5);
  const prices = last5.map(s=>s.price);

  const isUpImpulse = last5[0].price < last5[2].price && last5[2].price < last5[4].price &&
                      last5[1].price < last5[3].price;
  const isDownImpulse = last5[0].price > last5[2].price && last5[2].price > last5[4].price &&
                        last5[1].price > last5[3].price;

  const lastSwing = last5[last5.length-1];
  const secondLast = last5[last5.length-2];
  const momentum = (price - secondLast.price) / secondLast.price * 100;

  let wave = '?', phase = 'neutral', desc = '', confidence = 'medium';

  if(isUpImpulse) {
    if(lastSwing.type === 'low') {
      wave = '⑤波推进中'; phase = 'bull';
      desc = `上涨推动浪结构完整（①②③④已确认），当前可能处于第⑤浪推升阶段。第⑤浪目标：${fmtPrice(last5[3].price + (last5[3].price - last5[2].price))}`;
      confidence = 'medium';
    } else {
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
  // 统一信号结构，便于 render 层通用渲染。
  return { type, value, desc };
}

// 核心聚合函数（输入 -> 处理 -> 输出）：
// 输入：原始 K 线数组 [time, open, high, low, close, volume, ...]
// 处理：逐类计算趋势/动量/波动/量能/结构指标，再统一转换成信号对象
// 输出：用于页面渲染的 indicators + 关键序列数据（closes/highs/lows/volumes 等）
function analyzeAll(klines) {
  // 基础保护：极少数据时多数指标都会失真，提前终止。
  if (!klines || klines.length < 5) throw new Error('该币种刚上线，暂无足够K线数据，请稍后再试');
  // 把字符串价格转换为 number，避免后续比较出现隐式类型问题。
  const opens   = klines.map(k => parseFloat(k[1]));
  const highs   = klines.map(k => parseFloat(k[2]));
  const lows    = klines.map(k => parseFloat(k[3]));
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const last = closes.length - 1;
  const price = closes[last];

  // indicators 是统一输出容器：每个指标都写入 {type,value,desc,bar,group}
  const indicators = {};

  // === 趋势类（Trend）===
  const { macdLine, signal, histogram } = calcMACD(closes);
  const macdVal = macdLine[last];
  const sigVal = signal[last];
  const histVal = histogram[last];
  const histPrev = histogram[last-1];
  let macdType = 'neutral';
  let macdDesc = `MACD ${fmt(macdVal,4)} / Signal ${fmt(sigVal,4)}`;
  // MACD 判断逻辑：
  // - 主线在信号线上方且柱体增强 -> 偏多
  // - 主线在信号线下方且柱体走弱 -> 偏空
  if (macdVal > sigVal && histVal > histPrev) macdType = 'bull';
  else if (macdVal < sigVal && histVal < histPrev) macdType = 'bear';
  indicators.macd = { ...signalMeta(macdType, fmt(macdVal,4), macdDesc), bar: macdType==='bull'?75:macdType==='bear'?25:50, group:'trend' };

  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, Math.min(200, closes.length));
  const e20 = ema20[last], e50 = ema50[last], e200 = ema200[last];
  let emaType = 'neutral', emaBar = 50;
  let emaDesc = `EMA20:${fmtPrice(e20)} / EMA50:${fmtPrice(e50)}`;
  // EMA 排列用于判断趋势结构是否完整（多头/空头排列）。
  if (price > e20 && e20 > e50 && e50 > e200) { emaType = 'bull'; emaBar = 80; emaDesc = '多头排列'; }
  else if (price < e20 && e20 < e50 && e50 < e200) { emaType = 'bear'; emaBar = 20; emaDesc = '空头排列'; }
  else if (price > e50) { emaType = 'bull'; emaBar = 65; emaDesc = `价格在EMA50上方`; }
  else { emaType = 'bear'; emaBar = 35; emaDesc = `价格在EMA50下方`; }
  indicators.ema = { ...signalMeta(emaType, `${fmtPrice(e20)}`, emaDesc), bar: emaBar, group:'trend' };

  const e200Prev = ema200[last-1] || e200, e50Prev = ema50[last-1] || e50;
  let crossType = 'neutral', crossBar = 50, crossDesc = `EMA200: ${fmtPrice(e200)}`;
  // EMA200 常作为长周期“牛熊分界线”。
  if (price > e200) { crossType = 'bull'; crossBar = 70; crossDesc = `价格上方黄金区域`; }
  else { crossType = 'bear'; crossBar = 30; crossDesc = `价格跌破200均线`; }
  indicators.ema200 = { ...signalMeta(crossType, fmtPrice(e200), crossDesc), bar: crossBar, group:'trend' };

  const boll = calcBollinger(closes, Math.min(20, closes.length));
  const bollLast = boll[last];
  let bollType = 'neutral', bollBar = 50, bollDesc = '数据不足';
  let bw = 0;
  if (bollLast && bollLast.upper != null) {
    const { upper, mid, lower } = bollLast;
    bw = bollLast.bw || 0;
    // pct 越接近 1 越靠上轨，越接近 0 越靠下轨。
    const pct = (price - lower) / (upper - lower);
    if (pct > 0.85) { bollType = 'bear'; bollBar = 25; bollDesc = '价格触碰上轨，超买'; }
    else if (pct < 0.15) { bollType = 'bull'; bollBar = 75; bollDesc = '价格触碰下轨，超卖'; }
    else if (pct > 0.5) { bollType = 'bull'; bollBar = 60; bollDesc = `BB%B: ${(pct*100).toFixed(0)}%`; }
    else { bollType = 'bear'; bollBar = 40; bollDesc = `BB%B: ${(pct*100).toFixed(0)}%`; }
    indicators.boll = { ...signalMeta(bollType, `${(pct*100).toFixed(0)}%`, bollDesc), bar: bollBar, group:'trend' };
  } else {
    indicators.boll = { ...signalMeta('neutral', 'N/A', '数据不足'), bar: 50, group:'trend' };
  }

  // === 动量类（Momentum）===
  const rsis = calcRSI(closes);
  const rsi = rsis[rsis.length-1];
  const rsiPrev = rsis[rsis.length-2];
  let rsiType = 'neutral', rsiBar = 50, rsiDesc = `RSI: ${rsi.toFixed(1)}`;
  // RSI 用常见区间判断：<30 超卖，>70 超买。
  if (rsi < 30) { rsiType = 'bull'; rsiBar = 80; rsiDesc = `超卖区间 (${rsi.toFixed(1)})`; }
  else if (rsi > 70) { rsiType = 'bear'; rsiBar = 20; rsiDesc = `超买区间 (${rsi.toFixed(1)})`; }
  else if (rsi < 50 && rsi > rsiPrev) { rsiType = 'bull'; rsiBar = 60; rsiDesc = `由下向上穿越50`; }
  else if (rsi > 50 && rsi < rsiPrev) { rsiType = 'bear'; rsiBar = 40; rsiDesc = `由上向下穿越50`; }
  else if (rsi > 50) { rsiType = 'bull'; rsiBar = 62; rsiDesc = `强势区间`; }
  else { rsiType = 'bear'; rsiBar = 38; rsiDesc = `弱势区间`; }
  indicators.rsi = { ...signalMeta(rsiType, rsi.toFixed(1), rsiDesc), bar: Math.min(100, Math.max(0, rsi)), group:'momentum' };

  const kdjArr = calcKDJ(highs, lows, closes);
  const { K, D, J } = kdjArr[kdjArr.length-1];
  const kdjPrev = kdjArr[kdjArr.length-2];
  let kdjType = 'neutral', kdjBar = 50, kdjDesc = `K:${K.toFixed(1)} D:${D.toFixed(1)} J:${J.toFixed(1)}`;
  // KDJ 常用“金叉/死叉 + 过热/过冷”组合判断。
  if (K > D && kdjPrev.K <= kdjPrev.D && K < 80) { kdjType = 'bull'; kdjBar = 75; kdjDesc = `KDJ金叉`; }
  else if (K < D && kdjPrev.K >= kdjPrev.D && K > 20) { kdjType = 'bear'; kdjBar = 25; kdjDesc = `KDJ死叉`; }
  else if (J < 0) { kdjType = 'bull'; kdjBar = 82; kdjDesc = `J值超卖 (${J.toFixed(1)})`; }
  else if (J > 100) { kdjType = 'bear'; kdjBar = 18; kdjDesc = `J值超买 (${J.toFixed(1)})`; }
  else if (K > D) { kdjType = 'bull'; kdjBar = 60; kdjDesc = `K线在D线上方`; }
  else { kdjType = 'bear'; kdjBar = 40; kdjDesc = `K线在D线下方`; }
  indicators.kdj = { ...signalMeta(kdjType, `K${K.toFixed(0)}`, kdjDesc), bar: kdjBar, group:'momentum' };

  const { k: srsiK, d: srsiD } = calcStochRSI(closes);
  let srsiType = 'neutral', srsiBar = 50, srsiDesc = `StochRSI K:${srsiK?.toFixed(1)||'--'}`;
  // StochRSI 反应很快，噪音也更大，通常只做辅助确认。
  if (srsiK !== null) {
    if (srsiK < 20) { srsiType = 'bull'; srsiBar = 78; srsiDesc = `超卖 (K:${srsiK.toFixed(1)})`; }
    else if (srsiK > 80) { srsiType = 'bear'; srsiBar = 22; srsiDesc = `超买 (K:${srsiK.toFixed(1)})`; }
    else if (srsiK > srsiD && srsiK < 50) { srsiType = 'bull'; srsiBar = 62; srsiDesc = `金叉上行`; }
    else if (srsiK < srsiD && srsiK > 50) { srsiType = 'bear'; srsiBar = 38; srsiDesc = `死叉下行`; }
    else { srsiBar = srsiK; }
  }
  indicators.stochrsi = { ...signalMeta(srsiType, srsiK?.toFixed(1)||'--', srsiDesc), bar: srsiBar, group:'momentum' };

  const wr = calcWilliamsR(highs, lows, closes);
  let wrType = 'neutral', wrBar = 50, wrDesc = `WR: ${wr.toFixed(1)}`;
  if (wr < -80) { wrType = 'bull'; wrBar = 80; wrDesc = `超卖区间 (${wr.toFixed(1)})`; }
  else if (wr > -20) { wrType = 'bear'; wrBar = 20; wrDesc = `超买区间 (${wr.toFixed(1)})`; }
  else { wrBar = Math.abs(wr); wrDesc = `WR: ${wr.toFixed(1)}`; }
  indicators.williamsr = { ...signalMeta(wrType, wr.toFixed(1), wrDesc), bar: wrBar, group:'momentum' };

  const cci = calcCCI(highs, lows, closes);
  let cciType = 'neutral', cciBar = 50, cciDesc = `CCI: ${cci.toFixed(0)}`;
  if (cci < -100) { cciType = 'bull'; cciBar = 75; cciDesc = `超卖 (${cci.toFixed(0)})`; }
  else if (cci > 100) { cciType = 'bear'; cciBar = 25; cciDesc = `超买 (${cci.toFixed(0)})`; }
  else if (cci > 0) { cciType = 'bull'; cciBar = 58; cciDesc = `正向区间`; }
  else { cciType = 'bear'; cciBar = 42; cciDesc = `负向区间`; }
  indicators.cci = { ...signalMeta(cciType, cci.toFixed(0), cciDesc), bar: cciBar, group:'momentum' };

  // === 量能类（Volume）===
  const obv = calcOBV(closes, volumes);
  const obvSMA = calcSMA(obv, 20);
  const obvLast = obv[last];
  const obvSMALast = obvSMA[last];
  let obvType = 'neutral', obvBar = 50, obvDesc = `OBV vs MA20`;
  // OBV 与其均线比较：站上代表资金更偏流入。
  if (obvLast > obvSMALast * 1.02) { obvType = 'bull'; obvBar = 70; obvDesc = `OBV突破均线，资金流入`; }
  else if (obvLast < obvSMALast * 0.98) { obvType = 'bear'; obvBar = 30; obvDesc = `OBV跌破均线，资金流出`; }
  else { obvDesc = `OBV：${fmt(obvLast,0)}`; }
  indicators.obv = { ...signalMeta(obvType, fmt(obvLast,0), obvDesc), bar: obvBar, group:'volume' };

  const volSMA20 = calcVolumeSMA(volumes, 20);
  const volRatio = volumes[last] / volSMA20[last];
  let volType = 'neutral', volBar = 50, volDesc = `成交量：${fmt(volumes[last],2)}`;
  // volRatio = 当前量 / 20均量，>1.5 常视为明显放量。
  if (volRatio > 1.5 && closes[last] > closes[last-1]) { volType = 'bull'; volBar = 78; volDesc = `放量上涨 (${(volRatio*100).toFixed(0)}%)`; }
  else if (volRatio > 1.5 && closes[last] < closes[last-1]) { volType = 'bear'; volBar = 22; volDesc = `放量下跌 (${(volRatio*100).toFixed(0)}%)`; }
  else if (volRatio < 0.6) { volDesc = `缩量震荡`; }
  else { volBar = Math.min(100, volRatio*50); }
  indicators.volume = { ...signalMeta(volType, `×${volRatio.toFixed(2)}`, volDesc), bar: volBar, group:'volume' };

  const cmf = calcCMF(highs, lows, closes, volumes);
  const cmfLast = cmf[last];
  let cmfType = 'neutral', cmfBar = 50, cmfDesc = `CMF: ${cmfLast?.toFixed(3)||'--'}`;
  // CMF 正值偏流入，负值偏流出。
  if (cmfLast !== null) {
    if (cmfLast > 0.1) { cmfType = 'bull'; cmfBar = 72; cmfDesc = `资金持续流入`; }
    else if (cmfLast < -0.1) { cmfType = 'bear'; cmfBar = 28; cmfDesc = `资金持续流出`; }
    else if (cmfLast > 0) { cmfType = 'bull'; cmfBar = 55; }
    else { cmfType = 'bear'; cmfBar = 45; }
  }
  indicators.cmf = { ...signalMeta(cmfType, cmfLast?.toFixed(3)||'--', cmfDesc), bar: cmfBar, group:'volume' };

  const vwap = calcVWAP(highs, lows, closes, volumes);
  const vwapLast = vwap[last];
  let vwapType = 'neutral', vwapBar = 50, vwapDesc = `VWAP: ${fmtPrice(vwapLast)}`;
  // 价格相对 VWAP 的位置可理解为“相对平均持仓成本”的高低。
  if (price > vwapLast * 1.01) { vwapType = 'bull'; vwapBar = 68; vwapDesc = `价格在VWAP上方`; }
  else if (price < vwapLast * 0.99) { vwapType = 'bear'; vwapBar = 32; vwapDesc = `价格在VWAP下方`; }
  indicators.vwap = { ...signalMeta(vwapType, fmtPrice(vwapLast), vwapDesc), bar: vwapBar, group:'volume' };

  // === 波动类（Volatility）===
  const { atr } = calcATR(highs, lows, closes);
  const atrPct = atr / price * 100;
  let atrType = 'neutral', atrBar = 50, atrDesc = `ATR: ${fmtPrice(atr)} (${atrPct.toFixed(2)}%)`;
  // ATR 百分比越高，说明波动越剧烈，止损需要放宽。
  if (atrPct > 3) { atrType = 'bear'; atrBar = 20; atrDesc = `高波动 (${atrPct.toFixed(2)}%)`; }
  else if (atrPct < 0.8) { atrDesc = `低波动 (${atrPct.toFixed(2)}%)`; }
  else { atrBar = Math.min(80, atrPct * 20); }
  indicators.atr = { ...signalMeta(atrType, `${atrPct.toFixed(2)}%`, atrDesc), bar: atrBar, group:'volatility' };

  const bw_val = bw || 0;
  let bwType = 'neutral', bwBar = 50, bwDesc = `带宽: ${bw_val.toFixed(2)}%`;
  // 布林带宽用于识别“压缩后可能放量突破”或“高波动风险期”。
  if (bw_val < 3) { bwDesc = `带宽极窄，蓄势待发`; bwBar = 50; }
  else if (bw_val > 10) { bwType = 'bear'; bwBar = 25; bwDesc = `带宽极宽，高波动期`; }
  else { bwBar = Math.min(80, bw_val * 6); }
  indicators.bw = { ...signalMeta(bwType, `${bw_val.toFixed(2)}%`, bwDesc), bar: bwBar, group:'volatility' };

  const dcPeriod = 20;
  const dcHigh = Math.max(...highs.slice(last - dcPeriod + 1, last + 1));
  const dcLow  = Math.min(...lows.slice(last - dcPeriod + 1, last + 1));
  const dcPct  = (price - dcLow) / (dcHigh - dcLow);
  let dcType = 'neutral', dcBar = Math.round(dcPct * 100), dcDesc = `DC%: ${(dcPct*100).toFixed(0)}%`;
  // Donchian 百分位用于观察价格位于近期通道上/中/下哪个区域。
  if (dcPct > 0.85) { dcType = 'bear'; dcDesc = `接近通道上轨`; }
  else if (dcPct < 0.15) { dcType = 'bull'; dcDesc = `接近通道下轨`; }
  else if (dcPct > 0.5) { dcType = 'bull'; dcDesc = `通道中上区间`; }
  else { dcType = 'bear'; dcDesc = `通道中下区间`; }
  indicators.donchian = { ...signalMeta(dcType, `${(dcPct*100).toFixed(0)}%`, dcDesc), bar: dcBar, group:'volatility' };

  // === 支撑/辅助类（Supp）===
  const ichi = calcIchimoku(highs, lows, closes);
  const aboveCloud = ichi.price > Math.max(ichi.senkouA, ichi.senkouB);
  const belowCloud = ichi.price < Math.min(ichi.senkouA, ichi.senkouB);
  const inCloud    = !aboveCloud && !belowCloud;
  const tkCross    = ichi.tenkan > ichi.kijun;
  let ichiType = 'neutral', ichiBar = 50, ichiDesc = '';
  // 一目云层：云上偏多，云下偏空，云中偏震荡。
  if (aboveCloud && tkCross) { ichiType = 'bull'; ichiBar = 80; ichiDesc = `价格在云层上方，转换线上穿基准线`; }
  else if (aboveCloud)       { ichiType = 'bull'; ichiBar = 65; ichiDesc = `价格在云层上方（多头区域）`; }
  else if (belowCloud && !tkCross) { ichiType = 'bear'; ichiBar = 20; ichiDesc = `价格在云层下方，转换线下穿基准线`; }
  else if (belowCloud)       { ichiType = 'bear'; ichiBar = 35; ichiDesc = `价格在云层下方（空头区域）`; }
  else                       { ichiType = 'neutral'; ichiBar = 50; ichiDesc = `价格在云层内（震荡区间）`; }
  indicators.ichimoku = { ...signalMeta(ichiType, aboveCloud?'云上':belowCloud?'云下':'云中', ichiDesc), bar: ichiBar, group:'supp' };

  const { adx, pdi, mdi } = calcADX(highs, lows, closes);
  let adxType = 'neutral', adxBar = 50, adxDesc = `ADX:${adx.toFixed(1)} +DI:${pdi.toFixed(1)} -DI:${mdi.toFixed(1)}`;
  // ADX>25 通常意味着趋势有效，结合 +DI/-DI 判断方向。
  if (adx > 25 && pdi > mdi) { adxType = 'bull'; adxBar = 75; adxDesc = `趋势强劲，多头主导 (ADX:${adx.toFixed(1)})`; }
  else if (adx > 25 && mdi > pdi) { adxType = 'bear'; adxBar = 25; adxDesc = `趋势强劲，空头主导 (ADX:${adx.toFixed(1)})`; }
  else if (adx < 20) { adxDesc = `趋势弱，市场盘整 (ADX:${adx.toFixed(1)})`; }
  else { adxBar = Math.min(80, adx*2); }
  indicators.adx = { ...signalMeta(adxType, adx.toFixed(1), adxDesc), bar: Math.min(100,adxBar), group:'supp' };

  const mfi = calcMFI(highs, lows, closes, volumes);
  let mfiType = 'neutral', mfiBar = mfi, mfiDesc = `MFI: ${mfi.toFixed(1)}`;
  // MFI 用于判断“资金过热/过冷”。
  if (mfi < 20) { mfiType = 'bull'; mfiDesc = `资金超卖区间 (${mfi.toFixed(1)})`; }
  else if (mfi > 80) { mfiType = 'bear'; mfiDesc = `资金超买区间 (${mfi.toFixed(1)})`; }
  else if (mfi > 50) { mfiType = 'bull'; mfiDesc = `资金净流入 (${mfi.toFixed(1)})`; }
  else { mfiType = 'bear'; mfiDesc = `资金净流出 (${mfi.toFixed(1)})`; }
  indicators.mfi = { ...signalMeta(mfiType, mfi.toFixed(1), mfiDesc), bar: Math.min(100,Math.max(0,mfi)), group:'supp' };

  const roc = calcROC(closes, 12);
  let rocType = 'neutral', rocBar = 50, rocDesc = `ROC(12): ${roc.toFixed(2)}%`;
  // ROC 本质是动量速度，绝对值越大趋势越急。
  if (roc > 5) { rocType = 'bull'; rocBar = 78; rocDesc = `动能强劲上升 (${roc.toFixed(2)}%)`; }
  else if (roc > 1) { rocType = 'bull'; rocBar = 62; rocDesc = `价格上涨动能 (${roc.toFixed(2)}%)`; }
  else if (roc < -5) { rocType = 'bear'; rocBar = 22; rocDesc = `动能强劲下降 (${roc.toFixed(2)}%)`; }
  else if (roc < -1) { rocType = 'bear'; rocBar = 38; rocDesc = `价格下跌动能 (${roc.toFixed(2)}%)`; }
  else { rocDesc = `动能趋近零轴 (${roc.toFixed(2)}%)`; }
  indicators.roc = { ...signalMeta(rocType, `${roc.toFixed(2)}%`, rocDesc), bar: rocBar, group:'supp' };

  // === 均线系统（MA System）===
  const ma5   = calcSMA(closes, 5);
  const ma10  = calcSMA(closes, 10);
  const ma20  = calcSMA(closes, 20);
  const ma60  = calcSMA(closes, 60);
  const ma120 = calcSMA(closes, 120);
  const m5=ma5[last], m10=ma10[last], m20=ma20[last], m60=ma60[last], m120=ma120[last];

  // MA 组合交叉：短中长三组分别给出结构信号。
  let ma510Type = m5>m10?'bull':'bear';
  indicators.ma510 = { ...signalMeta(ma510Type, `${fmtPrice(m5)}`, m5>m10?'MA5上穿MA10 金叉':'MA5下穿MA10 死叉'), bar: m5>m10?68:32, group:'masys' };

  let ma2060Type = m20>m60?'bull':'bear';
  indicators.ma2060 = { ...signalMeta(ma2060Type, `${fmtPrice(m20)}`, m20>m60?'MA20上穿MA60 中期金叉':'MA20下穿MA60 中期死叉'), bar: m20>m60?72:28, group:'masys' };

  let ma60120Type = m60>m120?'bull':'bear';
  indicators.ma60120 = { ...signalMeta(ma60120Type, `${fmtPrice(m60)}`, m60>m120?'MA60上穿MA120 长期金叉':'MA60下穿MA120 长期死叉'), bar: m60>m120?76:24, group:'masys' };

  const fullBull = price>m5 && m5>m10 && m10>m20 && m20>m60 && m60>m120;
  const fullBear = price<m5 && m5<m10 && m10<m20 && m20<m60 && m60<m120;
  let maArrangeType = fullBull?'bull':fullBear?'bear':'neutral';
  let maArrangeDesc = fullBull?'五线多头完美排列，趋势极强':fullBear?'五线空头完美排列，趋势极弱':'均线排列混乱，处于震荡整理';
  indicators.maArrange = { ...signalMeta(maArrangeType, fullBull?'多排':fullBear?'空排':'混乱', maArrangeDesc), bar: fullBull?90:fullBear?10:50, group:'masys' };

  let ma120Type = price>m120?'bull':'bear';
  indicators.ma120 = { ...signalMeta(ma120Type, fmtPrice(m120), price>m120?'价格站上MA120长期均线':'价格跌破MA120长期均线'), bar: price>m120?70:30, group:'masys' };

  // === Vegas / Elliott 等结构信号 ===
  const vegas = calcVegasTunnel(closes);
  // 价格在通道上方/下方通常表示趋势较强；通道内则偏震荡。
  const vegasBull = price > vegas.upper;
  const vegasBear = price < vegas.lower;
  const vegasIn   = !vegasBull && !vegasBear;
  let vegTrendType = vegasBull?'bull':vegasBear?'bear':'neutral';
  let vegTrendDesc = vegasBull?'价格突破通道上轨，强势多头':vegasBear?'价格跌破通道下轨，强势空头':'价格在通道内震荡，等待方向';
  indicators.vegasTrend = { ...signalMeta(vegTrendType, fmtPrice(vegas.ema144), vegTrendDesc), bar: vegasBull?78:vegasBear?22:50, group:'vegas' };

  const ema12Cross = vegas.ema12 > vegas.upper ? 'bull' : vegas.ema12 < vegas.lower ? 'bear' : 'neutral';
  const ema12CrossDesc = vegas.ema12 > vegas.upper ? 'EMA12突破通道，趋势加速' : vegas.ema12 < vegas.lower ? 'EMA12跌破通道，下跌加速' : 'EMA12在通道内，方向待定';
  indicators.vegasEma12 = { ...signalMeta(ema12Cross, fmtPrice(vegas.ema12), ema12CrossDesc), bar: ema12Cross==='bull'?75:ema12Cross==='bear'?25:50, group:'vegas' };

  const elliott = calcElliottWave(closes, highs, lows);

  // 以下 try/catch 是“可选指标”，即使单项计算异常也不阻断主流程。
  try {
    // SAR 常用于跟踪止损与趋势翻转提示。
    const { sar, bull: sarBull } = calcParabolicSAR(highs, lows);
    const sarVal = sar[last];
    const sarType = sarBull ? 'bull' : 'bear';
    const sarDesc = sarBull
      ? `SAR(${fmtPrice(sarVal)}) 在价格下方，多头趋势，止损参考 ${fmtPrice(sarVal)}`
      : `SAR(${fmtPrice(sarVal)}) 在价格上方，空头趋势，阻力参考 ${fmtPrice(sarVal)}`;
    indicators.sar = { ...signalMeta(sarType, fmtPrice(sarVal), sarDesc), bar: sarBull?72:28, group:'trend' };
  } catch(e) {}

  try {
    // Aroon 用“近期新高/新低出现的时间位置”判断趋势活跃度。
    const { aroonUp, aroonDown } = calcAroon(highs, lows);
    const aUp = aroonUp[last], aDown = aroonDown[last];
    let aroonType = 'neutral', aroonDesc = 'Aroon数据不足';
    if (aUp !== null && aDown !== null) {
      if (aUp > 70 && aDown < 30)      { aroonType = 'bull'; aroonDesc = `Aroon Up(${aUp.toFixed(0)}) 强势，上涨趋势确立`; }
      else if (aDown > 70 && aUp < 30) { aroonType = 'bear'; aroonDesc = `Aroon Down(${aDown.toFixed(0)}) 强势，下跌趋势确立`; }
      else if (aUp > aDown)             { aroonType = 'bull'; aroonDesc = `Up(${aUp.toFixed(0)}) > Down(${aDown.toFixed(0)})，偏多`; }
      else                              { aroonType = 'bear'; aroonDesc = `Down(${aDown.toFixed(0)}) > Up(${aUp.toFixed(0)})，偏空`; }
    }
    indicators.aroon = { ...signalMeta(aroonType, aUp!=null?`${aUp.toFixed(0)}/${aDown.toFixed(0)}`:'--', aroonDesc), bar: aroonType==='bull'?70:aroonType==='bear'?30:50, group:'trend' };
  } catch(e) {}

  try {
    // 肯特纳通道与布林带类似，但波动项来自 ATR。
    const keltner = calcKeltner(highs, lows, closes);
    const kelt = keltner[last];
    let keltType = 'neutral', keltDesc = '';
    if (kelt && kelt.upper && kelt.lower) {
      if (price > kelt.upper)      { keltType = 'bull'; keltDesc = `突破肯特纳上轨(${fmtPrice(kelt.upper)})，强势突破`; }
      else if (price < kelt.lower) { keltType = 'bear'; keltDesc = `跌破肯特纳下轨(${fmtPrice(kelt.lower)})，弱势信号`; }
      else if (price > kelt.mid)   { keltType = 'bull'; keltDesc = `价格在中轨上方(${fmtPrice(kelt.mid)})，偏多`; }
      else                         { keltType = 'bear'; keltDesc = `价格在中轨下方(${fmtPrice(kelt.mid)})，偏空`; }
    }
    indicators.keltner = { ...signalMeta(keltType, kelt?.upper?fmtPrice(kelt.upper):'--', keltDesc), bar: keltType==='bull'?68:keltType==='bear'?32:50, group:'volatility' };
  } catch(e) {}

  try {
    // GMMA 通过短周期组与长周期组的相对位置判断“交易者 vs 投资者”共识。
    const gmma = calcGMMA(closes);
    let gmmaType = 'neutral', gmmaDesc = '';
    if (gmma.shortAvg > gmma.longAvg) {
      gmmaType = 'bull';
      gmmaDesc = gmma.shortSpread > 1
        ? `短期均线组强势发散于长期线上方，趋势强劲，投机者主导`
        : `短期均线在长期线上方，偏多但动能一般`;
    } else {
      gmmaType = 'bear';
      gmmaDesc = gmma.shortSpread > 1
        ? `短期均线组在长期线下方发散，空头趋势确立`
        : `短期均线在长期线下方，偏空`;
    }
    indicators.gmma = { ...signalMeta(gmmaType, fmtPrice(gmma.shortAvg), gmmaDesc), bar: gmmaType==='bull'?72:28, group:'trend' };
  } catch(e) {}

  try {
    // TD Sequential 用计数法提示“趋势衰竭/可能反转”。
    const td = calcTDSequential(closes);
    let tdType = 'neutral', tdDesc = '';
    if (td.isExhausted && td.lastCount > 0) {
      tdType = 'bear'; tdDesc = `TD计数达 ${td.lastCount}，上涨动能衰竭，关注反转`;
    } else if (td.isExhausted && td.lastCount < 0) {
      tdType = 'bull'; tdDesc = `TD计数达 ${Math.abs(td.lastCount)}，下跌动能衰竭，关注反弹`;
    } else if (td.lastCount > 0) {
      tdDesc = `TD上涨计数 ${td.lastCount}/9，序列进行中`;
    } else if (td.lastCount < 0) {
      tdDesc = `TD下跌计数 ${Math.abs(td.lastCount)}/9，序列进行中`;
    } else {
      tdDesc = 'TD序列重置';
    }
    indicators.td = { ...signalMeta(tdType, `${Math.abs(td.lastCount)}/9`, tdDesc), bar: tdType==='bull'?68:tdType==='bear'?32:50, group:'trend' };
  } catch(e) {}

  try {
    // PA（价格行为）综合 BOS/FVG/OB 等结构信号。
    const pa = calcPriceAction(highs, lows, closes);
    let paType = 'neutral', paDesc = '';
    if (pa.bos === 'bull')      { paType = 'bull'; paDesc = `BOS看多：突破近期摆动高点，结构转多`; }
    else if (pa.bos === 'bear') { paType = 'bear'; paDesc = `BOS看空：跌破近期摆动低点，结构转空`; }
    else if (pa.fvg)            { paType = pa.fvg.type; paDesc = `FVG${pa.fvg.type==='bull'?'看多':'看空'}：${fmtPrice(pa.fvg.price)} 附近存在公平价值缺口`; }
    else if (pa.ob)             { paType = pa.ob.type; paDesc = `订单块(OB)：${fmtPrice(pa.ob.price)} 附近有${pa.ob.type==='bull'?'多头':'空头'}订单块`; }
    else                        { paDesc = '价格结构中性，等待BOS或FVG信号'; }
    indicators.pa = { ...signalMeta(paType, pa.bos||(pa.fvg?'FVG':'OB')||'中性', paDesc), bar: paType==='bull'?70:paType==='bear'?30:50, group:'structure' };
  } catch(e) {}

  try {
    // 威科夫用于识别“吸筹/拉升/派发/下跌”阶段。
    const wyckoff = calcWyckoff(closes, volumes, highs, lows);
    indicators.wyckoff = { ...signalMeta(wyckoff.type, wyckoff.phase, wyckoff.desc), bar: wyckoff.type==='bull'?72:wyckoff.type==='bear'?28:50, group:'structure' };
  } catch(e) {}

  try {
    // 结构组里的 Donchian 与波动组 Donchian 百分位互补：一个看突破、一个看位置。
    const donc = calcDonchian(highs, lows);
    const don = donc[last];
    let donType = 'neutral', donDesc = '';
    if (don && don.upper) {
      if (price >= don.upper * 0.998)      { donType = 'bull'; donDesc = `突破唐奇安上轨(${fmtPrice(don.upper)})，强势信号`; }
      else if (price <= don.lower * 1.002) { donType = 'bear'; donDesc = `跌破唐奇安下轨(${fmtPrice(don.lower)})，弱势信号`; }
      else { donDesc = `价格在通道内(${fmtPrice(don.lower)}~${fmtPrice(don.upper)})震荡`; }
    }
    indicators.donchianPA = { ...signalMeta(donType, don?.upper?fmtPrice(don.upper):'--', donDesc), bar: donType==='bull'?72:donType==='bear'?28:50, group:'structure' };
  } catch(e) {}

  try {
    // 锚定 VWAP 近似“从某个关键低点开始的平均持仓成本”。
    const avwapData = calcAnchoredVWAP(highs, lows, closes, volumes);
    const avwapVal = avwapData.avwap[last];
    let avwapType = 'neutral', avwapDesc = '';
    if (avwapVal) {
      const diff = ((price - avwapVal) / avwapVal * 100).toFixed(2);
      if (price > avwapVal * 1.01)      { avwapType = 'bull'; avwapDesc = `价格高于锚定VWAP(${fmtPrice(avwapVal)}) +${diff}%，多头持仓成本上方`; }
      else if (price < avwapVal * 0.99) { avwapType = 'bear'; avwapDesc = `价格低于锚定VWAP(${fmtPrice(avwapVal)}) ${diff}%，空头占优`; }
      else                              { avwapDesc = `价格在锚定VWAP(${fmtPrice(avwapVal)})附近，多空均衡`; }
    }
    indicators.avwap = { ...signalMeta(avwapType, avwapVal?fmtPrice(avwapVal):'--', avwapDesc), bar: avwapType==='bull'?68:avwapType==='bear'?32:50, group:'structure' };
  } catch(e) {}

  // 最终把“信号 + 原始序列 + 关键派生数据”一次性返回给上层渲染。
  return { indicators, closes, highs, lows, volumes, price, ema20, ema50, ema200, fib: calcFibonacci(highs, lows, closes), vegas, elliott, m5, m10, m20, m60, m120 };
}

function calcParabolicSAR(highs, lows, step=0.02, max=0.2) {
  // Parabolic SAR：通过加速因子 AF 跟随趋势，突破时翻转方向。
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

function calcAroon(highs, lows, period=25) {
  // Aroon 取最近 period 内“最高/最低点距离当前有多远”。
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

function calcKeltner(highs, lows, closes, emaPeriod=20, atrPeriod=10, mult=2) {
  // 说明：这里的 ATR 需要按“序列”参与通道计算（upper/lower 随时间变化）。
  // 若后续重构该函数，注意保持 ATR 与 EMA 的时间索引对齐。
  const ema = calcEMA(closes, emaPeriod);
  // 这里应该使用 ATR 序列（atrArr）做逐点通道计算。
  // calcATR 返回的是“压缩序列”（长度小于 closes），因此直接按索引会错位。
  // 这里先取 atrArr，再按有效起点对齐到 closes 的时间轴。
  const atrObj = calcATR(highs, lows, closes, atrPeriod);
  const atr = atrObj.atrArr || [];
  const atrOffset = atrPeriod - 1;
  const startAt = Math.max(emaPeriod - 1, atrOffset);
  return closes.map((_, i) => ({
    // 显式索引，避免 i < atrOffset 时出现负索引访问（即便 JS 返回 undefined）。
    upper: (() => {
      if (i < startAt || ema[i] == null) return null;
      const atrIdx = i - atrOffset;
      if (atrIdx < 0 || atrIdx >= atr.length || atr[atrIdx] == null) return null;
      return ema[i] + mult * atr[atrIdx];
    })(),
    mid:   ema[i],
    lower: (() => {
      if (i < startAt || ema[i] == null) return null;
      const atrIdx = i - atrOffset;
      if (atrIdx < 0 || atrIdx >= atr.length || atr[atrIdx] == null) return null;
      return ema[i] - mult * atr[atrIdx];
    })(),
  }));
}

function calcGMMA(closes) {
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

function calcPriceAction(highs, lows, closes) {
  const n = closes.length;
  const last = n - 1;

  let swingHighs = [], swingLows = [];
  for (let i = 2; i < n - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      swingHighs.push({ idx: i, price: highs[i] });
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      swingLows.push({ idx: i, price: lows[i] });
    }
  }

  const lastSwingHigh = swingHighs[swingHighs.length - 1];
  const lastSwingLow  = swingLows[swingLows.length - 1];
  const price = closes[last];

  let bos = null;
  if (lastSwingHigh && price > lastSwingHigh.price) bos = 'bull';
  if (lastSwingLow  && price < lastSwingLow.price)  bos = 'bear';

  let fvg = null;
  if (last >= 2) {
    const gap = lows[last] - highs[last-2];
    const gapDown = highs[last] - lows[last-2];
    if (gap > 0) fvg = { type: 'bull', size: gap, price: (lows[last] + highs[last-2]) / 2 };
    else if (lows[last-2] - highs[last] > 0) fvg = { type: 'bear', size: lows[last-2] - highs[last], price: (lows[last-2] + highs[last]) / 2 };
  }

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

function calcAnchoredVWAP(highs, lows, closes, volumes) {
  const n = closes.length;
  const lookback = Math.min(50, n);
  let anchorIdx = n - lookback;
  let minLow = lows[anchorIdx];
  for (let i = anchorIdx; i < n; i++) {
    if (lows[i] < minLow) { minLow = lows[i]; anchorIdx = i; }
  }
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
