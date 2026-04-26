// 策略回测引擎 API
// 基于本地SQLite历史数据执行策略规则，计算回测指标

import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataByDate, getKlineHistory, getDatabase } from '@/lib/db/sqlite';
import type { BacktestParams, BacktestResult, BacktestTrade, EquityPoint } from '@/lib/types';
import { checkStockRules, type FilterContext } from '@/lib/stock-scan/filter-engine';

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
}

interface Position {
  code: string;
  name: string;
  entryPrice: number;
  shares: number;
  entryDate: string;
  stopLossPrice: number;
  takeProfitPrice: number;
  highestPrice: number;
}

// 获取日期范围内的所有交易日
function getTradeDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) { // 排除周末
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }
  }
  
  return dates;
}

// 计算MA
function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// 计算EMA
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// 计算MACD金叉
function calculateMACDGoldenCross(prices: number[]): boolean {
  if (prices.length < 35) return false;
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const diff = ema12 - ema26;
  
  if (prices.length < 36) return false;
  const prevPrices = prices.slice(0, -1);
  const prevEma12 = calculateEMA(prevPrices, 12);
  const prevEma26 = calculateEMA(prevPrices, 26);
  const prevDiff = prevEma12 - prevEma26;
  
  return prevDiff <= 0 && diff > 0;
}

