'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Target,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';
import { useStockStore } from '@/lib/store';
import { formatCurrency, formatPercent, getProfitColorClass } from '@/lib/mock-data';
import type { ViewType } from '@/app/page';

interface DashboardViewProps {
  onNavigate: (view: ViewType) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [mounted, setMounted] = useState(false);
  const positions = useStockStore((state) => state.positions);
  const alerts = useStockStore((state) => state.alerts);
  const strategies = useStockStore((state) => state.strategies);
  const activeStrategyId = useStockStore((state) => state.activeStrategyId);
  
  // 确保只在客户端渲染动态数据
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 使用 useMemo 计算 dashboard 数据，避免无限循环
  const dashboardData = useMemo(() => {
    return useStockStore.getState().getDashboardData();
  }, [positions, strategies, activeStrategyId]);

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === activeStrategyId),
    [strategies, activeStrategyId]
  );

  const unreadAlerts = alerts.filter((a) => !a.read);

  // 计算持仓盈亏
  const positionStats = useMemo(() => {
    return positions.map((p) => {
      const profit = (p.currentPrice - p.buyPrice) * p.shares;
      const profitPercent = ((p.currentPrice - p.buyPrice) / p.buyPrice) * 100;
      return { ...p, profit, profitPercent };
    });
  }, [positions]);

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  // 饼图数据
  const pieData = useMemo(() => {
    const sectorMap = new Map<string, number>();
    positions.forEach((p) => {
      const value = p.currentPrice * p.shares;
      sectorMap.set(p.sector, (sectorMap.get(p.sector) || 0) + value);
    });
    
    // 添加现金
    if (dashboardData.cashAmount > 0) {
      sectorMap.set('现金', dashboardData.cashAmount);
    }
    
    return Array.from(sectorMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }, [positions, dashboardData.cashAmount]);

  // 在客户端挂载前显示骨架屏，避免 hydration mismatch
  if (!mounted) {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur">
          <SidebarTrigger />
          <div className="flex flex-1 items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">投资总览</h1>
              <Skeleton className="mt-1 h-4 w-32" />
            </div>
            <Skeleton className="h-6 w-28" />
          </div>
        </header>
        <div className="flex-1 space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">投资总览</h1>
            <p className="text-sm text-muted-foreground">
              当前策略：{activeStrategy?.name || '未选择策略'}
            </p>
          </div>
          <Badge variant={dashboardData.performanceStats.systemHealth >= 1.5 ? 'default' : 'destructive'}>
            系统健康度：{dashboardData.performanceStats.systemHealth.toFixed(2)}
          </Badge>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总资产</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(dashboardData.totalCapital)}
              </div>
              <p className="text-xs text-muted-foreground">
                持仓市值：{formatCurrency(dashboardData.totalMarketValue)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总收益</CardTitle>
              {dashboardData.totalProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-chart-1" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getProfitColorClass(dashboardData.totalProfit)}`}>
                {formatCurrency(dashboardData.totalProfit)}
              </div>
              <p className={`text-xs ${getProfitColorClass(dashboardData.totalProfitPercent)}`}>
                {formatPercent(dashboardData.totalProfitPercent)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">现金比例</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData.cashPercent.toFixed(1)}%
              </div>
              <Progress
                value={dashboardData.cashPercent}
                className="mt-2 h-2"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {dashboardData.cashPercent < (activeStrategy?.moneyRules.minCashPercent || 10)
                  ? '低于安全线'
                  : '健康水平'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">持仓数量</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData.positionCount}</div>
              <p className="text-xs text-muted-foreground">
                上限：{activeStrategy?.moneyRules.maxPositions || 5} 只
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Net Value Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">净值曲线</CardTitle>
              <CardDescription>账户净值 vs 基准指数</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  value: { label: '账户净值', color: 'hsl(var(--chart-1))' },
                  benchmark: { label: '基准指数', color: 'hsl(var(--chart-3))' },
                }}
                className="h-[300px]"
              >
                <AreaChart data={[]}>
                  <defs>
                    <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => (v / 10000).toFixed(0) + '万'} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--chart-1))"
                    fill="url(#fillValue)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="benchmark"
                    stroke="hsl(var(--chart-3))"
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                </AreaChart>
              </ChartContainer>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                净值曲线需要真实交易数据支撑，请开始进行实际交易
              </p>
            </CardContent>
          </Card>

          {/* Sector Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">仓位分布</CardTitle>
              <CardDescription>按行业/现金划分</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  value: { label: '金额' },
                }}
                className="h-[200px]"
              >
                <RechartsPieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={({ payload }) => {
                      if (payload && payload[0]) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="font-medium">{data.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatCurrency(data.value)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RechartsPieChart>
              </ChartContainer>
              <div className="mt-4 space-y-2">
                {pieData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {((item.value / dashboardData.totalCapital) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Positions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">持仓概览</CardTitle>
                <CardDescription>当前持有股票</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('position')}>
                查看全部 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {positionStats.slice(0, 4).map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          position.profit >= 0 ? 'bg-chart-1/10' : 'bg-destructive/10'
                        }`}
                      >
                        {position.profit >= 0 ? (
                          <TrendingUp className="h-5 w-5 text-chart-1" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-destructive" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{position.stockName}</div>
                        <div className="text-xs text-muted-foreground">
                          {position.stockCode} · {position.shares}股
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${getProfitColorClass(position.profit)}`}>
                        {formatPercent(position.profitPercent)}
                      </div>
                      <div className={`text-xs ${getProfitColorClass(position.profit)}`}>
                        {position.profit >= 0 ? '+' : ''}{formatCurrency(position.profit)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Alerts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">交易提醒</CardTitle>
                <CardDescription>需要关注的信号</CardDescription>
              </div>
              <Badge variant="secondary">{unreadAlerts.length} 条未读</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {unreadAlerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      alert.severity === 'high'
                        ? 'border-destructive/50 bg-destructive/5'
                        : alert.severity === 'medium'
                        ? 'border-warning/50 bg-warning/5'
                        : 'border-border'
                    }`}
                  >
                    <div
                      className={`mt-0.5 rounded-full p-1 ${
                        alert.severity === 'high'
                          ? 'bg-destructive/10 text-destructive'
                          : alert.severity === 'medium'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {alert.type === 'stopLoss' ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : alert.type === 'signal' ? (
                        <Target className="h-4 w-4" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      {alert.stockName && (
                        <div className="font-medium">
                          {alert.stockName}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {alert.stockCode}
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                ))}
                {unreadAlerts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Activity className="h-10 w-10 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">暂无新提醒</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">系统绩效</CardTitle>
            <CardDescription>基于历史交易数据的统计分析</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-lg border p-4 text-center">
                <div className="text-2xl font-bold">
                  {(dashboardData.performanceStats.winRate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">胜率</div>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <div className="text-2xl font-bold">
                  {dashboardData.performanceStats.profitLossRatio.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">盈亏比</div>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <div className="text-2xl font-bold">
                  {dashboardData.performanceStats.totalTrades}
                </div>
                <div className="text-sm text-muted-foreground">总交易数</div>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <div className={`text-2xl font-bold ${getProfitColorClass(dashboardData.performanceStats.totalProfit)}`}>
                  {formatCurrency(dashboardData.performanceStats.totalProfit)}
                </div>
                <div className="text-sm text-muted-foreground">累计盈利</div>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(dashboardData.performanceStats.maxDrawdown)}
                </div>
                <div className="text-sm text-muted-foreground">最大回撤</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
