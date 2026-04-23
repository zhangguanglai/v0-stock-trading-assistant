// 技术指标计算引擎
// 基于历史K线数据计算各种技术指标

import type { DailyKLine, TechnicalIndicators, StockSignal, BuySignal } from './types';

// 计算简单移动平均线 SMA
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// 计算指数移动平均线 EMA
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

// 计算MACD指标
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { dif: number; dea: number; macd: number } | null {
  if (prices.length < slowPeriod + signalPeriod) return null;
  
  // 计算快慢EMA
  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);
  
  if (emaFast === null || emaSlow === null) return null;
  
  // DIF = 快EMA - 慢EMA
  const dif = emaFast - emaSlow;
  
  // 计算DIF序列的EMA作为DEA
  // 简化处理：使用当前DIF近似
  const difHistory: number[] = [];
  let fastEma = prices.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let slowEma = prices.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
  
  for (let i = Math.max(fastPeriod, slowPeriod); i < prices.length; i++) {
    fastEma = prices[i] * kFast + fastEma * (1 - kFast);
    slowEma = prices[i] * kSlow + slowEma * (1 - kSlow);
    difHistory.push(fastEma - slowEma);
  }
  
  // DEA是DIF的EMA
  const dea = calculateEMA(difHistory, signalPeriod) || 0;
  
  // MACD柱 = (DIF - DEA) * 2
  const macd = (dif - dea) * 2;
  
  return { dif, dea, macd };
}

// 计算RSI指标
export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  // 计算涨跌幅
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// 计算KDJ指标
export function calculateKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 9
): { k: number; d: number; j: number } | null {
  if (closes.length < period) return null;
  
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const currentClose = closes[closes.length - 1];
  
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  
  if (highestHigh === lowestLow) {
    return { k: 50, d: 50, j: 50 };
  }
  
  // RSV = (收盘价 - 最低价) / (最高价 - 最低价) * 100
  const rsv = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  
  // K = 2/3 * 前K + 1/3 * RSV (简化为RSV)
  // D = 2/3 * 前D + 1/3 * K
  // J = 3K - 2D
  const k = rsv;
  const d = rsv; // 简化
  const j = 3 * k - 2 * d;
  
  return { k, d, j };
}

// 计算布林带
export function calculateBOLL(
  prices: number[],
  period: number = 20,
  multiplier: number = 2
): { upper: number; middle: number; lower: number } | null {
  if (prices.length < period) return null;
  
  const recentPrices = prices.slice(-period);
  const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  // 计算标准差
  const variance = recentPrices.reduce((sum, price) => {
    return sum + Math.pow(price - middle, 2);
  }, 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: middle + multiplier * std,
    middle,
    lower: middle - multiplier * std,
  };
}

// 计算量比
export function calculateVolumeRatio(
  volumes: number[],
  period: number = 5
): number {
  if (volumes.length < period + 1) return 1;
  
  const currentVolume = volumes[volumes.length - 1];
  const avgVolume = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
  
  if (avgVolume === 0) return 1;
  
  return currentVolume / avgVolume;
}

