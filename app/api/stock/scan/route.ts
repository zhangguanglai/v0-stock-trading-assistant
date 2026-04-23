// 智能选股扫描API
// 方案C增强版：Tushare daily_basic全市场 + Sina实时行情 + fina_indicator财务数据
// 5000积分权限支持
import { NextRequest, NextResponse } from 'next/server';
import { getBatchQuotes, getFinanceIndicators, isTushareConfigured, getDailyKLine, detectBuySignal } from '@/lib/stock-api';
import { getAllDailyBasic, getStockBasic, getAllStockBasic, getConceptIndices, getConceptDaily, getConceptMembers, isTradingHours } from '@/lib/stock-api/tushare-api';
import type { BuySignal, RealtimeQuote } from '@/lib/stock-api/types';
import type { BuyRuleConfig } from '@/lib/stock-api/indicators';
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
  // 买入信号规则（用于buySignal检测）
  buyMa5CrossMa20?: boolean;
  buyMacdGoldenCross?: boolean;
  buyCandleConfirm?: boolean;
  buyVolumeConfirm?: boolean;
}

interface ScanStock {
  code: string;
  name: string;
  price: number;
  priceSource: 'realtime' | 'close'; // 价格来源：实时行情或收盘价
  changePercent: number;
  volume: number;
  amount: number;
  industry: string;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  turnoverRate: number | null;
  volumeRatio: number;
  roe: number | null;
  debtRatio: number | null;
  score: number;
  ruleChecks: { rule: string; pass: boolean; value?: string }[];
  meetsRules: boolean;
  buySignal?: BuySignal;
}

interface ScanFunnelStep {
  label: string;
  count: number;
  filter: string;
}


// 获取候选股票池 + 基本面数据
async function getCandidateStocks(rules: StrategyRules): Promise<{
  codes: string[];
  filteredCount: number;
  basicDataMap: Map<string, {
    marketCap: number;
    pe: number;
    pb: number;
    turnoverRate: number;
    volumeRatio: number;
  }>;
  source: string;
  error?: string;
  nameMap: Map<string, string>;
}> {
  if (isTushareConfigured()) {
    try {
      // 第一步：获取全市场股票列表（stock_basic 返回全量约5400只）
      console.log('[Scan] 获取全市场股票列表...');
      const stockBasicResult = await getStockBasic();
      
      if (!stockBasicResult.success || !stockBasicResult.data || stockBasicResult.data.length < 100) {
        throw new Error(`stock_basic 返回数据不足: ${stockBasicResult.data?.length || 0}只`);
      }
      
      const totalStocks = stockBasicResult.data.length;
      console.log(`[Scan] stock_basic 返回 ${totalStocks} 只股票`);
      
      // 构建股票代码->名称映射
      const nameMap = new Map<string, string>();
      stockBasicResult.data.forEach(s => nameMap.set(s.code, s.name));
      
      // 第二步：获取当日基本面数据（daily_basic 只返回有当日数据的股票）
      console.log('[Scan] 获取当日基本面数据...');
      const allBasicResult = await getAllDailyBasic();
      
      // 构建基本面数据映射
      const basicDataLookup = new Map<string, typeof allBasicResult.data[0]>();
      if (allBasicResult.success && allBasicResult.data) {
        allBasicResult.data.forEach(item => {
          basicDataLookup.set(item.code, item);
        });
        console.log(`[Scan] daily_basic 返回 ${allBasicResult.data.length} 只股票有当日数据`);
      }
      
      // 第三步：过滤 + 填充数据
      // 过滤掉ST股、退市股等
      const validStocks = stockBasicResult.data.filter(s => {
        const name = s.name || '';
        if (name.includes('ST') || name.includes('退') || name.includes('停牌')) return false;
        return true;
      });
      console.log(`[Scan] 过滤ST/退市股后剩余 ${validStocks.length} 只`);
      
      const filtered: (typeof allBasicResult.data)[0][] = [];
      let noDataButKept = 0;
      let filteredByMinMarketCap = 0;
      let filteredByMaxMarketCap = 0;
      let filteredByMaxPE = 0;
      let filteredByOther = 0;
      
      for (const stock of validStocks) {
        const basic = basicDataLookup.get(stock.code);
        
        if (basic && basic.marketCap > 0) {
          // 有基本面数据，正常筛选（仅估值指标：市值、PE、PB）
          if (rules.maxMarketCap && rules.maxMarketCap > 0 && basic.marketCap > rules.maxMarketCap) { filteredByMaxMarketCap++; continue; }
          if (rules.minMarketCap && basic.marketCap < rules.minMarketCap) { filteredByMinMarketCap++; continue; }
          if (rules.maxPE && basic.pe > 0 && basic.pe > rules.maxPE) { filteredByMaxPE++; continue; }
          // 换手率、量比移至资金面筛选
          filtered.push(basic);
        } else {
          // 无基本面数据（停牌/新上市等）— 不淘汰，保留进入后续筛选
          filtered.push({
            code: stock.code,
            marketCap: 0,
            circulatingCap: 0,
            pe: 0,
            pb: 0,
            turnoverRate: 0,
            volumeRatio: 1,
            close: 0,
            changePercent: 0,
          });
          noDataButKept++;
        }
      }
      
      console.log(`[Scan] 基本面筛选明细:`);
      console.log(`  - 有效股票: ${validStocks.length}只`);
      console.log(`  - 有数据且符合条件: ${filtered.length - noDataButKept}只`);
      console.log(`  - 无数据但保留: ${noDataButKept}只`);
      console.log(`  - 市值<${rules.minMarketCap || '?'}亿: ${filteredByMinMarketCap}只`);
      console.log(`  - 市值>${rules.maxMarketCap || '?'}亿: ${filteredByMaxMarketCap}只`);
      console.log(`  - PE>${rules.maxPE || '?'}: ${filteredByMaxPE}只`);
      console.log(`  - 其他条件: ${filteredByOther}只`);
      console.log(`  - 进入下一步: ${filtered.length}只`);
      
      // 按综合评分排序
      const sorted = filtered
        .map(item => ({
          ...item,
          score: calculateBasicScore(item, rules),
        }))
        .sort((a, b) => b.score - a.score);
      
      const codes = sorted.map(item => item.code);
      const basicDataMap = new Map<string, {
        marketCap: number; pe: number; pb: number; turnoverRate: number; volumeRatio: number;
      }>();
      sorted.forEach(item => {
        basicDataMap.set(item.code, {
          marketCap: item.marketCap, pe: item.pe, pb: item.pb,
          turnoverRate: item.turnoverRate, volumeRatio: item.volumeRatio,
        });
      });
      
      if (codes.length > 0) {
        console.log(`[Scan] 全市场筛选完成: ${totalStocks}只 → ${validStocks.length}只有效 → ${filtered.length}只符合基本面规则 → 取${codes.length}只`);
        return { codes, filteredCount: filtered.length, basicDataMap, source: 'tushare-full-market', nameMap };
      }
    } catch (e) {
      console.error('[Scan] 获取候选股票失败:', e);
      console.error('[Scan] 错误详情:', e instanceof Error ? e.stack : String(e));
      const errMsg = e instanceof Error ? e.message : String(e);
      const emptyMap = new Map<string, { marketCap: number; pe: number; pb: number; turnoverRate: number; volumeRatio: number }>();
      const emptyNameMap = new Map<string, string>();
      return { codes: [], filteredCount: 0, basicDataMap: emptyMap, source: 'error', error: `数据获取失败: ${errMsg}`, nameMap: emptyNameMap };
    }
  } else {
    console.warn('[Scan] Tushare 未配置 (TUSHARE_TOKEN 未设置)');
    const emptyMap = new Map<string, { marketCap: number; pe: number; pb: number; turnoverRate: number; volumeRatio: number }>();
    const emptyNameMap = new Map<string, string>();
    return { codes: [], filteredCount: 0, basicDataMap: emptyMap, source: 'error', error: 'TUSHARE_TOKEN 未配置', nameMap: emptyNameMap };
  }
}

