'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Bell,
  BellOff,
  Settings,
  Trash2,
  ArrowUpRight,
  Clock,
  Target,
  Shield,
  DollarSign,
  MoreHorizontal,
  ChevronDown,
  Check,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useStockStore } from '@/lib/store';
import { formatCurrency, formatPercent, getProfitColorClass } from '@/lib/mock-data';
import { useRealtimeQuotes } from '@/hooks/use-realtime-quotes';
import { toast } from 'sonner';
import type { Position } from '@/lib/types';

export function PositionView() {
  const {
    positions,
    updatePosition,
    removePosition,
    addTradeRecord,
    strategies,
    activeStrategyId,
  } = useStockStore();

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
  const [sellShares, setSellShares] = useState(0);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState(true);

  // 获取所有持仓股票代码
  const positionCodes = useMemo(
    () => positions.map((p) => p.stockCode).filter(Boolean),
    [positions]
  );

  // 实时行情数据
  const { quotes, isLoading: quotesLoading, lastUpdate, refresh: refreshQuotes } = useRealtimeQuotes({
    codes: positionCodes,
    interval: 5000, // 5秒刷新
    enabled: isRealtimeEnabled && positionCodes.length > 0,
  });

  // 合并实时行情到持仓数据
  const positionsWithRealtime = useMemo(() => {
    return positions.map((p) => {
      const quote = quotes.get(p.stockCode);
      if (quote && quote.price > 0) {
        return {
          ...p,
          currentPrice: quote.price,
          // 计算实时涨跌幅
          todayChange: quote.changePercent,
        };
      }
      return p;
    });
  }, [positions, quotes]);

  // 当实时行情更新时，检查止损止盈触发
  useEffect(() => {
    if (quotes.size === 0) return;
    
    positions.forEach((position) => {
      const quote = quotes.get(position.stockCode);
      if (!quote || quote.price <= 0) return;
      
      const currentPrice = quote.price;
      const profitPercent = ((currentPrice - position.buyPrice) / position.buyPrice) * 100;
      
      // 检查止损触发
      if (position.stopLossPrice && currentPrice <= position.stopLossPrice && !position.alertTriggered) {
        toast.error(`止损预警: ${position.stockName}(${position.stockCode}) 已触及止损价 ¥${position.stopLossPrice.toFixed(2)}`);
        updatePosition(position.id, { alertTriggered: true });
      }
      
      // 检查止盈触发
      if (position.takeProfitPrice && currentPrice >= position.takeProfitPrice && !position.alertTriggered) {
        toast.success(`止盈提醒: ${position.stockName}(${position.stockCode}) 已达止盈价 ¥${position.takeProfitPrice.toFixed(2)}`);
        updatePosition(position.id, { alertTriggered: true });
      }
    });
  }, [quotes, positions, updatePosition]);

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === activeStrategyId),
    [strategies, activeStrategyId]
  );

  // 计算持仓统计（使用实时数据）
  const stats = useMemo(() => {
    const totalCost = positionsWithRealtime.reduce((sum, p) => sum + p.buyPrice * p.shares, 0);
    const totalMarketValue = positionsWithRealtime.reduce(
      (sum, p) => sum + p.currentPrice * p.shares,
      0
    );
    const totalProfit = totalMarketValue - totalCost;
    const profitPositions = positionsWithRealtime.filter(
      (p) => p.currentPrice > p.buyPrice
    ).length;
    const lossPositions = positionsWithRealtime.length - profitPositions;
    const alertCount = positionsWithRealtime.filter((p) => p.alertTriggered).length;

    return {
      totalCost,
      totalMarketValue,
      totalProfit,
      profitPercent: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
      profitPositions,
      lossPositions,
      alertCount,
    };
  }, [positionsWithRealtime]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCards(newExpanded);
  };

  const handleUpdateSettings = () => {
    if (!selectedPosition) return;

    toast.success('止盈止损设置已更新');
    setIsSettingsOpen(false);
  };

  const handleSell = () => {
    if (!selectedPosition || sellShares <= 0) return;

    const sellAmount = selectedPosition.currentPrice * sellShares;
    const costAmount = selectedPosition.buyPrice * sellShares;
    const profit = sellAmount - costAmount;
    const profitPercent =
      ((selectedPosition.currentPrice - selectedPosition.buyPrice) /
        selectedPosition.buyPrice) *
      100;

    // 添加交易记录
    addTradeRecord({
      strategyId: activeStrategyId || '',
      stockCode: selectedPosition.stockCode,
      stockName: selectedPosition.stockName,
      type: 'sell',
      price: selectedPosition.currentPrice,
      shares: sellShares,
      amount: sellAmount,
      date: new Date(),
      triggerReason: '手动卖出',
      profit,
      profitPercent,
    });

    // 更新或删除持仓
    const remainingShares = selectedPosition.shares - sellShares;
    if (remainingShares <= 0) {
      removePosition(selectedPosition.id);
    } else {
      updatePosition(selectedPosition.id, { shares: remainingShares });
    }

    toast.success(`已卖出 ${sellShares} 股 ${selectedPosition.stockName}`);
    setIsSellDialogOpen(false);
    setSellShares(0);
    setSelectedPosition(null);
  };

  // 计算单个持仓的状态
  const getPositionStatus = (position: Position) => {
    const profit =
      ((position.currentPrice - position.buyPrice) / position.buyPrice) * 100;
    const stopLossPercent =
      ((position.stopLossPrice - position.buyPrice) / position.buyPrice) * 100;
    const takeProfitPercent =
      ((position.takeProfitPrice - position.buyPrice) / position.buyPrice) * 100;

    // 计算持有天数
    const holdingDays = Math.floor(
      (Date.now() - new Date(position.buyDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    // 距离止损/止盈的进度
    const stopLossProgress = Math.max(
      0,
      Math.min(100, (Math.abs(profit) / Math.abs(stopLossPercent)) * 100)
    );
    const takeProfitProgress = Math.max(
      0,
      Math.min(100, (profit / takeProfitPercent) * 100)
    );

    // 移动止盈追踪
    const highestProfitPercent =
      ((position.highestPrice - position.buyPrice) / position.buyPrice) * 100;
    const currentFromHigh =
      ((position.currentPrice - position.highestPrice) / position.highestPrice) *
      100;

    return {
      profit,
      holdingDays,
      stopLossProgress: profit < 0 ? stopLossProgress : 0,
      takeProfitProgress: profit > 0 ? takeProfitProgress : 0,
      highestProfitPercent,
      currentFromHigh,
      isNearStopLoss: profit < 0 && stopLossProgress > 70,
      isNearTakeProfit: profit > 0 && takeProfitProgress > 70,
    };
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">持仓管理</h1>
            <p className="text-sm text-muted-foreground">
              监控持仓，管理止盈止损哨兵
            </p>
          </div>
  <div className="flex items-center gap-2">
    {/* 实时行情状态 */}
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsRealtimeEnabled(!isRealtimeEnabled)}
        className={isRealtimeEnabled ? 'text-green-500' : 'text-muted-foreground'}
      >
        {isRealtimeEnabled ? (
          <Wifi className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
      </Button>
      {isRealtimeEnabled && lastUpdate && (
        <span className="text-xs text-muted-foreground">
          {lastUpdate.toLocaleTimeString()}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={refreshQuotes}
        disabled={quotesLoading}
      >
        <RefreshCw className={`h-4 w-4 ${quotesLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
    {stats.alertCount > 0 && (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        {stats.alertCount} 个警报
      </Badge>
    )}
  </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                持仓市值
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalMarketValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                成本：{formatCurrency(stats.totalCost)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                总盈亏
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${getProfitColorClass(
                  stats.totalProfit
                )}`}
              >
                {stats.totalProfit >= 0 ? '+' : ''}
                {formatCurrency(stats.totalProfit)}
              </div>
              <p className={`text-xs ${getProfitColorClass(stats.profitPercent)}`}>
                {formatPercent(stats.profitPercent)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                盈利/亏损
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-chart-1">
                  {stats.profitPositions}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-2xl font-bold text-destructive">
                  {stats.lossPositions}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                共 {positions.length} 只股票
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                活跃警报
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {stats.alertCount}
              </div>
              <p className="text-xs text-muted-foreground">需要立即关注</p>
            </CardContent>
          </Card>
        </div>

        {/* Position Cards */}
        <div className="space-y-4">
          {positions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Shield className="h-16 w-16 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">暂无持仓</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  使用仓位计算器建仓后，这里将显示您的持仓
                </p>
              </CardContent>
            </Card>
          ) : (
            positionsWithRealtime.map((position) => {
              const status = getPositionStatus(position);
              const isExpanded = expandedCards.has(position.id);
              const profitAmount =
                (position.currentPrice - position.buyPrice) * position.shares;

              return (
                <Card
                  key={position.id}
                  className={`transition-all ${
                    position.alertTriggered
                      ? 'border-destructive/50 bg-destructive/5'
                      : status.isNearStopLoss
                      ? 'border-warning/50'
                      : status.isNearTakeProfit
                      ? 'border-chart-1/50'
                      : ''
                  }`}
                >
                  <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(position.id)}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                              status.profit >= 0
                                ? 'bg-chart-1/10'
                                : 'bg-destructive/10'
                            }`}
                          >
                            {status.profit >= 0 ? (
                              <TrendingUp className="h-6 w-6 text-chart-1" />
                            ) : (
                              <TrendingDown className="h-6 w-6 text-destructive" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold">
                                {position.stockName}
                              </span>
                              <Badge variant="outline">{position.stockCode}</Badge>
                              {position.alertTriggered && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {position.alertType === 'stopLoss'
                                    ? '触发止损'
                                    : position.alertType === 'takeProfit'
                                    ? '触发止盈'
                                    : '时间止损'}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{position.shares} 股</span>
                              <span>成本 {position.buyPrice.toFixed(2)}</span>
                              <span>现价 {position.currentPrice.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div
                              className={`text-xl font-bold ${getProfitColorClass(
                                status.profit
                              )}`}
                            >
                              {formatPercent(status.profit)}
                            </div>
                            <div
                              className={`text-sm ${getProfitColorClass(
                                profitAmount
                              )}`}
                            >
                              {profitAmount >= 0 ? '+' : ''}
                              {formatCurrency(profitAmount)}
                            </div>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>操作</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedPosition(position);
                                  setIsSettingsOpen(true);
                                }}
                              >
                                <Settings className="mr-2 h-4 w-4" />
                                修改止盈止损
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedPosition(position);
                                  setSellShares(position.shares);
                                  setIsSellDialogOpen(true);
                                }}
                              >
                                <ArrowUpRight className="mr-2 h-4 w-4" />
                                卖出
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  removePosition(position.id);
                                  toast.success('持仓已删除');
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                删除记录
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="space-y-6 pt-0">
                        {/* Progress Bars */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                距离止损
                              </span>
                              <span className="text-destructive">
                                {position.stopLossPrice.toFixed(2)} (
                                {(
                                  ((position.stopLossPrice - position.buyPrice) /
                                    position.buyPrice) *
                                  100
                                ).toFixed(1)}
                                %)
                              </span>
                            </div>
                            <Progress
                              value={status.stopLossProgress}
                              className="h-2 bg-muted [&>div]:bg-destructive"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                距离止盈
                              </span>
                              <span className="text-chart-1">
                                {position.takeProfitPrice.toFixed(2)} (
                                {(
                                  ((position.takeProfitPrice - position.buyPrice) /
                                    position.buyPrice) *
                                  100
                                ).toFixed(1)}
                                %)
                              </span>
                            </div>
                            <Progress
                              value={status.takeProfitProgress}
                              className="h-2 bg-muted [&>div]:bg-chart-1"
                            />
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid gap-4 md:grid-cols-4">
                          <div className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span className="text-xs">持有天数</span>
                            </div>
                            <div className="mt-1 text-lg font-semibold">
                              {status.holdingDays} 天
                            </div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Target className="h-4 w-4" />
                              <span className="text-xs">最高盈利</span>
                            </div>
                            <div className="mt-1 text-lg font-semibold text-chart-1">
                              {formatPercent(status.highestProfitPercent)}
                            </div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <TrendingDown className="h-4 w-4" />
                              <span className="text-xs">从高点回撤</span>
                            </div>
                            <div className="mt-1 text-lg font-semibold text-destructive">
                              {formatPercent(status.currentFromHigh)}
                            </div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Bell className="h-4 w-4" />
                              <span className="text-xs">移动止盈</span>
                            </div>
                            <div className="mt-1">
                              <Badge
                                variant={
                                  position.trailingStopEnabled
                                    ? 'default'
                                    : 'secondary'
                                }
                              >
                                {position.trailingStopEnabled ? '已开启' : '已关闭'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPosition(position);
                              setSellShares(Math.floor(position.shares / 2));
                              setIsSellDialogOpen(true);
                            }}
                          >
                            <DollarSign className="mr-2 h-4 w-4" />
                            卖出一半
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPosition(position);
                              setSellShares(position.shares);
                              setIsSellDialogOpen(true);
                            }}
                          >
                            <ArrowUpRight className="mr-2 h-4 w-4" />
                            全部卖出
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              updatePosition(position.id, {
                                trailingStopEnabled: !position.trailingStopEnabled,
                              });
                              toast.success(
                                `移动止盈已${
                                  position.trailingStopEnabled ? '关闭' : '开启'
                                }`
                              );
                            }}
                          >
                            {position.trailingStopEnabled ? (
                              <BellOff className="mr-2 h-4 w-4" />
                            ) : (
                              <Bell className="mr-2 h-4 w-4" />
                            )}
                            {position.trailingStopEnabled
                              ? '关闭移动止盈'
                              : '开启移动止盈'}
                          </Button>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              修改止盈止损 - {selectedPosition?.stockName}
            </DialogTitle>
            <DialogDescription>
              调整{selectedPosition?.stockCode}的止盈止损价格
            </DialogDescription>
          </DialogHeader>
          {selectedPosition && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>止损价</Label>
                  <span className="text-sm text-destructive">
                    {selectedPosition.stopLossPrice.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[selectedPosition.stopLossPrice]}
                  min={selectedPosition.buyPrice * 0.8}
                  max={selectedPosition.buyPrice}
                  step={0.01}
                  onValueChange={([v]) =>
                    setSelectedPosition({ ...selectedPosition, stopLossPrice: v })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  较成本价{' '}
                  {(
                    ((selectedPosition.stopLossPrice - selectedPosition.buyPrice) /
                      selectedPosition.buyPrice) *
                    100
                  ).toFixed(1)}
                  %
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>止盈价</Label>
                  <span className="text-sm text-chart-1">
                    {selectedPosition.takeProfitPrice.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[selectedPosition.takeProfitPrice]}
                  min={selectedPosition.buyPrice}
                  max={selectedPosition.buyPrice * 1.5}
                  step={0.01}
                  onValueChange={([v]) =>
                    setSelectedPosition({
                      ...selectedPosition,
                      takeProfitPrice: v,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  较成本价{' '}
                  {(
                    ((selectedPosition.takeProfitPrice -
                      selectedPosition.buyPrice) /
                      selectedPosition.buyPrice) *
                    100
                  ).toFixed(1)}
                  %
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>移动止盈</Label>
                  <p className="text-sm text-muted-foreground">
                    自动追踪最高价，回撤时触发卖出
                  </p>
                </div>
                <Switch
                  checked={selectedPosition.trailingStopEnabled}
                  onCheckedChange={(v) =>
                    setSelectedPosition({
                      ...selectedPosition,
                      trailingStopEnabled: v,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (selectedPosition) {
                  updatePosition(selectedPosition.id, {
                    stopLossPrice: selectedPosition.stopLossPrice,
                    takeProfitPrice: selectedPosition.takeProfitPrice,
                    trailingStopEnabled: selectedPosition.trailingStopEnabled,
                  });
                  handleUpdateSettings();
                }
              }}
            >
              保存设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell Dialog */}
      <AlertDialog open={isSellDialogOpen} onOpenChange={setIsSellDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              卖出 {selectedPosition?.stockName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              当前持有 {selectedPosition?.shares} 股，现价{' '}
              {selectedPosition?.currentPrice.toFixed(2)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label>卖出数量</Label>
              <Input
                type="number"
                value={sellShares}
                onChange={(e) => setSellShares(Number(e.target.value))}
                max={selectedPosition?.shares}
                min={100}
                step={100}
              />
              <p className="text-sm text-muted-foreground">
                预计金额：
                {selectedPosition &&
                  formatCurrency(sellShares * selectedPosition.currentPrice)}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleSell}>确认卖出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
