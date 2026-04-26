'use client';

import { useState, useMemo, useEffect } from 'react';
import { Calendar, Play, BarChart3, TrendingUp, AlertTriangle, Download, RefreshCw, Loader2, History, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SidebarTrigger } from '@/components/ui/sidebar';
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

export function BacktestView() {
  const { strategies, activeStrategyId } = useStockStore();

  const [params, setParams] = useState<BacktestParams>({
    strategyId: activeStrategyId || '',
    startDate: '2024-01-01',
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 100000,
    commissionRate: 0.0003,
    slippage: 0.001,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [history, setHistory] = useState<BacktestRecord[]>([]);
  const [activeTab, setActiveTab] = useState('run');

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
  
  const handleRunBacktest = async () => {
    if (!params.strategyId) {
      toast.error('请选择一个策略');
      return;
    }
    
    setIsRunning(true);
    try {
      // 获取当前策略的规则
      const strategy = strategies.find(s => s.id === params.strategyId);
      if (!strategy) {
        toast.error('策略不存在');
        return;
      }
      
      // 转换策略规则为回测格式
      // 选股规则
      const rules = {
        // stockRules
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
        // sellRules
        stopLossPercent: strategy.sellRules?.stopLossPercent,
        takeProfitPercent: strategy.sellRules?.takeProfitPercent,
        trailingStopPercent: strategy.sellRules?.trailingStopPercent,
        timeStopDays: strategy.sellRules?.timeStopDays,
        timeStopMinGain: strategy.sellRules?.timeStopMinGain,
        // moneyRules
        maxPositions: strategy.moneyRules?.maxPositions,
        maxSingleStockPercent: strategy.moneyRules?.maxSingleStockPercent,
        minCashPercent: strategy.moneyRules?.minCashPercent,
      };
      
      // 调用真实回测API
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
      // 刷新历史记录
      loadHistory();
      setActiveTab('result');
    } catch (error) {
      console.error('回测失败:', error);
      toast.error('回测失败，请稍后重试');
    } finally {
      setIsRunning(false);
    }
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
  
  const generateMockTrades = (): BacktestTrade[] => {
    const trades: BacktestTrade[] = [];
    const stocks = [
      { code: '600519', name: '贵州茅台' },
      { code: '000858', name: '五粮液' },
      { code: '002594', name: '比亚迪' },
      { code: '601318', name: '中国平安' },
      { code: '600036', name: '招商银行' },
    ];
    
    for (let i = 0; i < 10; i++) {
      const stock = stocks[Math.floor(Math.random() * stocks.length)];
      const entryPrice = 50 + Math.random() * 150;
      const exitPrice = entryPrice * (0.9 + Math.random() * 0.3);
      const profit = exitPrice - entryPrice;
      
      trades.push({
        id: `trade-${i}`,
        stockCode: stock.code,
        stockName: stock.name,
        entryDate: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
        exitDate: new Date(Date.now() - (20 - i) * 86400000).toISOString().split('T')[0],
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        exitPrice: parseFloat(exitPrice.toFixed(2)),
        shares: 100,
        profit: parseFloat((profit * 100).toFixed(2)),
        profitPercent: parseFloat(((profit / entryPrice) * 100).toFixed(2)),
        holdingPeriod: 10 - i,
        signal: profit > 0 ? '买入信号' : '止损信号',
      });
    }
    
    return trades;
  };
  
  const generateMockEquityCurve = (): EquityPoint[] => {
    const points: EquityPoint[] = [];
    let equity = params.initialCapital;
    let peak = equity;
    
    for (let i = 0; i < 12; i++) {
      const change = (Math.random() - 0.45) * 0.05;
      equity = equity * (1 + change);
      peak = Math.max(peak, equity);
      const drawdown = ((peak - equity) / peak) * 100;
      
      points.push({
        date: new Date(Date.now() - (12 - i) * 30 * 86400000).toISOString().split('T')[0],
        equity: parseFloat(equity.toFixed(2)),
        drawdown: parseFloat(drawdown.toFixed(2)),
      });
    }
    
    return points;
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