// 判断是否应使用Tushare收盘价（非交易时段或周末）
function shouldUseTushareClosePrice(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=周日, 6=周六
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentTime = hour * 100 + minute; // 如 1530 表示 15:30
  
  // 周末不使用实时价格
  if (day === 0 || day === 6) return true;
  
  // 非交易时间：15:00后至次日9:15前使用收盘价
  if (currentTime >= 1505 || currentTime < 915) return true;
  
  // 交易时段使用实时价格
  return false;
}

// 基础评分（用于排序）
function calculateBasicScore(item: { marketCap: number; pe: number; turnoverRate: number; volumeRatio: number }, rules: StrategyRules): number {
  let score = 50;
  if (item.marketCap > 0 && item.marketCap < 50) score += 10;
  else if (item.marketCap < 200) score += 5;
  if (item.pe > 0 && item.pe < 20) score += 10;
  else if (item.pe < 40) score += 5;
  if (item.turnoverRate > 3) score += 5;
  if (item.volumeRatio > 1.5) score += 5;
  return score;
}

// 获取财务指标（ROE、负债率）- 并行获取全部候选股票
async function getFinanceMap(codes: string[]): Promise<Map<string, { roe: number; debtRatio: number }>> {
  const financeMap = new Map<string, { roe: number; debtRatio: number }>();
  
  if (!isTushareConfigured()) return financeMap;
  
  const uniqueCodes = [...new Set(codes)];
  const limitCodes = uniqueCodes.slice(0, 200);
  
  // 并行获取（最多100只并发）
  const promises = limitCodes.map(async (code) => {
    try {
      const finResult = await getFinanceIndicators(code);
      if (finResult.success && finResult.data && finResult.data.roe > 0) {
        return { code, roe: finResult.data.roe, debtRatio: finResult.data.debtRatio };
      }
    } catch {
      // 忽略
    }
    return null;
  });
  
  const results = await Promise.all(promises);
  results.forEach(r => {
    if (r) financeMap.set(r.code, { roe: r.roe, debtRatio: r.debtRatio });
  });
  
  return financeMap;
}

// 获取行业信息
async function getIndustryMap(codes: string[]): Promise<Map<string, string>> {
  const industryMap = new Map<string, string>();
  
  if (!isTushareConfigured()) return industryMap;
  
  try {
    const result = await getAllStockBasic();
    if (result.success && result.data) {
      result.data.forEach(stock => {
        industryMap.set(stock.code, stock.industry || '未知');
      });
    }
  } catch {
    // 忽略
  }
  
  return industryMap;
}

