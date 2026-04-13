'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  TrendingUp,
  TrendingDown,
  Star,
  StarOff,
  Eye,
  Trash2,
  BarChart3,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStockStore } from '@/lib/store';
import { formatPercent, getProfitColorClass } from '@/lib/mock-data';
import { toast } from 'sonner';

export function StockPoolView() {
  const { watchlist, removeFromWatchlist, addToWatchlist, strategies, activeStrategyId } =
    useStockStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'system' | 'manual'>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newStock, setNewStock] = useState({
    stockCode: '',
    stockName: '',
    sector: '',
  });

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === activeStrategyId),
    [strategies, activeStrategyId]
  );

  const filteredStocks = useMemo(() => {
    return watchlist.filter((stock) => {
      // 搜索过滤
      const matchesSearch =
        stock.stockCode.includes(searchQuery) ||
        stock.stockName.includes(searchQuery);

      // 类型过滤
      const matchesType =
        filterType === 'all' ||
        (filterType === 'system' && stock.isSystemPick) ||
        (filterType === 'manual' && !stock.isSystemPick);

      return matchesSearch && matchesType;
    });
  }, [watchlist, searchQuery, filterType]);

  const systemPicks = watchlist.filter((s) => s.isSystemPick);
  const manualPicks = watchlist.filter((s) => !s.isSystemPick);

  const handleAddStock = () => {
    if (!newStock.stockCode || !newStock.stockName) {
      toast.error('请填写股票代码和名称');
      return;
    }

    addToWatchlist({
      stockCode: newStock.stockCode,
      stockName: newStock.stockName,
      sector: newStock.sector || '未知',
      currentPrice: 0,
      changePercent: 0,
      priceVsMA5: 0,
      priceVsMA20: 0,
      volumeRatio: 0,
      roe: 0,
      debtRatio: 0,
      pePercentile: 0,
      meetsRules: false,
      isSystemPick: false,
    });

    setNewStock({ stockCode: '', stockName: '', sector: '' });
    setIsAddDialogOpen(false);
    toast.success('股票已添加到观察池');
  };

  const handleScan = () => {
    toast.success('扫描完成，已更新股票池');
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">智能股票池</h1>
            <p className="text-sm text-muted-foreground">
              基于策略规则自动筛选股票
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleScan}>
              <RefreshCw className="mr-2 h-4 w-4" /> 立即扫描
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> 手动添加
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加股票到观察池</DialogTitle>
                  <DialogDescription>
                    手动添加的股票将标记为"非系统机会"
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">股票代码</label>
                    <Input
                      placeholder="例如：600519"
                      value={newStock.stockCode}
                      onChange={(e) =>
                        setNewStock({ ...newStock, stockCode: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">股票名称</label>
                    <Input
                      placeholder="例如：贵州茅台"
                      value={newStock.stockName}
                      onChange={(e) =>
                        setNewStock({ ...newStock, stockName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">所属行业</label>
                    <Input
                      placeholder="例如：白酒"
                      value={newStock.sector}
                      onChange={(e) =>
                        setNewStock({ ...newStock, sector: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleAddStock}>添加</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                观察池总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{watchlist.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                系统筛选
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-1">{systemPicks.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                手动添加
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{manualPicks.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                符合规则
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-1">
                {watchlist.filter((s) => s.meetsRules).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Current Strategy Rules */}
        {activeStrategy && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">当前筛选规则</CardTitle>
              <CardDescription>
                基于策略"{activeStrategy.name}"的选股条件
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {activeStrategy.stockRules.priceAboveMA5 && (
                  <Badge variant="secondary">股价 &gt; MA5</Badge>
                )}
                {activeStrategy.stockRules.priceAboveMA20 && (
                  <Badge variant="secondary">股价 &gt; MA20</Badge>
                )}
                {activeStrategy.stockRules.weeklyMACDGoldenCross && (
                  <Badge variant="secondary">周MACD金叉</Badge>
                )}
                <Badge variant="secondary">
                  量比 &gt; {activeStrategy.stockRules.volumeRatio}
                </Badge>
                <Badge variant="secondary">
                  ROE &gt; {activeStrategy.stockRules.minROE}%
                </Badge>
                <Badge variant="secondary">
                  负债率 &lt; {activeStrategy.stockRules.maxDebtRatio}%
                </Badge>
                <Badge variant="secondary">
                  PE分位 &lt; {activeStrategy.stockRules.maxPEPercentile}%
                </Badge>
                <Badge variant="secondary">
                  换手率 &gt; {activeStrategy.stockRules.minTurnoverRate5D}%
                </Badge>
                <Badge variant="secondary">
                  市值 &lt; {activeStrategy.stockRules.maxMarketCap}亿
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stock List */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">股票列表</CardTitle>
                <CardDescription>点击查看详情，评估是否符合买入条件</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索股票..."
                    className="pl-8 w-[200px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Tabs
                  value={filterType}
                  onValueChange={(v) => setFilterType(v as typeof filterType)}
                >
                  <TabsList>
                    <TabsTrigger value="all">全部</TabsTrigger>
                    <TabsTrigger value="system">系统</TabsTrigger>
                    <TabsTrigger value="manual">手动</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>行业</TableHead>
                    <TableHead className="text-right">现价</TableHead>
                    <TableHead className="text-right">涨跌幅</TableHead>
                    <TableHead className="text-right">量比</TableHead>
                    <TableHead className="text-right">ROE</TableHead>
                    <TableHead className="text-center">符合规则</TableHead>
                    <TableHead className="text-center">来源</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
                          <p className="mt-2 text-sm text-muted-foreground">
                            暂无股票数据
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStocks.map((stock) => (
                      <TableRow key={stock.id}>
                        <TableCell className="font-medium">
                          {stock.stockCode}
                        </TableCell>
                        <TableCell>{stock.stockName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{stock.sector}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.currentPrice > 0
                            ? stock.currentPrice.toFixed(2)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`flex items-center justify-end gap-1 ${getProfitColorClass(
                              stock.changePercent
                            )}`}
                          >
                            {stock.changePercent >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {formatPercent(stock.changePercent)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.volumeRatio > 0
                            ? stock.volumeRatio.toFixed(2)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.roe > 0 ? stock.roe.toFixed(1) + '%' : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {stock.meetsRules ? (
                            <div className="flex items-center justify-center">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-chart-1/10">
                                <Check className="h-4 w-4 text-chart-1" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                                <X className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {stock.isSystemPick ? (
                            <Badge className="bg-chart-1/10 text-chart-1 hover:bg-chart-1/20">
                              <Star className="mr-1 h-3 w-3" />
                              系统
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              手动
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>操作</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                查看详情
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  removeFromWatchlist(stock.id);
                                  toast.success('已从观察池移除');
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                移除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
