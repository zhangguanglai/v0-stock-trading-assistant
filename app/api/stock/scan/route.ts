// 智能选股扫描API
// 方案C增强版：Tushare daily_basic全市场 + Sina实时行情 + fina_indicator财务数据
// 5000积分权限支持
import { NextRequest, NextResponse } from 'next/server';
import { getBatchQuotes, getFinanceIndicators, isTushareConfigured, getDailyKLine, detectBuySignal } from '@/lib/stock-api';
import { getAllDailyBasic, getAllStockBasic, getConceptIndices, getConceptDaily, getConceptMembers } from '@/lib/stock-api/tushare-api';
import type { BuySignal } from '@/lib/stock-api/types';
import type { BuyRuleConfig } from '@/lib/stock-api/indicators';

export const dynamic = 'force-dynamic';

interface StrategyRules {
  maxMarketCap?: number;
  minMarketCap?: number;
  minROE?: number;
  maxDebtRatio?: number;
  minTurnoverRate?: number;
  maxPE?: number;
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

// 常用板块股票池（回退使用）
const STOCK_POOLS: Record<string, string[]> = {
  all: [
    '600519', '000858', '000333', '600036', '000001', '601318', '002475', '002714',
    '300750', '300059', '002352', '600276', '000568', '601012', '002594', '600900',
    '000651', '601888', '002304', '600031', '002230', '300015', '002415', '002049',
    '300274', '000977', '300014', '300033', '002241', '300124', '600745', '300760',
    '603501', '688981', '002050', '002821', '600585', '000725', '601166', '600000',
    '601966', '601169', '601857', '601398', '601939',
  ],
};

// 获取候选股票池 + 基本面数据
async function getCandidateStocks(rules: StrategyRules): Promise<{
  codes: string[];
  filteredCount: number; // 基本面规则过滤后的真实数量
  basicDataMap: Map<string, {
    marketCap: number;
    pe: number;
    pb: number;
    turnoverRate: number;
    volumeRatio: number;
  }>;
  source: string;
}> {
  if (isTushareConfigured()) {
    try {
      console.log('[Scan] 使用 getAllDailyBasic 获取全市场基本面数据...');
      const allBasicResult = await getAllDailyBasic();
      
      if (allBasicResult.success && allBasicResult.data && allBasicResult.data.length > 100) {
        // 按规则筛选
        const filtered = allBasicResult.data.filter(item => {
          if (item.marketCap <= 0) return false;
          if (rules.maxMarketCap && rules.maxMarketCap > 0 && item.marketCap > rules.maxMarketCap) return false;
          if (rules.minMarketCap && item.marketCap < rules.minMarketCap) return false;
          if (rules.maxPE && item.pe > 0 && item.pe > rules.maxPE) return false;
          if (rules.minTurnoverRate && item.turnoverRate < rules.minTurnoverRate) return false;
          if (rules.minVolumeRatio && item.volumeRatio < rules.minVolumeRatio) return false;
          if (rules.minPB && item.pb < rules.minPB) return false;
          if (rules.maxPB && item.pb > rules.maxPB) return false;
          return true;
        });
        
        // 按综合评分排序，不限制数量（返回所有符合条件的股票）
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
          console.log(`[Scan] 全市场筛选完成: ${allBasicResult.data.length}只 → ${filtered.length}只符合 → 取${codes.length}只`);
          return { codes, filteredCount: filtered.length, basicDataMap, source: 'tushare-full-market' };
        }
      }
    } catch (e) {
      console.error('[Scan] getAllDailyBasic 失败:', e);
    }
  }
  
  // 回退到固定池
  const basicDataMap = new Map<string, {
    marketCap: number; pe: number; pb: number; turnoverRate: number; volumeRatio: number;
  }>();
  return { codes: STOCK_POOLS.all, filteredCount: STOCK_POOLS.all.length, basicDataMap, source: 'default-pool' };
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
// 核心逻辑：获取全量概念当日行情 + 全量概念成分，构建反向映射
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
    
    // 3. 获取候选股票所属概念（按股票代码反向查询）
    // 分批处理，每批20只，避免并发过多
    const uniqueCodes = [...new Set(codes)].slice(0, 300); // 最多处理300只
    const batchSize = 20;
    
