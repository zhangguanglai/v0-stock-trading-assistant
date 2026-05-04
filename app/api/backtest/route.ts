// 策略回测引擎 API
// 基于本地SQLite历史数据执行策略规则，计算回测指标
// 优化版本：内存预加载 + 批量计算技术指标

import { NextRequest, NextResponse } from 'next/server';
import type { BacktestParams, BacktestResult, BacktestTrade, EquityPoint } from '@/lib/types';
import { checkStockRules, type FilterContext } from '@/lib/stock-scan/filter-engine';

// 动态导入sqlite，避免构建时加载node:sqlite
async function getDb() {
  const { getDatabase } = await import('@/lib/db/sqlite');
  return getDatabase();
}

async function getName(code: string) {
  const { getStockName } = await import('@/lib/db/sqlite');
  return getStockName(code);
}

export const dynamic = 'force-dynamic';

interface StrategyRules {
  maxMarketCap?: number;
  minMarketCap?: number;
  minROE?: number;
  maxDebtRatio?: number;
  minTurnoverRate?: number;
  maxPE?: number;
  maxPEPercentile?: number;
  minTurnoverRate5D?: number;
  minPB?: number;
  maxPB?: number;
  minVolumeRatio?: number;
  priceAboveMA5?: boolean;
  priceAboveMA20?: boolean;
  weeklyMACDGoldenCross?: boolean;
  minSectorGain?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  trailingStopPercent?: number;
  timeStopDays?: number;
  timeStopMinGain?: number;
  maxPositions?: number;
  maxSingleStockPercent?: number;
  minCashPercent?: number;
  minScore?: number;
  maxIndexDrawdown?: number;
  useKellySizing?: boolean;
}

interface Position {
  code: string;
  name: string;
  entryPrice: number;
  shares: number;
  entryDate: string;
  highestPrice: number;
}

// ============ 数据预加载层 ============

interface DailyMarketData {
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePercent: number;
  marketCap?: number;
  pe?: number;
  pb?: number;
  turnoverRate?: number;
  volumeRatio?: number;
}

interface PrecomputedIndicators {
  ma5: number;
  ma20: number;
  ma60: number;
  macdGoldenCross: boolean;
  // 趋势强度: 收盘价在MA20上方的比例 (0-1)
  trendStrength: number;
  // 20日涨幅
  return20D: number;
  // 5日平均成交量 / 20日平均成交量
  volumeRatio5D20D: number;
  // 均值回归指标
  rsi: number;                    // RSI(14)
  bollingerUpper: number;         // 布林带上轨
  bollingerLower: number;         // 布林带下轨
  bollingerMid: number;           // 布林带中轨(20日MA)
  consecutiveDecline: number;     // 连续下跌天数
}

export interface BacktestDataCache {
  tradeDates: string[];
  // date -> code -> data
  marketDataByDate: Map<string, Map<string, DailyMarketData>>;
  // code -> date -> indicators
  indicatorsByCode: Map<string, Map<string, PrecomputedIndicators>>;
  // code -> sorted prices array for MACD calc
  priceHistory: Map<string, { date: string; close: number }[]>;
  // 沪深300指数信号: date -> aboveMA20
  indexAboveMA20: Map<string, boolean>;
  // 沪深300指数收益率: date -> returnPercent
  indexReturn: Map<string, number>;
}

