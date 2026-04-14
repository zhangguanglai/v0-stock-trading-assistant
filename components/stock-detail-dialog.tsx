'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';
import { formatCurrency, formatPercent, getProfitColorClass } from '@/lib/mock-data';
import type { WatchlistStock } from '@/lib/types';

interface StockDetailDialogProps {
  stock: WatchlistStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleFavorite?: (id: string) => void;
  onBuy?: (stock: WatchlistStock) => void;
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

export function StockDetailDialog({
  stock,
  open,
  onOpenChange,
  onToggleFavorite,
  onBuy,
}: StockDetailDialogProps) {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [indicators, setIndicators] = useState<StockIndicators | null>(null);
  const [loading, setLoading] = useState(false);

  // 获取实时行情和技术指标
  useEffect(() => {
    if (!stock || !open) return;

    const fetchData = async () => {
      setLoading(true);
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
        if (indicatorData.success && indicatorData.data) {
          setIndicators(indicatorData.data);
        }
      } catch (error) {
        console.error('获取股票详情失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [stock, open]);

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
            <Tabs defaultValue="indicators" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
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
                    <div className="space-y-2">
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
