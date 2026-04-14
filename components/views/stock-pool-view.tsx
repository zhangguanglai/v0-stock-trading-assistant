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
  ChevronDown,
  Zap,
  Settings2,
  Loader2,
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
import { formatCurrency, formatPercent, getProfitColorClass } from '@/lib/mock-data';
import { useStockSearch } from '@/hooks/use-stock-search';
import { useStockQuote } from '@/hooks/use-realtime-quotes';
import { StockDetailDialog } from '@/components/stock-detail-dialog';
import { toast } from 'sonner';
import type { WatchlistStock } from '@/lib/types';

export function StockPoolView() {
  const { watchlist, removeFromWatchlist, addToWatchlist, toggleFavorite, strategies, activeStrategyId, setActiveStrategy } =
    useStockStore();
  
  // 清除所有股票池数据（用于重新扫描）
  const clearWatchlist = () => {
    // 移除所有系统选出的股票
    watchlist.filter(s => s.isSystemPick).forEach(s => {
      removeFromWatchlist(s.id);
    });
    toast.success('已清除系统选出的股票，请重新扫描');
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'favorite' | 'system' | 'manual'>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [detailStock, setDetailStock] = useState<WatchlistStock | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [stockSearchKeyword, setStockSearchKeyword] = useState('');
  const [selectedSearchResult, setSelectedSearchResult] = useState<{
    code: string;
    name: string;
    market: string;
  } | null>(null);
  const [newStock, setNewStock] = useState({
    stockCode: '',
    stockName: '',
    sector: '',
  });

  // 股票搜索
  const { results: searchResults, isSearching, search: performSearch, clear: clearSearch } = useStockSearch();
  
  // 获取选中股票的实时行情
  const { quote: selectedQuote, isLoading: quoteLoading } = useStockQuote(
    selectedSearchResult?.code || null,
    !!selectedSearchResult
  );

  // 获取所有激活的策略
  const activeStrategies = useMemo(
    () => strategies.filter((s) => s.status === 'active'),
    [strategies]
  );

  // 当前选中用于筛选的策略（默认为全局激活策略，或第一个激活策略）
  const currentFilterStrategyId = selectedStrategyId || activeStrategyId || activeStrategies[0]?.id;
  
  const currentFilterStrategy = useMemo(
    () => strategies.find((s) => s.id === currentFilterStrategyId),
    [strategies, currentFilterStrategyId]
  );

  // 兼容旧的 activeStrategy 变量名
  const activeStrategy = currentFilterStrategy;

const filteredStocks = useMemo(() => {
  return watchlist.filter((stock) => {
    // 搜索过滤
    const matchesSearch =
      stock.stockCode.includes(searchQuery) ||
      stock.stockName.includes(searchQuery);
    
    // 类型过滤
    const matchesType =
      filterType === 'all' ||
      (filterType === 'favorite' && stock.isFavorite) ||
      (filterType === 'system' && stock.isSystemPick) ||
      (filterType === 'manual' && !stock.isSystemPick);
    
    return matchesSearch && matchesType;
  });
}, [watchlist, searchQuery, filterType]);

// 自选股票数量
const favoriteCount = useMemo(() => {
  return watchlist.filter((s) => s.isFavorite).length;
}, [watchlist]);

// 基于当前策略规则实时验证股票是否符合条件
// 注意：由于没有实时市值数据，这里只是标记需要重新验证
const validateStockRules = useMemo(() => {
  if (!currentFilterStrategy?.stockRules) {
    return (stock: typeof watchlist[0]) => ({
      meetsRules: stock.meetsRules,
      reason: '',
    });
  }
  
  const rules = currentFilterStrategy.stockRules;
  
  return (stock: typeof watchlist[0]) => {
    const violations: string[] = [];
    
    // ROE验证
    if (rules.minROE > 0 && stock.roe > 0 && stock.roe < rules.minROE) {
      violations.push(`ROE(${stock.roe.toFixed(1)}%) < ${rules.minROE}%`);
    }
    
    // 负债率验证
    if (rules.maxDebtRatio > 0 && stock.debtRatio > 0 && stock.debtRatio > rules.maxDebtRatio) {
      violations.push(`负债率(${stock.debtRatio.toFixed(1)}%) > ${rules.maxDebtRatio}%`);
    }
    
    // 量比验证
    if (rules.volumeRatio > 0 && stock.volumeRatio > 0 && stock.volumeRatio < rules.volumeRatio) {
      violations.push(`量比(${stock.volumeRatio.toFixed(2)}) < ${rules.volumeRatio}`);
    }
    
    // 市值验证需要额外的市值数据，这里无法验证
    // 但我们可以标记为"待验证"
    if (rules.maxMarketCap > 0) {
      // 市值数据需要从API获取，这里暂时跳过
    }
    
    return {
      meetsRules: violations.length === 0,
      reason: violations.join(', '),
    };
  };
}, [currentFilterStrategy]);

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

  const [isScanning, setIsScanning] = useState(false);
  
  const handleScan = async () => {
    setIsScanning(true);
    try {
      // 构建基于当前策略规则的扫描参数
      const params = new URLSearchParams();
      
      if (currentFilterStrategy?.stockRules) {
        const rules = currentFilterStrategy.stockRules;
        if (rules.maxMarketCap > 0) {
          params.set('maxMarketCap', rules.maxMarketCap.toString());
        }
        if (rules.minROE > 0) {
          params.set('minROE', rules.minROE.toString());
        }
        if (rules.maxDebtRatio > 0) {
          params.set('maxDebtRatio', rules.maxDebtRatio.toString());
        }
        if (rules.minTurnoverRate5D > 0) {
          params.set('minTurnoverRate', rules.minTurnoverRate5D.toString());
        }
      }
      
      const url = `/api/stock/scan${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success && result.data) {
        const { stocks, matchCount, note } = result.data;
        
        // 将符合规则的扫描结果添加到观察池
        let addedCount = 0;
        for (const stock of stocks) {
          // 检查是否已存在
          const exists = watchlist.some(w => w.stockCode === stock.code);
          if (!exists && stock.meetsRules) {
            addToWatchlist({
              stockCode: stock.code,
              stockName: stock.name,
              sector: stock.industry || '待分类',
              currentPrice: stock.price,
              changePercent: stock.changePercent,
              priceVsMA5: 0,
              priceVsMA20: 0,
              volumeRatio: stock.volumeRatio || 1,
              roe: stock.roe || 0,
              debtRatio: stock.debtRatio || 0,
              pePercentile: stock.pe || 0,
              meetsRules: true,
              isSystemPick: true,
              isFavorite: false,
              strategyId: currentFilterStrategyId,
            });
            addedCount++;
          }
        }
        
        if (matchCount === 0) {
          toast.warning(`扫描完成！共扫描 ${stocks.length} 只股票，但无符合当前策略规则的股票`, {
            description: note,
          });
        } else {
          toast.success(`扫描完成！${matchCount}/${stocks.length} 只符合规则，新增 ${addedCount} 只到观察池`, {
            description: note,
          });
        }
      } else {
        toast.error(result.error || '扫描失败');
      }
    } catch (error) {
      toast.error('扫描失败，请稍后重试');
    } finally {
      setIsScanning(false);
    }
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
<Button 
              variant="ghost" 
              size="sm"
              onClick={clearWatchlist}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              清除
            </Button>
            <Button variant="outline" onClick={handleScan} disabled={isScanning}>
              {isScanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {isScanning ? '扫描中...' : '立即扫描'}
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) {
                setStockSearchKeyword('');
                setSelectedSearchResult(null);
                clearSearch();
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> 添加股票
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>添加股票到观察池</DialogTitle>
                  <DialogDescription>
                    搜索股票代码或名称，获取实时行情后加入观察池
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* 股票搜索 */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">搜索股票</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="输入股票代码或名称，如 600519 或 茅台"
                        value={stockSearchKeyword}
                        onChange={(e) => {
                          setStockSearchKeyword(e.target.value);
                          performSearch(e.target.value);
                          setSelectedSearchResult(null);
                        }}
                        className="pl-10"
                      />
                      {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    
                    {/* 搜索结果列表 */}
                    {searchResults.length > 0 && !selectedSearchResult && (
                      <div className="max-h-48 overflow-y-auto rounded-md border">
                        {searchResults.map((result) => (
                          <div
                            key={result.code}
                            className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-muted"
                            onClick={() => {
                              setSelectedSearchResult(result);
                              setStockSearchKeyword(`${result.code} ${result.name}`);
                            }}
                          >
                            <div>
                              <span className="font-medium">{result.code}</span>
                              <span className="ml-2 text-muted-foreground">{result.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {result.market === 'sh' ? '沪' : result.market === 'sz' ? '深' : '北'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* 选中股票的实时行情 */}
                  {selectedSearchResult && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{selectedSearchResult.name}</p>
                            <p className="text-sm text-muted-foreground">{selectedSearchResult.code}</p>
                          </div>
                          {quoteLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : selectedQuote ? (
                            <div className="text-right">
                              <p className="text-lg font-semibold">¥{selectedQuote.price.toFixed(2)}</p>
                              <p className={`text-sm ${selectedQuote.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {selectedQuote.changePercent >= 0 ? '+' : ''}{selectedQuote.changePercent.toFixed(2)}%
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">获取行情中...</span>
                          )}
                        </div>
                        {selectedQuote && (
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <div>
                              <span>开盘</span>
                              <p className="font-medium text-foreground">¥{selectedQuote.open.toFixed(2)}</p>
                            </div>
                            <div>
                              <span>最高</span>
                              <p className="font-medium text-foreground">¥{selectedQuote.high.toFixed(2)}</p>
                            </div>
                            <div>
                              <span>最低</span>
                              <p className="font-medium text-foreground">¥{selectedQuote.low.toFixed(2)}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* 备注（可选） */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">所属行业（可选）</label>
                    <Input
                      placeholder="例如：白酒、新能源"
                      value={newStock.sector}
                      onChange={(e) =>
                        setNewStock({ ...newStock, sector: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setIsAddDialogOpen(false);
                    setStockSearchKeyword('');
                    setSelectedSearchResult(null);
                    clearSearch();
                  }}>
                    取消
                  </Button>
                  <Button 
                    onClick={() => {
                      if (selectedSearchResult && selectedQuote) {
                        addToWatchlist({
                          stockCode: selectedSearchResult.code,
                          stockName: selectedSearchResult.name,
                          sector: newStock.sector || '未分类',
                          currentPrice: selectedQuote.price,
                          changePercent: selectedQuote.changePercent,
                          priceVsMA5: 0,
                          priceVsMA20: 0,
                          volumeRatio: 1,
                          roe: 0,
                          debtRatio: 0,
                          pePercentile: 0,
                          meetsRules: false,
                          isSystemPick: false,
                          isFavorite: false,
                        });
                        toast.success(`已添加 ${selectedSearchResult.name} 到观察池`);
                        setIsAddDialogOpen(false);
                        setStockSearchKeyword('');
                        setSelectedSearchResult(null);
                        setNewStock({ stockCode: '', stockName: '', sector: '' });
                        clearSearch();
                      } else {
                        toast.error('请先搜索并选择一只股票');
                      }
                    }}
                    disabled={!selectedSearchResult || !selectedQuote}
                  >
                    添加到观察池
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        {/* 策略切换器 - 当有多个激活策略时显示 */}
        {activeStrategies.length > 1 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">当前有 {activeStrategies.length} 个激活策略</p>
                    <p className="text-xs text-muted-foreground">选择策略查看对应的筛选规则和股票池</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-w-[200px] justify-between">
                      <span className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        {currentFilterStrategy?.name || '选择策略'}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[250px]">
                    <DropdownMenuLabel>切换筛选策略</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {activeStrategies.map((strategy) => (
                      <DropdownMenuItem
                        key={strategy.id}
                        onClick={() => setSelectedStrategyId(strategy.id)}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {strategy.cycle === 'short' ? '短线' : strategy.cycle === 'swing' ? '波段' : '长线'}
                          </Badge>
                          {strategy.name}
                        </span>
                        {currentFilterStrategyId === strategy.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 无激活策略提示 */}
        {activeStrategies.length === 0 && (
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardContent className="flex items-center gap-4 py-4">
              <Settings2 className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="font-medium text-yellow-600 dark:text-yellow-400">暂无激活策略</p>
                <p className="text-sm text-muted-foreground">
                  请先在"策略配置中心"创建并激活至少一个策略，才能使用智能筛选功能
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
        {activeStrategy && activeStrategy.stockRules && (
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
                  量比 &gt; {activeStrategy.stockRules.volumeRatio || 1.5}
                </Badge>
                <Badge variant="secondary">
                  ROE &gt; {activeStrategy.stockRules.minROE || 10}%
                </Badge>
                <Badge variant="secondary">
                  负债率 &lt; {activeStrategy.stockRules.maxDebtRatio || 50}%
                </Badge>
                <Badge variant="secondary">
                  PE分位 &lt; {activeStrategy.stockRules.maxPEPercentile || 30}%
                </Badge>
                <Badge variant="secondary">
                  换手率 &gt; {activeStrategy.stockRules.minTurnoverRate5D || 3}%
                </Badge>
                <Badge variant="secondary">
                  市值 &lt; {activeStrategy.stockRules.maxMarketCap || 100}亿
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
                    <TabsTrigger value="favorite" className="relative">
                      <Star className="mr-1 h-3 w-3" />
                      自选
                      {favoriteCount > 0 && (
                        <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                          {favoriteCount}
                        </span>
                      )}
                    </TabsTrigger>
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
                          <div className="flex items-center gap-1.5">
                            {stock.isFavorite && (
                              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                            )}
                            {stock.stockCode}
                          </div>
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
                              <DropdownMenuItem
                                onClick={() => {
                                  toggleFavorite(stock.id);
                                  toast.success(stock.isFavorite ? '已从自选移除' : '已加入自选');
                                }}
                              >
                                {stock.isFavorite ? (
                                  <>
                                    <StarOff className="mr-2 h-4 w-4" />
                                    移出自选
                                  </>
                                ) : (
                                  <>
                                    <Star className="mr-2 h-4 w-4 text-yellow-500" />
                                    加入自选
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDetailStock(stock);
                                  setIsDetailOpen(true);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                查看详情
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
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

      {/* 股票详情弹窗 */}
      <StockDetailDialog
        stock={detailStock}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}
