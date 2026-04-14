// 智能选股扫描API
// 根据策略规则扫描符合条件的股票
import { NextRequest, NextResponse } from 'next/server';
import { getBatchQuotes, isTushareConfigured } from '@/lib/stock-api';

export const dynamic = 'force-dynamic';

// 热门股票池（用于演示扫描功能）
const HOT_STOCKS = [
  '600519', '000858', '600036', '601318', '000333',
  '600900', '601166', '600276', '000651', '002475',
  '600030', '601398', '600887', '000568', '603259',
  '002304', '600585', '601888', '600309', '000001',
];

// GET /api/stock/scan
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const strategy = searchParams.get('strategy'); // 策略ID（暂未使用）
    
    // 获取热门股票实时行情
    const quotesResult = await getBatchQuotes(HOT_STOCKS);
    
    if (!quotesResult.success || !quotesResult.data) {
      return NextResponse.json({
        success: false,
        error: quotesResult.error || '获取行情失败',
        timestamp: Date.now(),
      });
    }
    
    // 基础筛选（演示用）
    // 真实场景需要结合Tushare获取历史K线计算技术指标
    const scanResults = quotesResult.data
      .filter(quote => quote.price > 0)
      .map(quote => {
        // 简单评分逻辑
        let score = 50;
        const signals: string[] = [];
        
        // 涨幅正向
        if (quote.changePercent > 0 && quote.changePercent < 5) {
          score += 10;
          signals.push('温和上涨');
        } else if (quote.changePercent >= 5) {
          score += 5;
          signals.push('强势上涨');
        } else if (quote.changePercent < -5) {
          score -= 15;
          signals.push('大幅下跌');
        }
        
        // 成交活跃
        if (quote.amount > 1000000000) { // 成交额>10亿
          score += 10;
          signals.push('成交活跃');
        }
        
        return {
          code: quote.code.replace(/^(sh|sz|bj)/, ''),
          name: quote.name,
          price: quote.price,
          changePercent: quote.changePercent,
          volume: quote.volume,
          amount: quote.amount,
          score: Math.max(0, Math.min(100, score)),
          signals,
          meetsRules: score >= 60,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // 返回前10只
    
    return NextResponse.json({
      success: true,
      data: {
        stocks: scanResults,
        total: scanResults.length,
        tushareConfigured: isTushareConfigured(),
        scanTime: new Date().toISOString(),
        note: isTushareConfigured() 
          ? '已接入Tushare，可获取完整技术指标' 
          : '未配置Tushare Token，仅使用实时行情简单筛选',
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '扫描失败',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
