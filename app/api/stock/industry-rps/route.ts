import { NextRequest, NextResponse } from 'next/server';
import { isTushareConfigured, tushareRequest } from '@/lib/stock-api';

export const dynamic = 'force-dynamic';

interface IndustryRPS {
  industry: string;
  rps20: number;           // 20日RPS（基于全市场行业排名）
  change20d: number;       // 20日平均涨跌幅(%)
  stockCount: number;      // 行业内股票数
}

// 获取全市场行业RPS20数据
export async function GET(request: NextRequest) {
  try {
    if (!isTushareConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Tushare未配置',
        data: []
      });
    }

    // Step 1: 获取全市场股票基本信息（含行业）
    const stockBasicResult = await tushareRequest<{
      fields: string[];
      items: (string | number)[][];
    }>('stock_basic', { list_status: 'L' }, 'ts_code,symbol,name,industry');

    if (!stockBasicResult.success || !stockBasicResult.data) {
      return NextResponse.json({
        success: false,
        error: '获取股票基本信息失败',
        data: []
      });
    }

    // Step 2: 按行业分组统计
    const fields = stockBasicResult.data.fields || [];
    const industryIdx = fields.indexOf('industry');
    
    if (industryIdx < 0) {
      return NextResponse.json({
        success: false,
        error: '行业字段不存在',
        data: []
      });
    }

    const industryStocks = new Map<string, string[]>(); // industry -> [codes]
    
    stockBasicResult.data.items.forEach(item => {
      const tsCode = String(item[0]);
      const code = tsCode.split('.')[0];
      const industry = String(item[industryIdx] || '未知');
      
      if (!industryStocks.has(industry)) {
        industryStocks.set(industry, []);
      }
      industryStocks.get(industry)!.push(code);
    });

    // Step 3: 获取各行业代表性股票的20日涨幅（采样，每行业取前5只）
    const industryChanges = new Map<string, { totalChange: number; count: number }>();
    
    for (const [industry, codes] of industryStocks.entries()) {
      // 采样：最多取前10只计算（避免API调用过多）
      const sampleCodes = codes.slice(0, 10);
      let totalChange = 0;
      let validCount = 0;
      
      for (const code of sampleCodes.slice(0, 5)) {
        try {
          // 获取20日前和当前的价格来计算涨幅
          const klineResult = await tushareRequest<{
            fields: string[];
            items: (string | number | null)[][];
          }>('daily', {
            ts_code: code.startsWith('6') ? `${code}.SH` : `${code}.SZ`,
            start_date: getDateString(-20),
            end_date: getDateString(0),
          }, 'trade_date,close');
          
          if (klineResult.success && klineResult.data && klineResult.data.items.length >= 2) {
            const items = klineResult.data.items;
            const firstClose = Number(items[0][1]);   // 20天前的收盘价
            const lastClose = Number(items[items.length - 1][1]); // 最新的收盘价
            
            if (firstClose > 0 && lastClose > 0) {
              const change = ((lastClose - firstClose) / firstClose) * 100;
              totalChange += change;
              validCount++;
            }
          }
        } catch {
          // 忽略单只股票错误
        }
        
        // 短暂延迟避免限流
        if (sampleCodes.indexOf(code) < 4 && sampleCodes.indexOf(code) >= 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      if (validCount > 0) {
        industryChanges.set(industry, {
          totalChange: totalChange / validCount,
          count: codes.length
        });
      } else {
        industryChanges.set(industry, {
          totalChange: 0,
          count: codes.length
        });
      }
    }

    // Step 4: 计算RPS20（全市场行业排名）
    const allIndustries = Array.from(industryChanges.entries())
      .map(([name, data]) => ({
        industry: name,
        change20d: data.totalChange,
        stockCount: data.count
      }))
      .sort((a, b) => b.change20d - a.change20d);

    const totalIndustries = allIndustries.length;
    const result: IndustryRPS[] = allIndustries.map((item, index) => ({
      ...item,
      rps20: totalIndustries > 1 ? Math.round((1 - index / (totalIndustries - 1)) * 100) : 100
    }));

    return NextResponse.json({
      success: true,
      data: result,
      total: result.length,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Industry RPS API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误',
      data: []
    });
  }
}

function getDateString(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0].replace(/-/g, '');
}