// 获取板块涨幅映射（用于minSectorGain过滤）
// 返回：股票代码 -> 其所属概念板块中涨幅最高的那个板块的涨跌幅
// 核心逻辑：按股票代码反向查询所属概念 + 与当日板块行情匹配
// 优化：使用batchGetStockConcepts带缓存，按交易日失效
async function getSectorGainMap(
  codes: string[],
  minSectorGain: number
): Promise<Map<string, { sectorCode: string; sectorName: string; gain: number }>> {
  const sectorGainMap = new Map<string, { sectorCode: string; sectorName: string; gain: number }>();
  
  if (!isTushareConfigured() || codes.length === 0) return sectorGainMap;
  
  try {
    // 1. 获取全量概念板块当日行情（缓存1天，每日仅1次API调用）
    const dailyResult = await getConceptDaily();
    if (!dailyResult.success || !dailyResult.data || dailyResult.data.length === 0) {
      console.log('[SectorGain] 概念板块日行情数据为空');
      return sectorGainMap;
    }
    
    // 构建板块代码->涨跌幅映射
    const sectorPctMap = new Map<string, number>();
    dailyResult.data.forEach(d => {
      // 保留所有板块（包括涨跌幅为0的），零值是有效的板块涨幅，用于与minSectorGain比较
      sectorPctMap.set(d.tsCode, d.pctChange);
    });
    console.log(`[SectorGain] 获取到${sectorPctMap.size}个概念板块当日涨跌幅`);
    
    // 2. 获取全量概念板块列表（用于板块名称映射）
    const indexResult = await getConceptIndices('N');
    const sectorNameMap = new Map<string, string>();
    if (indexResult.success && indexResult.data) {
      indexResult.data.forEach(idx => {
        sectorNameMap.set(idx.tsCode, idx.name);
      });
    }
    
    // 3. 按股票代码反向查询所属概念（带缓存，分批限流）
    const uniqueCodes = [...new Set(codes)];
    console.log(`[SectorGain] 开始查询${uniqueCodes.length}只股票的所属概念...`);
    
    // 将候选股票转换为Tushare格式 (000001.SZ)
    const tsCodes = uniqueCodes.map(code => {
      const cleanCode = code.replace(/^(sh|sz|bj)/i, '');
      const market = code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ';
      return `${cleanCode}.${market}`;
    });
    
    // 批量获取股票所属概念（内部带缓存）
    const { batchGetStockConcepts } = await import('@/lib/stock-api/tushare-api');
    const stockConceptsMap = await batchGetStockConcepts(tsCodes, 10, 200);
    console.log(`[SectorGain] 成功获取${stockConceptsMap.size}只股票的概念归属`);
    
    // 4. 匹配候选股票与板块涨幅
    for (let i = 0; i < uniqueCodes.length; i++) {
      const code = uniqueCodes[i];
      const tsCode = tsCodes[i];
      const concepts = stockConceptsMap.get(tsCode);
      
      if (!concepts || concepts.length === 0) continue;
      
      // 找出该股票所属概念中涨幅最高的
      let maxGain = -Infinity;
      let bestSector = '';
      let bestSectorName = '';
      
      for (const concept of concepts) {
        const gain = sectorPctMap.get(concept.tsCode);
        if (gain !== undefined && gain > maxGain) {
          maxGain = gain;
          bestSector = concept.tsCode;
          bestSectorName = concept.tsName;
        }
      }
      
      if (bestSector) {
        sectorGainMap.set(code, { sectorCode: bestSector, sectorName: bestSectorName, gain: maxGain });
      }
    }
    
    console.log(`[SectorGain] 板块涨幅映射构建完成: ${sectorGainMap.size}/${uniqueCodes.length} 只股票`);
  } catch (e) {
    console.error('[SectorGain] 获取板块涨幅映射失败:', e);
  }
  
  return sectorGainMap;
}

