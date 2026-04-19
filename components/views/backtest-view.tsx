'use client';

import { useState, useMemo } from 'react';
import { Calendar, Play, BarChart3, TrendingUp, AlertTriangle, Download, RefreshCw, Loader2 } from 'lucide-react';
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

export function BacktestView() {
  const { strategies, activeStrategyId } = useStockStore();
  
  const [params, setParams] = useState<BacktestParams>({
    strategyId: activeStrategyId || '',
    startDate: '2023-01-01',
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 100000,
    commissionRate: 0.0003,
    slippage: 0.001,
  });
  
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  
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
      // 模拟回测过程
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 生成模拟回测结果
      const mockResult: BacktestResult = {
        strategyId: params.strategyId,
        strategyName: activeStrategy?.name || '策略',
        startDate: params.startDate,
        endDate: params.endDate,
        initialCapital: params.initialCapital,
        finalCapital: params.initialCapital * 1.25,
        totalReturn: 25,
        annualizedReturn: 12.25,
        maxDrawdown: 15.5,
        sharpeRatio: 1.8,
        winRate: 65,
        totalTrades: 50,
        winningTrades: 32,
        losingTrades: 18,
        avgWin: 8.5,
        avgLoss: 4.2,
        profitFactor: 2.1,
        trades: generateMockTrades(),
        equityCurve: generateMockEquityCurve(),
      };
      
      setResult(mockResult);
      toast.success('回测完成');
    } catch (error) {
      console.error('回测失败:', error);
      toast.error('回测失败，请稍后重试');
    } finally {
      setIsRunning(false);
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
        
        {/* Backtest Results */}
        {result && (
          <>
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
                  <Button variant="outline" size="sm" className="gap-1">
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
      </div>
    </div>
  );
}
