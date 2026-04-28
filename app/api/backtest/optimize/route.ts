// 策略参数优化 API
// 基于网格搜索自动测试多组参数组合，返回最优配置推荐
// 优化版本：同一批次共享数据预加载缓存

import { NextRequest, NextResponse } from 'next/server';
import { runBacktestWithCache, preloadBacktestData, type BacktestDataCache } from '../route';
import type { BacktestParams, BacktestResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface OptimizableParam {
  name: string;
  label: string;
  category: 'stock' | 'sell' | 'money';
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | boolean;
}

export interface ParamRange {
  name: string;
  values: (number | boolean)[];
}

export interface OptimizeRequest {
  params: BacktestParams;
  baseRules: Record<string, unknown>;
  paramRanges: ParamRange[];
  weights?: {
    totalReturn?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
    winRate?: number;
    profitFactor?: number;
    tradeFrequency?: number;
  };
  maxCombinations?: number;
}

export interface OptimizationResult {
  id: number;
  params: Record<string, unknown>;
  backtest: BacktestResult;
  score: number;
  scoreBreakdown: {
    returnScore: number;
    sharpeScore: number;
    drawdownScore: number;
    winRateScore: number;
    profitFactorScore: number;
    frequencyScore: number;
  };
  rank: number;
}

export interface OptimizeResponse {
  success: boolean;
  totalCombinations: number;
  completedCombinations: number;
  results: OptimizationResult[];
  bestResult: OptimizationResult | null;
  top3Results: OptimizationResult[];
  executionTimeMs: number;
  dataLoadTimeMs: number;
  error?: string;
}

const DEFAULT_WEIGHTS = {
  totalReturn: 0.25,
  sharpeRatio: 0.25,
  maxDrawdown: 0.20,
  winRate: 0.15,
  profitFactor: 0.10,
  tradeFrequency: 0.05,
};

function generateCombinations(paramRanges: ParamRange[]): Record<string, unknown>[] {
  if (paramRanges.length === 0) return [{}];
  const [first, ...rest] = paramRanges;
  const restCombinations = generateCombinations(rest);
  const combinations: Record<string, unknown>[] = [];
  for (const value of first.values) {
    for (const restCombo of restCombinations) {
      combinations.push({ [first.name]: value, ...restCombo });
    }
  }
  return combinations;
}

function calculateScore(
  result: BacktestResult,
  weights: Required<NonNullable<OptimizeRequest['weights']>>
): { score: number; breakdown: OptimizationResult['scoreBreakdown'] } {
  const returnScore = Math.max(0, Math.min(100, (result.annualizedReturn + 50) * (100 / 150)));
  const sharpeScore = Math.max(0, Math.min(100, result.sharpeRatio * 20));
  const drawdownScore = Math.max(0, Math.min(100, 100 - result.maxDrawdown * 2));
  const winRateScore = result.winRate;
  const profitFactorScore = Math.max(0, Math.min(100, result.profitFactor * 20));
  const frequencyScore = Math.max(0, Math.min(100, result.totalTrades * 0.5));

  const score =
    returnScore * weights.totalReturn +
    sharpeScore * weights.sharpeRatio +
    drawdownScore * weights.maxDrawdown +
    winRateScore * weights.winRate +
    profitFactorScore * weights.profitFactor +
    frequencyScore * weights.tradeFrequency;

  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      returnScore: Math.round(returnScore * 100) / 100,
      sharpeScore: Math.round(sharpeScore * 100) / 100,
      drawdownScore: Math.round(drawdownScore * 100) / 100,
      winRateScore: Math.round(winRateScore * 100) / 100,
      profitFactorScore: Math.round(profitFactorScore * 100) / 100,
      frequencyScore: Math.round(frequencyScore * 100) / 100,
    },
  };
}

