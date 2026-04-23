'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
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
  History,
  ChevronUp,
  Clock,
  Calendar,
  ArrowUpDown,
  Flame,
  Thermometer,
  Snowflake,
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
import { getSectorHeatDisplayClass, getSectorHeatTextColor } from '@/lib/stock-api/rps';
import { useStockSearch } from '@/hooks/use-stock-search';
import { useStockQuote } from '@/hooks/use-realtime-quotes';
import { useStockPoolRefresh } from '@/hooks/use-stock-pool-refresh';
import { StockDetailDialog } from '@/components/stock-detail-dialog';
import { toast } from 'sonner';
import type { WatchlistStock, ScanFunnel, ScanFunnelStep } from '@/lib/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function StockPoolView() {
  const { watchlist, removeFromWatchlist, addToWatchlist, toggleFavorite, updateWatchlistStock, strategies, activeStrategyId, setActiveStrategy, addScanFunnel, scanFunnels, clearScanFunnels } =
    useStockStore();

  const handleRefreshWatchlist = useCallback((updatedStocks: Partial<WatchlistStock>[]) => {
    updatedStocks.forEach(update => {
      if (update.id) {
        updateWatchlistStock(update.id, update);
      }
    });
  }, [updateWatchlistStock]);

  const { isRefreshing, lastUpdateTime, isTradingHours: isTrading, nextRefreshTime, refresh: refreshWatchlist } = useStockPoolRefresh(
    watchlist,
    handleRefreshWatchlist
  );
  
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
  const [showFunnelHistory, setShowFunnelHistory] = useState(false);
  const [expandedFunnelId, setExpandedFunnelId] = useState<string | null>(null);
  
  // 排序状态
  type SortField = 'sector' | 'sectorHeat' | 'changePercent' | 'volumeRatio' | 'roe' | 'buySignal';
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // 切换排序方向
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 新字段，默认降序
      setSortField(field);
      setSortOrder('desc');
    }
  };
  
  // 计算板块热度映射（基于全市场行业RPS20排名 + 实时活跃度）
  const [sectorHeatMap, setSectorHeatMap] = useState<Map<string, import('@/lib/stock-api/rps').SectorHeatInfo>>(new Map());
  const [isCalculatingHeat, setIsCalculatingHeat] = useState(false);
  
  // 异步计算板块热度
  useEffect(() => {
    let cancelled = false;
    
    async function calculate() {
      if (watchlist.length === 0) {
        setSectorHeatMap(new Map());
        return;
      }
      
      setIsCalculatingHeat(true);
      try {
        const { calculateSectorHeatMap } = await import('@/lib/stock-api/rps');
        const result = await calculateSectorHeatMap(watchlist);
        if (!cancelled) {
          setSectorHeatMap(result);
        }
      } catch (error) {
        console.error('计算板块热度失败:', error);
      } finally {
        if (!cancelled) {
          setIsCalculatingHeat(false);
        }
      }
    }
    
    calculate();
    
    return () => { cancelled = true; };
  }, [watchlist]);
  
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
  let result = watchlist.filter((stock) => {
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
  
  // 排序
  if (sortField) {
    result = [...result].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'sector':
          comparison = a.sector.localeCompare(b.sector, 'zh-CN');
          break;
        case 'sectorHeat': {
          const heatA = sectorHeatMap.get(a.sector)?.heatScore || 0;
          const heatB = sectorHeatMap.get(b.sector)?.heatScore || 0;
          comparison = heatA - heatB;
          break;
        }
        case 'changePercent':
          comparison = a.changePercent - b.changePercent;
          break;
        case 'volumeRatio':
          comparison = (a.volumeRatio || 0) - (b.volumeRatio || 0);
          break;
        case 'roe':
          comparison = (a.roe || 0) - (b.roe || 0);
          break;
        case 'buySignal': {
          // 买入信号排序：触发 > 未触发 > 无数据
          const getSignalPriority = (stock: typeof a) => {
            if (!stock.buySignal) return 0;
            if (!stock.buySignal.trigger) return 1;
            // 根据信号强度排序
            const strengthOrder: Record<string, number> = { strong: 3, medium: 2, weak: 1 };
            return strengthOrder[stock.buySignal.strength] || 2 + 10; // 触发的优先级更高
          };
          comparison = getSignalPriority(a) - getSignalPriority(b);
          break;
        }
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }
  
  return result;
}, [watchlist, searchQuery, filterType, sortField, sortOrder, sectorHeatMap]);

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
    if (!currentFilterStrategy) {
      toast.error('请先选择或激活一个策略');
      return;
    }

    setIsScanning(true);
    try {
      const params = new URLSearchParams();
      
      if (currentFilterStrategy.stockRules) {
        const rules = currentFilterStrategy.stockRules;
        // 市值规则
        if (rules.minMarketCap > 0) {
          params.set('minMarketCap', rules.minMarketCap.toString());
        }
        if (rules.maxMarketCap > 0) {
          params.set('maxMarketCap', rules.maxMarketCap.toString());
        }
        // ROE规则
        if (rules.minROE > 0) {
          params.set('minROE', rules.minROE.toString());
        }
        // 负债率规则
        if (rules.maxDebtRatio > 0) {
          params.set('maxDebtRatio', rules.maxDebtRatio.toString());
        }
        // 换手率规则
        if (rules.minTurnoverRate5D > 0) {
          params.set('minTurnoverRate', rules.minTurnoverRate5D.toString());
        }
        // PE规则（绝对PE值，非分位）
        if (rules.maxPEPercentile > 0) {
          params.set('maxPE', rules.maxPEPercentile.toString());
        }
        // 量比规则
        if (rules.volumeRatio > 0) {
          params.set('minVolumeRatio', rules.volumeRatio.toString());
        }
        // 技术面规则
        if (rules.priceAboveMA5) {
          params.set('priceAboveMA5', 'true');
        }
        if (rules.priceAboveMA20) {
          params.set('priceAboveMA20', 'true');
        }
        if (rules.weeklyMACDGoldenCross) {
          params.set('weeklyMACDGoldenCross', 'true');
        }
        // 板块涨幅规则
        if (rules.minSectorGain > 0) {
          params.set('minSectorGain', rules.minSectorGain.toString());
        }
        // 买入信号规则（基于策略配置）
        if (currentFilterStrategy.buyRules) {
          const buyRules = currentFilterStrategy.buyRules;
          params.set('buyMa5CrossMa20', String(buyRules.ma5CrossMa20));
          params.set('buyMacdGoldenCross', String(buyRules.macdGoldenCross));
          params.set('buyCandleConfirm', String(buyRules.candleConfirm));
          params.set('buyVolumeConfirm', String(buyRules.volumeConfirm));
        }
      }
      
      const url = `/api/stock/scan${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success && result.data) {
        const { stocks, matchCount, note, funnel } = result.data;
        
        // 保存漏斗信息
        if (funnel && currentFilterStrategy) {
          const scanFunnel: ScanFunnel = {
            strategyId: currentFilterStrategy.id,
            strategyName: currentFilterStrategy.name,
            scannedAt: new Date().toISOString(),
            steps: funnel,
            totalResult: matchCount,
          };
          addScanFunnel(scanFunnel);
        }
        
        let addedCount = 0;
        for (const stock of stocks) {
          const exists = watchlist.some(w => w.stockCode === stock.code);
          if (!exists && (stock.meetsRules || stock.buySignal?.trigger)) {
            addToWatchlist({
              stockCode: stock.code,
              stockName: stock.name,
              sector: stock.industry || '待分类',
              currentPrice: stock.price,
              priceSource: stock.priceSource || 'realtime',
              changePercent: stock.changePercent,
              priceVsMA5: 0,
              priceVsMA20: 0,
              volumeRatio: stock.volumeRatio || 1,
              roe: stock.roe || 0,
              debtRatio: stock.debtRatio || 0,
              pePercentile: stock.pe || 0,
              marketCap: stock.marketCap || 0,
              meetsRules: stock.meetsRules,
              isSystemPick: stock.meetsRules, // 只有符合规则的才标记为系统选出
              isFavorite: false,
              strategyId: currentFilterStrategyId,
              buySignal: stock.buySignal,
              ruleChecks: stock.ruleChecks,
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
        // 扫描失败也保存到漏斗历史，方便排查问题
        if (currentFilterStrategy) {
          const errorFunnel: ScanFunnel = {
            strategyId: currentFilterStrategy.id,
            strategyName: currentFilterStrategy.name,
            scannedAt: new Date().toISOString(),
            steps: [
              { label: 'A股全市场', count: 0, filter: '数据获取失败' },
              { label: '基本面筛选', count: 0, filter: result.error || '扫描失败' },
            ],
            totalResult: 0,
            error: result.error || '扫描失败',
          };
          addScanFunnel(errorFunnel);
        }
        toast.error(result.error || '扫描失败');
      }
    } catch (error) {
      console.error('Scan error:', error);
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
                  ROE &gt; {activeStrategy.stockRules.minROE || 10}% <span className="opacity-60">(可选)</span>
                </Badge>
                <Badge variant="secondary">
                  负债率 &lt; {activeStrategy.stockRules.maxDebtRatio || 50}% <span className="opacity-60">(可选)</span>
                </Badge>
                <Badge variant="secondary">
                  PE &lt; {activeStrategy.stockRules.maxPEPercentile || 30}
                </Badge>
                <Badge variant="secondary">
                  换手率 &gt; {activeStrategy.stockRules.minTurnoverRate5D || 3}%
                </Badge>
                <Badge variant="secondary">
                  市值 {activeStrategy.stockRules.minMarketCap || 30}亿 ~ {activeStrategy.stockRules.maxMarketCap === 0 ? '不限' : `${activeStrategy.stockRules.maxMarketCap || 200}亿`}
                </Badge>
                {activeStrategy.stockRules.minSectorGain && activeStrategy.stockRules.minSectorGain > 0 && (
                  <Badge variant="secondary">
                    板块涨幅 &gt; {activeStrategy.stockRules.minSectorGain}%
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scan Funnel History */}
        {scanFunnels.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    扫描漏斗历史
                  </CardTitle>
                  <CardDescription>
                    查看最近 {scanFunnels.length} 次策略筛选的漏斗过滤过程
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('确定要清除所有扫描历史记录吗？')) {
                        clearScanFunnels();
                        toast.success('已清除扫描历史');
                      }
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    清除
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!showFunnelHistory && scanFunnels.length > 0) {
                        setShowFunnelHistory(true);
                        setExpandedFunnelId(null);
                      } else {
                        setShowFunnelHistory(false);
                        setExpandedFunnelId(null);
                      }
                    }}
                  >
                    <History className="mr-1 h-3 w-3" />
                    {showFunnelHistory ? '收起' : '展开'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {showFunnelHistory && (
              <CardContent>
                <div className="space-y-4">
                  {scanFunnels.map((funnel) => (
                    <div
                      key={funnel.scannedAt}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            {funnel.strategyName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(funnel.scannedAt), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                          </p>
                        </div>
                        <Badge variant={funnel.error ? 'destructive' : funnel.totalResult > 0 ? 'default' : 'secondary'}>
                          {funnel.error ? `错误: ${funnel.error}` : `结果: ${funnel.totalResult} 只`}
                        </Badge>
                      </div>

                      {/* Funnel Steps - 优化后的精简设计 */}
                      <div className="space-y-1">
                        {funnel.steps.map((step, idx) => {
                          const maxCount = funnel.steps[0].count;
                          const prevStep = idx > 0 ? funnel.steps[idx - 1] : null;
                          const filteredOut = prevStep ? prevStep.count - step.count : 0;
                          const filterRate = prevStep && prevStep.count > 0 
                            ? ((filteredOut / prevStep.count) * 100) 
                            : 0;
                          const isExpanded = expandedFunnelId === `${funnel.scannedAt}-${idx}`;
                          const isFirst = idx === 0;
                          const isLast = idx === funnel.steps.length - 1;
                          
                          // 步骤类型标识
                          const stepType = isFirst ? 'source' : 
                            isLast ? 'result' : 
                            step.label.includes('基本面') ? 'fundamental' :
                            step.label.includes('技术面') ? 'technical' : 'filter';

                          return (
                            <div key={idx} className="relative">
                              {/* Connector line */}
                              {idx > 0 && (
                                <div className="absolute left-5 top-0 h-3 w-px bg-border -translate-y-full" />
                              )}
                              
                              <div
                                className={`flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-lg p-2.5 transition-colors ${
                                  isLast ? 'bg-primary/5 ring-1 ring-primary/20' : ''
                                }`}
                                onClick={() =>
                                  setExpandedFunnelId(
                                    isExpanded ? null : `${funnel.scannedAt}-${idx}`
                                  )
                                }
                              >
                                {/* Funnel icon */}
                                <div
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    isLast
                                      ? 'bg-primary text-primary-foreground'
                                      : isFirst
                                      ? 'bg-chart-1/20 text-chart-1'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  <ChevronUp
                                    className={`h-4 w-4 transition-transform ${
                                      isExpanded ? 'rotate-180' : ''
                                    }`}
                                  />
                                </div>

                                {/* Step info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium">{step.label}</p>
                                      {/* 关键过滤标记 */}
                                      {!isFirst && !isLast && filterRate > 80 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                                          关键过滤
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                      <p className="text-lg font-bold tabular-nums">{step.count}</p>
                                      {!isFirst && (
                                        <span className="text-xs text-muted-foreground">只</span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Progress bar - 漏斗形视觉 */}
                                  <div className="relative">
                                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          isLast ? 'bg-primary' :
                                          filterRate > 80 ? 'bg-red-400' :
                                          filterRate > 50 ? 'bg-amber-400' :
                                          'bg-chart-1'
                                        }`}
                                        style={{ width: `${maxCount > 0 ? (step.count / maxCount) * 100 : 0}%` }}
                                      />
                                    </div>
                                  </div>
                                  
                                  {/* 过滤信息 - 仅在展开时显示详细，折叠时显示一行摘要 */}
                                  {!isFirst && !isExpanded && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {filterRate > 0 ? (
                                        <span>
                                          淘汰 <span className="text-red-400 font-medium">{filteredOut}</span> 只
                                          <span className="mx-1 text-muted-foreground/50">·</span>
                                          过滤率 <span className="font-medium">{filterRate.toFixed(1)}%</span>
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground/50">无过滤</span>
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Expanded filter details */}
                              {isExpanded && (
                                <div className="ml-14 mt-1 p-3 bg-muted/30 rounded-lg text-xs space-y-2 border border-border/50">
                                  {isLast ? (
                                    <>
                                      {/* 结果步骤特殊展示 */}
                                      <div>
                                        <p className="font-medium text-muted-foreground mb-1.5">筛选结果</p>
                                        <div className="flex items-center gap-3">
                                          <div className="text-center">
                                            <p className="text-2xl font-bold text-primary">{step.count}</p>
                                            <p className="text-[10px] text-muted-foreground">最终入选</p>
                                          </div>
                                          {step.label.match(/\d+只/) && (
                                            <div className="text-center px-3 py-1.5 rounded-md bg-green-500/10 border border-green-500/20">
                                              <p className="text-sm font-semibold text-green-600">{step.label.match(/\d+只[^）]*/)?.[0]}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {step.filter && step.filter !== '无过滤' && (
                                        <div className="pt-2 border-t border-border/50">
                                          <p className="font-medium text-muted-foreground mb-1.5">选股规则</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {step.filter.split(/[；;]/).filter(Boolean).map((condition, i) => (
                                              <span key={i} className="inline-block px-2 py-1 rounded-md bg-primary/10 text-primary/90">
                                                {condition.trim()}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                                        <div>
                                          <span className="text-muted-foreground">总过滤率</span>
                                          <p className="text-amber-400 font-semibold">
                                            {maxCount > 0 ? ((1 - step.count / maxCount) * 100).toFixed(1) : 0}%
                                          </p>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">通过率</span>
                                          <p className="text-green-400 font-semibold">
                                            {maxCount > 0 ? ((step.count / maxCount) * 100).toFixed(1) : 0}%
                                          </p>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      {/* 筛选条件 */}
                                      {step.filter && step.filter !== '无过滤' && (
                                        <div>
                                          <p className="font-medium text-muted-foreground mb-1.5">筛选条件</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {step.filter.split(/[；;]/).filter(Boolean).map((condition, i) => (
                                              <span key={i} className="inline-block px-2 py-1 rounded-md bg-primary/10 text-primary/90">
                                                {condition.trim()}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* 数据统计 */}
                                      {!isFirst && (
                                        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
                                          <div>
                                            <span className="text-muted-foreground">本步淘汰</span>
                                            <p className="text-red-400 font-semibold">{filteredOut} 只</p>
                                          </div>
                                          <div>
                                            <span className="text-muted-foreground">本步过滤率</span>
                                            <p className="text-amber-400 font-semibold">{filterRate.toFixed(1)}%</p>
                                          </div>
                                          <div>
                                            <span className="text-muted-foreground">累计剩余</span>
                                            <p className="text-green-400 font-semibold">
                                              {maxCount > 0 ? ((step.count / maxCount) * 100).toFixed(1) : 0}%
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* 数据来源 */}
                                      {isFirst && (
                                        <div className="pt-2 border-t border-border/50">
                                          <span className="text-muted-foreground">数据来源: </span>
                                          <span className="text-blue-400 font-medium">
                                            {funnel.steps.some(s => s.label === '基本面筛选') ? 'Tushare全市场扫描' : '固定股票池'}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
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
              <div className="flex flex-wrap items-center gap-2">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshWatchlist}
                  disabled={isRefreshing}
                  className="gap-1"
                >
                  {isRefreshing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {isRefreshing ? '刷新中' : '刷新'}
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`inline-block h-2 w-2 rounded-full ${isTrading ? 'bg-green-500' : 'bg-gray-500'}`} />
                  <span>{isTrading ? '交易时段' : '非交易时段'}</span>
                  {lastUpdateTime && (
                    <span className="hidden sm:inline">
                      更新于 {lastUpdateTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>
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
                    <TableHead 
                      className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort('sectorHeat')}
                    >
                      <div className="flex items-center gap-1">
                        板块及热度
                        <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'sectorHeat' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">现价</TableHead>
                    <TableHead 
                      className="text-right cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort('changePercent')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        涨跌幅
                        <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'changePercent' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="text-right cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort('volumeRatio')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        量比
                        <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'volumeRatio' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="text-right cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort('roe')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        ROE
                        <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'roe' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="text-center cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort('buySignal')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        买入信号
                        <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'buySignal' ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">符合规则</TableHead>
                    <TableHead className="text-center">来源</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center">
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
                          {(() => {
                            const heat = sectorHeatMap.get(stock.sector);
                            if (!heat) {
                              return <Badge variant="outline">{stock.sector}</Badge>;
                            }
                            
                            return (
                              <div className="flex flex-col gap-1 min-w-[120px]">
                                {/* 第一行：图标+行业名+板块涨幅 */}
                                <div className="flex items-center gap-1">
                                  {heat.heatLevel === 'extreme' && (
                                    <Flame className={`h-3.5 w-3.5 ${heat.displayColor}`} />
                                  )}
                                  {heat.heatLevel === 'high' && (
                                    <Flame className={`h-3.5 w-3.5 ${heat.displayColor}`} />
                                  )}
                                  {heat.heatLevel === 'medium' && (
                                    <Thermometer className={`h-3.5 w-3.5 ${heat.displayColor}`} />
                                  )}
                                  {heat.heatLevel === 'low' && (
                                    <Snowflake className={`h-3.5 w-3.5 ${heat.displayColor}`} />
                                  )}
                                  <span className="text-xs font-medium truncate">{stock.sector}</span>
                                  <span className={`text-[10px] font-bold ${
                                    // 判断使用当日涨幅还是20日涨幅
                                    Math.abs(heat.avgChangePercent) > 0.01
                                      ? (heat.avgChangePercent >= 0 ? 'text-red-500' : 'text-green-500')
                                      : (heat.change20d && heat.change20d >= 0 ? 'text-orange-500' : 'text-green-500')
                                  }`}>
                                    {(() => {
                                      // 当日涨幅不为0时，显示当日涨幅
                                      if (Math.abs(heat.avgChangePercent) > 0.01) {
                                        return `${heat.avgChangePercent >= 0 ? '+' : ''}${heat.avgChangePercent.toFixed(1)}%`;
                                      }
                                      // 当日涨幅为0且有20日数据，显示20日涨幅
                                      if (heat.change20d != null) {
                                        return `${heat.change20d >= 0 ? '+' : ''}${heat.change20d.toFixed(1)}%(20日)`;
                                      }
                                      // 无数据时显示0%
                                      return '+0.0%';
                                    })()}
                                  </span>
                                </div>
                                
                                {/* 第二行：进度条 + RPS分数 */}
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all ${getSectorHeatDisplayClass(heat.heatScore)}`}
                                      style={{ width: `${heat.heatScore}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-mono font-medium whitespace-nowrap ${getSectorHeatTextColor(heat.heatScore)}`}>
                                    RPS:{heat.rpsScore}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {stock.currentPrice > 0
                              ? stock.currentPrice.toFixed(2)
                              : '-'}
                            {stock.priceSource === 'realtime' ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-600" title="实时行情">
                                <Clock className="h-3 w-3" />
                                <span className="hidden sm:inline">实时</span>
                              </span>
                            ) : stock.priceSource === 'close' ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600" title="收盘价">
                                <Calendar className="h-3 w-3" />
                                <span className="hidden sm:inline">收盘</span>
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`flex items-center justify-end gap-1 ${getProfitColorClass(
                              stock.changePercent
                            )}`}
                          >
                            {stock.changePercent > 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : stock.changePercent < 0 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : (
                              <span className="h-3 w-3 text-muted-foreground">-</span>
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
                          {stock.buySignal ? (
                            stock.buySignal.trigger ? (
                              <div className="flex items-center justify-center gap-1">
                                <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20">
                                  <TrendingUp className="mr-1 h-3 w-3" />
                                  {stock.buySignal.strength === 'strong' ? '强买入' : stock.buySignal.strength === 'medium' ? '买入' : '弱买入'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  ¥{stock.buySignal.suggestedPrice?.toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                已检测 - 未触发
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              未检测
                            </Badge>
                          )}
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
        strategyId={selectedStrategyId || undefined}
      />
    </div>
  );
}