// 检测买入信号（获取K线并分析）- 并行获取
async function detectBuySignalsForStocks(codes: string[], limit: number = 300, buyRuleConfig?: BuyRuleConfig): Promise<Map<string, BuySignal>> {
  const signalMap = new Map<string, BuySignal>();
  
  if (!isTushareConfigured()) return signalMap;
  
  const uniqueCodes = [...new Set(codes)].slice(0, limit);
  
  // 分批处理，每批10只，避免并发过多导致Tushare限流
  const batchSize = 10;
  for (let i = 0; i < uniqueCodes.length; i += batchSize) {
    const batch = uniqueCodes.slice(i, i + batchSize);
    const promises = batch.map(async (code) => {
      try {
        const klineResult = await getDailyKLine(code, undefined, undefined, 120, 'qfq');
        if (klineResult.success && klineResult.data && klineResult.data.length >= 60) {
          const signal = detectBuySignal(klineResult.data, buyRuleConfig);
          return { code, signal };
        }
      } catch {
        // 忽略
      }
      return null;
    });
    
    const results = await Promise.all(promises);
    results.forEach(r => {
      if (r) signalMap.set(r.code, r.signal);
    });
    
    // 批次间短暂延迟，避免Tushare限流
    if (i + batchSize < uniqueCodes.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return signalMap;
}

// 检查价格是否在均线之上
function checkPriceAboveMA(code: string, quotes: Record<string, { code: string; name: string; price: number }>, ma5?: number, ma20?: number): { priceAboveMA5?: boolean; priceAboveMA20?: boolean } {
  const result: { priceAboveMA5?: boolean; priceAboveMA20?: boolean } = {};
  const quote = quotes[code];
  if (quote && ma5 !== undefined && ma5 > 0) {
    result.priceAboveMA5 = quote.price > ma5;
  }
  if (quote && ma20 !== undefined && ma20 > 0) {
    result.priceAboveMA20 = quote.price > ma20;
  }
  return result;
}

// 检查周MACD金叉（需要周线数据）
async function checkWeeklyMACDGoldenCross(codes: string[]): Promise<Map<string, boolean>> {
  const resultMap = new Map<string, boolean>();
  
  if (!isTushareConfigured()) return resultMap;
  
  const promises = codes.slice(0, 100).map(async (code) => {
    try {
      const klineResult = await getDailyKLine(code, undefined, undefined, 120, 'qfq');
      if (klineResult.success && klineResult.data && klineResult.data.length >= 60) {
        const klines = klineResult.data;
        // 简单的周线MACD近似：取每周最后一个交易日的数据
        const weeklyCloses: number[] = [];
        let weekCount = 0;
        for (let i = 0; i < klines.length; i++) {
          if (i === 0 || weekCount === 0) {
            weeklyCloses.push(klines[i].close);
            weekCount = 1;
          } else {
            const currentDay = new Date(klines[i].date).getDay();
            const prevDay = new Date(klines[i - 1].date).getDay();
            if (currentDay < prevDay || (currentDay === 5 && weekCount >= 4)) {
              // 新的一周
              weeklyCloses.push(klines[i].close);
              weekCount = 1;
            } else {
              weekCount++;
            }
          }
        }
        
        if (weeklyCloses.length >= 10) {
          const { calculateMACDSeries } = await import('@/lib/stock-api/indicators');
          const macdSeries = calculateMACDSeries(weeklyCloses, 12, 26, 9);
          if (macdSeries.length >= 2) {
            const current = macdSeries[macdSeries.length - 1];
            const prev = macdSeries[macdSeries.length - 2];
            const isGoldenCross = current.dif > current.dea && prev.dif <= prev.dea;
            return { code, isGoldenCross };
          }
        }
      }
    } catch {
      // 忽略
    }
    return null;
  });
  
  const results = await Promise.all(promises);
  results.forEach(r => {
    if (r) resultMap.set(r.code, r.isGoldenCross);
  });
  
  return resultMap;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const rules: StrategyRules = {
      maxMarketCap: searchParams.get('maxMarketCap') ? Number(searchParams.get('maxMarketCap')) : undefined,
      minMarketCap: searchParams.get('minMarketCap') ? Number(searchParams.get('minMarketCap')) : undefined,
      minROE: searchParams.get('minROE') ? Number(searchParams.get('minROE')) : undefined,
      maxDebtRatio: searchParams.get('maxDebtRatio') ? Number(searchParams.get('maxDebtRatio')) : undefined,
      minTurnoverRate: searchParams.get('minTurnoverRate') ? Number(searchParams.get('minTurnoverRate')) : undefined,
      maxPE: searchParams.get('maxPE') ? Number(searchParams.get('maxPE')) : undefined,
      minPB: searchParams.get('minPB') ? Number(searchParams.get('minPB')) : undefined,
      maxPB: searchParams.get('maxPB') ? Number(searchParams.get('maxPB')) : undefined,
      minVolumeRatio: searchParams.get('minVolumeRatio') ? Number(searchParams.get('minVolumeRatio')) : undefined,
      priceAboveMA5: searchParams.get('priceAboveMA5') === 'true',
      priceAboveMA20: searchParams.get('priceAboveMA20') === 'true',
      weeklyMACDGoldenCross: searchParams.get('weeklyMACDGoldenCross') === 'true',
      minSectorGain: searchParams.get('minSectorGain') ? Number(searchParams.get('minSectorGain')) : undefined,
      // 买入信号规则
      buyMa5CrossMa20: searchParams.get('buyMa5CrossMa20') === 'true',
      buyMacdGoldenCross: searchParams.get('buyMacdGoldenCross') === 'true',
      buyCandleConfirm: searchParams.get('buyCandleConfirm') === 'true',
      buyVolumeConfirm: searchParams.get('buyVolumeConfirm') === 'true',
    };
    
    // 漏斗追踪
    const funnelSteps: ScanFunnelStep[] = [];
    
    // 步骤1: 获取全市场数据
    const allBasicResult = await getAllDailyBasic();
    const totalMarketCount = allBasicResult.success && allBasicResult.data ? allBasicResult.data.length : 0;
    
    if (totalMarketCount > 0) {
      funnelSteps.push({
        label: 'A股全市场',
        count: totalMarketCount,
        filter: '全市场A股（约5000+只）',
      });
    }
    
    // 步骤2: 基本面筛选（基于getCandidateStocks的结果）
    // 基本面条件：市值、PE、PB（估值指标）
    const { codes: candidateCodes, filteredCount, basicDataMap, source: poolSource, error: poolError } = await getCandidateStocks(rules);
    console.log(`[Scan] 候选股票: ${candidateCodes.length} 只 (过滤后${filteredCount}只), 来源: ${poolSource}${poolError ? ', 错误: ' + poolError : ''}`);

    if (poolSource === 'error' || candidateCodes.length === 0) {
      return NextResponse.json({
        success: false,
        error: poolError || '数据获取失败，无法执行选股扫描',
        timestamp: Date.now(),
      }, { status: 503 });
    }

    const poolFilters: string[] = [];
    if (rules.minMarketCap) poolFilters.push(`市值≥${rules.minMarketCap}亿`);
    if (rules.maxMarketCap && rules.maxMarketCap > 0) poolFilters.push(`市值≤${rules.maxMarketCap}亿`);
    if (rules.maxPE) poolFilters.push(`PE≤${rules.maxPE}`);
    if (rules.minPB) poolFilters.push(`PB≥${rules.minPB}`);
    if (rules.maxPB) poolFilters.push(`PB≤${rules.maxPB}`);
    
    funnelSteps.push({
      label: '基本面筛选',
      count: filteredCount,
      filter: poolFilters.join('，'),
    });
    
    // 2. 获取行情数据
    // 非交易时段使用Tushare收盘价，交易时段使用新浪实时行情
    const useClosePrice = shouldUseTushareClosePrice();
    console.log(`[Scan] 价格数据源: ${useClosePrice ? 'Tushare收盘价(非交易时段)' : '新浪实时行情'}`);
    
    // 获取Tushare当日收盘价和涨跌幅（非交易时段直接使用，交易时段作为备用）
    const closePriceMap = new Map<string, { price: number; changePercent: number }>();
    const nameMap = new Map<string, string>(); // 股票代码->名称映射
    if (isTushareConfigured()) {
      try {
        // 获取基本面数据（包含收盘价和涨跌幅）
        const allBasicResult = await getAllDailyBasic();
        if (allBasicResult.success && allBasicResult.data) {
          allBasicResult.data.forEach(item => {
            if (item.close > 0) {
              closePriceMap.set(item.code, { price: item.close, changePercent: item.changePercent });
            }
          });
          console.log(`[Scan] 获取到${closePriceMap.size}只股票的Tushare收盘价`);
        }
        
        // 获取股票名称映射
        const stockBasicResult = await getStockBasic();
        if (stockBasicResult.success && stockBasicResult.data) {
          stockBasicResult.data.forEach(s => nameMap.set(s.code, s.name));
          console.log(`[Scan] 获取到${nameMap.size}只股票名称`);
        }
      } catch (e) {
        console.error('[Scan] 获取Tushare数据失败:', e);
      }
    }
    
    let mergedQuotes: RealtimeQuote[];
    
    if (useClosePrice) {
      // 非交易时段：直接使用Tushare收盘价，跳过新浪请求
      console.log('[Scan] 非交易时段，使用Tushare收盘价，跳过新浪实时行情请求');
      mergedQuotes = candidateCodes.map(code => {
        const closeData = closePriceMap.get(code);
        const prevClose = closeData?.price && closeData?.changePercent !== undefined
          ? closeData.price / (1 + closeData.changePercent / 100)
          : closeData?.price || 0;
        return {
          code: code.startsWith('6') || code.startsWith('9') ? `sh${code}` : `sz${code}`,
          name: nameMap.get(code) || '',
          price: closeData?.price || 0,
          changePercent: closeData?.changePercent || 0,
          volume: 0,
          amount: 0,
          prevClose,
          open: closeData?.price || 0,
          high: closeData?.price || 0,
          low: closeData?.price || 0,
          bid1: 0,
          bid1Vol: 0,
          ask1: 0,
          ask1Vol: 0,
          date: '',
          time: '',
          change: closeData?.price ? closeData.price - prevClose : 0,
        };
      });
    } else {
      // 交易时段：使用新浪实时行情
      const sinaCodes = candidateCodes.map(code => {
        if (code.startsWith('6') || code.startsWith('9')) return `sh${code}`;
        if (code.startsWith('0') || code.startsWith('3')) return `sz${code}`;
        return `sh${code}`;
      });
      
      const quotesResult = await getBatchQuotes(sinaCodes);
      
      if (!quotesResult.success || !quotesResult.data) {
        return NextResponse.json({
          success: false,
          error: quotesResult.error || '获取行情失败',
          timestamp: Date.now(),
        });
      }
      
      // 合并行情数据
      mergedQuotes = quotesResult.data.map(quote => {
        const code = quote.code.replace(/^(sh|sz|bj)/, '');
        return quote;
      });
    }
    
    // 静默过滤无效行情（停牌、退市等），不加入漏斗
    const validQuotes = mergedQuotes.filter(q => q.price > 0);
    const invalidCount = candidateCodes.length - validQuotes.length;
    if (invalidCount > 0) {
      console.log(`[Scan] 过滤${invalidCount}只无效行情（停牌/退市）`);
    }
    
    // 2.5 获取行业信息
    const industryMap = await getIndustryMap(candidateCodes);
    
    // 2.6 获取板块涨幅映射（当设置了minSectorGain时）
    const sectorGainMap = rules.minSectorGain && rules.minSectorGain > 0
      ? await getSectorGainMap(candidateCodes, rules.minSectorGain)
      : new Map<string, { sectorCode: string; sectorName: string; gain: number }>();
    
    // 步骤3: 获取财务指标（非过滤步骤，仅记录数据覆盖情况）
    const financeMap = await getFinanceMap(candidateCodes);
    console.log(`[Scan] 财务数据: ${financeMap.size}/${validQuotes.length} 只有可用财务数据`);
    
    // 构建选股规则描述（仅选股规则，不含买入规则）
    const selectionRules: string[] = [];
    if (rules.priceAboveMA5) selectionRules.push('股价>MA5');
    if (rules.priceAboveMA20) selectionRules.push('股价>MA20');
    if (rules.weeklyMACDGoldenCross) selectionRules.push('周线MACD金叉');
    if (rules.minROE !== undefined) selectionRules.push(`ROE≥${rules.minROE}%`);
    if (rules.maxDebtRatio !== undefined) selectionRules.push(`负债率≤${rules.maxDebtRatio}%`);
    if (rules.maxPEPercentile !== undefined) selectionRules.push(`PE分位≤${rules.maxPEPercentile}%`);
    if (rules.minTurnoverRate5D !== undefined) selectionRules.push(`5日换手率≥${rules.minTurnoverRate5D}%`);
    if (rules.minSectorGain !== undefined) selectionRules.push(`板块涨幅≥${rules.minSectorGain}%`);
    
    // 构建买入规则描述（用于买入信号步骤）
    const buyRuleFilters: string[] = [];
    if (rules.buyMa5CrossMa20) buyRuleFilters.push('MA5金叉MA20');
    if (rules.buyMacdGoldenCross) buyRuleFilters.push('日MACD金叉');
    if (rules.buyCandleConfirm) buyRuleFilters.push('K线确认');
    if (rules.buyVolumeConfirm) buyRuleFilters.push('成交量确认');
    
    // 3.5 获取技术指标用于技术面规则检查（MA5/MA20、周MACD金叉）
    // 使用 validQuotes 对应的代码来获取技术指标，确保与 scanResults 对齐
    const needsTechnicalCheck = rules.priceAboveMA5 || rules.priceAboveMA20 || rules.weeklyMACDGoldenCross;
    let technicalDataMap = new Map<string, { ma5?: number; ma20?: number; weeklyMACDGoldenCross?: boolean }>();
    
    // 从 validQuotes 中提取需要技术分析的代码（与后续 scanResults 保持一致）
    const codesForTechnicalAnalysis = validQuotes.map(q => q.code.replace(/^(sh|sz|bj)/, ''));
    
    if (needsTechnicalCheck && isTushareConfigured() && codesForTechnicalAnalysis.length > 0) {
      // 分批处理，每批5只（减少并发，避免Tushare限流）
      const batchSize = 5;
      for (let i = 0; i < codesForTechnicalAnalysis.length; i += batchSize) {
        const batch = codesForTechnicalAnalysis.slice(i, i + batchSize);
        const promises = batch.map(async (code) => {
          try {
            const klineResult = await getDailyKLine(code, undefined, undefined, 120, 'qfq');
            if (klineResult.success && klineResult.data && klineResult.data.length >= 60) {
              const klines = klineResult.data;
              const closes = klines.map(k => k.close);
              
              const { calculateSMASeries } = await import('@/lib/stock-api/indicators');
              const ma5Series = calculateSMASeries(closes, 5);
              const ma20Series = calculateSMASeries(closes, 20);
              const ma5 = ma5Series[closes.length - 1];
              const ma20 = ma20Series[closes.length - 1];
              
              let weeklyMACDGoldenCross: boolean | undefined;
              if (rules.weeklyMACDGoldenCross) {
                const { calculateMACDSeries } = await import('@/lib/stock-api/indicators');
                const weeklyCloses: number[] = [];
                let weekCount = 0;
                for (let j = 0; j < klines.length; j++) {
                  if (j === 0 || weekCount === 0) {
                    weeklyCloses.push(klines[j].close);
                    weekCount = 1;
                  } else {
                    const currentDay = new Date(klines[j].date).getDay();
                    const prevDay = new Date(klines[j - 1].date).getDay();
                    if (currentDay < prevDay || (currentDay === 5 && weekCount >= 4)) {
                      weeklyCloses.push(klines[j].close);
                      weekCount = 1;
                    } else {
                      weekCount++;
                    }
                  }
                }
                if (weeklyCloses.length >= 10) {
                  const macdSeries = calculateMACDSeries(weeklyCloses, 12, 26, 9);
                  if (macdSeries.length >= 2) {
                    const current = macdSeries[macdSeries.length - 1];
                    const prev = macdSeries[macdSeries.length - 2];
                    weeklyMACDGoldenCross = current.dif > current.dea && prev.dif <= prev.dea;
                  }
                }
              }
              
              return { code, ma5, ma20, weeklyMACDGoldenCross };
            }
          } catch (e) {
            console.log(`[TechnicalData] 获取${code}K线失败:`, e);
          }
          return null;
        });
        
        const results = await Promise.all(promises);
        results.forEach(r => {
          if (r) technicalDataMap.set(r.code, { ma5: r.ma5, ma20: r.ma20, weeklyMACDGoldenCross: r.weeklyMACDGoldenCross });
        });
        
        if (i + batchSize < codesForTechnicalAnalysis.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    // 步骤3.6: 检测买入信号（前100只股票并行获取K线分析）
    const buyRuleConfig: BuyRuleConfig = {
      ma5CrossMa20: rules.buyMa5CrossMa20 !== undefined ? rules.buyMa5CrossMa20 : true,
      macdGoldenCross: rules.buyMacdGoldenCross !== undefined ? rules.buyMacdGoldenCross : true,
      candleConfirm: rules.buyCandleConfirm !== undefined ? rules.buyCandleConfirm : true,
      volumeConfirm: rules.buyVolumeConfirm !== undefined ? rules.buyVolumeConfirm : true,
    };
    const buySignalMap = await detectBuySignalsForStocks(candidateCodes, 300, buyRuleConfig);
    
    // 4. 基于规则筛选（使用统一过滤引擎）
    const scanResults: ScanStock[] = validQuotes
      .map(quote => {
        const code = quote.code.replace(/^(sh|sz|bj)/, '');
        const basicData = basicDataMap.get(code);
        const finance = financeMap.get(code);
        const techData = technicalDataMap.get(code);
        const sectorData = sectorGainMap.get(code);
        
        // 确定价格来源
        const priceSource = (useClosePrice && closePriceMap.has(code)) ? 'close' : 'realtime';
        
        // 构建过滤上下文
        const filterCtx: FilterContext = {
          code,
          quote: {
            price: quote.price,
            changePercent: quote.changePercent,
            volume: quote.volume,
            amount: quote.amount,
            name: quote.name,
          },
          basicData: basicData || null,
          finance: finance || null,
          technical: techData || null,
          sector: sectorData || null,
        };
        
        // 使用统一过滤引擎
        const filterResult = checkStockRules(rules, filterCtx);
        
        return {
          code,
          name: quote.name,
          price: quote.price,
          priceSource,
          changePercent: quote.changePercent,
          volume: quote.volume,
          amount: quote.amount,
          industry: industryMap.get(code) || '未知',
          marketCap: basicData?.marketCap || null,
          pe: basicData?.pe || null,
          pb: basicData?.pb || null,
          turnoverRate: basicData?.turnoverRate || null,
          volumeRatio: basicData?.volumeRatio || 1,
          roe: finance?.roe || null,
          debtRatio: finance?.debtRatio || null,
          score: filterResult.score,
          ruleChecks: filterResult.ruleChecks,
          meetsRules: filterResult.meetsRules,
          buySignal: buySignalMap.get(code),
        };
      })
      .sort((a, b) => {
        if (a.buySignal?.trigger && !b.buySignal?.trigger) return -1;
        if (!a.buySignal?.trigger && b.buySignal?.trigger) return 1;
        if (a.meetsRules !== b.meetsRules) return a.meetsRules ? -1 : 1;
        const strengthOrder = { strong: 4, medium: 3, weak: 2, none: 1 };
        if (a.buySignal && b.buySignal && a.buySignal.trigger && b.buySignal.trigger) {
          return (strengthOrder[b.buySignal.strength] || 0) - (strengthOrder[a.buySignal.strength] || 0);
        }
        return b.score - a.score;
      });
    
    const matchCount = scanResults.filter(s => s.meetsRules).length;
    
    // ===== 漏斗构建（按基本面→技术面→资金面顺序） =====
    
    // 漏斗步骤2: 技术面筛选
    // 技术面条件：股价>MA5、股价>MA20、周MACD金叉
    // 注意：无数据时不作为硬性淘汰（与meetsAllRules逻辑保持一致）
    const hasTechnicalRules = rules.priceAboveMA5 || rules.priceAboveMA20 || rules.weeklyMACDGoldenCross;
    if (hasTechnicalRules) {
      let ma5PassCount = 0, ma5FailCount = 0, ma5NoDataCount = 0;
      let ma20PassCount = 0, ma20FailCount = 0, ma20NoDataCount = 0;
      let macdPassCount = 0, macdFailCount = 0, macdNoDataCount = 0;
      
      // 从基本面筛选后的候选池中计算技术面通过情况
      // 与meetsAllRules逻辑保持一致：无数据时不淘汰
      const technicalPassResults = scanResults.filter(s => {
        let allPass = true;
        let anyChecked = false; // 是否有任何条件被检查
        const techData = technicalDataMap.get(s.code);
        
        // MA5
        if (rules.priceAboveMA5) {
          anyChecked = true;
          if (!techData?.ma5 || techData.ma5 <= 0) { ma5NoDataCount++; /* 无数据不淘汰 */ }
          else if (s.price > techData.ma5) { ma5PassCount++; }
          else { ma5FailCount++; allPass = false; }
        }
        
        // MA20
        if (rules.priceAboveMA20) {
          anyChecked = true;
          if (!techData?.ma20 || techData.ma20 <= 0) { ma20NoDataCount++; /* 无数据不淘汰 */ }
          else if (s.price > techData.ma20) { ma20PassCount++; }
          else { ma20FailCount++; allPass = false; }
        }
        
        // 周MACD金叉
        if (rules.weeklyMACDGoldenCross) {
          anyChecked = true;
          if (techData?.weeklyMACDGoldenCross === undefined) { macdNoDataCount++; /* 无数据不淘汰 */ }
          else if (techData.weeklyMACDGoldenCross) { macdPassCount++; }
          else { macdFailCount++; allPass = false; }
        }
        
        return allPass;
      });
      
      const technicalPassCount = technicalPassResults.length;
      
      // 构建条件描述
      const details: string[] = [];
      if (rules.priceAboveMA5) details.push(`股价>MA5`);
      if (rules.priceAboveMA20) details.push(`股价>MA20`);
      if (rules.weeklyMACDGoldenCross) details.push(`周线MACD金叉`);
      
      funnelSteps.push({
        label: '技术面筛选',
        count: technicalPassCount,
        filter: details.join('、'),
      });
      
      // 漏斗步骤3: 资金面筛选
      // 资金面条件：换手率、量比、板块涨幅
      const hasCapitalRules = (rules.minTurnoverRate && rules.minTurnoverRate > 0) || (rules.minVolumeRatio && rules.minVolumeRatio > 0) || (rules.minSectorGain && rules.minSectorGain > 0);
      if (hasCapitalRules) {
        let turnoverPassCount = 0, turnoverFailCount = 0;
        let volumeRatioPassCount = 0, volumeRatioFailCount = 0;
        let sectorPassCount = 0, sectorFailCount = 0, sectorNoDataCount = 0;
        
        // 从技术面筛选后的股票中计算资金面通过情况
        const capitalPassResults = technicalPassResults.filter(s => {
          let allPass = true;
          
          // 换手率（资金活跃度指标）
          if (rules.minTurnoverRate && rules.minTurnoverRate > 0) {
            if (s.turnoverRate && s.turnoverRate >= rules.minTurnoverRate!) { turnoverPassCount++; }
            else { turnoverFailCount++; allPass = false; }
          }
          
          // 量比（资金相对强度指标）
          if (rules.minVolumeRatio && rules.minVolumeRatio > 0) {
            if (s.volumeRatio >= rules.minVolumeRatio!) { volumeRatioPassCount++; }
            else { volumeRatioFailCount++; allPass = false; }
          }
          
          // 板块涨幅（资金流向/题材热度指标）
          // 注意：无数据时不作为硬性淘汰（与技术面筛选逻辑保持一致）
          if (rules.minSectorGain && rules.minSectorGain > 0) {
            const sectorData = sectorGainMap.get(s.code);
            if (!sectorData) { 
              sectorNoDataCount++; 
              // 无板块数据时不淘汰，与技术面筛选保持一致
            } else if (sectorData.gain >= rules.minSectorGain!) { 
              sectorPassCount++; 
            } else { 
              sectorFailCount++; 
              // 板块涨幅不足时不淘汰，作为参考指标而非硬过滤
            }
          }
          
          return allPass;
        });
        
        const capitalPassCount = capitalPassResults.length;
        
        // 构建条件描述
        const capitalDetails: string[] = [];
        if (rules.minTurnoverRate && rules.minTurnoverRate > 0) capitalDetails.push(`换手率≥${rules.minTurnoverRate}%`);
        if (rules.minVolumeRatio && rules.minVolumeRatio > 0) capitalDetails.push(`量比≥${rules.minVolumeRatio}`);
        if (rules.minSectorGain && rules.minSectorGain > 0) capitalDetails.push(`板块涨幅≥${rules.minSectorGain}%`);
        
        funnelSteps.push({
          label: '资金面筛选',
          count: capitalPassCount,
          filter: capitalDetails.join('、'),
        });
      }
    }
    
    // 漏斗步骤4: 符合选股规则 + 买入信号
    // 直接使用 scanResults，meetsRules 已在前面正确计算
    // 避免与 funnel 阶段的过滤逻辑重复/不一致
    const lastFunnelStep = funnelSteps[funnelSteps.length - 1];
    const lastFunnelCount = lastFunnelStep ? lastFunnelStep.count : candidateCodes.length;
    
    // 符合选股规则 = meetsRules 为 true 的股票
    const matchCountFromLastStep = scanResults.filter(s => s.meetsRules).length;
    const buySignalCount = scanResults.filter(s => s.buySignal?.trigger).length;
    const analyzedCount = scanResults.filter(s => s.buySignal !== undefined).length;
    
    if (matchCountFromLastStep < lastFunnelCount) {
      const resultLabel = buySignalCount > 0 
        ? `符合选股规则（${buySignalCount}只触发买入信号）`
        : '符合选股规则';
      
      const filterParts: string[] = [];
      if (selectionRules.length > 0) {
        filterParts.push(`${selectionRules.length}项选股规则`);
      }
      if (buySignalCount > 0) {
        filterParts.push(`${buySignalCount}只触发买入信号（检测${analyzedCount}只）`);
      }
      
      funnelSteps.push({
        label: resultLabel,
        count: matchCountFromLastStep,
        filter: filterParts.join('，'),
      });
    } else if (buySignalCount > 0) {
      funnelSteps.push({
        label: `符合选股规则（${buySignalCount}只触发买入信号）`,
        count: matchCountFromLastStep,
        filter: `${buySignalCount}只触发买入信号（检测${analyzedCount}只）`,
      });
    }
    
    const ruleDescriptions = buildRuleDescriptions(rules);
    
    return NextResponse.json({
      success: true,
      data: {
        stocks: scanResults,
        total: scanResults.length,
        matchCount,
        rules,
        ruleDescriptions,
        poolSource,
        poolError,
        tushareConfigured: isTushareConfigured(),
        scanTime: new Date().toISOString(),
        note: buildScanNote(poolSource, scanResults.length, matchCount, financeMap.size, poolError),
        funnel: funnelSteps,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Scan] error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '扫描失败',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}

function buildRuleDescriptions(rules: StrategyRules): string[] {
  const descs: string[] = [];
  if (rules.maxMarketCap) descs.push(`市值 ≤ ${rules.maxMarketCap}亿`);
  if (rules.minMarketCap) descs.push(`市值 ≥ ${rules.minMarketCap}亿`);
  if (rules.minROE) descs.push(`ROE ≥ ${rules.minROE}%`);
  if (rules.maxDebtRatio) descs.push(`负债率 ≤ ${rules.maxDebtRatio}%`);
  if (rules.minTurnoverRate) descs.push(`换手率 ≥ ${rules.minTurnoverRate}%`);
  if (rules.maxPE) descs.push(`PE ≤ ${rules.maxPE}`);
  if (rules.minVolumeRatio) descs.push(`量比 ≥ ${rules.minVolumeRatio}`);
  if (rules.minPB) descs.push(`PB ≥ ${rules.minPB}`);
  if (rules.maxPB) descs.push(`PB ≤ ${rules.maxPB}`);
  if (rules.priceAboveMA5) descs.push(`股价 > MA5`);
  if (rules.priceAboveMA20) descs.push(`股价 > MA20`);
  if (rules.weeklyMACDGoldenCross) descs.push(`周MACD金叉`);
  if (rules.minSectorGain) descs.push(`板块涨幅 ≥ ${rules.minSectorGain}%`);
  return descs;
}

function buildScanNote(poolSource: string, total: number, matchCount: number, financeCount: number, poolError?: string): string {
  const sourceDesc: Record<string, string> = {
    'tushare-full-market': 'Tushare全市场',
  };
  const base = `${sourceDesc[poolSource] || poolSource}，扫描 ${total} 只，${financeCount} 只有财务数据，${matchCount} 只符合规则`;
  return poolError ? `${base}⚠️ ${poolError}` : base;
}