    for (let i = 0; i < uniqueCodes.length; i += batchSize) {
      const batch = uniqueCodes.slice(i, i + batchSize);
      const promises = batch.map(async (code) => {
        try {
          // 按股票代码查询所属概念
          const memberResult = await getConceptMembers(undefined, code.replace(/^(sh|sz|bj)/, '') + '.' + (code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ'));
          if (memberResult.success && memberResult.data && memberResult.data.length > 0) {
            // 找出该股票所属概念中涨幅最高的
            let maxGain = -Infinity;
            let bestSector = '';
            let bestSectorName = '';
            
            for (const member of memberResult.data) {
              const gain = sectorPctMap.get(member.tsCode);
              if (gain !== undefined && gain > maxGain) {
                maxGain = gain;
                bestSector = member.tsCode;
                bestSectorName = sectorNameMap.get(member.tsCode) || member.tsCode;
              }
            }
            
            if (bestSector) {
              return { code, sectorCode: bestSector, sectorName: bestSectorName, gain: maxGain };
            }
          }
        } catch {
          // 忽略
        }
        return null;
      });
      
      const results = await Promise.all(promises);
      results.forEach(r => {
        if (r) {
          sectorGainMap.set(r.code, { sectorCode: r.sectorCode, sectorName: r.sectorName, gain: r.gain });
        }
      });
      
      // 批次间短暂延迟
      if (i + batchSize < uniqueCodes.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`[SectorGain] 板块涨幅映射构建完成: ${sectorGainMap.size}/${uniqueCodes.length} 只股票`);
  } catch (e) {
    console.error('[SectorGain] 获取板块涨幅映射失败:', e);
  }
  
  return sectorGainMap;
}

// 检测买入信号（获取K线并分析）- 并行获取
async function detectBuySignalsForStocks(codes: string[], limit: number = 100, buyRuleConfig?: BuyRuleConfig): Promise<Map<string, BuySignal>> {
  const signalMap = new Map<string, BuySignal>();
  
  if (!isTushareConfigured()) return signalMap;
  
  const uniqueCodes = [...new Set(codes)].slice(0, limit);
  
  // 分批处理，每批10只，避免并发过多导致Tushare限流
  const batchSize = 10;
  for (let i = 0; i < uniqueCodes.length; i += batchSize) {
    const batch = uniqueCodes.slice(i, i + batchSize);
    const promises = batch.map(async (code) => {
      try {
        const klineResult = await getDailyKLine(code, undefined, undefined, 120);
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
      const klineResult = await getDailyKLine(code, undefined, undefined, 120);
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
    
    // 步骤2: 基本面筛选
    const { codes: candidateCodes, filteredCount, basicDataMap, source: poolSource } = await getCandidateStocks(rules);
    console.log(`[Scan] 候选股票: ${candidateCodes.length} 只 (过滤后${filteredCount}只), 来源: ${poolSource}`);
    const poolFilters: string[] = [];
    if (poolSource === 'tushare-full-market') {
      poolFilters.push(`市值≥${rules.minMarketCap || 30}亿`);
      if (rules.maxMarketCap && rules.maxMarketCap > 0) poolFilters.push(`市值≤${rules.maxMarketCap}亿`);
      else poolFilters.push('市值不限');
      if (rules.maxPE) poolFilters.push(`PE≤${rules.maxPE}`);
      if (rules.minPB) poolFilters.push(`PB≥${rules.minPB}`);
      if (rules.maxPB) poolFilters.push(`PB≤${rules.maxPB}`);
      if (rules.minTurnoverRate) poolFilters.push(`换手率≥${rules.minTurnoverRate}%`);
      if (rules.minVolumeRatio) poolFilters.push(`量比≥${rules.minVolumeRatio}`);
    } else {
      poolFilters.push('默认固定股票池');
    }
    
    funnelSteps.push({
      label: '基本面筛选',
      count: filteredCount,
      filter: poolFilters.join('，'),
    });
    
    // 2. 获取行情数据
    // 非交易时段使用Tushare收盘价，交易时段使用新浪实时行情
    const useClosePrice = shouldUseTushareClosePrice();
    console.log(`[Scan] 价格数据源: ${useClosePrice ? 'Tushare收盘价(非交易时段)' : '新浪实时行情'}`);
    
    // 转换为新浪代码格式
    const sinaCodes = candidateCodes.map(code => {
      if (code.startsWith('6') || code.startsWith('9')) return `sh${code}`;
      if (code.startsWith('0') || code.startsWith('3')) return `sz${code}`;
      return `sh${code}`;
    });
    
    // 获取Tushare当日收盘价（非交易时段使用）
    // daily_basic 不含 pct_chg，所以只获取收盘价，涨跌幅保留新浪的计算结果
    const closePriceMap = new Map<string, { price: number }>();
    if (useClosePrice && isTushareConfigured()) {
      try {
        const allBasicResult = await getAllDailyBasic();
        if (allBasicResult.success && allBasicResult.data) {
          allBasicResult.data.forEach(item => {
            if (item.close > 0) {
              closePriceMap.set(item.code, { price: item.close });
            }
          });
          console.log(`[Scan] 获取到${closePriceMap.size}只股票的Tushare收盘价`);
        }
      } catch (e) {
        console.error('[Scan] 获取Tushare收盘价失败:', e);
      }
    }
    
    // 获取新浪实时行情
    const quotesResult = await getBatchQuotes(sinaCodes);
    
    if (!quotesResult.success || !quotesResult.data) {
      return NextResponse.json({
        success: false,
        error: quotesResult.error || '获取行情失败',
        timestamp: Date.now(),
      });
    }
    
    // 合并行情数据：优先使用Tushare收盘价，涨跌幅使用新浪的计算结果
    const mergedQuotes = quotesResult.data.map(quote => {
      const code = quote.code.replace(/^(sh|sz|bj)/, '');
      
      // 非交易时段：使用Tushare收盘价替换价格，但保留新浪涨跌幅
      if (useClosePrice && closePriceMap.has(code)) {
        const closeData = closePriceMap.get(code)!;
        return {
          ...quote,
          price: closeData.price,
          // 涨跌幅保持新浪的计算结果（基于收盘价计算）
        };
      }
      
      return quote;
    });
    
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
      // 分批处理，每批10只
      const batchSize = 10;
      for (let i = 0; i < codesForTechnicalAnalysis.length; i += batchSize) {
        const batch = codesForTechnicalAnalysis.slice(i, i + batchSize);
        const promises = batch.map(async (code) => {
          try {
            const klineResult = await getDailyKLine(code, undefined, undefined, 120);
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
          } catch {
            // 忽略
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
    const buySignalMap = await detectBuySignalsForStocks(candidateCodes, 100, buyRuleConfig);
    
    // 4. 基于规则筛选
    const scanResults: ScanStock[] = validQuotes
      .map(quote => {
        const code = quote.code.replace(/^(sh|sz|bj)/, '');
        const basicData = basicDataMap.get(code);
        
        // 确定价格来源
        const priceSource = (useClosePrice && closePriceMap.has(code)) ? 'close' : 'realtime';
        
        const ruleChecks: { rule: string; pass: boolean; value?: string }[] = [];
        let meetsAllRules = true;
        let score = 50;
        
        // 市值规则
        if (basicData && rules.maxMarketCap !== undefined) {
          const pass = basicData.marketCap <= rules.maxMarketCap;
          ruleChecks.push({ rule: `市值 ≤ ${rules.maxMarketCap}亿`, pass, value: `${basicData.marketCap.toFixed(0)}亿` });
          if (!pass) meetsAllRules = false;
        }
        
        if (basicData && rules.minMarketCap !== undefined) {
          const pass = basicData.marketCap >= rules.minMarketCap;
          ruleChecks.push({ rule: `市值 ≥ ${rules.minMarketCap}亿`, pass, value: `${basicData.marketCap.toFixed(0)}亿` });
          if (!pass) meetsAllRules = false;
        }
        
        // PE规则
        if (basicData && rules.maxPE !== undefined && basicData.pe > 0) {
          const pass = basicData.pe <= rules.maxPE;
          ruleChecks.push({ rule: `PE ≤ ${rules.maxPE}`, pass, value: basicData.pe.toFixed(1) });
          if (!pass) meetsAllRules = false;
        }
        
        // PB规则
        if (basicData && rules.minPB !== undefined && basicData.pb > 0) {
          const pass = basicData.pb >= rules.minPB;
          ruleChecks.push({ rule: `PB ≥ ${rules.minPB}`, pass, value: basicData.pb.toFixed(2) });
          if (!pass) meetsAllRules = false;
        }
        
        if (basicData && rules.maxPB !== undefined && basicData.pb > 0) {
          const pass = basicData.pb <= rules.maxPB;
          ruleChecks.push({ rule: `PB ≤ ${rules.maxPB}`, pass, value: basicData.pb.toFixed(2) });
          if (!pass) meetsAllRules = false;
        }
        
        // 换手率规则
        if (basicData && rules.minTurnoverRate !== undefined) {
          const pass = basicData.turnoverRate >= rules.minTurnoverRate;
          ruleChecks.push({ rule: `换手率 ≥ ${rules.minTurnoverRate}%`, pass, value: `${basicData.turnoverRate.toFixed(2)}%` });
          if (!pass) meetsAllRules = false;
        }
        
        // 量比规则
        if (basicData && rules.minVolumeRatio !== undefined) {
          const pass = basicData.volumeRatio >= rules.minVolumeRatio;
          ruleChecks.push({ rule: `量比 ≥ ${rules.minVolumeRatio}`, pass, value: basicData.volumeRatio.toFixed(2) });
          if (!pass) meetsAllRules = false;
        }
        
        // ROE规则（加分项，无数据时不强制排除，仅影响评分）
        const finance = financeMap.get(code);
        if (rules.minROE !== undefined) {
          if (!finance || finance.roe <= 0) {
            ruleChecks.push({ rule: `ROE ≥ ${rules.minROE}%`, pass: false, value: '无数据' });
            // 不设置 meetsAllRules = false，作为加分项
          } else {
            const pass = finance.roe >= rules.minROE;
            ruleChecks.push({ rule: `ROE ≥ ${rules.minROE}%`, pass, value: `${finance.roe.toFixed(1)}%` });
            if (!pass) score -= 10; // ROE不达标扣分
          }
        }
        
        // 负债率规则（加分项，无数据时不强制排除）
        if (rules.maxDebtRatio !== undefined) {
          if (!finance || finance.debtRatio <= 0) {
            ruleChecks.push({ rule: `负债率 ≤ ${rules.maxDebtRatio}%`, pass: false, value: '无数据' });
            // 不设置 meetsAllRules = false，作为加分项
          } else {
            const pass = finance.debtRatio <= rules.maxDebtRatio;
            ruleChecks.push({ rule: `负债率 ≤ ${rules.maxDebtRatio}%`, pass, value: `${finance.debtRatio.toFixed(1)}%` });
            if (!pass) score -= 10; // 负债率超标扣分
          }
        }
        
        // 技术面规则：股价>MA5
        if (rules.priceAboveMA5) {
          const techData = technicalDataMap.get(code);
          if (!techData || !techData.ma5 || techData.ma5 <= 0) {
            ruleChecks.push({ rule: `股价 > MA5`, pass: false, value: '无数据' });
          } else {
            const pass = quote.price > techData.ma5;
            ruleChecks.push({ rule: `股价 > MA5`, pass, value: `现价${quote.price.toFixed(2)} MA5=${techData.ma5.toFixed(2)}` });
            if (!pass) meetsAllRules = false;
          }
        }
        
        // 技术面规则：股价>MA20
        if (rules.priceAboveMA20) {
          const techData = technicalDataMap.get(code);
          if (!techData || !techData.ma20 || techData.ma20 <= 0) {
            ruleChecks.push({ rule: `股价 > MA20`, pass: false, value: '无数据' });
          } else {
            const pass = quote.price > techData.ma20;
            ruleChecks.push({ rule: `股价 > MA20`, pass, value: `现价${quote.price.toFixed(2)} MA20=${techData.ma20.toFixed(2)}` });
            if (!pass) meetsAllRules = false;
          }
        }
        
        // 技术面规则：周MACD金叉
        if (rules.weeklyMACDGoldenCross) {
          const techData = technicalDataMap.get(code);
          if (!techData || techData.weeklyMACDGoldenCross === undefined) {
            ruleChecks.push({ rule: `周MACD金叉`, pass: false, value: '无数据' });
          } else {
            const pass = techData.weeklyMACDGoldenCross;
            ruleChecks.push({ rule: `周MACD金叉`, pass, value: pass ? '已金叉' : '未金叉' });
            if (!pass) meetsAllRules = false;
          }
        }
        
        // 板块涨幅规则：所属概念板块当日涨跌幅 ≥ minSectorGain
        if (rules.minSectorGain && rules.minSectorGain > 0) {
          const sectorData = sectorGainMap.get(code);
          if (!sectorData) {
            ruleChecks.push({ rule: `板块涨幅 ≥ ${rules.minSectorGain}%`, pass: false, value: '无板块数据' });
            // 无板块数据时不排除，作为软过滤
          } else {
            const pass = sectorData.gain >= rules.minSectorGain;
            ruleChecks.push({ rule: `板块涨幅 ≥ ${rules.minSectorGain}%`, pass, value: `${sectorData.sectorName} ${sectorData.gain.toFixed(2)}%` });
            if (!pass) meetsAllRules = false;
          }
        }
        
        // 综合评分调整
        if (quote.changePercent > 0 && quote.changePercent < 5) score += 10;
        else if (quote.changePercent >= 5) score += 5;
        else if (quote.changePercent < -5) score -= 15;
        
        if (basicData) {
          if (basicData.marketCap > 0 && basicData.marketCap < 50) score += 15;
          else if (basicData.marketCap < 100) score += 10;
          else if (basicData.marketCap < 200) score += 5;
          if (basicData.pe > 0 && basicData.pe < 20) score += 10;
          else if (basicData.pe < 40) score += 5;
        }
        
        if (finance && finance.roe > 15) score += 15;
        else if (finance && finance.roe > 10) score += 10;
        else if (finance && finance.roe > 5) score += 5;
        
        if (finance && finance.debtRatio > 0 && finance.debtRatio < 40) score += 5;
        
        if (basicData && basicData.volumeRatio > 2) score += 5;
        
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
          score: Math.max(0, Math.min(100, score)),
          ruleChecks,
          meetsRules: meetsAllRules,
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
    
    // 漏斗：技术面筛选（整合所有技术条件为一步）
    const hasTechnicalRules = rules.priceAboveMA5 || rules.priceAboveMA20 || rules.weeklyMACDGoldenCross;
    if (hasTechnicalRules) {
      // 计算各条件通过数
      let ma5PassCount = 0, ma5FailCount = 0, ma5NoDataCount = 0;
      let ma20PassCount = 0, ma20FailCount = 0, ma20NoDataCount = 0;
      let macdPassCount = 0, macdFailCount = 0, macdNoDataCount = 0;
      
      // 计算技术面全部通过的股票
      const technicalPassResults = scanResults.filter(s => {
        let allPass = true;
        const techData = technicalDataMap.get(s.code);
        
        if (rules.priceAboveMA5) {
          if (!techData?.ma5 || techData.ma5 <= 0) { ma5NoDataCount++; allPass = false; }
          else if (s.price > techData.ma5) { ma5PassCount++; }
          else { ma5FailCount++; allPass = false; }
        }
        
        if (rules.priceAboveMA20) {
          if (!techData?.ma20 || techData.ma20 <= 0) { ma20NoDataCount++; allPass = false; }
          else if (s.price > techData.ma20) { ma20PassCount++; }
          else { ma20FailCount++; allPass = false; }
        }
        
        if (rules.weeklyMACDGoldenCross) {
          if (techData?.weeklyMACDGoldenCross === undefined) { macdNoDataCount++; allPass = false; }
          else if (techData.weeklyMACDGoldenCross) { macdPassCount++; }
          else { macdFailCount++; allPass = false; }
        }
        
        return allPass;
      });
      
      const technicalPassCount = technicalPassResults.length;
      
      // 构建明细
      const details: string[] = [];
      if (rules.priceAboveMA5) {
        let p = `${ma5PassCount}通过`;
        if (ma5FailCount > 0) p += `/${ma5FailCount}不通过`;
        if (ma5NoDataCount > 0) p += `/${ma5NoDataCount}无数据`;
        details.push(p);
      }
      if (rules.priceAboveMA20) {
        let p = `${ma20PassCount}通过`;
        if (ma20FailCount > 0) p += `/${ma20FailCount}不通过`;
        if (ma20NoDataCount > 0) p += `/${ma20NoDataCount}无数据`;
        details.push(p);
      }
      if (rules.weeklyMACDGoldenCross) {
        let p = `${macdPassCount}通过`;
        if (macdFailCount > 0) p += `/${macdFailCount}不通过`;
        if (macdNoDataCount > 0) p += `/${macdNoDataCount}无数据`;
        details.push(p);
      }
      
      funnelSteps.push({
        label: '技术面筛选',
        count: technicalPassCount,
        filter: details.join('；'),
      });
    }
    
    // 漏斗：板块涨幅筛选（当设置了minSectorGain时）
    if (rules.minSectorGain && rules.minSectorGain > 0 && sectorGainMap.size > 0) {
      let sectorPassCount = 0, sectorFailCount = 0, sectorNoDataCount = 0;
      
      const sectorPassResults = scanResults.filter(s => {
        const sectorData = sectorGainMap.get(s.code);
        if (!sectorData) { sectorNoDataCount++; return false; }
        if (sectorData.gain >= rules.minSectorGain!) { sectorPassCount++; return true; }
        sectorFailCount++;
        return false;
      });
      
      const details: string[] = [];
      details.push(`${sectorPassCount}通过`);
      if (sectorFailCount > 0) details.push(`${sectorFailCount}不通过`);
      if (sectorNoDataCount > 0) details.push(`${sectorNoDataCount}无数据`);
      
      funnelSteps.push({
        label: '板块涨幅筛选',
        count: sectorPassResults.length,
        filter: `板块涨幅≥${rules.minSectorGain}%（${details.join('、')}）`,
      });
    }
    
    // 漏斗：符合选股规则 + 买入信号（合并为结果步骤）
    const buySignalCount = scanResults.filter(s => s.buySignal?.trigger).length;
    
    // 只有当"符合选股规则"数量与技术面筛选不同时才添加此步骤
    const lastFunnelStep = funnelSteps[funnelSteps.length - 1];
    const lastFunnelCount = lastFunnelStep ? lastFunnelStep.count : candidateCodes.length;
    
    if (matchCount < lastFunnelCount) {
      // 选股规则有实际过滤效果
      const resultLabel = buySignalCount > 0 
        ? `符合选股规则（${buySignalCount}只买入信号）`
        : '符合选股规则';
      funnelSteps.push({
        label: resultLabel,
        count: matchCount,
        filter: buySignalCount > 0 
          ? `${buySignalCount}只触发买入信号（${buyRuleFilters.join('、')}）`
          : selectionRules.length > 0 
            ? `通过${selectionRules.length}项选股规则`
            : '通过选股规则',
      });
    } else if (buySignalCount > 0) {
      // 选股规则无过滤，但有买入信号
      funnelSteps.push({
        label: `符合选股规则（${buySignalCount}只买入信号）`,
        count: matchCount,
        filter: `${buySignalCount}只触发买入信号（${buyRuleFilters.join('、')}）`,
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
        tushareConfigured: isTushareConfigured(),
        scanTime: new Date().toISOString(),
        note: buildScanNote(poolSource, scanResults.length, matchCount, financeMap.size),
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

function buildScanNote(poolSource: string, total: number, matchCount: number, financeCount: number): string {
  const sourceDesc = {
    'tushare-full-market': 'Tushare全市场',
    'default-pool': '默认股票池',
  };
  return `${sourceDesc[poolSource] || poolSource}，扫描 ${total} 只，${financeCount} 只有财务数据，${matchCount} 只符合规则`;
}
