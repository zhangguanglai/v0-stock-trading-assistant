// 智能选股扫描API
// 根据策略规则扫描符合条件的股票
import { NextRequest, NextResponse } from 'next/server';
import { getBatchQuotes, getDailyBasic, getStockBasic, getFinanceIndicators, isTushareConfigured } from '@/lib/stock-api';

export const dynamic = 'force-dynamic';

// 策略规则接口（从请求参数解析）
interface StrategyRules {
  maxMarketCap?: number;      // 最大市值（亿）
  minMarketCap?: number;      // 最小市值（亿）
  minROE?: number;            // 最小ROE
  maxDebtRatio?: number;      // 最大负债率
  minTurnoverRate?: number;   // 最小换手率
  maxPE?: number;             // 最大PE
  minPB?: number;             // 最小PB
  maxPB?: number;             // 最大PB
}

// 小市值股票池（用于市值<100亿筛选）
// 这些是市值相对较小的股票示例
const SMALL_CAP_STOCKS = [
  // 小市值股票示例（需要验证实际市值）
  '002049', // 紫光国微
  '300122', // 智飞生物
  '002371', // 北方华创
  '300274', // 阳光电源
  '300750', // 宁德时代（大市值，用于对比验证）
  '000977', // 浪潮信息
  '002415', // 海康威视（大市值，用于对比验证）
  '300014', // 亿纬锂能
  '002230', // 科大讯飞
  '300033', // 同花顺
  '300059', // 东方财富
  '002241', // 歌尔股份
  '300124', // 汇川技术
  '002352', // 顺丰控股
  '300015', // 爱尔眼科
  '600745', // 闻泰科技
  '002714', // 牧原股份
  '300760', // 迈瑞医疗
  '603501', // 韦尔股份
  '688981', // 中芯国际
];

