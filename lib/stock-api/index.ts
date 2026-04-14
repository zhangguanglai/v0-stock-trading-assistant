// 股票数据API统一导出

export * from './types';
export * from './sina-api';
export * from './tushare-api';
export * from './indicators';

// 便捷方法：获取股票完整数据（实时行情 + 技术指标）
import { getRealtimeQuote, getBatchQuotes } from './sina-api';
import { getDailyKLine, isTushareConfigured } from './tushare-api';
import { calculateAllIndicators, generateSignals, calculateScore } from './indicators';
import type { RealtimeQuote, TechnicalIndicators, StockSignal, ApiResponse } from './types';

export interface StockFullData {
  quote: RealtimeQuote;
  indicators: TechnicalIndicators | null;
  signals: StockSignal[];
  score: number;
}

// 获取单只股票的完整数据
export async function getStockFullData(code: string): Promise<ApiResponse<StockFullData>> {
  // 1. 获取实时行情
  const quoteResult = await getRealtimeQuote(code);
  if (!quoteResult.success || !quoteResult.data) {
    return {
      success: false,
      error: quoteResult.error || '获取行情失败',
      timestamp: Date.now(),
    };
  }
  
  const quote = quoteResult.data;
  let indicators: TechnicalIndicators | null = null;
  let signals: StockSignal[] = [];
  let score = 50;
  
  // 2. 如果Tushare配置了，获取K线计算技术指标
  if (isTushareConfigured()) {
    const klineResult = await getDailyKLine(code);
    if (klineResult.success && klineResult.data && klineResult.data.length > 0) {
      indicators = calculateAllIndicators(klineResult.data);
      signals = generateSignals(quote.price, indicators);
      score = calculateScore(indicators, signals);
    }
  } else {
    // 没有Tushare时，使用简化的信号生成
    signals = generateSimpleSignals(quote);
    score = 50 + signals.filter(s => s.type === 'buy').length * 10 
              - signals.filter(s => s.type === 'sell').length * 10;
  }
  
  return {
    success: true,
    data: {
      quote,
      indicators,
      signals,
      score: Math.max(0, Math.min(100, score)),
    },
    timestamp: Date.now(),
  };
}

// 简化的信号生成（不依赖K线数据）
function generateSimpleSignals(quote: RealtimeQuote): StockSignal[] {
  const signals: StockSignal[] = [];
  const now = new Date().toISOString();
  
  // 涨跌幅信号
  if (quote.changePercent > 5) {
    signals.push({
      type: 'buy',
      name: '大幅上涨',
      strength: quote.changePercent > 7 ? 'strong' : 'medium',
      description: `今日涨幅${quote.changePercent.toFixed(2)}%，势头强劲`,
      triggeredAt: now,
    });
  } else if (quote.changePercent < -5) {
    signals.push({
      type: 'sell',
      name: '大幅下跌',
      strength: quote.changePercent < -7 ? 'strong' : 'medium',
      description: `今日跌幅${Math.abs(quote.changePercent).toFixed(2)}%，注意风险`,
      triggeredAt: now,
    });
  }
  
  // 成交量信号（简化判断）
  if (quote.volume > 0 && quote.amount > 0) {
    const avgPrice = quote.amount / quote.volume;
    if (avgPrice > quote.prevClose * 1.02) {
      signals.push({
        type: 'buy',
        name: '均价上移',
        strength: 'weak',
        description: '成交均价高于昨收，买盘积极',
        triggeredAt: now,
      });
    }
  }
  
  return signals;
}

// 批量获取股票完整数据
export async function getBatchStockFullData(codes: string[]): Promise<ApiResponse<StockFullData[]>> {
  if (codes.length === 0) {
    return { success: true, data: [], timestamp: Date.now() };
  }
  
  // 获取批量行情
  const quotesResult = await getBatchQuotes(codes);
  if (!quotesResult.success || !quotesResult.data) {
    return {
      success: false,
      error: quotesResult.error,
      timestamp: Date.now(),
    };
  }
  
  const results: StockFullData[] = quotesResult.data.map(quote => ({
    quote,
    indicators: null,
    signals: generateSimpleSignals(quote),
    score: 50,
  }));
  
  return {
    success: true,
    data: results,
    timestamp: Date.now(),
  };
}