// 计算均线序列（返回每个时间点的均线值）
export function calculateSMASeries(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// 计算MACD序列
export function calculateMACDSeries(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): Array<{ dif: number; dea: number; macd: number }> {
  const result: Array<{ dif: number; dea: number; macd: number }> = [];
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
  const kSignal = 2 / (signalPeriod + 1);
  
  let fastEma = prices.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let slowEma = prices.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
  
  for (let i = Math.max(fastPeriod, slowPeriod); i < prices.length; i++) {
    fastEma = prices[i] * kFast + fastEma * (1 - kFast);
    slowEma = prices[i] * kSlow + slowEma * (1 - kSlow);
    const dif = fastEma - slowEma;
    
    if (result.length === 0) {
      result.push({ dif, dea: dif, macd: 0 });
    } else {
      const prevDea = result[result.length - 1].dea;
      const dea = dif * kSignal + prevDea * (1 - kSignal);
      const macd = (dif - dea) * 2;
      result.push({ dif, dea, macd });
    }
  }
  
  return result;
}

// 计算20日均量序列
export function calculateAvgVolumeSeries(volumes: number[], period: number = 20): number[] {
  const result: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// 买入规则配置（用于动态检测）
export interface BuyRuleConfig {
  ma5CrossMa20?: boolean;      // 均线多头排列
  macdGoldenCross?: boolean;   // 日MACD金叉且零轴上方
  candleConfirm?: boolean;     // K线确认
  volumeConfirm?: boolean;     // 成交量确认
}

// 默认规则（四个条件全开）
const DEFAULT_BUY_RULES: BuyRuleConfig = {
  ma5CrossMa20: true,
  macdGoldenCross: true,
  candleConfirm: true,
  volumeConfirm: true,
};

// 检测量化买入信号（支持策略规则配置）
export function detectBuySignal(klines: DailyKLine[], rules?: BuyRuleConfig, actualPrice?: { close: number; open: number }): BuySignal {
  const activeRules = rules || DEFAULT_BUY_RULES;
  const closes = klines.map(k => k.close);
  const opens = klines.map(k => k.open);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);

  const n = closes.length;
  const latestDate = klines[n - 1]?.date || '未知日期';

  // 计算均线序列
  const ma5Series = calculateSMASeries(closes, 5);
  const ma10Series = calculateSMASeries(closes, 10);
  const ma20Series = calculateSMASeries(closes, 20);
  
  // 计算MACD序列
  const macdSeries = calculateMACDSeries(closes);
  
  // 计算均量序列
  const avgVolSeries = calculateAvgVolumeSeries(volumes, 20);
  
  // 当前值
  const currentMa5 = ma5Series[n - 1] || 0;
  const currentMa10 = ma10Series[n - 1] || 0;
  const currentMa20 = ma20Series[n - 1] || 0;
  const prevMa20 = n > 1 ? (ma20Series[n - 2] || 0) : 0;
  
  const currentMacd = macdSeries[macdSeries.length - 1];
  const prevMacd = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] : null;
  
  const currentClose = closes[n - 1];
  const currentOpen = opens[n - 1];
  const currentLow = lows[n - 1];
  const currentVolume = volumes[n - 1];
  const avgVolume = avgVolSeries[n - 1] || 0;
  const volumeRatioVal = avgVolume > 0 ? currentVolume / avgVolume : 0;

  const displayClose = actualPrice?.close ?? currentClose;
  const displayOpen = actualPrice?.open ?? currentOpen;
  
  const prevClose = n > 1 ? closes[n - 2] : currentClose;
  const prevOpen = n > 1 ? opens[n - 2] : currentOpen;
  const prevLow = n > 1 ? lows[n - 2] : currentLow;
  
  // 条件A: 均线多头排列
  const maBullish = (currentMa5 > currentMa10) && (currentMa10 > currentMa20);
  const ma20Upward = currentMa20 > prevMa20;
  
  // 条件B: MACD金叉
  let macdGoldenCross = false;
  if (currentMacd && prevMacd) {
    macdGoldenCross = (currentMacd.dif > currentMacd.dea) && (prevMacd.dif <= prevMacd.dea);
  }
  
  // 条件B增强: MACD在零轴上方附近
  const macdNearZero = currentMacd ? currentMacd.dif > -0.05 : false;
  
  // 条件C: K线确认（阳线且收盘价 > MA5）
  const bullishCandle = (currentClose > currentOpen) && (currentClose > currentMa5);
  
  // 条件C增强: 看涨吞没形态
  const bullishEngulfing = (currentClose > currentOpen) && 
                           (currentLow < prevLow) && 
                           (currentClose > prevClose) && 
                           (currentClose > prevOpen);
  
  // 条件D: 成交量过滤（当日成交量 > 20日均量 x 1.2）
  const volumeConfirmVal = avgVolume > 0 ? currentVolume > avgVolume * 1.2 : false;
  
  // 根据策略规则判断哪些条件需要检查
  // 收集所有启用的条件
  const enabledConditions: { key: string; pass: boolean }[] = [];
  
  // 均线多头排列规则：ma5CrossMa20 = MA5>MA10>MA20
  if (activeRules.ma5CrossMa20 !== false) {
    enabledConditions.push({ key: 'ma5CrossMa20', pass: maBullish });
  }
  
  // MACD金叉且零轴上方规则
  if (activeRules.macdGoldenCross !== false) {
    // 金叉 + 零轴上方（DIF>0）
    const macdGoldenAndAbove = macdGoldenCross && (currentMacd ? currentMacd.dif > 0 : false);
    enabledConditions.push({ key: 'macdGoldenCross', pass: macdGoldenAndAbove });
  }
  
  // K线确认规则
  if (activeRules.candleConfirm !== false) {
    enabledConditions.push({ key: 'candleConfirm', pass: bullishCandle || bullishEngulfing });
  }
  
  // 成交量确认规则
  if (activeRules.volumeConfirm !== false) {
    enabledConditions.push({ key: 'volumeConfirm', pass: volumeConfirmVal });
  }
  
  // 如果没有任何条件启用，默认不触发
  const allEnabledPass = enabledConditions.length > 0 && enabledConditions.every(c => c.pass);
  const passedCount = enabledConditions.filter(c => c.pass).length;
  const enabledCount = enabledConditions.length;
  
  // 判断买入信号强度
  let trigger = false;
  let strength: 'strong' | 'medium' | 'weak' | 'none' = 'none';
  
  if (enabledCount === 0) {
    // 没有启用任何条件
    strength = 'none';
  } else if (allEnabledPass) {
    trigger = true;
    // 根据通过率判断强度
    if (enabledCount >= 4 && passedCount >= 4) {
      strength = 'strong';    // 四个条件全开且全通过
    } else if (passedCount >= enabledCount * 0.75) {
      strength = 'medium';    // 75%以上条件通过
    } else {
      strength = 'weak';      // 刚好满足最低要求
    }
  } else if (passedCount >= enabledCount * 0.5) {
    strength = 'weak';        // 部分条件通过（50%以上），接近触发
  }
  
  // 建议买入价格（收盘价）
  const suggestedPrice = trigger ? currentClose : null;
  
  // 止损价位（5%固定止损）
  const stopLoss = suggestedPrice ? suggestedPrice * 0.95 : null;
  
  // 构建信号详情（注意：macdGoldenCross现在合并了金叉+零轴位置）
  const buySignal: BuySignal = {
    trigger,
    strength,
    conditions: {
      trendAlignment: {
        name: '均线多头排列',
        pass: maBullish,
        value: maBullish ? `MA5(${currentMa5.toFixed(2)}) > MA10(${currentMa10.toFixed(2)}) > MA20(${currentMa20.toFixed(2)})` : `MA5=${currentMa5.toFixed(2)}, MA10=${currentMa10.toFixed(2)}, MA20=${currentMa20.toFixed(2)}`,
        description: maBullish ? (ma20Upward ? '均线呈多头排列且MA20向上，上升趋势确认' : '均线呈多头排列，趋势向好') : '均线未形成多头排列，需等待趋势确认',
      },
      macdGoldenCross: {
        name: '日MACD金叉且零轴上方',
        pass: macdGoldenCross && (currentMacd ? currentMacd.dif > 0 : false),
        value: currentMacd ? `DIF=${currentMacd.dif.toFixed(3)}, DEA=${currentMacd.dea.toFixed(3)}` : '数据不足',
        description: (macdGoldenCross && currentMacd && currentMacd.dif > 0) ? 'MACD金叉确认且在零轴上方，多头动能强劲' : 
                     (currentMacd && currentMacd.dif > 0 && !macdGoldenCross ? 'MACD在零轴上方但未形成金叉' :
                      (currentMacd && currentMacd.dif <= 0 ? 'MACD在零轴下方，动能偏弱' : '等待MACD金叉信号')),
      },
      candleConfirm: {
        name: 'K线确认',
        pass: bullishCandle || bullishEngulfing,
        value: `${latestDate} 收盘价=${displayClose.toFixed(2)}, 开盘价=${displayOpen.toFixed(2)}`,
        description: bullishEngulfing ? '看涨吞没形态，强烈买入信号' : (bullishCandle ? '阳线且收盘价站上MA5，买入确认' : 'K线未出现确认形态，建议观望'),
      },
      volumeConfirm: {
        name: '成交量确认',
        pass: volumeConfirmVal,
        value: `当日量=${currentVolume}, 20日均量=${Math.round(avgVolume)}, 量比=${volumeRatioVal.toFixed(2)}`,
        description: volumeConfirmVal ? '成交量明显放大，资金活跃度高' : '成交量未明显放大，注意确认后续量能',
      },
    },
    suggestedPrice: suggestedPrice || undefined,
    stopLoss: stopLoss || undefined,
    actualClose: actualPrice?.close,
    actualOpen: actualPrice?.open,
    description: trigger ? 
      `买入信号${strength === 'strong' ? '强烈' : strength === 'medium' ? '明确' : '初步'}触发！建议买入价${suggestedPrice?.toFixed(2)}元，止损位${stopLoss?.toFixed(2)}元` : 
      '买入条件未完全满足，建议继续观察',
  };
  
  return buySignal;
}

