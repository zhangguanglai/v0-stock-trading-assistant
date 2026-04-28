'use client';

import { useState, useMemo, useEffect } from 'react';
import { Calendar, Play, BarChart3, TrendingUp, AlertTriangle, Download, RefreshCw, Loader2, History, Trash2, Settings2, Trophy, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useStockStore } from '@/lib/store';
import { formatCurrency, formatPercent, getProfitColorClass } from '@/lib/mock-data';
import { BacktestParams, BacktestResult, BacktestTrade, EquityPoint } from '@/lib/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

interface BacktestRecord {
  id: number;
  strategy_id: string;
  strategy_name: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_return: number;
  annualized_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  created_at: string;
}

interface OptimizableParam {
  name: string;
  label: string;
  category: 'stock' | 'sell' | 'money';
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | boolean;
}

interface OptimizationResult {
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

interface OptimizeResponse {
  success: boolean;
  totalCombinations: number;
  completedCombinations: number;
  results: OptimizationResult[];
  bestResult: OptimizationResult | null;
  top3Results: OptimizationResult[];
  executionTimeMs: number;
  dataLoadTimeMs?: number;
}

export function BacktestView() {
  const { strategies, activeStrategyId } = useStockStore();

  // 默认回测周期：12个月前到今天
  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const [params, setParams] = useState<BacktestParams>({
    strategyId: activeStrategyId || '',
    startDate: formatDate(oneYearAgo),
    endDate: formatDate(today),
    initialCapital: 100000,
    commissionRate: 0.0003,
    slippage: 0.001,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [history, setHistory] = useState<BacktestRecord[]>([]);
  const [activeTab, setActiveTab] = useState('run');

  // 参数优化状态
  const [optimizableParams, setOptimizableParams] = useState<OptimizableParam[]>([]);
  const [selectedParams, setSelectedParams] = useState<Set<string>>(new Set());
  const [paramRanges, setParamRanges] = useState<Record<string, { min: number; max: number; step: number }>>({});
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState(0);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResponse | null>(null);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  // 加载可优化参数列表
  useEffect(() => {
    fetch('/api/backtest/optimize')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setOptimizableParams(data.params);
          // 初始化默认范围
          const ranges: Record<string, { min: number; max: number; step: number }> = {};
          data.params.forEach((p: OptimizableParam) => {
            if (p.type === 'number') {
              ranges[p.name] = {
                min: p.min ?? 0,
                max: p.max ?? 100,
                step: p.step ?? 1,
              };
            }
          });
          setParamRanges(ranges);
        }
      })
      .catch(console.error);
  }, []);

  // 加载回测历史
  const loadHistory = async () => {
    try {
      const response = await fetch('/api/backtest/history?limit=20');
      const data = await response.json();
      if (data.success) {
        setHistory(data.data);
      }
    } catch (error) {
      console.error('加载回测历史失败:', error);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === params.strategyId),
    [strategies, params.strategyId]
  );

  // 构建基础规则（当前策略的固定参数）
  const buildBaseRules = (strategy: typeof activeStrategy) => {
    if (!strategy) return {};
    return {
      minMarketCap: strategy.stockRules?.minMarketCap,
      maxMarketCap: strategy.stockRules?.maxMarketCap,
      minROE: strategy.stockRules?.minROE,
      maxDebtRatio: strategy.stockRules?.maxDebtRatio,
      minTurnoverRate: strategy.stockRules?.minTurnoverRate5D,
      maxPE: strategy.stockRules?.maxPEPercentile,
      minVolumeRatio: strategy.stockRules?.volumeRatio,
      minSectorGain: strategy.stockRules?.minSectorGain,
      priceAboveMA5: strategy.stockRules?.priceAboveMA5,
      priceAboveMA20: strategy.stockRules?.priceAboveMA20,
      weeklyMACDGoldenCross: strategy.stockRules?.weeklyMACDGoldenCross,
      stopLossPercent: strategy.sellRules?.stopLossPercent,
      takeProfitPercent: strategy.sellRules?.takeProfitPercent,
      trailingStopPercent: strategy.sellRules?.trailingStopPercent,
      timeStopDays: strategy.sellRules?.timeStopDays,
      timeStopMinGain: strategy.sellRules?.timeStopMinGain,
      maxPositions: strategy.moneyRules?.maxPositions,
      maxSingleStockPercent: strategy.moneyRules?.maxSingleStockPercent,
      minCashPercent: strategy.moneyRules?.minCashPercent,
    };
  };

