'use client';

import { useState, useMemo } from 'react';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  Download,
  BarChart3,
  Target,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Bar,
  BarChart,
  ResponsiveContainer,
  Line,
  LineChart,
  ReferenceLine,
} from 'recharts';
import { useStockStore } from '@/lib/store';
import { formatCurrency, formatPercent, getProfitColorClass, mockNetValueData } from '@/lib/mock-data';

export function TradeLogView() {
  const tradeRecords = useStockStore((state) => state.tradeRecords);
  const strategies = useStockStore((state) => state.strategies);
  const activeStrategyId = useStockStore((state) => state.activeStrategyId);
  
  // 使用 useMemo 计算性能统计，避免无限循环
  const performanceStats = useMemo(() => {
    return useStockStore.getState().getPerformanceStats();
  }, [tradeRecords]);

  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell'>('all');
  const [timeRange, setTimeRange] = useState<'all' | '1m' | '3m' | '6m' | '1y'>('all');

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === activeStrategyId),
    [strategies, activeStrategyId]
  );

  // 过滤交易记录
  const filteredRecords = useMemo(() => {
    let records = [...tradeRecords];

    // 类型过滤
    if (filterType !== 'all') {
      records = records.filter((r) => r.type === filterType);
    }

    // 时间过滤
    if (timeRange !== 'all') {
      const now = new Date();
      const ranges: Record<string, number> = {
        '1m': 30,
        '3m': 90,
        '6m': 180,
        '1y': 365,
      };
      const days = ranges[timeRange];
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      records = records.filter((r) => new Date(r.date) >= cutoff);
    }

    // 按日期排序（最新在前）
    return records.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [tradeRecords, filterType, timeRange]);

  // 计算月度收益数据
  const monthlyProfitData = useMemo(() => {
    const monthlyMap = new Map<string, number>();
    
    tradeRecords
      .filter((r) => r.type === 'sell' && r.profit !== undefined)
      .forEach((record) => {
        const date = new Date(record.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + (record.profit || 0));
      });

    return Array.from(monthlyMap.entries())
      .map(([month, profit]) => ({ month, profit }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [tradeRecords]);

  // 获取系统健康度状态
  const getSystemHealthStatus = () => {
    const health = performanceStats.systemHealth;
    if (health >= 1.5) return { status: 'healthy', color: 'text-chart-1', label: '健康' };
    if (health >= 1.0) return { status: 'normal', color: 'text-warning', label: '一般' };
    return { status: 'warning', color: 'text-destructive', label: '需优化' };
  };

  const healthStatus = getSystemHealthStatus();

  // 模拟不适期数据
  const drawdownPeriods = useMemo(() => {
    // 这里是模拟数据，实际应该从交易记录计算
    return [
      { start: '2024-05', end: '2024-05', maxDrawdown: -3.2 },
    ];
  }, []);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">交易日志与复盘</h1>
            <p className="text-sm text-muted-foreground">
              记录每一笔交易，分析系统绩效
            </p>
          </div>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" /> 导出报告
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">绩效总览</TabsTrigger>
            <TabsTrigger value="records">交易记录</TabsTrigger>
            <TabsTrigger value="analysis">深度分析</TabsTrigger>
          </TabsList>

          {/* 绩效总览 */}
          <TabsContent value="overview" className="space-y-6">
            {/* 核心指标 */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    胜率
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(performanceStats.winRate * 100).toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {performanceStats.winningTrades} 胜 / {performanceStats.losingTrades} 负
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    盈亏比
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {performanceStats.profitLossRatio.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    平均盈利 / 平均亏损
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    总交易
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {performanceStats.totalTrades}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    已完成交易笔数
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    累计盈亏
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-bold ${getProfitColorClass(
                      performanceStats.totalProfit
                    )}`}
                  >
                    {performanceStats.totalProfit >= 0 ? '+' : ''}
                    {formatCurrency(performanceStats.totalProfit)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    平均盈利：{formatCurrency(performanceStats.avgProfit)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    系统健康度
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${healthStatus.color}`}>
                    {performanceStats.systemHealth.toFixed(2)}
                  </div>
                  <Badge
                    variant={
                      healthStatus.status === 'healthy'
                        ? 'default'
                        : healthStatus.status === 'normal'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {healthStatus.label}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* 净值曲线 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">净值曲线</CardTitle>
                <CardDescription>
                  账户净值变化 vs 基准指数（沪深300）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    value: { label: '账户净值', color: 'hsl(var(--chart-1))' },
                    benchmark: { label: '基准指数', color: 'hsl(var(--chart-3))' },
                  }}
                  className="h-[350px]"
                >
                  <AreaChart data={mockNetValueData}>
                    <defs>
                      <linearGradient id="fillValue2" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="hsl(var(--chart-1))"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(var(--chart-1))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis
                      className="text-xs"
                      tickFormatter={(v) => (v / 10000).toFixed(0) + '万'}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--chart-1))"
                      fill="url(#fillValue2)"
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
              </CardContent>
            </Card>

            {/* 月度收益 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">月度收益</CardTitle>
                <CardDescription>每月已实现盈亏统计</CardDescription>
              </CardHeader>
              <CardContent>
                {monthlyProfitData.length > 0 ? (
                  <ChartContainer
                    config={{
                      profit: { label: '月度收益', color: 'hsl(var(--chart-1))' },
                    }}
                    className="h-[250px]"
                  >
                    <BarChart data={monthlyProfitData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis
                        className="text-xs"
                        tickFormatter={(v) => (v >= 0 ? '+' : '') + v}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Bar
                        dataKey="profit"
                        fill="hsl(var(--chart-1))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-[250px] items-center justify-center">
                    <p className="text-muted-foreground">暂无足够数据生成图表</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 交易记录 */}
          <TabsContent value="records" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">交易明细</CardTitle>
                    <CardDescription>
                      共 {filteredRecords.length} 条记录
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={filterType}
                      onValueChange={(v) => setFilterType(v as typeof filterType)}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="buy">买入</SelectItem>
                        <SelectItem value="sell">卖出</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={timeRange}
                      onValueChange={(v) => setTimeRange(v as typeof timeRange)}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="1m">近1月</SelectItem>
                        <SelectItem value="3m">近3月</SelectItem>
                        <SelectItem value="6m">近6月</SelectItem>
                        <SelectItem value="1y">近1年</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">日期</TableHead>
                        <TableHead>股票</TableHead>
                        <TableHead className="text-center">类型</TableHead>
                        <TableHead className="text-right">价格</TableHead>
                        <TableHead className="text-right">数量</TableHead>
                        <TableHead className="text-right">金额</TableHead>
                        <TableHead className="text-right">盈亏</TableHead>
                        <TableHead>触发规则</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <FileText className="h-10 w-10 text-muted-foreground/50" />
                              <p className="mt-2 text-sm text-muted-foreground">
                                暂无交易记录
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRecords.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="text-muted-foreground">
                              {new Date(record.date).toLocaleDateString('zh-CN')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{record.stockName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {record.stockCode}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={record.type === 'buy' ? 'default' : 'secondary'}
                                className={
                                  record.type === 'buy'
                                    ? 'bg-chart-1/10 text-chart-1 hover:bg-chart-1/20'
                                    : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                }
                              >
                                {record.type === 'buy' ? '买入' : '卖出'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {record.price.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {record.shares}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(record.amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {record.type === 'sell' && record.profit !== undefined ? (
                                <div
                                  className={getProfitColorClass(record.profit)}
                                >
                                  <div>
                                    {record.profit >= 0 ? '+' : ''}
                                    {formatCurrency(record.profit)}
                                  </div>
                                  <div className="text-xs">
                                    {formatPercent(record.profitPercent || 0)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {record.triggerReason}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 深度分析 */}
          <TabsContent value="analysis" className="space-y-6">
            {/* 系统评估 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">系统健康度分析</CardTitle>
                  <CardDescription>
                    健康度 = 胜率 × 盈亏比，大于1.5为健康
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-center">
                    <div
                      className={`flex h-32 w-32 flex-col items-center justify-center rounded-full border-4 ${
                        healthStatus.status === 'healthy'
                          ? 'border-chart-1 bg-chart-1/10'
                          : healthStatus.status === 'normal'
                          ? 'border-warning bg-warning/10'
                          : 'border-destructive bg-destructive/10'
                      }`}
                    >
                      <div className={`text-3xl font-bold ${healthStatus.color}`}>
                        {performanceStats.systemHealth.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {healthStatus.label}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">胜率</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-chart-1"
                            style={{
                              width: `${performanceStats.winRate * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {(performanceStats.winRate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">盈亏比</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-chart-3"
                            style={{
                              width: `${Math.min(
                                (performanceStats.profitLossRatio / 3) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {performanceStats.profitLossRatio.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`rounded-lg border p-4 ${
                      healthStatus.status === 'healthy'
                        ? 'border-chart-1/30 bg-chart-1/5'
                        : healthStatus.status === 'normal'
                        ? 'border-warning/30 bg-warning/5'
                        : 'border-destructive/30 bg-destructive/5'
                    }`}
                  >
                    {healthStatus.status === 'healthy' ? (
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-chart-1" />
                        <div>
                          <p className="font-medium text-chart-1">系统运行良好</p>
                          <p className="text-sm text-muted-foreground">
                            继续保持纪律执行，长期收益可期
                          </p>
                        </div>
                      </div>
                    ) : healthStatus.status === 'normal' ? (
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-warning" />
                        <div>
                          <p className="font-medium text-warning">系统表现一般</p>
                          <p className="text-sm text-muted-foreground">
                            建议检查选股规则或止损设置
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium text-destructive">系统需要优化</p>
                          <p className="text-sm text-muted-foreground">
                            当前策略可能不适合市场环境，建议暂停交易并复盘
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">盈亏分布</CardTitle>
                  <CardDescription>分析每笔交易的盈亏情况</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-chart-1/30 bg-chart-1/5 p-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-chart-1" />
                        <span className="text-sm font-medium">盈利交易</span>
                      </div>
                      <div className="mt-2">
                        <div className="text-2xl font-bold text-chart-1">
                          {performanceStats.winningTrades}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          平均盈利：{formatCurrency(performanceStats.avgProfit)}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-5 w-5 text-destructive" />
                        <span className="text-sm font-medium">亏损交易</span>
                      </div>
                      <div className="mt-2">
                        <div className="text-2xl font-bold text-destructive">
                          {performanceStats.losingTrades}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          平均亏损：{formatCurrency(performanceStats.avgLoss)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">最大回撤</span>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-destructive">
                      {formatCurrency(performanceStats.maxDrawdown)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      系统运行以来的最大亏损幅度
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 不适期提示 */}
            {drawdownPeriods.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">系统不适期</CardTitle>
                  <CardDescription>
                    连续亏损或大幅回撤的阶段标记
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-warning" />
                      <div>
                        <p className="font-medium">历史不适期记录</p>
                        <div className="mt-2 space-y-2">
                          {drawdownPeriods.map((period, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between text-sm"
                            >
                              <span>
                                {period.start} - {period.end}
                              </span>
                              <Badge variant="outline" className="text-destructive">
                                回撤 {period.maxDrawdown}%
                              </Badge>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                          历史数据表明，不适期后通常会有奖励。保持纪律，坚持执行系统规则。
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 策略建议 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">优化建议</CardTitle>
                <CardDescription>基于历史数据的策略优化方向</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {performanceStats.winRate < 0.4 && (
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                      <Target className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">提高选股精准度</p>
                        <p className="text-sm text-muted-foreground">
                          当前胜率偏低，建议增加更多筛选条件或等待更明确的买入信号
                        </p>
                      </div>
                    </div>
                  )}
                  {performanceStats.profitLossRatio < 1.5 && (
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">优化盈亏比</p>
                        <p className="text-sm text-muted-foreground">
                          考虑扩大止盈目标或收紧止损线，让盈利更充分运行
                        </p>
                      </div>
                    </div>
                  )}
                  {performanceStats.totalTrades > 20 && performanceStats.winRate >= 0.4 && performanceStats.profitLossRatio >= 1.5 && (
                    <div className="flex items-start gap-3 rounded-lg border border-chart-1/30 bg-chart-1/5 p-4">
                      <CheckCircle className="h-5 w-5 text-chart-1" />
                      <div>
                        <p className="font-medium text-chart-1">系统表现优秀</p>
                        <p className="text-sm text-muted-foreground">
                          继续保持当前策略，坚持纪律执行
                        </p>
                      </div>
                    </div>
                  )}
                  {performanceStats.totalTrades < 10 && (
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">数据样本不足</p>
                        <p className="text-sm text-muted-foreground">
                          完成更多交易后，统计数据将更具参考价值
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