// 根据K线数据计算所有技术指标
export function calculateAllIndicators(klines: DailyKLine[]): TechnicalIndicators {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);
  
  return {
    ma5: calculateSMA(closes, 5),
    ma10: calculateSMA(closes, 10),
    ma20: calculateSMA(closes, 20),
    ma60: calculateSMA(closes, 60),
    macd: calculateMACD(closes),
    rsi: {
      rsi6: calculateRSI(closes, 6) || 50,
      rsi12: calculateRSI(closes, 12) || 50,
      rsi24: calculateRSI(closes, 24) || 50,
    },
    kdj: calculateKDJ(highs, lows, closes),
    boll: calculateBOLL(closes),
    volumeRatio: calculateVolumeRatio(volumes),
  };
}

// 生成买卖信号
export function generateSignals(
  currentPrice: number,
  indicators: TechnicalIndicators,
  prevIndicators?: TechnicalIndicators
): StockSignal[] {
  const signals: StockSignal[] = [];
  const now = new Date().toISOString();
  
  // MA金叉信号
  if (indicators.ma5 && indicators.ma20) {
    if (indicators.ma5 > indicators.ma20) {
      if (prevIndicators?.ma5 && prevIndicators?.ma20 && 
          prevIndicators.ma5 <= prevIndicators.ma20) {
        signals.push({
          type: 'buy',
          name: 'MA5上穿MA20金叉',
          strength: 'strong',
          description: '5日均线上穿20日均线，形成金叉买入信号',
          triggeredAt: now,
        });
      } else {
        signals.push({
          type: 'buy',
          name: '股价在MA20上方',
          strength: 'medium',
          description: '股价运行在20日均线上方，趋势向好',
          triggeredAt: now,
        });
      }
    } else {
      signals.push({
        type: 'sell',
        name: '股价在MA20下方',
        strength: 'medium',
        description: '股价运行在20日均线下方，趋势偏弱',
        triggeredAt: now,
      });
    }
  }
  
  // MACD信号
  if (indicators.macd) {
    if (indicators.macd.macd > 0 && indicators.macd.dif > indicators.macd.dea) {
      signals.push({
        type: 'buy',
        name: 'MACD金叉',
        strength: indicators.macd.macd > 0.5 ? 'strong' : 'medium',
        description: 'MACD金叉且红柱放大，多头趋势增强',
        triggeredAt: now,
      });
    } else if (indicators.macd.macd < 0) {
      signals.push({
        type: 'sell',
        name: 'MACD死叉',
        strength: indicators.macd.macd < -0.5 ? 'strong' : 'weak',
        description: 'MACD绿柱，空头趋势',
        triggeredAt: now,
      });
    }
  }
  
  // RSI超买超卖信号
  if (indicators.rsi) {
    if (indicators.rsi.rsi6 < 30) {
      signals.push({
        type: 'buy',
        name: 'RSI超卖',
        strength: indicators.rsi.rsi6 < 20 ? 'strong' : 'medium',
        description: `RSI(6)=${indicators.rsi.rsi6.toFixed(1)}，处于超卖区域`,
        triggeredAt: now,
      });
    } else if (indicators.rsi.rsi6 > 70) {
      signals.push({
        type: 'sell',
        name: 'RSI超买',
        strength: indicators.rsi.rsi6 > 80 ? 'strong' : 'medium',
        description: `RSI(6)=${indicators.rsi.rsi6.toFixed(1)}，处于超买区域`,
        triggeredAt: now,
      });
    }
  }
  
  // 量比信号
  if (indicators.volumeRatio > 2) {
    signals.push({
      type: currentPrice > 0 ? 'buy' : 'hold',
      name: '放量突破',
      strength: indicators.volumeRatio > 3 ? 'strong' : 'medium',
      description: `量比${indicators.volumeRatio.toFixed(2)}，成交活跃`,
      triggeredAt: now,
    });
  }
  
  // KDJ信号
  if (indicators.kdj) {
    if (indicators.kdj.j < 20) {
      signals.push({
        type: 'buy',
        name: 'KDJ超卖',
        strength: 'medium',
        description: `J值=${indicators.kdj.j.toFixed(1)}，处于超卖区域`,
        triggeredAt: now,
      });
    } else if (indicators.kdj.j > 80) {
      signals.push({
        type: 'sell',
        name: 'KDJ超买',
        strength: 'medium',
        description: `J值=${indicators.kdj.j.toFixed(1)}，处于超买区域`,
        triggeredAt: now,
      });
    }
  }
  
  return signals;
}

// 计算综合评分 (0-100)
export function calculateScore(
  indicators: TechnicalIndicators,
  signals: StockSignal[]
): number {
  let score = 50; // 基础分
  
  // 根据信号调整分数
  for (const signal of signals) {
    const delta = signal.strength === 'strong' ? 15 : 
                  signal.strength === 'medium' ? 10 : 5;
    
    if (signal.type === 'buy') {
      score += delta;
    } else if (signal.type === 'sell') {
      score -= delta;
    }
  }
  
  // 限制在0-100范围
  return Math.max(0, Math.min(100, score));
}