// 预加载整个回测期间的数据到内存
export async function preloadBacktestData(startDate: string, endDate: string): Promise<BacktestDataCache> {
  const database = await getDb();
  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');

  // 1. 获取交易日列表
  const dateRows = database.prepare(
    `SELECT DISTINCT date FROM daily_kline WHERE date >= ? AND date <= ? ORDER BY date`
  ).all(start, end) as { date: string }[];

  const tradeDates = dateRows.map(r => r.date);

  if (tradeDates.length === 0) {
    return { tradeDates: [], marketDataByDate: new Map(), indicatorsByCode: new Map(), priceHistory: new Map() };
  }

  // 2. 一次性加载所有K线数据（整个回测期间）
  const klineStart = performance.now();
  const klineRows = database.prepare(`
    SELECT code, date, open, high, low, close, volume, amount, change_percent as changePercent
    FROM daily_kline
    WHERE date >= ? AND date <= ?
  `).all(start, end) as {
    code: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
    changePercent: number;
  }[];

  // 3. 一次性加载所有基本面数据
  const basicRows = database.prepare(`
    SELECT code, date, market_cap as marketCap, pe, pb, turnover_rate as turnoverRate, volume_ratio as volumeRatio
    FROM daily_basic
    WHERE date >= ? AND date <= ?
  `).all(start, end) as {
    code: string;
    date: string;
    marketCap: number;
    pe: number;
    pb: number;
    turnoverRate: number;
    volumeRatio: number;
  }[];

  // 4. 构建基本面数据快速查找表
  const basicMap = new Map<string, Map<string, typeof basicRows[0]>>();
  for (const row of basicRows) {
    if (!basicMap.has(row.code)) {
      basicMap.set(row.code, new Map());
    }
    basicMap.get(row.code)!.set(row.date, row);
  }

  // 5. 构建 marketDataByDate
  const marketDataByDate = new Map<string, Map<string, DailyMarketData>>();
  // 价格历史包含volume用于计算成交量比
  const priceHistory = new Map<string, { date: string; close: number; volume: number }[]>();

  for (const row of klineRows) {
    // 按日期分组
    if (!marketDataByDate.has(row.date)) {
      marketDataByDate.set(row.date, new Map());
    }

    const basic = basicMap.get(row.code)?.get(row.date);

    marketDataByDate.get(row.date)!.set(row.code, {
      code: row.code,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      amount: row.amount,
      changePercent: row.changePercent || 0,
      marketCap: basic?.marketCap,
      pe: basic?.pe,
      pb: basic?.pb,
      turnoverRate: basic?.turnoverRate,
      volumeRatio: basic?.volumeRatio,
    });

    // 构建价格历史（用于技术指标计算）
    if (!priceHistory.has(row.code)) {
      priceHistory.set(row.code, []);
    }
    priceHistory.get(row.code)!.push({ date: row.date, close: row.close, volume: row.volume });
  }

  // 6. 预计算所有技术指标（每只股票每个交易日）
  const indicatorsByCode = new Map<string, Map<string, PrecomputedIndicators>>();

  for (const [code, prices] of priceHistory) {
    // 按日期排序
    prices.sort((a, b) => a.date.localeCompare(b.date));

    const indicators = new Map<string, PrecomputedIndicators>();

    for (let i = 0; i < prices.length; i++) {
      const date = prices[i].date;
      const priceSlice = prices.slice(0, i + 1).map(p => p.close);
      const closePrices = priceSlice;

      const ma5 = calculateMA(closePrices, 5);
      const ma20 = calculateMA(closePrices, 20);
      const ma60 = calculateMA(closePrices, 60);
      const macdGoldenCross = calculateMACDGoldenCross(closePrices);

      // 趋势强度: 最近20天中收盘价在MA20上方的天数比例
      let aboveMA20Count = 0;
      const checkDays = Math.min(20, i + 1);
      for (let j = i - checkDays + 1; j <= i; j++) {
        if (j >= 0) {
          const dayMA20 = calculateMA(closePrices.slice(0, j + 1), 20);
          if (closePrices[j] > dayMA20) aboveMA20Count++;
        }
      }
      const trendStrength = checkDays > 0 ? aboveMA20Count / checkDays : 0;

      // 20日涨幅
      const return20D = i >= 20 ? (closePrices[i] - closePrices[i - 20]) / closePrices[i - 20] * 100 : 0;

      // 成交量比: 5日平均成交量 / 20日平均成交量
      let volumeRatio5D20D = 1.0;
      if (i >= 20) {
        const vol5 = prices.slice(i - 4, i + 1).reduce((s, p) => s + p.volume, 0) / 5;
        const vol20 = prices.slice(i - 19, i + 1).reduce((s, p) => s + p.volume, 0) / 20;
        if (vol20 > 0) volumeRatio5D20D = vol5 / vol20;
      }

      // RSI(14)
      const rsi = calculateRSI(closePrices, 14);

      // 布林带 (20日, 2倍标准差)
      const bollingerMid = ma20;
      let bollingerUpper = ma20;
      let bollingerLower = ma20;
      if (i >= 20) {
        const slice20 = closePrices.slice(-20);
        const mean = slice20.reduce((a, b) => a + b, 0) / 20;
        const variance = slice20.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / 20;
        const std = Math.sqrt(variance);
        bollingerUpper = mean + 2 * std;
        bollingerLower = mean - 2 * std;
      }

      // 连续下跌天数
      let consecutiveDecline = 0;
      for (let j = i; j > 0; j--) {
        if (closePrices[j] < closePrices[j - 1]) {
          consecutiveDecline++;
        } else {
          break;
        }
      }

      indicators.set(date, { ma5, ma20, ma60, macdGoldenCross, trendStrength, return20D, volumeRatio5D20D, rsi, bollingerUpper, bollingerLower, bollingerMid, consecutiveDecline });
    }

    indicatorsByCode.set(code, indicators);
  }

  const totalMs = performance.now() - klineStart;
  console.log(`[Backtest] 数据预加载完成: ${tradeDates.length}个交易日, ${klineRows.length}条K线, ${basicRows.length}条基本面, 耗时${totalMs.toFixed(0)}ms`);

  // 6. 计算沪深300指数信号
  const indexAboveMA20 = new Map<string, boolean>();
  const indexReturn = new Map<string, number>();
  const indexPrices: number[] = [];

  for (const date of tradeDates) {
    const dayData = marketDataByDate.get(date);
    const indexData = dayData?.get('000300');
    if (indexData && indexData.close > 0) {
      indexPrices.push(indexData.close);
      const ma20 = indexPrices.length >= 20
        ? indexPrices.slice(-20).reduce((a, b) => a + b, 0) / 20
        : indexPrices.reduce((a, b) => a + b, 0) / indexPrices.length;
      indexAboveMA20.set(date, indexData.close > ma20);
      indexReturn.set(date, indexData.changePercent || 0);
    } else {
      indexAboveMA20.set(date, true);
      indexReturn.set(date, 0);
    }
  }

  return { tradeDates, marketDataByDate, indicatorsByCode, priceHistory, indexAboveMA20, indexReturn };
}