// GET /api/stock/scan?maxMarketCap=100&minROE=10
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // 解析策略规则参数
    const rules: StrategyRules = {
      maxMarketCap: searchParams.get('maxMarketCap') ? Number(searchParams.get('maxMarketCap')) : undefined,
      minMarketCap: searchParams.get('minMarketCap') ? Number(searchParams.get('minMarketCap')) : undefined,
      minROE: searchParams.get('minROE') ? Number(searchParams.get('minROE')) : undefined,
      maxDebtRatio: searchParams.get('maxDebtRatio') ? Number(searchParams.get('maxDebtRatio')) : undefined,
      minTurnoverRate: searchParams.get('minTurnoverRate') ? Number(searchParams.get('minTurnoverRate')) : undefined,
      maxPE: searchParams.get('maxPE') ? Number(searchParams.get('maxPE')) : undefined,
      minPB: searchParams.get('minPB') ? Number(searchParams.get('minPB')) : undefined,
      maxPB: searchParams.get('maxPB') ? Number(searchParams.get('maxPB')) : undefined,
    };
    
    // 1. 获取实时行情
    const quotesResult = await getBatchQuotes(SMALL_CAP_STOCKS);
    
    if (!quotesResult.success || !quotesResult.data) {
      return NextResponse.json({
        success: false,
        error: quotesResult.error || '获取行情失败',
        timestamp: Date.now(),
      });
    }
    
    // 2. 如果配置了Tushare，获取基本面数据（含市值、行业、ROE等）
    let basicDataMap: Map<string, {
      marketCap: number;
      pe: number;
      pb: number;
      turnoverRate: number;
      volumeRatio: number;
    }> = new Map();
    
    let industryMap: Map<string, string> = new Map();
    let financeMap: Map<string, { roe: number; debtRatio: number }> = new Map();
    
    if (isTushareConfigured()) {
      // 获取每日基本面数据（市值、换手率等）
      const basicResult = await getDailyBasic(SMALL_CAP_STOCKS);
      if (basicResult.success && basicResult.data) {
        basicResult.data.forEach(item => {
          basicDataMap.set(item.code, {
            marketCap: item.marketCap,
            pe: item.pe,
            pb: item.pb,
            turnoverRate: item.turnoverRate,
            volumeRatio: item.volumeRatio,
          });
        });
      }
      
      // 获取股票基本信息（行业）
      const stockInfoResult = await getStockBasic();
      if (stockInfoResult.success && stockInfoResult.data) {
        stockInfoResult.data.forEach(item => {
          industryMap.set(item.code, item.industry || '未知');
        });
      }
      
      // 获取财务指标（ROE、负债率）- 只获取前几只，避免API限制
      for (const code of SMALL_CAP_STOCKS.slice(0, 10)) {
        try {
          const finResult = await getFinanceIndicators(code);
          if (finResult.success && finResult.data) {
            financeMap.set(code, {
              roe: finResult.data.roe,
              debtRatio: finResult.data.debtRatio,
            });
          }
        } catch {
          // 忽略单个股票的错误
        }
      }
    }
    
    // 3. 基于规则筛选
    const scanResults = quotesResult.data
      .filter(quote => quote.price > 0)
      .map(quote => {
        const code = quote.code.replace(/^(sh|sz|bj)/, '');
        const basicData = basicDataMap.get(code);
        
        // 规则验证
        const ruleChecks: { rule: string; pass: boolean; value?: string }[] = [];
        let meetsAllRules = true;
        
        // 市值规则验证
        if (basicData && rules.maxMarketCap !== undefined) {
          const pass = basicData.marketCap <= rules.maxMarketCap;
          ruleChecks.push({
            rule: `市值 < ${rules.maxMarketCap}亿`,
            pass,
            value: `${basicData.marketCap.toFixed(0)}亿`,
          });
          if (!pass) meetsAllRules = false;
        }
        
        if (basicData && rules.minMarketCap !== undefined) {
          const pass = basicData.marketCap >= rules.minMarketCap;
          ruleChecks.push({
            rule: `市值 > ${rules.minMarketCap}亿`,
            pass,
            value: `${basicData.marketCap.toFixed(0)}亿`,
          });
          if (!pass) meetsAllRules = false;
        }
        
        // PE规则验证
        if (basicData && rules.maxPE !== undefined && basicData.pe > 0) {
          const pass = basicData.pe <= rules.maxPE;
          ruleChecks.push({
            rule: `PE < ${rules.maxPE}`,
            pass,
            value: `${basicData.pe.toFixed(1)}`,
          });
          if (!pass) meetsAllRules = false;
        }
        
        // 换手率规则验证
        if (basicData && rules.minTurnoverRate !== undefined) {
          const pass = basicData.turnoverRate >= rules.minTurnoverRate;
          ruleChecks.push({
            rule: `换手率 > ${rules.minTurnoverRate}%`,
            pass,
            value: `${basicData.turnoverRate.toFixed(2)}%`,
          });
          if (!pass) meetsAllRules = false;
        }
        
        // 计算评分
        let score = 50;
        
        // 涨跌幅评分
        if (quote.changePercent > 0 && quote.changePercent < 5) {
          score += 10;
        } else if (quote.changePercent >= 5) {
          score += 5;
        } else if (quote.changePercent < -5) {
          score -= 15;
        }
        
        // 市值评分（小市值加分）
        if (basicData) {
          if (basicData.marketCap < 50) {
            score += 15;
          } else if (basicData.marketCap < 100) {
            score += 10;
          } else if (basicData.marketCap < 200) {
            score += 5;
          }
        }
        
        // 获取行业和财务数据
        const industry = industryMap.get(code) || '待分类';
        const finance = financeMap.get(code);
        
        return {
          code,
          name: quote.name,
          price: quote.price,
          changePercent: quote.changePercent,
          volume: quote.volume,
          amount: quote.amount,
          industry,
          marketCap: basicData?.marketCap || null,
          pe: basicData?.pe || null,
          pb: basicData?.pb || null,
          turnoverRate: basicData?.turnoverRate || null,
          volumeRatio: basicData?.volumeRatio || 1,
          roe: finance?.roe || null,
          debtRatio: finance?.debtRatio || null,
          score: Math.max(0, Math.min(100, score)),
          ruleChecks,
          meetsRules: meetsAllRules,
        };
      })
      .sort((a, b) => {
        // 先按是否符合规则排序，再按评分排序
        if (a.meetsRules !== b.meetsRules) {
          return a.meetsRules ? -1 : 1;
        }
        return b.score - a.score;
      });
    
    // 统计
    const matchCount = scanResults.filter(s => s.meetsRules).length;
    
    return NextResponse.json({
      success: true,
      data: {
        stocks: scanResults,
        total: scanResults.length,
        matchCount,
        rules,
        tushareConfigured: isTushareConfigured(),
        scanTime: new Date().toISOString(),
        note: isTushareConfigured() 
          ? `已获取市值等基本面数据，共${matchCount}只符合规则` 
          : '未配置Tushare Token，无法获取市值数据进行精确筛选',
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[v0] Scan error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '扫描失败',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
