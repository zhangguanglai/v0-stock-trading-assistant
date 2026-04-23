// 策略回测引擎 API
// 基于本地SQLite历史数据执行策略规则，计算回测指标

import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataByDate, getKlineHistory } from '@/lib/db/sqlite';
import type { BacktestParams, BacktestResult, BacktestTrade, EquityPoint } from '@/lib/types';

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
    
    // 2. 选股（基于策略规则）
    const candidates: typeof marketData = [];
    for (const data of marketData) {
      if (!data || data.close <= 0) continue;
      
      // 基本面筛选
      if (rules.maxMarketCap && data.marketCap && data.marketCap > rules.maxMarketCap) continue;
      if (rules.minMarketCap && data.marketCap && data.marketCap < rules.minMarketCap) continue;
      if (rules.maxPE && data.pe && data.pe > rules.maxPE) continue;
      
      // 技术面筛选（从本地数据库查询历史数据）
      if (rules.priceAboveMA5 || rules.priceAboveMA20 || rules.weeklyMACDGoldenCross) {
        // 计算历史数据开始日期（30天前）
        const histStart = new Date(dateStr);
        histStart.setDate(histStart.getDate() - 40);
        const histStartStr = histStart.toISOString().slice(0, 10).replace(/-/g, '');
        
        const histData = getKlineHistory(data.code, histStartStr, date);
        if (histData.length < 20) continue;
        
        const prices = histData.map(h => h.close);
        const ma5 = calculateMA(prices, 5);
        const ma20 = calculateMA(prices, 20);
        
        if (rules.priceAboveMA5 && data.close <= ma5) continue;
        if (rules.priceAboveMA20 && data.close <= ma20) continue;
        if (rules.weeklyMACDGoldenCross && !calculateMACDGoldenCross(prices)) continue;
      }
      
      // 资金面筛选
      if (rules.minTurnoverRate && data.turnoverRate && data.turnoverRate < rules.minTurnoverRate) continue;
      if (rules.minVolumeRatio && data.volumeRatio && data.volumeRatio < rules.minVolumeRatio) continue;
      
      candidates.push(data);
    }
    
    // 3. 买入（按评分排序，选择前N只）
    const maxPositions = 5; // 最大持仓数
    const availableSlots = maxPositions - positions.length;
    
    if (availableSlots > 0 && candidates.length > 0) {
      // 按涨跌幅排序（简单评分）
      candidates.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
      
      const selected = candidates.slice(0, availableSlots);
      const positionSize = cash / (availableSlots + 1); // 预留部分现金
      
      for (const stock of selected) {
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