async function runOptimization(request: OptimizeRequest): Promise<OptimizeResponse> {
  const startTime = Date.now();
  const weights = { ...DEFAULT_WEIGHTS, ...request.weights };

  // 生成所有参数组合
  const combinations = generateCombinations(request.paramRanges);

  // 限制组合数
  const maxCombinations = request.maxCombinations || 500;
  if (combinations.length > maxCombinations) {
    const step = Math.floor(combinations.length / maxCombinations);
    const sampled: Record<string, unknown>[] = [];
    for (let i = 0; i < combinations.length; i += step) {
      sampled.push(combinations[i]);
      if (sampled.length >= maxCombinations) break;
    }
    combinations.length = 0;
    combinations.push(...sampled);
  }

  // 预加载数据（只执行一次，所有组合共享）
  const dataLoadStart = Date.now();
  const cache = preloadBacktestData(request.params.startDate, request.params.endDate);
  const dataLoadTimeMs = Date.now() - dataLoadStart;

  if (cache.tradeDates.length === 0) {
    return {
      success: false,
      totalCombinations: combinations.length,
      completedCombinations: 0,
      results: [],
      bestResult: null,
      top3Results: [],
      executionTimeMs: 0,
      dataLoadTimeMs,
      error: '回测时间范围无效，数据库中无数据',
    };
  }

  console.log(`[Optimize] 开始批量回测: ${combinations.length}种组合, 数据预加载耗时${dataLoadTimeMs}ms`);

  const results: OptimizationResult[] = [];
  let completedCount = 0;

  // 串行执行回测（共享缓存）
  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i];
    const rules = { ...request.baseRules, ...combo };

    try {
      const backtestResult = await runBacktestWithCache(request.params, rules as Parameters<typeof runBacktestWithCache>[1], cache);
      const { score, breakdown } = calculateScore(backtestResult, weights as Required<typeof weights>);

      results.push({
        id: i + 1,
        params: combo,
        backtest: backtestResult,
        score,
        scoreBreakdown: breakdown,
        rank: 0,
      });
    } catch (error) {
      console.warn(`[Optimize] 组合 ${i + 1} 回测失败:`, error);
    }

    completedCount++;

    // 每10个组合打印进度
    if ((i + 1) % 10 === 0 || i === combinations.length - 1) {
      console.log(`[Optimize] 进度: ${i + 1}/${combinations.length}`);
    }
  }

  // 按评分排序
  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => { r.rank = i + 1; });

  const executionTimeMs = Date.now() - startTime;
  console.log(`[Optimize] 批量回测完成: ${completedCount}/${combinations.length}种组合, 总耗时${executionTimeMs}ms`);

  return {
    success: true,
    totalCombinations: combinations.length,
    completedCombinations: completedCount,
    results,
    bestResult: results[0] || null,
    top3Results: results.slice(0, 3),
    executionTimeMs,
    dataLoadTimeMs,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OptimizeRequest;

    if (!body.params || !body.baseRules || !body.paramRanges || body.paramRanges.length === 0) {
      return NextResponse.json({ success: false, error: '缺少必要参数：params, baseRules, paramRanges' });
    }

    const totalCombinations = body.paramRanges.reduce((acc, range) => acc * range.values.length, 1);
    if (totalCombinations > 500) {
      return NextResponse.json({ success: false, error: `参数组合数 ${totalCombinations} 过多，请减少优化参数或缩小范围（最大500）` });
    }

    const result = await runOptimization(body);
    return NextResponse.json({ ...result, timestamp: Date.now() });
  } catch (error) {
    console.error('[Optimize] 参数优化失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '参数优化失败',
      totalCombinations: 0,
      completedCombinations: 0,
      results: [],
      bestResult: null,
      top3Results: [],
      executionTimeMs: 0,
      dataLoadTimeMs: 0,
    });
  }
}

export async function GET() {
  const optimizableParams: OptimizableParam[] = [
    // 选股规则 - 基于回测优化结果调整默认值
    { name: 'minTurnoverRate', label: '最小换手率(%)', category: 'stock', type: 'number', min: 1, max: 10, step: 1, defaultValue: 1 },
    { name: 'minVolumeRatio', label: '最小量比', category: 'stock', type: 'number', min: 1, max: 3, step: 0.5, defaultValue: 1 },
    { name: 'minROE', label: '最小ROE(%)', category: 'stock', type: 'number', min: 5, max: 20, step: 2.5, defaultValue: 10 },
    { name: 'maxDebtRatio', label: '最大负债率(%)', category: 'stock', type: 'number', min: 30, max: 70, step: 10, defaultValue: 50 },
    { name: 'maxMarketCap', label: '最大市值(亿)', category: 'stock', type: 'number', min: 50, max: 500, step: 50, defaultValue: 300 },
    { name: 'minSectorGain', label: '最小板块涨幅(%)', category: 'stock', type: 'number', min: 0, max: 5, step: 1, defaultValue: 2 },
    { name: 'priceAboveMA5', label: '股价>MA5', category: 'stock', type: 'boolean', defaultValue: true },
    { name: 'priceAboveMA20', label: '股价>MA20', category: 'stock', type: 'boolean', defaultValue: true },
    // 卖出规则 - 基于回测优化结果：止盈15%表现最好
    { name: 'stopLossPercent', label: '止损比例(%)', category: 'sell', type: 'number', min: 3, max: 15, step: 1, defaultValue: 8 },
    { name: 'takeProfitPercent', label: '止盈比例(%)', category: 'sell', type: 'number', min: 10, max: 50, step: 5, defaultValue: 15 },
    { name: 'trailingStopPercent', label: '移动止盈(%)', category: 'sell', type: 'number', min: 3, max: 10, step: 1, defaultValue: 5 },
    { name: 'timeStopDays', label: '时间止损(天)', category: 'sell', type: 'number', min: 10, max: 40, step: 5, defaultValue: 20 },
    // 资金管理
    { name: 'maxPositions', label: '最大持仓数', category: 'money', type: 'number', min: 3, max: 10, step: 1, defaultValue: 5 },
    { name: 'maxSingleStockPercent', label: '单股最大占比(%)', category: 'money', type: 'number', min: 10, max: 30, step: 5, defaultValue: 20 },
  ];

  return NextResponse.json({ success: true, params: optimizableParams });
}