// 回测引擎主函数
async function runBacktest(
  params: BacktestParams,
  rules: StrategyRules
): Promise<BacktestResult> {
  const tradeDates = getTradeDates(params.startDate, params.endDate);
  
  if (tradeDates.length === 0) {
    throw new Error('回测时间范围无效');
  }
  
  // 初始化回测状态
  let cash = params.initialCapital;
  let positions: Position[] = [];
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let peakEquity = params.initialCapital;
  
  // 按日期循环
  for (let i = 0; i < tradeDates.length; i++) {
    const date = tradeDates[i];
    const dateStr = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    
    // 从本地数据库获取当日全市场数据
    const marketData = getMarketDataByDate(date);
    const dailyDataMap = new Map(marketData.map(d => [d.code, d]));
    
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
      
      // 检查止损
      const stopLossTriggered = currentPrice <= pos.stopLossPrice;
      // 检查止盈
      const takeProfitTriggered = currentPrice >= pos.takeProfitPrice;
      // 检查时间止损（持有超过20天）
      const holdingDays = i - tradeDates.indexOf(pos.entryDate.replace(/-/g, ''));
      const timeStopTriggered = holdingDays >= 20;
      
      if (stopLossTriggered || takeProfitTriggered || timeStopTriggered) {
        // 卖出
        const sellAmount = currentPrice * pos.shares;
        const commission = sellAmount * params.commissionRate;
        cash += sellAmount - commission;
        
        const profit = (currentPrice - pos.entryPrice) * pos.shares - commission;
        const profitPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        
        trades.push({
          id: `trade-${trades.length + 1}`,
          stockCode: pos.code,
          stockName: pos.name,
          entryDate: pos.entryDate,
          exitDate: dateStr,
          entryPrice: pos.entryPrice,
          exitPrice: currentPrice,
          shares: pos.shares,
          profit,
          profitPercent,
          holdingPeriod: holdingDays,
          signal: stopLossTriggered ? '止损信号' : takeProfitTriggered ? '止盈信号' : '时间止损',
        });
      } else {
        remainingPositions.push(pos);
      }
    }
    positions = remainingPositions;
    
    // 2. 选股（基于策略规则，复用 filter-engine）
    const candidates: { data: typeof marketData[0]; score: number }[] = [];
    for (const data of marketData) {
      if (!data || data.close <= 0) continue;
      
      // 构建 FilterContext
      const ctx: FilterContext = {
        code: data.code,
        quote: {
          price: data.close,
          changePercent: data.changePercent || 0,
          volume: data.volume || 0,
          amount: data.amount || 0,
          name: data.code,
        },
        basicData: {
          marketCap: data.marketCap || 0,
          pe: data.pe || 0,
          pb: data.pb || 0,
          turnoverRate: data.turnoverRate || 0,
          volumeRatio: data.volumeRatio || 0,
        },
        finance: null,
        technical: null,
        sector: null,
      };
      
      // 技术面数据（从本地数据库查询）
      if (rules.priceAboveMA5 || rules.priceAboveMA20 || rules.weeklyMACDGoldenCross) {
        const histStart = new Date(dateStr);
        histStart.setDate(histStart.getDate() - 40);
        const histStartStr = histStart.toISOString().slice(0, 10).replace(/-/g, '');
        
        const histData = getKlineHistory(data.code, histStartStr, date);
        if (histData.length < 20) continue;
        
        const prices = histData.map(h => h.close);
        const ma5 = calculateMA(prices, 5);
        const ma20 = calculateMA(prices, 20);
        
        ctx.technical = {
          ma5,
          ma20,
          weeklyMACDGoldenCross: calculateMACDGoldenCross(prices),
        };
      }
      
      const filterResult = checkStockRules(rules, ctx);
      if (filterResult.meetsRules) {
        candidates.push({ data, score: filterResult.score });
      }
    }
    
    // 3. 买入（按评分排序，选择前N只）
    const maxPositions = 5; // 最大持仓数
    const availableSlots = maxPositions - positions.length;
    
    if (availableSlots > 0 && candidates.length > 0) {
      // 按 filter-engine 的综合评分排序
      candidates.sort((a, b) => b.score - a.score);
      
      const selected = candidates.slice(0, availableSlots);
      const positionSize = cash / (availableSlots + 1); // 预留部分现金
      
      for (const { data: stock } of selected) {
        if (cash < positionSize * 1.1) break; // 保留10%缓冲
        
        const shares = Math.floor(positionSize / stock.close / 100) * 100; // 100股整数
        if (shares < 100) continue;
        
        const buyAmount = stock.close * shares;
        const commission = buyAmount * params.commissionRate;
        
        if (cash < buyAmount + commission) continue;
        
        cash -= buyAmount + commission;
        
        positions.push({
          code: stock.code,
          name: stock.code, // 本地数据库暂无名称，用代码代替
          entryPrice: stock.close,
          shares,
          entryDate: dateStr,
          stopLossPrice: stock.close * 0.92, // 8%止损
          takeProfitPrice: stock.close * 1.15, // 15%止盈
          highestPrice: stock.close,
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
  
  // 年化收益
  const years = tradeDates.length / 252;
  const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : 0;
  
  // 最大回撤
  const maxDrawdown = Math.max(...equityCurve.map(p => p.drawdown));
  
  // 胜率
  const winningTrades = trades.filter(t => t.profit > 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  
  // 平均盈亏
  const avgWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + t.profitPercent, 0) / winningTrades.length 
    : 0;
  const losingTrades = trades.filter(t => t.profit <= 0);
  const avgLoss = losingTrades.length > 0 
    ? losingTrades.reduce((sum, t) => sum + Math.abs(t.profitPercent), 0) / losingTrades.length 
    : 0;
  
  // 盈亏比
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  // 夏普比率（简化版，假设无风险利率3%）
  const dailyReturns = equityCurve.slice(1).map((p, i) => (p.equity - equityCurve[i].equity) / equityCurve[i].equity);
  const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const dailyStd = Math.sqrt(dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length);
  const sharpeRatio = dailyStd > 0 ? ((avgDailyReturn * 252 - 0.03) / (dailyStd * Math.sqrt(252))) : 0;
  
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

// API路由处理
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { params, rules } = body as { params: BacktestParams; rules: StrategyRules };
    
    if (!params || !params.strategyId || !params.startDate || !params.endDate) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数',
      });
    }
    
    // 限制回测时间范围（最多5年）
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 1825) { // 5年
      return NextResponse.json({
        success: false,
        error: '回测时间范围不能超过5年',
      });
    }
    
    if (daysDiff < 30) {
      return NextResponse.json({
        success: false,
        error: '回测时间范围至少30天',
      });
    }
    
    const result = await runBacktest(params, rules);
    
    // 持久化保存回测结果
    try {
      saveBacktestResult(result);
    } catch (dbError) {
      console.warn('保存回测结果失败（不影响回测结果）:', dbError);
    }
    
    return NextResponse.json({
      success: true,
      data: result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('回测失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '回测执行失败',
      timestamp: Date.now(),
    });
  }
}

// 持久化保存回测结果到 SQLite
function saveBacktestResult(result: BacktestResult) {
  const database = getDatabase();
  
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