// ============ 技术指标计算 ============

function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateMACDGoldenCross(prices: number[]): boolean {
  if (prices.length < 36) return false;
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const diff = ema12 - ema26;
  const prevPrices = prices.slice(0, -1);
  const prevEma12 = calculateEMA(prevPrices, 12);
  const prevEma26 = calculateEMA(prevPrices, 26);
  const prevDiff = prevEma12 - prevEma26;
  return prevDiff <= 0 && diff > 0;
}

// ============ 回测引擎 ============

export async function runBacktest(
  params: BacktestParams,
  rules: StrategyRules
): Promise<BacktestResult> {
  const cache = await preloadBacktestData(params.startDate, params.endDate);
  return runBacktestWithCache(params, rules, cache);
}

export async function runBacktestWithCache(
  params: BacktestParams,
  rules: StrategyRules,
  cache: BacktestDataCache
): Promise<BacktestResult> {
  const startTime = performance.now();

  const { tradeDates, marketDataByDate, indicatorsByCode } = cache;

  const commissionRate = params.commissionRate ?? 0.0003;
  const slippage = params.slippage ?? 0.001;

  if (tradeDates.length === 0) {
    throw new Error('回测时间范围无效，数据库中无数据');
  }

  let cash = params.initialCapital;
  let positions: Position[] = [];
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let peakEquity = params.initialCapital;

  // 按日期循环
  for (let i = 0; i < tradeDates.length; i++) {
    const date = tradeDates[i];
    const dateStr = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

    // 从内存获取当日全市场数据
    const dailyDataMap = marketDataByDate.get(date);
    if (!dailyDataMap) continue;

    const marketData = Array.from(dailyDataMap.values());

    // 1. 检查持仓（止盈止损）
    const remainingPositions: Position[] = [];
    for (const pos of positions) {
      const data = dailyDataMap.get(pos.code);
      if (!data) {
        remainingPositions.push(pos);
        continue;
      }

      const currentPrice = data.close;
      pos.highestPrice = Math.max(pos.highestPrice, currentPrice);

      const stopLossPercent = rules.stopLossPercent ?? 8;
      const takeProfitPercent = rules.takeProfitPercent ?? 15;
      const trailingStopPercent = rules.trailingStopPercent ?? 5;
      const timeStopDays = rules.timeStopDays ?? 20;
      const timeStopMinGain = rules.timeStopMinGain ?? 3;

      const currentStopLoss = pos.entryPrice * (1 - stopLossPercent / 100);
      const currentTakeProfit = pos.entryPrice * (1 + takeProfitPercent / 100);
      const trailingStopPrice = pos.highestPrice * (1 - trailingStopPercent / 100);

      const holdingDays = i - tradeDates.indexOf(pos.entryDate.replace(/-/g, ''));
      const currentGainPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

      const stopLossTriggered = currentPrice <= currentStopLoss;
      const takeProfitTriggered = currentPrice >= currentTakeProfit;
      const trailingStopTriggered = currentPrice <= trailingStopPrice && currentPrice > pos.entryPrice;
      const timeStopTriggered = holdingDays >= timeStopDays && currentGainPercent < timeStopMinGain;

      if (stopLossTriggered || takeProfitTriggered || trailingStopTriggered || timeStopTriggered) {
        const sellPrice = currentPrice * (1 - slippage);
        const sellAmount = sellPrice * pos.shares;
        const commission = sellAmount * commissionRate;
        cash += sellAmount - commission;

        const profit = (sellPrice - pos.entryPrice) * pos.shares - commission;
        const profitPercent = ((sellPrice - pos.entryPrice) / pos.entryPrice) * 100;

        let signal = '时间止损';
        if (stopLossTriggered) signal = '止损信号';
        else if (takeProfitTriggered) signal = '止盈信号';
        else if (trailingStopTriggered) signal = '移动止盈';

        trades.push({
          id: `trade-${trades.length + 1}`,
          stockCode: pos.code,
          stockName: pos.name,
          entryDate: pos.entryDate,
          exitDate: dateStr,
          entryPrice: pos.entryPrice,
          exitPrice: sellPrice,
          shares: pos.shares,
          profit,
          profitPercent,
          holdingPeriod: holdingDays,
          signal,
        });
      } else {
        remainingPositions.push(pos);
      }
    }
    positions = remainingPositions;

    // 2. 选股（从内存读取预计算指标，使用增强评分）
    const candidates: { data: DailyMarketData; score: number; indicators: PrecomputedIndicators }[] = [];

    for (const data of marketData) {
      if (!data || data.close <= 0) continue;

      // 获取预计算指标
      const indicators = indicatorsByCode.get(data.code)?.get(date);
      if (!indicators) continue;

      // 判断策略类型
      const isMeanReversion = (rules as Record<string, unknown>).strategyType === 'mean-reversion';

      // 基础过滤条件
      let passFilter = true;

      if (isMeanReversion) {
        // 均值回归策略过滤：寻找超卖/回调股票
        const passBelowMA5 = !(rules as Record<string, unknown>).priceBelowMA5 || data.close < indicators.ma5;
        const passBelowMA20 = !(rules as Record<string, unknown>).priceBelowMA20 || data.close < indicators.ma20;
        const passRSI = (rules as Record<string, unknown>).rsiOversold === undefined || indicators.rsi <= ((rules as Record<string, unknown>).rsiOversold as number);
        const passBollinger = !(rules as Record<string, unknown>).bollingerBelowLower || data.close <= indicators.bollingerLower;
        const passDecline = (rules as Record<string, unknown>).maxConsecutiveDecline === undefined || indicators.consecutiveDecline >= ((rules as Record<string, unknown>).maxConsecutiveDecline as number);
        const passTurnover = !rules.minTurnoverRate || (data.turnoverRate || 0) >= rules.minTurnoverRate;
        const passMarketCap = (!rules.minMarketCap || (data.marketCap || 0) >= rules.minMarketCap) &&
                              (!rules.maxMarketCap || (data.marketCap || 0) <= rules.maxMarketCap);

        if (!passBelowMA5 || !passBelowMA20 || !passRSI || !passBollinger || !passDecline || !passTurnover || !passMarketCap) {
          passFilter = false;
        }
      } else {
        // 趋势策略过滤（原有逻辑）
        const passMA5 = !rules.priceAboveMA5 || data.close > indicators.ma5;
        const passMA20 = !rules.priceAboveMA20 || data.close > indicators.ma20;
        const passMA60 = !rules.weeklyMACDGoldenCross || data.close > indicators.ma60;
        const passMACD = !rules.weeklyMACDGoldenCross || indicators.macdGoldenCross;
        const passTurnover = !rules.minTurnoverRate || (data.turnoverRate || 0) >= rules.minTurnoverRate;
        const passVolumeRatio = !rules.minVolumeRatio || (data.volumeRatio || 0) >= rules.minVolumeRatio;
        const passMarketCap = (!rules.minMarketCap || (data.marketCap || 0) >= rules.minMarketCap) &&
                              (!rules.maxMarketCap || (data.marketCap || 0) <= rules.maxMarketCap);

        if (!passMA5 || !passMA20 || !passMA60 || !passMACD || !passTurnover || !passVolumeRatio || !passMarketCap) {
          passFilter = false;
        }
      }

      if (!passFilter) continue;

      // 增强评分系统
      let score = 50;

      if (isMeanReversion) {
        // 均值回归策略评分：回调越深、超卖越严重，分数越高
        if (data.changePercent < -3 && data.changePercent > -8) score += 15;
        else if (data.changePercent < -1 && data.changePercent >= -3) score += 10;
        else if (data.changePercent >= 0) score -= 10;

        // RSI超卖加分
        if (indicators.rsi < 20) score += 20;
        else if (indicators.rsi < 30) score += 15;
        else if (indicators.rsi < 40) score += 8;

        // 布林带偏离加分
        const bollingerDeviation = indicators.bollingerMid > indicators.bollingerLower
          ? (data.close - indicators.bollingerMid) / (indicators.bollingerMid - indicators.bollingerLower)
          : 0;
        if (bollingerDeviation < -1) score += 15;
        else if (bollingerDeviation < -0.5) score += 10;

        // 连续下跌加分
        if (indicators.consecutiveDecline >= 5) score += 10;
        else if (indicators.consecutiveDecline >= 3) score += 5;

        // 缩量回调加分（抛压减轻）
        if (indicators.volumeRatio5D20D < 0.8) score += 8;
        else if (indicators.volumeRatio5D20D < 1.0) score += 4;

        // 基本面加分（均值回归偏好低估值）
        if (data.pe && data.pe > 0 && data.pe < 20) score += 10;
        if (data.pb && data.pb > 0 && data.pb < 2) score += 8;

      } else {
        // 趋势策略评分（原有逻辑）
        score += indicators.trendStrength * 30;
        if (indicators.ma5 > indicators.ma20 && indicators.ma20 > indicators.ma60) score += 15;
        else if (indicators.ma5 > indicators.ma20) score += 8;
        if (indicators.macdGoldenCross) score += 10;
        if (indicators.volumeRatio5D20D > 1.5) score += 10;
        else if (indicators.volumeRatio5D20D > 1.2) score += 5;
        if (indicators.return20D > 5 && indicators.return20D < 30) score += 10;
        else if (indicators.return20D > 0 && indicators.return20D < 5) score += 5;
        else if (indicators.return20D < -10) score -= 10;

        // 当日涨幅适中
        if (data.changePercent > 2 && data.changePercent < 7) score += 5;
        else if (data.changePercent > 7) score -= 5;
        else if (data.changePercent < -3) score -= 5;
      }

      // 基本面加分（通用）
      if (data.pe && data.pe > 0 && data.pe < 30) score += 8;
      if (data.pb && data.pb > 0 && data.pb < 3) score += 5;
      if (data.marketCap && data.marketCap > 0 && data.marketCap < 200) score += 5;

      // 换手率适中
      if (data.turnoverRate && data.turnoverRate > 3 && data.turnoverRate < 15) score += 5;

      score = Math.max(0, Math.min(100, score));

      candidates.push({ data, score, indicators });
    }

    // 3. 买入
    let maxPositions = rules.maxPositions ?? 5;

    // 指数均线过滤：沪深300在MA20下方时，降低仓位上限
    const useIndexFilter = rules.maxIndexDrawdown !== undefined && rules.maxIndexDrawdown !== null;
    if (useIndexFilter) {
      const indexAbove = cache.indexAboveMA20.get(date) ?? true;
      if (!indexAbove) {
        maxPositions = Math.min(maxPositions, 2);
      }
    }

    const maxSingleStockPercent = rules.maxSingleStockPercent ?? 20;
    const minCashPercent = rules.minCashPercent ?? 10;
    const availableSlots = maxPositions - positions.length;

    // 最低评分过滤
    const minScore = rules.minScore ?? 0;
    if (minScore > 0) {
      const filtered = candidates.filter(c => c.score >= minScore);
      if (filtered.length === 0) {
        candidates.length = 0;
      } else {
        candidates.length = 0;
        candidates.push(...filtered);
      }
    }

    if (availableSlots > 0 && candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const selected = candidates.slice(0, availableSlots);

      const totalEquity = cash + positions.reduce((sum, pos) => {
        const data = dailyDataMap.get(pos.code);
        return sum + (data ? data.close * pos.shares : pos.entryPrice * pos.shares);
      }, 0);
      const maxPositionValue = totalEquity * (maxSingleStockPercent / 100);
      const minCash = totalEquity * (minCashPercent / 100);
      const availableCash = Math.max(0, cash - minCash);

      // 凯利仓位优化
      const useKelly = rules.useKellySizing === true;
      let kellyFraction = 1.0;
      if (useKelly && trades.length >= 10) {
        const wins = trades.filter(t => t.profit > 0);
        const losses = trades.filter(t => t.profit < 0);
        if (wins.length > 0 && losses.length > 0) {
          const avgWin = wins.reduce((s, t) => s + t.profitPercent, 0) / wins.length;
          const avgLoss = Math.abs(losses.reduce((s, t) => s + t.profitPercent, 0) / losses.length);
          const winRate = wins.length / (wins.length + losses.length);
          if (avgLoss > 0) {
            const rawKelly = winRate - (1 - winRate) / (avgWin / avgLoss);
            kellyFraction = Math.max(0.5, Math.min(1.0, rawKelly));
          }
        }
      }

      for (const { data: stock } of selected) {
        const buyPrice = stock.close * (1 + slippage);
        const maxBuyAmount = Math.min(maxPositionValue, availableCash / availableSlots) * kellyFraction;
        const shares = Math.floor(maxBuyAmount / buyPrice / 100) * 100;
        if (shares < 100) continue;

        const buyAmount = buyPrice * shares;
        const commission = buyAmount * commissionRate;

        if (cash < buyAmount + commission) continue;

        cash -= buyAmount + commission;

        positions.push({
          code: stock.code,
          name: await getName(stock.code),
          entryPrice: buyPrice,
          shares,
          entryDate: dateStr,
          highestPrice: buyPrice,
        });
      }
    }

    // 4. 记录权益曲线
    const totalPositionValue = positions.reduce((sum, pos) => {
      const data = dailyDataMap.get(pos.code);
      return sum + (data ? data.close * pos.shares : pos.entryPrice * pos.shares);
    }, 0);

    const totalEquity = cash + totalPositionValue;
    peakEquity = Math.max(peakEquity, totalEquity);
    const drawdown = ((peakEquity - totalEquity) / peakEquity) * 100;

    equityCurve.push({
      date: dateStr,
      equity: totalEquity,
      drawdown,
    });
  }

  // 计算最终指标
  const finalEquity = equityCurve[equityCurve.length - 1]?.equity || params.initialCapital;
  const totalReturn = ((finalEquity - params.initialCapital) / params.initialCapital) * 100;
  const years = tradeDates.length / 252;
  const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : 0;
  const maxDrawdown = Math.max(...equityCurve.map(p => p.drawdown));

  const winningTrades = trades.filter(t => t.profit > 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.profitPercent, 0) / winningTrades.length
    : 0;
  const losingTrades = trades.filter(t => t.profit <= 0);
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + Math.abs(t.profitPercent), 0) / losingTrades.length
    : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

  const dailyReturns = equityCurve.slice(1).map((p, i) => (p.equity - equityCurve[i].equity) / equityCurve[i].equity);
  const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const dailyStd = Math.sqrt(dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length);
  const sharpeRatio = dailyStd > 0 ? ((avgDailyReturn * 252 - 0.03) / (dailyStd * Math.sqrt(252))) : 0;

  const totalMs = performance.now() - startTime;
  console.log(`[Backtest] 回测完成: ${tradeDates.length}天, ${trades.length}笔交易, 耗时${totalMs.toFixed(0)}ms`);

  return {
    strategyId: params.strategyId,
    strategyName: '策略回测',
    startDate: params.startDate,
    endDate: params.endDate,
    initialCapital: params.initialCapital,
    finalCapital: finalEquity,
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    sharpeRatio,
    winRate,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWin,
    avgLoss,
    profitFactor,
    trades,
    equityCurve,
  };
}

