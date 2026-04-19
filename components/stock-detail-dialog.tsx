'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  Star,
  StarOff,
  ShoppingCart,
  Info,
  BarChart3,
  FileText,
  Loader2,
  ExternalLink,
  Target,
  Shield,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { formatCurrency, formatPercent, getProfitColorClass } from '@/lib/mock-data';
import { useStockStore } from '@/lib/store';
import type { WatchlistStock } from '@/lib/types';
import type { BuySignal } from '@/lib/stock-api/types';

interface StockDetailDialogProps {
  stock: WatchlistStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleFavorite?: (id: string) => void;
  onBuy?: (stock: WatchlistStock) => void;
  strategyId?: string;
}

interface StockQuote {
  price: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;  // 昨收价
  volume: number;
  amount: number;
}

interface StockIndicators {
  ma5: number;
  ma10: number;
  ma20: number;
  macd: { dif: number; dea: number; macd: number };
  rsi: { rsi6: number; rsi12: number; rsi24: number };
  volumeRatio: number;
}

const REFRESH_INTERVAL = 30000; // 30秒

// 判断当前是否为交易时段
function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=周日, 6=周六
  if (day === 0 || day === 6) return false;
  
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 100 + minute;
  
  // 9:30-11:30, 13:00-15:00
  return (time >= 930 && time < 1135) || (time >= 1300 && time < 1505);
}