  const handleRunBacktest = async () => {
    if (!params.strategyId) {
      toast.error('请选择一个策略');
      return;
    }

    setIsRunning(true);
    try {
      const strategy = strategies.find(s => s.id === params.strategyId);
      if (!strategy) {
        toast.error('策略不存在');
        return;
      }

      const rules = buildBaseRules(strategy);

      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, rules }),
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || '回测失败');
        return;
      }

      setResult(data.data);
      toast.success('回测完成');
      loadHistory();
      setActiveTab('result');
    } catch (error) {
      console.error('回测失败:', error);
      toast.error('回测失败，请稍后重试');
    } finally {
      setIsRunning(false);
    }
  };

  // 执行参数优化
  const handleRunOptimization = async () => {
    if (!params.strategyId) {
      toast.error('请选择一个策略');
      return;
    }
    if (selectedParams.size === 0) {
      toast.error('请至少选择一个要优化的参数');
      return;
    }

    const strategy = strategies.find(s => s.id === params.strategyId);
    if (!strategy) {
      toast.error('策略不存在');
      return;
    }

    setIsOptimizing(true);
    setOptimizeProgress(0);
    setOptimizeResult(null);

    try {
      const baseRules = buildBaseRules(strategy);
      const ranges: { name: string; values: (number | boolean)[] }[] = [];

      // 为每个选中的参数生成取值范围
      for (const paramName of selectedParams) {
        const param = optimizableParams.find(p => p.name === paramName);
        if (!param) continue;

        if (param.type === 'boolean') {
          ranges.push({ name: paramName, values: [true, false] });
        } else {
          const range = paramRanges[paramName];
          if (!range) continue;
          const values: number[] = [];
          for (let v = range.min; v <= range.max; v += range.step) {
            values.push(Math.round(v * 100) / 100);
          }
          // 限制每个参数的取值数量
          if (values.length > 5) {
            const step = Math.ceil(values.length / 5);
            const sampled: number[] = [];
            for (let i = 0; i < values.length; i += step) {
              sampled.push(values[i]);
            }
            ranges.push({ name: paramName, values: sampled });
          } else {
            ranges.push({ name: paramName, values });
          }
        }
      }

      // 计算组合数
      const totalCombo = ranges.reduce((acc, r) => acc * r.values.length, 1);
      if (totalCombo > 500) {
        toast.error(`参数组合数 ${totalCombo} 过多，请减少参数或缩小范围`);
        setIsOptimizing(false);
        return;
      }

      toast.info(`开始优化，共 ${totalCombo} 组参数组合...`);

      const response = await fetch('/api/backtest/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          params,
          baseRules,
          paramRanges: ranges,
          weights: {
            totalReturn: 0.25,
            sharpeRatio: 0.25,
            maxDrawdown: 0.20,
            winRate: 0.15,
            profitFactor: 0.10,
            tradeFrequency: 0.05,
          },
        }),
      });

      const data: OptimizeResponse = await response.json();

      if (!data.success) {
        toast.error(data.error || '优化失败');
        return;
      }

      setOptimizeResult(data);
      toast.success(`优化完成！最佳评分: ${data.bestResult?.score.toFixed(2)}`);
    } catch (error) {
      console.error('优化失败:', error);
      toast.error('优化失败，请稍后重试');
    } finally {
      setIsOptimizing(false);
      setOptimizeProgress(100);
    }
  };

  // 应用优化结果到策略
  const handleApplyParams = (optResult: OptimizationResult) => {
    // 这里可以添加将参数应用到策略的逻辑
    toast.success('参数已复制，请前往策略配置页面手动应用');
    // 将参数显示在控制台，方便用户复制
    console.log('推荐参数配置:', optResult.params);
  };

  // 删除回测记录
  const handleDeleteRecord = async (id: number) => {
    try {
      const response = await fetch(`/api/backtest/history?id=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast.success('记录已删除');
        loadHistory();
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const chartData = useMemo(() => {
    if (!result) return { labels: [], datasets: [] };

    return {
      labels: result.equityCurve.map(p => p.date),
      datasets: [
        {
          label: '资产价值',
          data: result.equityCurve.map(p => p.equity),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
        },
        {
          label: '最大回撤',
          data: result.equityCurve.map(p => p.drawdown),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          yAxisID: 'y1',
        },
      ],
    };
  }, [result]);

  // 按类别分组参数
  const paramsByCategory = useMemo(() => {
    const groups: Record<string, OptimizableParam[]> = {
      stock: [],
      sell: [],
      money: [],
    };
    optimizableParams.forEach(p => {
      groups[p.category].push(p);
    });
    return groups;
  }, [optimizableParams]);

  const categoryLabels: Record<string, string> = {
    stock: '选股规则',
    sell: '卖出规则',
    money: '资金管理',
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">策略回测</h1>
            <p className="text-sm text-muted-foreground">
              测试策略历史表现，提升交易系统可信度
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="run" className="gap-1">
              <Play className="h-4 w-4" />
              运行回测
            </TabsTrigger>
            <TabsTrigger value="optimize" className="gap-1">
              <Settings2 className="h-4 w-4" />
              参数优化
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1">
              <History className="h-4 w-4" />
              历史记录
            </TabsTrigger>
          </TabsList>

          <TabsContent value="run" className="space-y-6 mt-0">
            {/* Backtest Parameters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">回测参数</CardTitle>
                <CardDescription>设置回测的基本参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>选择策略</Label>
                    <Select
                      value={params.strategyId}
                      onValueChange={(value) => setParams({ ...params, strategyId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择策略" />
                      </SelectTrigger>
                      <SelectContent>
                        {strategies.map((strategy) => (
                          <SelectItem key={strategy.id} value={strategy.id}>
                            {strategy.name} ({strategy.cycle === 'short' ? '短线' : strategy.cycle === 'swing' ? '波段' : '长线'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>初始资金</Label>
                    <Input
                      type="number"
                      value={params.initialCapital}
                      onChange={(e) => setParams({ ...params, initialCapital: Number(e.target.value) })}
                      placeholder="100000"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>开始日期</Label>
                    <Input
                      type="date"
                      value={params.startDate}
                      onChange={(e) => setParams({ ...params, startDate: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>结束日期</Label>
                    <Input
                      type="date"
                      value={params.endDate}
                      onChange={(e) => setParams({ ...params, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>佣金费率</Label>
                    <Input
                      type="number"
                      value={params.commissionRate}
                      onChange={(e) => setParams({ ...params, commissionRate: Number(e.target.value) })}
                      step="0.0001"
                      placeholder="0.0003"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>滑点</Label>
                    <Input
                      type="number"
                      value={params.slippage}
                      onChange={(e) => setParams({ ...params, slippage: Number(e.target.value) })}
                      step="0.0001"
                      placeholder="0.001"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleRunBacktest}
                    disabled={isRunning}
                    className="gap-2"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        回测中...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        开始回测
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 参数优化标签页 */}
          <TabsContent value="optimize" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-5 w-5 text-yellow-500" />
                      参数优化
                    </CardTitle>
                    <CardDescription>
                      选择要优化的参数和范围，系统将自动测试多组配置并推荐最优方案
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 回测基础参数 */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>选择策略</Label>
                    <Select
                      value={params.strategyId}
                      onValueChange={(value) => setParams({ ...params, strategyId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择策略" />
                      </SelectTrigger>
                      <SelectContent>
                        {strategies.map((strategy) => (
                          <SelectItem key={strategy.id} value={strategy.id}>
                            {strategy.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>开始日期</Label>
                    <Input
                      type="date"
                      value={params.startDate}
                      onChange={(e) => setParams({ ...params, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>结束日期</Label>
                    <Input
                      type="date"
                      value={params.endDate}
                      onChange={(e) => setParams({ ...params, endDate: e.target.value })}
                    />
                  </div>
                </div>

                {/* 参数选择 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">选择要优化的参数</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedParams(new Set(optimizableParams.map(p => p.name)))}
                      >
                        全选
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedParams(new Set())}
                      >
                        清空
                      </Button>
                    </div>
                  </div>

                  {Object.entries(paramsByCategory).map(([category, paramsList]) => (
                    <div key={category} className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        {categoryLabels[category]}
                      </h4>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {paramsList.map((param) => (
                          <div
                            key={param.name}
                            className={`border rounded-lg p-3 transition-colors ${
                              selectedParams.has(param.name)
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={selectedParams.has(param.name)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(selectedParams);
                                  if (checked) newSet.add(param.name);
                                  else newSet.delete(param.name);
                                  setSelectedParams(newSet);
                                }}
                              />
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-sm font-medium cursor-pointer">
                                    {param.label}
                                  </Label>
                                  <Badge variant="secondary" className="text-xs">
                                    默认: {String(param.defaultValue)}
                                  </Badge>
                                </div>
                                {param.type === 'number' && selectedParams.has(param.name) && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        size={1}
                                        className="h-7 text-xs"
                                        value={paramRanges[param.name]?.min ?? param.min}
                                        onChange={(e) =>
                                          setParamRanges(prev => ({
                                            ...prev,
                                            [param.name]: {
                                              ...prev[param.name],
                                              min: Number(e.target.value),
                                            },
                                          }))
                                        }
                                      />
                                      <span className="text-xs text-muted-foreground">~</span>
                                      <Input
                                        type="number"
                                        size={1}
                                        className="h-7 text-xs"
                                        value={paramRanges[param.name]?.max ?? param.max}
                                        onChange={(e) =>
                                          setParamRanges(prev => ({
                                            ...prev,
                                            [param.name]: {
                                              ...prev[param.name],
                                              max: Number(e.target.value),
                                            },
                                          }))
                                        }
                                      />
                                      <span className="text-xs text-muted-foreground">步长</span>
                                      <Input
                                        type="number"
                                        size={1}
                                        className="h-7 text-xs w-16"
                                        value={paramRanges[param.name]?.step ?? param.step}
                                        onChange={(e) =>
                                          setParamRanges(prev => ({
                                            ...prev,
                                            [param.name]: {
                                              ...prev[param.name],
                                              step: Number(e.target.value),
                                            },
                                          }))
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 优化按钮 */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    已选择 {selectedParams.size} 个参数
                    {selectedParams.size > 0 && (
                      <span className="ml-2">
                        （预计
                        {Array.from(selectedParams).reduce((acc, name) => {
                          const param = optimizableParams.find(p => p.name === name);
                          if (!param) return acc;
                          if (param.type === 'boolean') return acc * 2;
                          const range = paramRanges[name];
                          if (!range) return acc;
                          const count = Math.floor((range.max - range.min) / range.step) + 1;
                          return acc * Math.min(count, 5);
                        }, 1)}
                        种组合）
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={handleRunOptimization}
                    disabled={isOptimizing || selectedParams.size === 0}
                    className="gap-2"
                  >
                    {isOptimizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        优化中...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        开始优化
                      </>
                    )}
                  </Button>
                </div>

                {/* 进度条 */}
                {isOptimizing && (
                  <div className="space-y-2">
                    <Progress value={optimizeProgress} />
                    <p className="text-xs text-muted-foreground text-center">
                      正在测试不同参数组合，请耐心等待...
                    </p>
                    <p className="text-xs text-muted-foreground text-center">
                      预估耗时约 {Math.ceil(selectedParams.size > 0 ?
                        Array.from(selectedParams).reduce((acc, name) => {
                          const param = optimizableParams.find(p => p.name === name);
                          if (!param) return acc;
                          if (param.type === 'boolean') return acc * 2;
                          const range = paramRanges[name];
                          if (!range) return acc;
                          const count = Math.min(Math.floor((range.max - range.min) / range.step) + 1, 5);
                          return acc * count;
                        }, 1) * 0.3 : 0
                      )} 秒
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 优化结果 */}
            {optimizeResult && optimizeResult.success && (
              <div className="space-y-6">
                {/* Top 3 推荐 */}
                <Card className="border-primary/50">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      Top 3 推荐配置
                    </CardTitle>
                    <CardDescription>
                      基于综合评分（收益、夏普比率、回撤、胜率、盈亏比）排序
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {optimizeResult.top3Results.map((res, idx) => (
                      <div
                        key={res.id}
                        className={`border rounded-lg p-4 ${
                          idx === 0 ? 'border-yellow-500/50 bg-yellow-50/50' : 'border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={idx === 0 ? 'default' : idx === 1 ? 'secondary' : 'outline'}
                            >
                              #{res.rank}
                            </Badge>
                            <span className="font-semibold">
                              综合评分: {res.score.toFixed(2)}
                            </span>
                            {idx === 0 && (
                              <Badge variant="default" className="bg-yellow-500">
                                最佳
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApplyParams(res)}
                          >
                            应用参数
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div className="text-sm">
                            <span className="text-muted-foreground">总收益:</span>{' '}
                            <span className={getProfitColorClass(res.backtest.totalReturn)}>
                              {res.backtest.totalReturn >= 0 ? '+' : ''}
                              {res.backtest.totalReturn.toFixed(2)}%
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">年化:</span>{' '}
                            <span className={getProfitColorClass(res.backtest.annualizedReturn)}>
                              {res.backtest.annualizedReturn >= 0 ? '+' : ''}
                              {res.backtest.annualizedReturn.toFixed(2)}%
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">最大回撤:</span>{' '}
                            <span className="text-destructive">
                              {res.backtest.maxDrawdown.toFixed(2)}%
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">夏普比率:</span>{' '}
                            <span>{res.backtest.sharpeRatio.toFixed(2)}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">胜率:</span>{' '}
                            <span>{res.backtest.winRate.toFixed(1)}%</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">盈亏比:</span>{' '}
                            <span>{res.backtest.profitFactor.toFixed(2)}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">交易数:</span>{' '}
                            <span>{res.backtest.totalTrades} 笔</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">执行时间:</span>{' '}
                            <span>{(optimizeResult.executionTimeMs / 1000).toFixed(1)}s</span>
                          </div>
                        </div>

                        {/* 参数详情 */}
                        <div className="bg-muted/50 rounded p-3">
                          <button
                            className="flex items-center gap-1 text-sm font-medium w-full"
                            onClick={() =>
                              setExpandedResult(expandedResult === res.id ? null : res.id)
                            }
                          >
                            {expandedResult === res.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            参数配置
                          </button>
                          {expandedResult === res.id && (
                            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                              {Object.entries(res.params).map(([key, value]) => {
                                const paramDef = optimizableParams.find(p => p.name === key);
                                return (
                                  <div key={key} className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      {paramDef?.label || key}:
                                    </span>
                                    <span className="font-medium">
                                      {typeof value === 'boolean'
                                        ? value
                                          ? '是'
                                          : '否'
                                        : String(value)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 评分明细 */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                          <div className="text-center p-2 bg-muted rounded">
                            <div className="text-muted-foreground">收益分</div>
                            <div className="font-medium">{res.scoreBreakdown.returnScore.toFixed(1)}</div>
                          </div>
                          <div className="text-center p-2 bg-muted rounded">
                            <div className="text-muted-foreground">夏普分</div>
                            <div className="font-medium">{res.scoreBreakdown.sharpeScore.toFixed(1)}</div>
                          </div>
                          <div className="text-center p-2 bg-muted rounded">
                            <div className="text-muted-foreground">回撤分</div>
                            <div className="font-medium">{res.scoreBreakdown.drawdownScore.toFixed(1)}</div>
                          </div>
                          <div className="text-center p-2 bg-muted rounded">
                            <div className="text-muted-foreground">胜率分</div>
                            <div className="font-medium">{res.scoreBreakdown.winRateScore.toFixed(1)}</div>
                          </div>
                          <div className="text-center p-2 bg-muted rounded">
                            <div className="text-muted-foreground">盈亏比分</div>
                            <div className="font-medium">{res.scoreBreakdown.profitFactorScore.toFixed(1)}</div>
                          </div>
                          <div className="text-center p-2 bg-muted rounded">
                            <div className="text-muted-foreground">频率分</div>
                            <div className="font-medium">{res.scoreBreakdown.frequencyScore.toFixed(1)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* 完整结果表格 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">全部优化结果</CardTitle>
                    <CardDescription>
                      共测试 {optimizeResult.totalCombinations} 种参数组合
                      {optimizeResult.dataLoadTimeMs !== undefined && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (数据加载 {optimizeResult.dataLoadTimeMs}ms, 回测执行 {optimizeResult.executionTimeMs}ms)
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>排名</TableHead>
                            <TableHead>综合评分</TableHead>
                            <TableHead className="text-right">总收益</TableHead>
                            <TableHead className="text-right">年化收益</TableHead>
                            <TableHead className="text-right">最大回撤</TableHead>
                            <TableHead className="text-right">夏普比率</TableHead>
                            <TableHead className="text-right">胜率</TableHead>
                            <TableHead className="text-right">盈亏比</TableHead>
                            <TableHead>交易数</TableHead>
                            <TableHead>参数摘要</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {optimizeResult.results.map((res) => (
                            <TableRow key={res.id}>
                              <TableCell>
                                <Badge variant={res.rank <= 3 ? 'default' : 'outline'}>
                                  {res.rank}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{res.score.toFixed(2)}</TableCell>
                              <TableCell className={`text-right ${getProfitColorClass(res.backtest.totalReturn)}`}>
                                {res.backtest.totalReturn >= 0 ? '+' : ''}
                                {res.backtest.totalReturn.toFixed(2)}%
                              </TableCell>
                              <TableCell className={`text-right ${getProfitColorClass(res.backtest.annualizedReturn)}`}>
                                {res.backtest.annualizedReturn >= 0 ? '+' : ''}
                                {res.backtest.annualizedReturn.toFixed(2)}%
                              </TableCell>
                              <TableCell className="text-right text-destructive">
                                {res.backtest.maxDrawdown.toFixed(2)}%
                              </TableCell>
                              <TableCell className="text-right">
                                {res.backtest.sharpeRatio.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                {res.backtest.winRate.toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right">
                                {res.backtest.profitFactor.toFixed(2)}
                              </TableCell>
                              <TableCell>{res.backtest.totalTrades}</TableCell>
                              <TableCell>
                                <div className="text-xs text-muted-foreground max-w-[200px] truncate">
                                  {Object.entries(res.params)
                                    .map(([k, v]) => {
                                      const def = optimizableParams.find(p => p.name === k);
                                      return `${def?.label || k}=${String(v)}`;
                                    })
                                    .join(', ')}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="result" className="space-y-6 mt-0">
            {/* Backtest Results */}
            {result && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">回测结果</h2>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('run')}>
                    返回参数
                  </Button>
                </div>
                {/* Summary Stats */}
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        总收益率
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-chart-1">
                        {formatPercent(result.totalReturn)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        年化 {formatPercent(result.annualizedReturn)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        最大回撤
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive">
                        {formatPercent(result.maxDrawdown)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        风险指标
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        夏普比率
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {result.sharpeRatio.toFixed(2)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        风险调整收益
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        胜率
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-chart-1">
                        {formatPercent(result.winRate)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {result.totalTrades} 笔交易
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Equity Curve */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">资金曲线</CardTitle>
                    <CardDescription>回测期间的资产价值变化</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ChartContainer config={{
                        equity: { label: '资产价值' },
                        drawdown: { label: '最大回撤' },
                      }}>
                        <LineChart data={result.equityCurve}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis yAxisId="left" label={{ value: '资产价值 (元)', angle: -90, position: 'insideLeft' }} />
                          <YAxis yAxisId="right" orientation="right" label={{ value: '回撤 (%)', angle: 90, position: 'insideRight' }} />
                          <Tooltip />
                          <Legend />
                          <Line yAxisId="left" type="monotone" dataKey="equity" stroke="#3b82f6" strokeWidth={2} />
                          <Line yAxisId="right" type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} />
                        </LineChart>
                      </ChartContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Trade Details */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">交易详情</CardTitle>
                        <CardDescription>回测期间的交易记录</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                        if (!result) return;
                        const headers = ['股票代码', '股票名称', '买入日期', '卖出日期', '买入价', '卖出价', '股数', '收益', '收益率%', '持有天数', '信号'];
                        const rows = result.trades.map(t => [
                          t.stockCode, t.stockName, t.entryDate, t.exitDate,
                          t.entryPrice.toFixed(2), t.exitPrice.toFixed(2), t.shares,
                          t.profit.toFixed(2), t.profitPercent.toFixed(2), t.holdingPeriod, t.signal
                        ]);
                        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `回测交易记录_${result.startDate}_${result.endDate}.csv`;
                        link.click();
                        toast.success('导出成功');
                      }}>
                        <Download className="h-4 w-4" />
                        导出数据
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>股票</TableHead>
                            <TableHead>买入日期</TableHead>
                            <TableHead>卖出日期</TableHead>
                            <TableHead>买入价</TableHead>
                            <TableHead>卖出价</TableHead>
                            <TableHead>持有天数</TableHead>
                            <TableHead className="text-right">收益</TableHead>
                            <TableHead className="text-right">收益率</TableHead>
                            <TableHead>信号</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.trades.map((trade) => (
                            <TableRow key={trade.id}>
                              <TableCell className="font-medium">
                                {trade.stockName} ({trade.stockCode})
                              </TableCell>
                              <TableCell>{trade.entryDate}</TableCell>
                              <TableCell>{trade.exitDate}</TableCell>
                              <TableCell>{trade.entryPrice.toFixed(2)}</TableCell>
                              <TableCell>{trade.exitPrice.toFixed(2)}</TableCell>
                              <TableCell>{trade.holdingPeriod} 天</TableCell>
                              <TableCell className={`text-right ${getProfitColorClass(trade.profit)}`}>
                                {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
                              </TableCell>
                              <TableCell className={`text-right ${getProfitColorClass(trade.profitPercent)}`}>
                                {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent.toFixed(2)}%
                              </TableCell>
                              <TableCell>
                                <span className={`px-2 py-1 rounded text-xs ${trade.profit >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {trade.signal}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">回测历史记录</CardTitle>
                    <CardDescription>最近 20 次回测结果</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadHistory} className="gap-1">
                    <RefreshCw className="h-4 w-4" />
                    刷新
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>暂无回测记录</p>
                    <p className="text-sm">运行回测后，结果将自动保存到这里</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>策略</TableHead>
                          <TableHead>日期范围</TableHead>
                          <TableHead className="text-right">总收益率</TableHead>
                          <TableHead className="text-right">最大回撤</TableHead>
                          <TableHead className="text-right">夏普比率</TableHead>
                          <TableHead className="text-right">胜率</TableHead>
                          <TableHead>交易数</TableHead>
                          <TableHead>时间</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">{record.strategy_name || '-'}</TableCell>
                            <TableCell className="text-xs">
                              {record.start_date} ~ {record.end_date}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${getProfitColorClass(record.total_return)}`}>
                              {record.total_return >= 0 ? '+' : ''}{record.total_return.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              {record.max_drawdown.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right">{record.sharpe_ratio.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{record.win_rate.toFixed(1)}%</TableCell>
                            <TableCell>{record.total_trades} 笔</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(record.created_at).toLocaleString('zh-CN')}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteRecord(record.id)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