// ============ API路由 ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { params, rules } = body as { params: BacktestParams; rules: StrategyRules };

    if (!params || !params.strategyId || !params.startDate || !params.endDate) {
      return NextResponse.json({ success: false, error: '缺少必要参数' });
    }

    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 1825) {
      return NextResponse.json({ success: false, error: '回测时间范围不能超过5年' });
    }
    if (daysDiff < 30) {
      return NextResponse.json({ success: false, error: '回测时间范围至少30天' });
    }

    const result = await runBacktest(params, rules);

    try {
      await saveBacktestResult(result);
    } catch (dbError) {
      console.warn('保存回测结果失败（不影响回测结果）:', dbError);
    }

    return NextResponse.json({ success: true, data: result, timestamp: Date.now() });
  } catch (error) {
    console.error('回测失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '回测执行失败',
      timestamp: Date.now(),
    });
  }
}

async function saveBacktestResult(result: BacktestResult) {
  const database = await getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id TEXT,
      strategy_name TEXT,
      start_date TEXT,
      end_date TEXT,
      initial_capital REAL,
      final_capital REAL,
      total_return REAL,
      annualized_return REAL,
      max_drawdown REAL,
      sharpe_ratio REAL,
      win_rate REAL,
      total_trades INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  const insert = database.prepare(`
    INSERT INTO backtest_results
    (strategy_id, strategy_name, start_date, end_date, initial_capital, final_capital,
     total_return, annualized_return, max_drawdown, sharpe_ratio, win_rate, total_trades)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    result.strategyId, result.strategyName,
    result.startDate, result.endDate,
    result.initialCapital, result.finalCapital,
    result.totalReturn, result.annualizedReturn,
    result.maxDrawdown, result.sharpeRatio,
    result.winRate, result.totalTrades
  );
}