export function StockDetailDialog({
  stock,
  open,
  onOpenChange,
  onToggleFavorite,
  onBuy,
  strategyId,
}: StockDetailDialogProps) {
  const { strategies, activeStrategyId } = useStockStore();
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [indicators, setIndicators] = useState<StockIndicators | null>(null);
  const [loading, setLoading] = useState(false);
  const [buySignalLoading, setBuySignalLoading] = useState(false);
  const [onDemandBuySignal, setOnDemandBuySignal] = useState<BuySignal | null>(null);
  const [buySignalError, setBuySignalError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (!stock) return;
    
    setIsRefreshing(true);
    try {
      // 获取实时行情
      const quoteRes = await fetch(`/api/stock/quote?codes=${stock.stockCode}`);
      const quoteData = await quoteRes.json();
      if (quoteData.success && quoteData.data?.[0]) {
        const q = quoteData.data[0];
        setQuote({
          price: q.price,
          changePercent: q.changePercent,
          open: q.open,
          high: q.high,
          low: q.low,
          prevClose: q.prevClose,  // 新浪API返回prevClose
          volume: q.volume,
          amount: q.amount,
        });
      }

      // 获取技术指标
      const indicatorRes = await fetch(`/api/stock/indicators?code=${stock.stockCode}`);
      const indicatorData = await indicatorRes.json();
      if (indicatorData.success && indicatorData.data?.indicators) {
        const ind = indicatorData.data.indicators;
        setIndicators({
          ma5: ind.ma5,
          ma10: ind.ma10,
          ma20: ind.ma20,
          macd: ind.macd,
          rsi: ind.rsi,
          volumeRatio: ind.volumeRatio || 1,
        });
      }
      
      setLastUpdateTime(new Date());
    } catch (error) {
      console.error('获取股票详情失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [stock?.stockCode]);

  // 手动刷新
  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // 获取实时行情和技术指标
  useEffect(() => {
    if (!stock || !open) return;

    setLoading(true);
    fetchData()
      .finally(() => setLoading(false));
  }, [stock?.stockCode, open, fetchData]);

  // 自动刷新逻辑
  useEffect(() => {
    if (!stock || !open) return;

    const setupAutoRefresh = () => {
      // 清除旧定时器
      if (intervalRef.current) clearInterval(intervalRef.current);

      const trading = isTradingHours();
      
      if (trading) {
        // 交易时段：设置30秒刷新
        intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
      }
    };

    setupAutoRefresh();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stock?.stockCode, open, fetchData]);

  // 按需获取买入信号（使用策略规则）
  useEffect(() => {
    if (!stock || !open) return;
    
    // 切换股票时重置状态
    setBuySignalError(null);
    setOnDemandBuySignal(null);
    
    // 如果已经有缓存的buySignal，不重复获取
    if (stock.buySignal) return;

    const fetchBuySignal = async () => {
      setBuySignalLoading(true);
      try {
        const url = strategyId 
          ? `/api/stock/buy-signal?code=${stock.stockCode}&strategyId=${strategyId}`
          : `/api/stock/buy-signal?code=${stock.stockCode}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && data.data) {
          setOnDemandBuySignal(data.data);
        } else {
          setBuySignalError(data.error || '获取买入信号失败');
        }
      } catch (error) {
        setBuySignalError(error instanceof Error ? error.message : '网络请求失败');
        console.error('获取买入信号失败:', error);
      } finally {
        setBuySignalLoading(false);
      }
    };

    fetchBuySignal();
  }, [stock?.stockCode, open, strategyId]);

  if (!stock) return null;

  const currentPrice = quote?.price || stock.currentPrice;
  const changePercent = quote?.changePercent || stock.changePercent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold">{stock.stockName}</span>
                  <Badge variant="outline">{stock.stockCode}</Badge>
                  <Badge variant="secondary">{stock.sector}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={refresh}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  {onToggleFavorite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onToggleFavorite(stock.id)}
                    >
                      {stock.isFavorite ? (
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                      ) : (
                        <StarOff className="h-5 w-5" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                  >
                    <a
                      href={`https://quote.eastmoney.com/${stock.stockCode.startsWith('6') ? 'sh' : 'sz'}${stock.stockCode}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  </Button>
                </div>
              </DialogTitle>
          <DialogDescription className="sr-only">
            查看{stock.stockName}的详细信息，包括实时行情、技术指标和基本面数据
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">加载中...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 价格卡片 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-3xl font-bold ${getProfitColorClass(changePercent)}`}>
                      ¥{currentPrice.toFixed(2)}
                    </p>
                    <p className={`text-lg ${getProfitColorClass(changePercent)}`}>
                      {changePercent >= 0 ? (
                        <TrendingUp className="inline h-4 w-4 mr-1" />
                      ) : (
                        <TrendingDown className="inline h-4 w-4 mr-1" />
                      )}
                      {formatPercent(changePercent)}
                    </p>
                  </div>
                  {onBuy && (
                    <Button onClick={() => onBuy(stock)} className="bg-red-500 hover:bg-red-600">
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      买入
                    </Button>
                  )}
                </div>

                {/* 行情数据 */}
                {quote && (
                  <div className="grid grid-cols-4 gap-4 mt-6 text-sm">
                    <div>
                      <p className="text-muted-foreground">开盘</p>
                      <p className={`font-medium ${getProfitColorClass(quote.open - quote.preClose)}`}>
                        {quote.open.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">最高</p>
                      <p className="font-medium text-red-500">{quote.high?.toFixed(2) ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">最低</p>
                      <p className="font-medium text-green-500">{quote.low?.toFixed(2) ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">昨收</p>
                      <p className="font-medium">{quote.prevClose?.toFixed(2) ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">成交量</p>
                      <p className="font-medium">{quote.volume ? formatCurrency(quote.volume) + '手' : '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">成交额</p>
                      <p className="font-medium">{quote.amount ? formatCurrency(quote.amount) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">量比</p>
                      <p className="font-medium">{indicators?.volumeRatio?.toFixed(2) ?? stock.volumeRatio?.toFixed(2) ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">换手率</p>
                      <p className="font-medium">-</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 详细信息标签页 */}
            <Tabs defaultValue="buy-signal" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="buy-signal">
                  <Target className="mr-2 h-4 w-4" />
                  买入信号
                </TabsTrigger>
                <TabsTrigger value="indicators">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  技术指标
                </TabsTrigger>
                <TabsTrigger value="fundamental">
                  <Info className="mr-2 h-4 w-4" />
                  基本面
                </TabsTrigger>
                <TabsTrigger value="rules">
                  <FileText className="mr-2 h-4 w-4" />
                  规则检查
                </TabsTrigger>
              </TabsList>

              {/* 买入信号 */}
              <TabsContent value="buy-signal" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">量化买入信号检测</CardTitle>
                    <CardDescription>
                      {strategyId ? '基于当前策略规则检测' : '使用默认规则检测'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {buySignalLoading ? (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mt-3">正在检测买入信号...</p>
                      </div>
                    ) : (stock.buySignal || onDemandBuySignal) ? (() => {
                      const signal = stock.buySignal || onDemandBuySignal!;
                      return (
                        <div className="space-y-4">
                          {/* 信号强度总览 */}
                          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                            <div>
                              <p className="text-sm text-muted-foreground">信号状态</p>
                              <div className="flex items-center gap-2 mt-1">
                                {signal.trigger ? (
                                  <Badge className={
                                    signal.strength === 'strong' ? 'bg-red-500 text-white' :
                                    signal.strength === 'medium' ? 'bg-orange-500 text-white' :
                                    'bg-blue-500 text-white'
                                  }>
                                    {signal.strength === 'strong' ? '强烈买入' : 
                                     signal.strength === 'medium' ? '明确买入' : '初步买入'}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">未触发</Badge>
                                )}
                                <span className="text-sm text-muted-foreground">
                                  {signal.description}
                                </span>
                              </div>
                            </div>
                            {signal.suggestedPrice && (
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">建议买入价</p>
                                <p className="text-2xl font-bold text-red-500">
                                  ¥{signal.suggestedPrice.toFixed(2)}
                                </p>
                                {signal.stopLoss && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Shield className="h-3 w-3 text-green-500" />
                                    <span className="text-xs text-green-500">
                                      止损 ¥{signal.stopLoss.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 条件检查详情 */}
                          <div className="space-y-3">
                            {Object.values(signal.conditions).map((cond, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border">
                                {cond.pass ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="font-medium text-sm">{cond.name}</p>
                                    {cond.value && (
                                      <span className="text-xs text-muted-foreground font-mono">{cond.value}</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{cond.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })() : buySignalError ? (
                      <div className="text-center py-8">
                        <XCircle className="h-12 w-12 mx-auto text-red-500/50 mb-3" />
                        <p className="text-red-400 font-medium">买入信号检测失败</p>
                        <p className="text-xs text-muted-foreground mt-2">{buySignalError}</p>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                        <p className="text-muted-foreground">该股票暂无买入信号分析</p>
                        <p className="text-xs text-muted-foreground mt-1">请确保Tushare已正确配置</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 技术指标 */}
              <TabsContent value="indicators" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">技术指标</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {indicators ? (
                      <div className="space-y-4">
                        {/* 均线 */}
                        <div>
                          <p className="text-sm font-medium mb-2">移动平均线</p>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">MA5</p>
                              <p className={`font-medium ${getProfitColorClass(currentPrice - indicators.ma5)}`}>
                                {indicators.ma5.toFixed(2)}
                              </p>
                            </div>
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">MA10</p>
                              <p className={`font-medium ${getProfitColorClass(currentPrice - indicators.ma10)}`}>
                                {indicators.ma10.toFixed(2)}
                              </p>
                            </div>
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">MA20</p>
                              <p className={`font-medium ${getProfitColorClass(currentPrice - indicators.ma20)}`}>
                                {indicators.ma20.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* MACD */}
                        <div>
                          <p className="text-sm font-medium mb-2">MACD</p>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">DIF</p>
                              <p className={`font-medium ${getProfitColorClass(indicators.macd.dif)}`}>
                                {indicators.macd.dif.toFixed(3)}
                              </p>
                            </div>
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">DEA</p>
                              <p className={`font-medium ${getProfitColorClass(indicators.macd.dea)}`}>
                                {indicators.macd.dea.toFixed(3)}
                              </p>
                            </div>
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">MACD</p>
                              <p className={`font-medium ${getProfitColorClass(indicators.macd.macd)}`}>
                                {indicators.macd.macd.toFixed(3)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* RSI */}
                        <div>
                          <p className="text-sm font-medium mb-2">RSI</p>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">RSI6</p>
                              <p className="font-medium">{indicators.rsi.rsi6.toFixed(2)}</p>
                            </div>
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">RSI12</p>
                              <p className="font-medium">{indicators.rsi.rsi12.toFixed(2)}</p>
                            </div>
                            <div className="p-2 rounded bg-muted">
                              <p className="text-muted-foreground">RSI24</p>
                              <p className="font-medium">{indicators.rsi.rsi24.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-4">
                        技术指标数据获取中...
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 基本面 */}
              <TabsContent value="fundamental" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">基本面数据</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded bg-muted">
                        <p className="text-sm text-muted-foreground">行业</p>
                        <p className="font-medium">{stock.sector}</p>
                      </div>
                      <div className="p-3 rounded bg-muted">
                        <p className="text-sm text-muted-foreground">ROE</p>
                        <p className="font-medium">
                          {stock.roe > 0 ? `${stock.roe.toFixed(2)}%` : '-'}
                        </p>
                      </div>
                      <div className="p-3 rounded bg-muted">
                        <p className="text-sm text-muted-foreground">负债率</p>
                        <p className="font-medium">
                          {stock.debtRatio > 0 ? `${stock.debtRatio.toFixed(2)}%` : '-'}
                        </p>
                      </div>
                      <div className="p-3 rounded bg-muted">
                        <p className="text-sm text-muted-foreground">PE分位</p>
                        <p className="font-medium">
                          {stock.pePercentile > 0 ? `${stock.pePercentile.toFixed(1)}` : '-'}
                        </p>
                      </div>
                      <div className="p-3 rounded bg-muted">
                        <p className="text-sm text-muted-foreground">量比</p>
                        <p className="font-medium">{stock.volumeRatio.toFixed(2)}</p>
                      </div>
                      <div className="p-3 rounded bg-muted">
                        <p className="text-sm text-muted-foreground">价格/MA5</p>
                        <p className={`font-medium ${getProfitColorClass(stock.priceVsMA5)}`}>
                          {stock.priceVsMA5 > 0 ? `+${stock.priceVsMA5.toFixed(2)}%` : `${stock.priceVsMA5.toFixed(2)}%`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 规则检查 */}
              <TabsContent value="rules" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">策略规则检查</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* 基本状态 */}
                      <div className="flex items-center justify-between p-2 rounded bg-muted">
                        <span>符合当前策略规则</span>
                        <Badge variant={stock.meetsRules ? 'default' : 'destructive'}>
                          {stock.meetsRules ? '通过' : '不通过'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-muted">
                        <span>系统选出</span>
                        <Badge variant={stock.isSystemPick ? 'default' : 'secondary'}>
                          {stock.isSystemPick ? '是' : '否'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-muted">
                        <span>已加入自选</span>
                        <Badge variant={stock.isFavorite ? 'default' : 'secondary'}>
                          {stock.isFavorite ? '是' : '否'}
                        </Badge>
                      </div>

                      {/* 买入信号与规则检查说明 */}
                      {!stock.meetsRules && stock.buySignal?.trigger && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <div className="text-xs space-y-1">
                              <p className="font-medium text-amber-700 dark:text-amber-400">
                                ⚠️ 信号关注：有买入信号但未完全符合选股规则
                              </p>
                              <p className="text-muted-foreground leading-relaxed">
                                这只股票触发了<strong className="text-amber-600">技术面买入信号</strong>（{stock.buySignal.strength === 'strong' ? '强烈' : stock.buySignal.strength === 'medium' ? '中等' : '轻度'}买入），
                                但未通过全部<strong className="text-red-500">筛选条件</strong>。
                              </p>
                              <p className="text-muted-foreground leading-relaxed">
                                <span className="text-blue-500">处理方式：</span>作为<strong className="text-amber-600">信号关注股</strong>加入观察池，
                                不标记为"系统选出"。可参考买入信号，但需注意基本面风险。
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 详细规则检查 - 始终使用当前策略配置实时验证 */}
                      {(() => {
                        const currentStrategyId = strategyId || activeStrategyId;
                        const currentStrategy = strategies.find(s => s.id === currentStrategyId);
                        
                        if (!currentStrategy?.stockRules) return null;
                        
                        const rules = currentStrategy.stockRules;
                        const violations: { rule: string; expected: string; actual: string; pass: boolean }[] = [];
                        
                        // ROE
                        if (rules.minROE > 0 && stock.roe > 0) {
                          const pass = stock.roe >= rules.minROE;
                          violations.push({
                            rule: `ROE ≥ ${rules.minROE}%`,
                            expected: `≥ ${rules.minROE}%`,
                            actual: `${stock.roe.toFixed(1)}%`,
                            pass,
                          });
                        }
                        
                        // 负债率
                        if (rules.maxDebtRatio > 0 && stock.debtRatio > 0) {
                          const pass = stock.debtRatio <= rules.maxDebtRatio;
                          violations.push({
                            rule: `负债率 ≤ ${rules.maxDebtRatio}%`,
                            expected: `≤ ${rules.maxDebtRatio}%`,
                            actual: `${stock.debtRatio.toFixed(1)}%`,
                            pass,
                          });
                        }
                        
                        // 量比
                        if (rules.minVolumeRatio > 0 && stock.volumeRatio > 0) {
                          const pass = stock.volumeRatio >= rules.minVolumeRatio;
                          violations.push({
                            rule: `量比 ≥ ${rules.minVolumeRatio}`,
                            expected: `≥ ${rules.minVolumeRatio}`,
                            actual: stock.volumeRatio.toFixed(2),
                            pass,
                          });
                        }
                        
                        // 换手率
                        if (rules.minTurnoverRate5D > 0 && stock.turnoverRate > 0) {
                          const pass = stock.turnoverRate >= rules.minTurnoverRate5D;
                          violations.push({
                            rule: `换手率 ≥ ${rules.minTurnoverRate5D}%`,
                            expected: `≥ ${rules.minTurnoverRate5D}%`,
                            actual: `${stock.turnoverRate.toFixed(2)}%`,
                            pass,
                          });
                        }
                        
                        // 市值
                        if (rules.minMarketCap > 0 || rules.maxMarketCap > 0) {
                          if (stock.marketCap && stock.marketCap > 0) {
                            if (rules.minMarketCap > 0) {
                              const pass = stock.marketCap >= rules.minMarketCap;
                              violations.push({
                                rule: `市值 ≥ ${rules.minMarketCap}亿`,
                                expected: `≥ ${rules.minMarketCap}亿`,
                                actual: `${stock.marketCap.toFixed(0)}亿`,
                                pass,
                              });
                            }
                            if (rules.maxMarketCap > 0) {
                              const pass = stock.marketCap <= rules.maxMarketCap;
                              violations.push({
                                rule: `市值 ≤ ${rules.maxMarketCap}亿`,
                                expected: `≤ ${rules.maxMarketCap}亿`,
                                actual: `${stock.marketCap.toFixed(0)}亿`,
                                pass,
                              });
                            }
                          } else {
                            violations.push({
                              rule: '市值范围',
                            expected: `${rules.minMarketCap || 0}-${rules.maxMarketCap || '不限'}亿`,
                              actual: '无数据',
                              pass: false,
                            });
                          }
                        }
                        
                        // 板块涨幅（仅当策略设置了板块涨幅条件时显示）
                        if (rules.minSectorGain && rules.minSectorGain > 0) {
                          // 详情页无法获取实时板块数据，显示提示
                          violations.push({
                            rule: `板块涨幅 ≥ ${rules.minSectorGain}%`,
                            expected: `≥ ${rules.minSectorGain}%`,
                            actual: '选股扫描时已过滤',
                            pass: true,
                          });
                        }
                        
                        if (violations.length === 0) return null;
                        
                        const failCount = violations.filter(v => !v.pass).length;
                        
                        return (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              规则明细（{failCount > 0 ? <span className="text-red-500">{failCount}项不通过</span> : <span className="text-green-500">全部通过</span>}）
                            </p>
                            <div className="space-y-1.5">
                              {violations.map((v, i) => (
                                <div key={i} className={`flex items-center justify-between p-2 rounded text-xs ${
                                  v.pass ? 'bg-green-500/5' : 'bg-red-500/5'
                                }`}>
                                  <div className="flex items-center gap-2">
                                    {v.pass ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                                    )}
                                    <span className={v.pass ? '' : 'text-red-700 dark:text-red-400'}>{v.rule}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{v.expected}</span>
                                    <span className={`font-mono font-medium ${
                                      v.pass ? 'text-green-600' : 'text-red-600'
                                    }`}>{v.actual}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
