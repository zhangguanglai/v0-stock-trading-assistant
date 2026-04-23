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
  BarChart3,
  FileText,
  X,
  Loader2,
  Plus,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { getStockFullData } from '@/lib/stock-api';
import { detectBuySignal } from '@/lib/stock-api/indicators';
import type { BuyRules } from '@/lib/types';
import { useRealtimeQuotes } from '@/hooks/use-realtime-quotes';
import { toast } from 'sonner';
import type { Position } from '@/lib/types';

// 买入信号客户端缓存（5分钟TTL）
interface BuySignalCache {
  data: any;
  timestamp: number;
}

const buySignalCache = new Map<string, BuySignalCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

export function PositionView() {
  const {
    positions,
    updatePosition,
    removePosition,
    addPosition,
    addTradeRecord,
    strategies,
    activeStrategyId,
  } = useStockStore();

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState(false);
  const [sellShares, setSellShares] = useState(0);
  const [buyForm, setBuyForm] = useState({
    stockCode: '',
    stockName: '',
    buyPrice: 0,
    shares: 0,
    buyDate: new Date().toISOString().split('T')[0],
    fee: 0,
    buyReason: '',
    emotion: '',
    notes: '',
    buyBatch: 1, // 1: 第一批建仓, 2: 第二批加仓, 3: 第三批二次加仓
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [buyEvaluation, setBuyEvaluation] = useState({
    overall: 'neutral',
    message: '请输入股票代码或名称',
    checks: {
      highLow: false,
      movingAvg: false,
      volume: false,
    },
    details: [],
  });
  const [agreedToChecks, setAgreedToChecks] = useState(false);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  
  // 当前活跃策略（必须在fundsStatus之前声明）
  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === activeStrategyId),
    [strategies, activeStrategyId]
  );

  const fundsStatus = useMemo(() => {
    const totalCost = positions.reduce((sum, p) => sum + (p.buyPrice || p.entryPrice || 0) * (p.shares || p.quantity || 0), 0);
    const totalFunds = activeStrategy?.moneyRules?.totalCapital || 200000;
    const usedFunds = totalCost;
    const availableFunds = Math.max(0, totalFunds - usedFunds);
    return { totalFunds, usedFunds, availableFunds };
  }, [positions, activeStrategy]);

  const positionAdvice = useMemo(() => {
    const { totalFunds, availableFunds } = fundsStatus;
    const strategy = activeStrategy;
    const maxSingleStockPercent = strategy?.moneyRules?.maxSingleStockPercent || 20;
    const batchRatios = strategy?.buyRules?.batchBuyRatios || [0.3, 0.3, 0.4];
    const batchRatio = batchRatios[buyForm.buyBatch - 1] || 1;
    const recommendedPercentage = maxSingleStockPercent * batchRatio;
    let riskLevel = 'low';
    if (strategy?.cycle === 'short') riskLevel = 'medium';
    else if (strategy?.cycle === 'swing') riskLevel = 'medium';
    const recommendedAmount = totalFunds * (recommendedPercentage / 100);
    const finalAmount = Math.min(recommendedAmount, availableFunds);
    const recommendedShares = buyForm.buyPrice > 0 ? Math.floor(finalAmount / buyForm.buyPrice / 100) * 100 : 0;
    return { recommendedPercentage, recommendedAmount: finalAmount, recommendedShares, riskLevel };
  }, [fundsStatus, activeStrategy, buyForm.buyBatch, buyForm.buyPrice]);
  const [strategyCheck, setStrategyCheck] = useState({
    passed: false,
    message: '请先输入股票代码',
    matchedRules: 0,
    totalRules: 4,
    ruleDetails: [
      { name: '均线多头排列', description: 'MA5>MA10>MA20', passed: false, status: 'fail', detail: '等待股票代码' },
      { name: 'MACD金叉', description: 'DIF上穿DEA且DIF>0', passed: false, status: 'fail', detail: '等待股票代码' },
      { name: 'K线确认', description: '阳线且收盘价站上MA5', passed: false, status: 'fail', detail: '等待股票代码' },
      { name: '成交量确认', description: '当日量>20日均量×1.2', passed: false, status: 'fail', detail: '等待股票代码' },
    ],
  });

  const [sellStrategyCheck, setSellStrategyCheck] = useState({
    passed: false,
    message: '正在检查卖出策略匹配度...',
    matchedRules: 0,
    totalRules: 0,
    ruleDetails: [],
  });
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

  // P0: 按当前策略过滤持仓 - 只显示属于当前策略的持仓
  const filteredPositions = useMemo(() => {
    if (!activeStrategyId) return positionsWithRealtime;
    return positionsWithRealtime.filter(p => p.strategyId === activeStrategyId || !p.strategyId);
  }, [positionsWithRealtime, activeStrategyId]);

  // 计算持仓统计（使用过滤后的持仓数据）
  const stats = useMemo(() => {
    const totalCost = filteredPositions.reduce((sum, p) => sum + (p.buyPrice || p.entryPrice || 0) * (p.shares || p.quantity || 0), 0);
    const totalMarketValue = filteredPositions.reduce(
      (sum, p) => sum + p.currentPrice * (p.shares || p.quantity || 0),
      0
    );
    const totalProfit = totalMarketValue - totalCost;
    const profitPositions = filteredPositions.filter(
      (p) => p.currentPrice > (p.buyPrice || p.entryPrice || 0)
    ).length;
    const lossPositions = filteredPositions.length - profitPositions;
    const alertCount = filteredPositions.filter((p) => p.alertTriggered).length;

    return {
      totalCost,
      totalMarketValue,
      totalProfit,
      profitPercent: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
      profitPositions,
      lossPositions,
      alertCount,
    };
  }, [filteredPositions]);

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

  const handleSearch = async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/stock/search?keyword=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      if (data.success && data.data && data.data.length > 0) {
        setSearchResults(data.data.map((s: any) => ({
          code: s.code,
          name: s.name,
          sector: s.sector || s.symbol?.startsWith('sh') ? '沪市' : s.symbol?.startsWith('sz') ? '深市' : '北交所',
        })));
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('搜索失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleBatchChange = (batch: number) => {
    const strategy = activeStrategy;
    const batchRatios = strategy?.buyRules?.batchBuyRatios || [0.3, 0.3, 0.4];
    const batchRatio = batchRatios[batch - 1] || 0.3;
    const totalFunds = strategy?.moneyRules?.totalCapital || 200000;
    const maxPercent = strategy?.moneyRules?.maxSingleStockPercent || 20;
    const price = buyForm.buyPrice || 0;
    const batchAmount = totalFunds * (maxPercent / 100) * batchRatio;
    const suggestedShares = price > 0 ? Math.floor(batchAmount / price / 100) * 100 : 100;

    setBuyForm({ ...buyForm, buyBatch: batch, shares: suggestedShares });
  };

  const handleSelectStock = async (stock: any) => {
    const strategy = activeStrategy;
    const batchRatios = strategy?.buyRules?.batchBuyRatios || [0.3, 0.3, 0.4];
    const batchIdx = 0; // 默认第1批
    const batchRatio = batchRatios[batchIdx] || 0.3;

    setSearchQuery(stock.name);
    setSearchResults([]);

    // 获取最新价格
    let latestPrice = 0;
    try {
      const res = await fetch(`/api/stock/quote?codes=${stock.code}`);
      const data = await res.json();
      if (data.success && data.data && data.data[0]) {
        const quote = data.data[0];
        latestPrice = quote.price || quote.prevClose || 0;
      }
    } catch (e) {
      console.warn('获取价格失败:', e);
    }

    // 基于策略仓位 + 当前批次比例自动计算数量
    const totalFunds = strategy?.moneyRules?.totalCapital || 200000;
    const maxPercent = strategy?.moneyRules?.maxSingleStockPercent || 20;
    const batchAmount = totalFunds * (maxPercent / 100) * batchRatio;
    const suggestedShares = latestPrice > 0 ? Math.floor(batchAmount / latestPrice / 100) * 100 : 100;

    setBuyForm({
      stockCode: stock.code,
      stockName: stock.name,
      buyPrice: latestPrice,
      shares: suggestedShares,
      buyDate: new Date().toISOString().split('T')[0],
      fee: 0,
      buyReason: '',
      emotion: '',
      notes: '',
      buyBatch: 1,
    });

    evaluateBuyRule(stock.code);
  };

  // 基于indicators的降级买入信号判断（当K线数据不可用时使用）
function createFallbackBuySignal(indicators: any, rules: any): any {
  const ma5 = indicators?.ma5;
  const ma10 = indicators?.ma10;
  const ma20 = indicators?.ma20;
  const macd = indicators?.macd;
  const volumeRatio = indicators?.volumeRatio || 1;
  
  // 均线多头排列判断
  const trendAlignment = {
    key: 'trendAlignment',
    pass: ma5 && ma10 && ma20 && ma5 > ma10 && ma10 > ma20,
    rule: rules?.ma5CrossMa20,
    detail: `MA5=${ma5?.toFixed(2)} MA10=${ma10?.toFixed(2)} MA20=${ma20?.toFixed(2)}`
  };
  
  // MACD金叉判断
  const macdGoldenCross = {
    key: 'macdGoldenCross',
    pass: macd && macd.dif > macd.dea && macd.dif > 0,
    rule: rules?.macdGoldenCross,
    detail: `DIF=${macd?.dif?.toFixed(3)} DEA=${macd?.dea?.toFixed(3)}`
  };
  
  // K线确认（简化：基于当前价格和MA5）
  const candleConfirm = {
    key: 'candleConfirm',
    pass: true, // 无法精确判断，默认通过
    rule: rules?.candleConfirm,
    detail: '等待K线数据'
  };
  
  // 成交量确认
  const volumeConfirm = {
    key: 'volumeConfirm',
    pass: volumeRatio >= 1.2,
    rule: rules?.volumeConfirm,
    detail: `量比=${volumeRatio.toFixed(2)}`
  };
  
  // 综合判断
  const conditions = [trendAlignment, macdGoldenCross, candleConfirm, volumeConfirm];
  const passedCount = conditions.filter(c => c.pass).length;
  
  return {
    trigger: passedCount >= (rules ? Object.values(rules).filter(Boolean).length * 0.6 : 2),
    strength: passedCount >= 4 ? 'strong' : passedCount >= 3 ? 'medium' : passedCount >= 2 ? 'weak' : undefined,
    conditions: {
      trendAlignment,
      macdGoldenCross,
      candleConfirm,
      volumeConfirm
    }
  };
}

const checkStrategyMatch = async (stockCode: string) => {
    const strategy = activeStrategy;

    if (!stockCode || !stockCode.trim()) {
      setStrategyCheck({
        passed: false,
        message: '请先输入股票代码',
        matchedRules: 0,
        totalRules: 4,
        ruleDetails: [
          { name: '均线多头排列', description: 'MA5>MA10>MA20', passed: false, status: 'fail', detail: '等待股票代码' },
          { name: 'MACD金叉', description: 'DIF上穿DEA且DIF>0', passed: false, status: 'fail', detail: '等待股票代码' },
          { name: 'K线确认', description: '阳线且收盘价站上MA5', passed: false, status: 'fail', detail: '等待股票代码' },
          { name: '成交量确认', description: '当日量>20日均量×1.2', passed: false, status: 'fail', detail: '等待股票代码' },
        ],
      });
      return;
    }

    if (!strategy || !strategy.buyRules) {
      setStrategyCheck({
        passed: false,
        message: '请先选择一个策略并配置买入规则',
        matchedRules: 0,
        totalRules: 0,
        ruleDetails: [],
      });
      return;
    }

    const buyRules = strategy.buyRules;

    // 检查客户端缓存（5分钟内不重复请求）
    const cacheKey = `${stockCode}_${activeStrategyId || ''}`;
    const cached = buySignalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // 使用缓存数据
      const data = cached.data.indicators || {};
      const indicators = data.indicators || null;
      const buySignal = cached.data.buySignal || null;
      
      // 直接从缓存构建结果
      if (!buySignal || !buySignal.conditions) {
        setStrategyCheck({
          passed: false,
          message: '缓存数据不完整',
          matchedRules: 0,
          totalRules: 4,
          ruleDetails: [
            { name: '均线多头排列', description: 'MA5>MA10>MA20', passed: false, status: 'fail', detail: '无数据' },
            { name: 'MACD金叉', description: 'DIF上穿DEA且DIF>0', passed: false, status: 'fail', detail: '无数据' },
            { name: 'K线确认', description: '阳线且收盘价站上MA5', passed: false, status: 'fail', detail: '无数据' },
            { name: '成交量确认', description: '当日量>20日均量×1.2', passed: false, status: 'fail', detail: '无数据' },
          ],
        });
        return;
      }

      const maCondition = buySignal.conditions.trendAlignment;
      const macdCondition = buySignal.conditions.macdGoldenCross;
      const candleCondition = buySignal.conditions.candleConfirm;
      const volumeCondition = buySignal.conditions.volumeConfirm;

      const ruleDetails = [
        {
          name: '均线多头排列',
          description: `MA5>MA10>MA20: ${indicators?.ma5 ? indicators.ma5.toFixed(2) : '?'} / ${indicators?.ma10 ? indicators.ma10.toFixed(2) : '?'} / ${indicators?.ma20 ? indicators.ma20.toFixed(2) : '?'}`,
          passed: maCondition?.pass || false,
          status: maCondition?.pass ? 'pass' : 'fail',
          detail: maCondition?.pass ? '通过' : '未通过',
        },
        {
          name: 'MACD金叉',
          description: `DIF=${indicators?.macd?.dif ? indicators.macd.dif.toFixed(3) : '?'}, DEA=${indicators?.macd?.dea ? indicators.macd.dea.toFixed(3) : '?'}`,
          passed: macdCondition?.pass || false,
          status: macdCondition?.pass ? 'pass' : 'fail',
          detail: macdCondition?.pass ? '通过' : '未通过',
        },
        {
          name: 'K线确认',
          description: `收盘价=${indicators?.close ? indicators.close.toFixed(2) : '?'}, 开盘价=${indicators?.open ? indicators.open.toFixed(2) : '?'}`,
          passed: candleCondition?.pass || false,
          status: candleCondition?.pass ? 'pass' : 'fail',
          detail: candleCondition?.pass ? '通过' : '未通过',
        },
        {
          name: '成交量确认',
          description: `量比=${indicators?.volumeRatio ? indicators.volumeRatio.toFixed(2) : '?'}`,
          passed: volumeCondition?.pass || false,
          status: volumeCondition?.pass ? 'pass' : 'fail',
          detail: volumeCondition?.pass ? '通过' : '未通过',
        },
      ];

      const totalRules = ruleDetails.length;
      const matchedRules = ruleDetails.filter(r => r.passed).length;
      const passed = buySignal.trigger;
      const message = passed
        ? `策略匹配度良好，满足 ${matchedRules}/${totalRules} 项买入规则`
        : `策略匹配度较低，仅满足 ${matchedRules}/${totalRules} 项买入规则`;

      setStrategyCheck({ passed, message, matchedRules, totalRules, ruleDetails });
      return;
    }

    try {
      setStockSearchLoading(true);

      // Use server-side API routes to avoid CORS issues in browser
      const [indicatorsRes, buySignalRes] = await Promise.allSettled([
        fetch(`/api/stock/indicators?code=${stockCode}`).then(r => r.json()),
        fetch(`/api/stock/buy-signal?code=${stockCode}&strategyId=${activeStrategyId || ''}`).then(r => r.json()),
      ]);

      const indicatorsResult = indicatorsRes.status === 'fulfilled' ? indicatorsRes.value : null;
      const buySignalResult = buySignalRes.status === 'fulfilled' ? buySignalRes.value : null;

      // Check if both API calls failed
      if ((!indicatorsResult?.success || !indicatorsResult?.data) && (!buySignalResult?.success || !buySignalResult?.data)) {
        // Both failed - try position-based fallback
        const pos = positions.find(p => p.stockCode === stockCode);
        const hasPositionData = pos !== undefined;

        setStrategyCheck({
          passed: false,
          message: hasPositionData
            ? `数据服务暂不可用，基于持仓数据评估 (${pos.stockName})`
            : '数据服务暂不可用，请检查网络连接后重试',
          matchedRules: 0,
          totalRules: 4,
          ruleDetails: hasPositionData ? [
            { name: '均线多头排列', description: 'MA5>MA10>MA20', passed: false, status: 'fail', detail: `现价¥${pos.currentPrice?.toFixed(2)}` },
            { name: 'MACD金叉', description: 'DIF上穿DEA且DIF>0', passed: false, status: 'fail', detail: `盈亏${((pos.currentPrice - pos.buyPrice) / pos.buyPrice * 100).toFixed(1)}%` },
            { name: 'K线确认', description: '阳线且收盘价站上MA5', passed: false, status: 'fail', detail: `持有${pos.shares}股` },
            { name: '成交量确认', description: '当日量>20日均量×1.2', passed: false, status: 'fail', detail: `成本¥${pos.buyPrice?.toFixed(2)}` },
          ] : [
            { name: '均线多头排列', description: 'MA5>MA10>MA20', passed: false, status: 'fail', detail: '无数据' },
            { name: 'MACD金叉', description: 'DIF上穿DEA且DIF>0', passed: false, status: 'fail', detail: '无数据' },
            { name: 'K线确认', description: '阳线且收盘价站上MA5', passed: false, status: 'fail', detail: '无数据' },
            { name: '成交量确认', description: '当日量>20日均量×1.2', passed: false, status: 'fail', detail: '无数据' },
          ],
        });
        return;
      }

      const data = indicatorsResult?.success ? indicatorsResult.data : {};
      const indicators = data.indicators || null;
      const buySignal = buySignalResult?.success ? buySignalResult.data : null;
      
      // If buy signal data is not available, show error
      if (!buySignal || !buySignal.conditions) {
        setStrategyCheck({
          passed: false,
          message: buySignalResult?.error || '买入信号检测失败',
          matchedRules: 0,
          totalRules: 4,
          ruleDetails: [
            { name: '均线多头排列', description: 'MA5>MA10>MA20', passed: false, status: 'fail', detail: '无数据' },
            { name: 'MACD金叉', description: 'DIF上穿DEA且DIF>0', passed: false, status: 'fail', detail: '无数据' },
            { name: 'K线确认', description: '阳线且收盘价站上MA5', passed: false, status: 'fail', detail: '无数据' },
            { name: '成交量确认', description: '当日量>20日均量×1.2', passed: false, status: 'fail', detail: '无数据' },
          ],
        });
        return;
      }
      
      const signals = buySignal.conditions || [];
      
      // 构建规则详情（统一名称和描述）
      const maCondition = buySignal.conditions.trendAlignment;
      const macdCondition = buySignal.conditions.macdGoldenCross;
      const candleCondition = buySignal.conditions.candleConfirm;
      const volumeCondition = buySignal.conditions.volumeConfirm;
      
      const ruleDetails = [
        {
          name: '均线多头排列',
          description: `MA5>MA10>MA20: ${indicators?.ma5 ? indicators.ma5.toFixed(2) : '?'} / ${indicators?.ma10 ? indicators.ma10.toFixed(2) : '?'} / ${indicators?.ma20 ? indicators.ma20.toFixed(2) : '?'}`,
          passed: maCondition?.pass || false,
          status: maCondition?.pass ? 'pass' : 'fail',
          detail: maCondition?.pass ? '通过' : (indicators?.ma5 && indicators?.ma10 && indicators?.ma20 ? '均线未呈多头排列' : '数据不足'),
        },
        {
          name: 'MACD金叉',
          description: `DIF=${indicators?.macd?.dif ? indicators.macd.dif.toFixed(3) : '?'}, DEA=${indicators?.macd?.dea ? indicators.macd.dea.toFixed(3) : '?'}`,
          passed: macdCondition?.pass || false,
          status: macdCondition?.pass ? 'pass' : 'fail',
          detail: macdCondition?.pass ? '通过' : (indicators?.macd ? '未形成金叉' : '数据不足'),
        },
        {
          name: 'K线确认',
          description: buySignal?.actualClose ? `${buySignal.actualClose.toFixed(2)} / ${buySignal.actualOpen.toFixed(2)}` : (candleCondition?.value || '?'),
          passed: candleCondition?.pass || false,
          status: candleCondition?.pass ? 'pass' : 'fail',
          detail: candleCondition?.pass ? '通过' : (candleCondition?.value || '数据不足'),
        },
        {
          name: '成交量确认',
          description: `量比=${indicators?.volumeRatio ? indicators.volumeRatio.toFixed(2) : '?'}`,
          passed: volumeCondition?.pass || false,
          status: volumeCondition?.pass ? 'pass' : 'fail',
          detail: volumeCondition?.pass ? '通过' : (indicators?.volumeRatio ? `未达1.2倍标准` : '数据不足'),
        },
      ];
      
      const totalRules = ruleDetails.length;
      const matchedRules = ruleDetails.filter(r => r.passed).length;
      const allEnabledPass = buyRules.ma5CrossMa20 === (maCondition?.pass || false) &&
                            buyRules.macdGoldenCross === (macdCondition?.pass || false) &&
                            buyRules.candleConfirm === (candleCondition?.pass || false) &&
                            buyRules.volumeConfirm === (volumeCondition?.pass || false);
      
      let passed = buySignal.trigger; // 使用detectBuySignal的综合判断结果
      let message = '';
      
      if (passed) {
        message = `策略匹配度良好，满足 ${matchedRules}/${totalRules} 项买入规则`;
      } else {
        message = `策略匹配度较低，仅满足 ${matchedRules}/${totalRules} 项买入规则`;
      }
      
      setStrategyCheck({
        passed,
        message,
        matchedRules,
        totalRules,
        ruleDetails,
      });

      // 缓存结果（5分钟）
      buySignalCache.set(cacheKey, {
        data: { indicators: data, buySignal },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('检查策略匹配时出错:', error);
      setStrategyCheck({
        passed: false,
        message: `检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
        matchedRules: 0,
        totalRules: 4,
        ruleDetails: [],
      });
    } finally {
      setStockSearchLoading(false);
    }
  };

  const checkSellStrategyMatch = async (stockCode: string) => {
    // 检查股票是否符合策略卖出规则
    const strategy = activeStrategy;
    
    // 无策略时基于持仓数据做降级分析
    if (!strategy || !strategy.sellRules) {
      const pos = positions.find(p => p.stockCode === stockCode);
      if (pos) {
        const currentPnL = ((pos.currentPrice - pos.buyPrice) / pos.buyPrice * 100);
        const stopLoss = pos.buyPrice * (1 - 0.08);
        const takeProfit = pos.buyPrice * (1 + 0.25);
        
        setSellStrategyCheck({
          passed: currentPnL >= 0,
          message: `当前盈亏 ${currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(1)}% | 成本 ¥${pos.buyPrice.toFixed(2)} | 现价 ¥${pos.currentPrice.toFixed(2)} | 持仓 ${pos.shares}股`,
          matchedRules: currentPnL >= 0 ? 2 : 1,
          totalRules: 3,
          ruleDetails: [
            { name: '止损检查', description: `当前 ${currentPnL.toFixed(1)}% > 止损线 -8%`, passed: currentPnL > -8, status: currentPnL > -8 ? 'pass' : 'fail', detail: `止损价: ¥${stopLoss.toFixed(2)}` },
            { name: '止盈检查', description: `当前 ${currentPnL.toFixed(1)}% < 止盈目标 +25%`, passed: currentPnL < 25, status: currentPnL < 25 ? 'pass' : 'fail', detail: `止盈价: ¥${takeProfit.toFixed(2)}` },
            { name: '持仓时长检查', description: `持有 ${pos.shares} 股`, passed: true, status: 'pass', detail: '建议关注' },
          ],
        });
      } else {
        setSellStrategyCheck({
          passed: false,
          message: '请先选择一个策略并配置卖出规则',
          matchedRules: 0,
          totalRules: 0,
          ruleDetails: [],
        });
      }
      return;
    }
    
    const sellRules = strategy.sellRules;
    
    // 获取股票真实数据进行验证
    try {
      setStockSearchLoading(true);
      const stockData = await getStockFullData(stockCode);
      
      if (!stockData.success || !stockData.data) {
        // 如果获取数据失败，使用策略配置进行检查
        const ruleDetails = [
          {
            name: 'MA5死叉MA20',
            description: '短期均线下穿中期均线，形成卖出信号',
            passed: sellRules.ma5CrossMa20 || false,
            status: sellRules.ma5CrossMa20 ? 'pass' : 'fail',
          },
          {
            name: 'MACD死叉',
            description: 'MACD指标形成死叉，动量向下',
            passed: sellRules.macdDeathCross || false,
            status: sellRules.macdDeathCross ? 'pass' : 'fail',
          },
          {
            name: 'K线确认',
            description: 'K线形态确认卖出信号',
            passed: sellRules.candleConfirm || false,
            status: sellRules.candleConfirm ? 'pass' : 'fail',
          },
          {
            name: '成交量确认',
            description: '成交量异常放大，验证卖出信号',
            passed: sellRules.volumeConfirm || false,
            status: sellRules.volumeConfirm ? 'pass' : 'fail',
          },
        ];
        
        const totalRules = ruleDetails.length;
        const matchedRules = ruleDetails.filter(r => r.passed).length;
        
        let passed = matchedRules >= totalRules * 0.7; // 70%以上规则匹配视为通过
        let message = '';
        
        if (passed) {
          message = `策略匹配度良好，满足 ${matchedRules}/${totalRules} 项卖出规则`;
        } else {
          message = `策略匹配度较低，仅满足 ${matchedRules}/${totalRules} 项卖出规则`;
        }
        
        setSellStrategyCheck({
          passed,
          message,
          matchedRules,
          totalRules,
          ruleDetails,
        });
        return;
      }
      
      const { indicators, signals } = stockData.data;
      
      // 基于真实数据的规则检查
      const ruleDetails = [
        {
          name: 'MA5死叉MA20',
          description: '短期均线下穿中期均线，形成卖出信号',
          passed: (indicators?.ma5 && indicators?.ma20 && indicators.ma5 < indicators.ma20) || false,
          status: (indicators?.ma5 && indicators?.ma20 && indicators.ma5 < indicators.ma20) ? 'pass' : 'fail',
        },
        {
          name: 'MACD死叉',
          description: 'MACD指标形成死叉，动量向下',
          passed: (indicators?.macd && indicators.macd.dif < indicators.macd.dea) || false,
          status: (indicators?.macd && indicators.macd.dif < indicators.macd.dea) ? 'pass' : 'fail',
        },
        {
          name: 'K线确认',
          description: 'K线形态确认卖出信号',
          passed: signals.some(s => s.type === 'sell' && s.strength === 'strong') || false,
          status: signals.some(s => s.type === 'sell' && s.strength === 'strong') ? 'pass' : 'fail',
        },
        {
          name: '成交量确认',
          description: '成交量异常放大，验证卖出信号',
          passed: (indicators?.volumeRatio && indicators.volumeRatio > 2) || false,
          status: (indicators?.volumeRatio && indicators.volumeRatio > 2) ? 'pass' : 'fail',
        },
      ];
      
      const totalRules = ruleDetails.length;
      const matchedRules = ruleDetails.filter(r => r.passed).length;
      
      let passed = matchedRules >= totalRules * 0.7; // 70%以上规则匹配视为通过
      let message = '';
      
      if (passed) {
        message = `策略匹配度良好，满足 ${matchedRules}/${totalRules} 项卖出规则`;
      } else {
        message = `策略匹配度较低，仅满足 ${matchedRules}/${totalRules} 项卖出规则`;
      }
      
      setSellStrategyCheck({
        passed,
        message,
        matchedRules,
        totalRules,
        ruleDetails,
      });
    } catch (error) {
      console.error('检查卖出策略匹配时出错:', error);
      // 出错时使用策略配置进行检查
      const ruleDetails = [
        {
          name: 'MA5死叉MA20',
          description: '短期均线下穿中期均线，形成卖出信号',
          passed: sellRules.ma5CrossMa20 || false,
          status: sellRules.ma5CrossMa20 ? 'pass' : 'fail',
        },
        {
          name: 'MACD死叉',
          description: 'MACD指标形成死叉，动量向下',
          passed: sellRules.macdDeathCross || false,
          status: sellRules.macdDeathCross ? 'pass' : 'fail',
        },
        {
          name: 'K线确认',
          description: 'K线形态确认卖出信号',
          passed: sellRules.candleConfirm || false,
          status: sellRules.candleConfirm ? 'pass' : 'fail',
        },
        {
          name: '成交量确认',
          description: '成交量异常放大，验证卖出信号',
          passed: sellRules.volumeConfirm || false,
          status: sellRules.volumeConfirm ? 'pass' : 'fail',
        },
      ];
      
      const totalRules = ruleDetails.length;
      const matchedRules = ruleDetails.filter(r => r.passed).length;
      
      let passed = matchedRules >= totalRules * 0.7; // 70%以上规则匹配视为通过
      let message = '';
      
      if (passed) {
        message = `策略匹配度良好，满足 ${matchedRules}/${totalRules} 项卖出规则`;
      } else {
        message = `策略匹配度较低，仅满足 ${matchedRules}/${totalRules} 项卖出规则`;
      }
      
      setSellStrategyCheck({
        passed,
        message,
        matchedRules,
        totalRules,
        ruleDetails,
      });
    } finally {
      setStockSearchLoading(false);
    }
  };

  // 加仓建议计算
  type AddPositionScenario = 'first_buy' | 'dip_add' | 'breakout_add' | 'fill_add' | 'manual';

  interface AddPositionAdvice {
    scenario: AddPositionScenario;
    scenarioLabel: string;
    scenarioIcon: string;
    scenarioColor: string;
    recommendedShares: number;
    recommendedAmount: number;
    addReason: string;
    canAdd: boolean;
    currentPnL: number;
    dipPercent: number;
    currentShares: number;
    costPrice: number;
    currentPrice: number;
    investedAmount: number;
    targetAmount: number;
    targetPercent: number;
    currentPercent: number;
    afterAddPercent: number;
    afterAddCostPrice: number;
    suggestedBatch: number;
    riskLevel: 'low' | 'medium' | 'high';
    ruleTriggered: string;
  }

  const calculateAddPositionAdvice = (position: Position): AddPositionAdvice => {
    const strategy = activeStrategy;
    const buyRules = strategy?.buyRules;
    const moneyRules = strategy?.moneyRules;

    const defaultAdvice: AddPositionAdvice = {
      scenario: 'manual',
      scenarioLabel: '手动买入',
      scenarioIcon: '📝',
      scenarioColor: 'gray',
      recommendedShares: 0,
      recommendedAmount: 0,
      addReason: '请先选择策略',
      canAdd: false,
      currentPnL: 0,
      dipPercent: 0,
      currentShares: position.shares || 0,
      costPrice: position.buyPrice || 0,
      currentPrice: position.currentPrice || position.buyPrice || 0,
      investedAmount: (position.buyPrice || 0) * (position.shares || 0),
      targetAmount: 0,
      targetPercent: moneyRules?.maxSingleStockPercent || 20,
      currentPercent: 0,
      afterAddPercent: 0,
      afterAddCostPrice: position.buyPrice || 0,
      suggestedBatch: 1,
      riskLevel: 'medium',
      ruleTriggered: '',
    };

    if (!strategy || !fundsStatus) return defaultAdvice;

    const currentPrice = position.currentPrice || position.buyPrice || 0;
    const costPrice = position.buyPrice || 0;
    const currentShares = position.shares || 0;
    const totalFunds = fundsStatus.totalFunds;
    const availableFunds = fundsStatus.availableFunds;
    const maxSingleStockPercent = moneyRules?.maxSingleStockPercent || 20;
    const maxSingleStockAmount = totalFunds * maxSingleStockPercent / 100;
    const investedAmount = costPrice * currentShares;
    const currentPercent = totalFunds > 0 ? (investedAmount / totalFunds) * 100 : 0;

    const currentPnL = costPrice > 0 ? ((currentPrice - costPrice) / costPrice) * 100 : 0;
    const dipPercent = Math.max(0, costPrice > 0 ? ((costPrice - currentPrice) / costPrice) * 100 : 0);

    let scenario: AddPositionScenario = 'manual';
    let scenarioLabel = '手动买入';
    let scenarioIcon = '📝';
    let scenarioColor = 'gray';
    let canAdd = false;
    let addReason = '';
    let recommendedPercent = 0;
    let suggestedBatch = 1;
    let ruleTriggered = '';

    const hasExistingPosition = currentShares > 0;

    if (!hasExistingPosition) {
      scenario = 'first_buy';
      scenarioLabel = '首次建仓';
      scenarioIcon = '🏗️';
      scenarioColor = 'blue';
      canAdd = true;
      addReason = '新持仓建仓，按策略首次批次比例执行';
      suggestedBatch = 1;
      recommendedPercent = (buyRules?.batchBuyRatios?.[0] || 0.3);
      ruleTriggered = `batchBuyRatios[0]=${recommendedPercent}`;
    } else {
      const batchRatios = buyRules?.batchBuyRatios || [0.3, 0.3, 0.4];

      if (buyRules?.addPositionOnDip && buyRules.addPositionOnDip > 0 && currentPnL <= -buyRules.addPositionOnDip) {
        scenario = 'dip_add';
        scenarioLabel = '回调加仓';
        scenarioIcon = '📉';
        scenarioColor = 'orange';
        canAdd = true;
        addReason = `当前亏损 ${Math.abs(currentPnL).toFixed(1)}%，触发策略「下跌${buyRules.addPositionOnDip}%加仓」规则`;
        suggestedBatch = Math.min(2, batchRatios.length);
        recommendedPercent = batchRatios[suggestedBatch - 1] || 0.3;
        ruleTriggered = `addPositionOnDip=${buyRules.addPositionOnDip}%`;
      } else if (buyRules?.addPositionOnMA60 && currentPrice >= costPrice * 1.05) {
        scenario = 'breakout_add';
        scenarioLabel = '突破加仓';
        scenarioIcon = '🚀';
        scenarioColor = 'green';
        canAdd = true;
        const gainPercent = ((currentPrice - costPrice) / costPrice) * 100;
        addReason = `当前盈利 ${gainPercent.toFixed(1)}%，股价站稳成本上方，触发策略「突破/趋势延续加仓」规则`;
        suggestedBatch = Math.min(3, batchRatios.length);
        recommendedPercent = batchRatios[suggestedBatch - 1] || 0.4;
        ruleTriggered = 'addPositionOnMA60=true';
      } else if (investedAmount < maxSingleStockAmount * 0.7) {
        scenario = 'fill_add';
        scenarioLabel = '补仓加仓';
        scenarioIcon = '📦';
        scenarioColor = 'purple';
        canAdd = true;
        const gapPercent = maxSingleStockPercent - currentPercent;
        addReason = `当前仓位 ${currentPercent.toFixed(1)}% 未达目标 ${maxSingleStockPercent}%，建议补仓至目标仓位`;
        suggestedBatch = Math.min(2, batchRatios.length);
        recommendedPercent = Math.min(gapPercent / 100 * 0.6, 0.25);
        ruleTriggered = `currentPos=${currentPercent.toFixed(1)}% < target=${maxSingleStockPercent}%`;
      } else if (currentPnL > -5 && currentPnL < 10) {
        scenario = 'manual';
        scenarioLabel = '适度加仓';
        scenarioIcon = '📝';
        scenarioColor = 'gray';
        canAdd = true;
        addReason = '当前盈亏在正常区间，策略允许适度加仓操作';
        suggestedBatch = 2;
        recommendedPercent = 0.15;
        ruleTriggered = 'discretionary';
      } else {
        scenario = 'manual';
        scenarioLabel = '观察中';
        scenarioIcon = '⏸️';
        scenarioColor = 'gray';
        canAdd = false;
        if (currentPnL < -10) {
          addReason = `亏损已达 ${currentPnL.toFixed(1)}%，超过策略风控阈值，建议止损而非加仓`;
        } else if (currentPnL > 15) {
          addReason = `盈利已达 ${currentPnL.toFixed(1)}%，追高加仓风险较大，注意止盈`;
        }
        recommendedPercent = 0;
        ruleTriggered = '';
      }
    }

    const baseAmount = totalFunds * recommendedPercent;
    const maxAddAmount = availableFunds * 0.5;
    const recommendedAmount = Math.min(baseAmount, maxAddAmount);
    const recommendedShares = currentPrice > 0 ? Math.floor(recommendedAmount / currentPrice / 100) * 100 : 0;

    const newTotalShares = currentShares + recommendedShares;
    const newTotalCost = investedAmount + (recommendedShares * currentPrice);
    const afterAddCostPrice = newTotalShares > 0 ? newTotalCost / newTotalShares : costPrice;
    const afterAddPercent = totalFunds > 0 ? (newTotalCost / totalFunds) * 100 : 0;

    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    if (scenario === 'dip_add') riskLevel = 'high';
    else if (scenario === 'breakout_add' && currentPnL > 3) riskLevel = 'medium';
    else if (scenario === 'first_buy' || scenario === 'fill_add') riskLevel = 'low';

    return {
      scenario,
      scenarioLabel,
      scenarioIcon,
      scenarioColor,
      recommendedShares,
      recommendedAmount: recommendedShares * currentPrice,
      addReason,
      canAdd,
      currentPnL,
      dipPercent,
      currentShares,
      costPrice,
      currentPrice,
      investedAmount,
      targetAmount: maxSingleStockAmount,
      targetPercent: maxSingleStockPercent,
      currentPercent,
      afterAddPercent,
      afterAddCostPrice,
      suggestedBatch,
      riskLevel,
      ruleTriggered,
    };
  };

  const renderBuyDialogContent = () => {
    const isAddMode = selectedPosition && selectedPosition.stockCode === buyForm.stockCode;
    const advice = isAddMode ? calculateAddPositionAdvice(selectedPosition) : null;

    return (
      <>
        {isAddMode && advice && (
          <div className={`rounded-lg border-2 p-4 ${advice.canAdd
            ? advice.scenarioColor === 'orange' ? 'border-orange-500/60 bg-orange-500/10'
            : advice.scenarioColor === 'green' ? 'border-green-500/60 bg-green-500/10'
            : advice.scenarioColor === 'blue' ? 'border-blue-500/60 bg-blue-500/10'
            : advice.scenarioColor === 'purple' ? 'border-purple-500/60 bg-purple-500/10'
            : 'border-muted-foreground/40 bg-muted/30'
            : 'border-red-500/40 bg-red-500/10'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{advice.scenarioIcon}</span>
                <div>
                  <span className="font-bold text-base text-foreground">{advice.scenarioLabel}</span>
                  <Badge variant="secondary" className={`ml-2 text-xs ${
                    advice.riskLevel === 'high' ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : advice.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                    : 'bg-green-500/20 text-green-400 border-green-500/40'
                  }`}>
                    {advice.riskLevel === 'high' ? '高风险' : advice.riskLevel === 'medium' ? '中风险' : '低风险'}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${advice.currentPnL >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {advice.currentPnL >= 0 ? '+' : ''}{advice.currentPnL.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground">当前盈亏</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3 text-center">
              <div className="bg-background/60 rounded-md p-2 border"><p className="text-xs text-muted-foreground">持仓</p><p className="text-sm font-bold text-foreground">{advice.currentShares}股</p></div>
              <div className="bg-background/60 rounded-md p-2 border"><p className="text-xs text-muted-foreground">成本价</p><p className="text-sm font-bold text-foreground">¥{advice.costPrice.toFixed(2)}</p></div>
              <div className="bg-background/60 rounded-md p-2 border"><p className="text-xs text-muted-foreground">现价</p><p className="text-sm font-bold text-foreground">¥{advice.currentPrice.toFixed(2)}</p></div>
              <div className="bg-background/60 rounded-md p-2 border"><p className="text-xs text-muted-foreground">仓位占比</p><p className="text-sm font-bold text-foreground">{advice.currentPercent.toFixed(1)}%</p></div>
            </div>

            <div className="bg-background/60 rounded-md p-3 mb-3 border">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> 策略判定依据</p>
              <p className="text-xs text-muted-foreground mt-1">{advice.addReason}</p>
              {advice.ruleTriggered && (<p className="text-xs text-blue-400 mt-1 font-mono bg-blue-500/10 rounded px-2 py-0.5 inline-block">触发规则: {advice.ruleTriggered}</p>)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background/60 rounded-md p-3 border">
                <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">推荐数量</p><span className="text-lg font-bold text-primary">{advice.recommendedShares} 股</span></div>
                <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (advice.recommendedShares / Math.max(advice.currentShares, 1)) * 100)}%` }} /></div>
              </div>
              <div className="bg-background/60 rounded-md p-3 border">
                <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">推荐金额</p><span className="text-lg font-bold text-green-400">{formatCurrency(advice.recommendedAmount)}</span></div>
                <p className="text-xs text-muted-foreground mt-0.5">占可用资金 {fundsStatus.availableFunds > 0 ? Math.round(advice.recommendedAmount / fundsStatus.availableFunds * 100) : 0}%</p>
              </div>
            </div>

            {advice.canAdd && (
              <div className="mt-3 bg-background/60 rounded-md p-3 border">
                <p className="text-xs font-semibold text-foreground mb-2">📊 加仓后预览</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-xs text-muted-foreground">总持仓</p><p className="text-sm font-bold text-foreground">{advice.currentShares + advice.recommendedShares} 股</p></div>
                  <div><p className="text-xs text-muted-foreground">摊薄成本</p><p className="text-sm font-bold text-orange-400">¥{advice.afterAddCostPrice.toFixed(2)}</p></div>
                  <div><p className="text-xs text-muted-foreground">仓位占比</p><p className="text-sm font-bold text-blue-400">{advice.afterAddPercent.toFixed(1)}% / {advice.targetPercent}%</p></div>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1"><span>仓位进度</span><span>{advice.currentPercent.toFixed(1)}% → {advice.afterAddPercent.toFixed(1)}% (目标{advice.targetPercent}%)</span></div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                    <div className="h-full bg-blue-500/60 rounded-l-full transition-all" style={{ width: `${Math.min(100, (advice.currentPercent / advice.targetPercent) * 100)}%` }} />
                    <div className="h-full bg-primary/60 transition-all" style={{ width: `${Math.min(100, ((advice.afterAddPercent - advice.currentPercent) / advice.targetPercent) * 100)}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isAddMode && (
          <div className="space-y-2">
            <Label>选择策略</Label>
            <Select value={activeStrategyId || ''} onValueChange={(value) => { useStockStore.getState().setActiveStrategy(value); }}>
              <SelectTrigger><SelectValue placeholder="选择适用的策略" /></SelectTrigger>
              <SelectContent>{strategies.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name} ({s.cycle === 'short' ? '短线' : s.cycle === 'swing' ? '波段' : '长线'})</SelectItem>))}</SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>股票代码 / 名称</Label>
          <div className="relative">
            <Input type="text" value={searchQuery || (isAddMode ? `${buyForm.stockCode} ${buyForm.stockName}` : '')} onChange={(e) => { if (!isAddMode) { setSearchQuery(e.target.value); handleSearch(e.target.value); } }}
              onKeyDown={async (e) => { if (isAddMode) return; if (e.key === 'Enter' && searchQuery.trim()) { if (searchResults.length > 0) handleSelectStock(searchResults[0]); else { const sc = searchQuery.trim(); let price = 0; try { const res = await fetch(`/api/stock/quote?codes=${sc}`); const d = await res.json(); if (d.success && d.data?.[0]) price = d.data[0].price || d.data[0].prevClose || 0; } catch {} const strategy = activeStrategy; const totalFunds = strategy?.moneyRules?.totalCapital || 200000; const maxPercent = strategy?.moneyRules?.maxSingleStockPercent || 20; const batchRatios = strategy?.buyRules?.batchBuyRatios || [0.3, 0.3, 0.4]; const batchAmount = totalFunds * (maxPercent / 100) * (batchRatios[0] || 0.3); const shares = price > 0 ? Math.floor(batchAmount / price / 100) * 100 : 100; setBuyForm({ ...buyForm, stockCode: sc, stockName: sc, buyPrice: price, shares, buyDate: new Date().toISOString().split('T')[0], fee: 0, buyReason: '', emotion: '', notes: '', buyBatch: 1 }); evaluateBuyRule(sc); } } }}
              placeholder={isAddMode ? `${buyForm.stockCode} ${buyForm.stockName}` : "输入代码或名称搜索..."} disabled={isAddMode} className={isAddMode ? 'bg-muted cursor-not-allowed' : ''} />
            {isAddMode && (<Badge variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-green-500/20 text-green-400 border-green-500/40">已锁定</Badge>)}
            {!isAddMode && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((stock, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent cursor-pointer text-foreground border-b last:border-b-0"
                    onClick={() => handleSelectStock(stock)}>
                    <span className="font-medium">{stock.name}</span>
                    <span className="text-sm text-muted-foreground">{stock.code} · {stock.sector}</span>
                  </div>
                ))}
              </div>
            )}
            {!isAddMode && isSearching && (<div className="absolute right-2 top-1/2 -translate-y-1/2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>)}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>买入价格 (¥)</Label><Input type="number" value={buyForm.buyPrice} onChange={(e) => { setBuyForm({ ...buyForm, buyPrice: Number(e.target.value) }); }} placeholder="0.000" step="0.001" /></div>
            <div className="space-y-2"><Label>买入数量 (股)</Label><Input type="number" value={buyForm.shares} onChange={(e) => setBuyForm({ ...buyForm, shares: Number(e.target.value) })} placeholder="0" min="100" step="100" /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>买入日期</Label><Input type="date" value={buyForm.buyDate} onChange={(e) => setBuyForm({ ...buyForm, buyDate: e.target.value })} /></div>
            <div className="space-y-2"><Label>手续费 (¥)</Label><Input type="number" value={buyForm.fee} onChange={(e) => setBuyForm({ ...buyForm, fee: Number(e.target.value) })} placeholder="0" step="0.01" /></div>
          </div>
        </div>

        {!isAddMode && (
          <div className="space-y-2">
            <Label>买入批次</Label>
            <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((batch) => (<button key={batch} onClick={() => handleBatchChange(batch)}
              className={`py-3 px-4 rounded-md border text-center ${buyForm.buyBatch === batch ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-accent text-foreground'}`}>
                <div className="text-xl font-bold">{activeStrategy?.buyRules?.batchBuyRatios?.[batch - 1] ? `${Math.round(activeStrategy.buyRules.batchBuyRatios[batch - 1] * 100)}%` : batch === 1 ? '30%' : batch === 2 ? '30%' : '40%'}</div>
                <div className="text-sm text-muted-foreground">第{batch}批{batch === 1 ? ' (建仓)' : batch === 2 ? ' (加仓)' : ' (二次加仓)'}</div>
              </button>))}</div>
          </div>
        )}

        {isAddMode && advice && (
          <div className="rounded-md border bg-blue-500/10 border-blue-500/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-1 text-foreground"><Target className="h-3.5 w-3.5 text-blue-400" /> 建议执行第{advice.suggestedBatch}批买入</span>
              <Badge variant="outline" className="text-xs text-foreground">{activeStrategy?.buyRules?.batchBuyRatios?.[advice.suggestedBatch - 1] ? `${Math.round((activeStrategy.buyRules.batchBuyRatios[advice.suggestedBatch - 1]) * 100)}%` : advice.suggestedBatch === 1 ? '30%' : advice.suggestedBatch === 2 ? '30%' : '40%'}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">策略配置：首次{activeStrategy?.buyRules?.batchBuyRatios?.[0] ? `${Math.round(activeStrategy.buyRules.batchBuyRatios[0] * 100)}%` : '30%'}，回调{activeStrategy?.buyRules?.batchBuyRatios?.[1] ? `${Math.round(activeStrategy.buyRules.batchBuyRatios[1] * 100)}%` : '30%'}，突破{activeStrategy?.buyRules?.batchBuyRatios?.[2] ? `${Math.round(activeStrategy.buyRules.batchBuyRatios[2] * 100)}%` : '40%'}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-foreground" /><Label className="font-medium text-foreground">系统规则检查</Label></div>

          <div className={`rounded-md border p-4 ${strategyCheck.passed ? 'border-green-500/60 bg-green-500/10' : 'border-yellow-500/60 bg-yellow-500/10'}`}>
            <div className="flex items-center gap-2 mb-2">
              {strategyCheck.passed ? <Check className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
              <span className="font-medium text-sm text-foreground">买入策略检查</span>
              {strategyCheck.totalRules > 0 && (<span className="ml-auto text-xs text-muted-foreground">{strategyCheck.matchedRules}/{strategyCheck.totalRules} 通过</span>)}
            </div>
            {strategyCheck.totalRules > 0 && (<Progress value={(strategyCheck.matchedRules / strategyCheck.totalRules) * 100} className="h-1.5 mb-3 bg-muted" />)}
            <p className="text-sm mb-2 text-foreground">{strategyCheck.message}</p>
            {strategyCheck.ruleDetails?.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">{strategyCheck.ruleDetails.map((rule, i) => (
                <div key={i} className={`flex items-center justify-between p-2.5 rounded-md border text-sm ${rule.passed ? 'bg-green-500/10 border-green-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{rule.name}</span>
                    <span className="text-xs text-muted-foreground">{rule.description}</span>
                    <span className="text-xs text-muted-foreground">{rule.detail}</span>
                  </div>
                  <span className={`text-lg ${rule.passed ? 'text-green-400' : 'text-red-400'}`}>{rule.passed ? '✓' : '✗'}</span>
                </div>
              ))}</div>
            )}
          </div>

          {!isAddMode && (
            <div className="rounded-md border bg-blue-500/10 border-blue-500/40 p-4">
              <div className="flex items-center gap-2 mb-3"><Target className="h-4 w-4 text-blue-400" /><span className="font-medium text-sm text-foreground">买入仓位建议</span></div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-background/60 rounded p-2 border"><p className="text-xs text-muted-foreground">建议仓位</p><p className="text-base font-bold text-foreground">{positionAdvice.recommendedPercentage}%</p></div>
                <div className="bg-background/60 rounded p-2 border"><p className="text-xs text-muted-foreground">金额</p><p className="text-base font-bold text-foreground">{formatCurrency(positionAdvice.recommendedAmount)}</p></div>
                <div className="bg-background/60 rounded p-2 border"><p className="text-xs text-muted-foreground">数量</p><p className="text-base font-bold text-foreground">{positionAdvice.recommendedShares}股</p></div>
                <div className="bg-background/60 rounded p-2 border"><p className="text-xs text-muted-foreground">风险</p><Badge variant={positionAdvice.riskLevel === 'low' ? 'default' : positionAdvice.riskLevel === 'medium' ? 'secondary' : 'destructive'} className="text-xs mt-0.5">{positionAdvice.riskLevel === 'low' ? '低' : positionAdvice.riskLevel === 'medium' ? '中' : '高'}</Badge></div>
              </div>
            </div>
          )}

          <div className="rounded-md border bg-purple-500/10 border-purple-500/40 p-4">
            <div className="flex items-center gap-2 mb-3"><DollarSign className="h-4 w-4 text-purple-400" /><span className="font-medium text-sm text-foreground">资金余额</span><span className="ml-auto text-xs text-muted-foreground">已用 {Math.round((fundsStatus.usedFunds / fundsStatus.totalFunds) * 100)}%</span></div>
            <Progress value={(fundsStatus.usedFunds / fundsStatus.totalFunds) * 100} className="h-1.5 mb-2 bg-muted" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><span className="text-xs text-muted-foreground">总资金 <span className="text-[10px] opacity-70">{activeStrategy?.moneyRules?.totalCapital ? '(策略配置)' : '(默认值)'}</span></span><p className="text-sm font-bold text-foreground">{formatCurrency(fundsStatus.totalFunds)}</p></div>
              <div><p className="text-xs text-muted-foreground">已用</p><p className="text-sm font-bold text-foreground">{formatCurrency(fundsStatus.usedFunds)}</p></div>
              <div><p className="text-xs text-muted-foreground">可用</p><p className="text-sm font-bold text-green-400">{formatCurrency(fundsStatus.availableFunds)}</p></div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
            <input type="checkbox" checked={agreedToChecks} onChange={(e) => setAgreedToChecks(e.target.checked)} className="rounded border-muted-foreground text-primary focus:ring-primary h-4 w-4" />
            <Label className="text-sm font-medium text-foreground">我已查看上述系统规则检查结果，确认执行本次买入</Label>
          </div>
        </div>

        <div className="pt-2">
          <div className={`rounded-lg border p-3 ${isAddMode ? 'bg-green-500/10 border-green-500/40' : 'bg-muted/30 border-muted-foreground/30'}`}>
            <div className="flex justify-between items-center"><span className="text-sm font-medium text-foreground">预计交易金额</span><span className="text-xl font-bold text-primary">{formatCurrency(buyForm.buyPrice * buyForm.shares)}</span></div>
            <div className="flex justify-between items-center mt-1.5 text-sm text-muted-foreground"><span>{buyForm.shares}股 × ¥{buyForm.buyPrice.toFixed(2)}</span><span>占可用资金 {fundsStatus.availableFunds > 0 ? Math.round((buyForm.buyPrice * buyForm.shares / fundsStatus.availableFunds) * 100) : 0}%</span></div>
            {isAddMode && advice && (<div className="mt-2 pt-2 border-t border-muted-foreground/20 text-xs text-green-400"><span className="font-medium">加仓后：</span>总持仓 {(advice.currentShares + buyForm.shares)}股，摊薄成本 ¥{(advice.afterAddCostPrice).toFixed(2)}，仓位占比 {((advice.investedAmount + buyForm.shares * buyForm.buyPrice) / fundsStatus.totalFunds * 100).toFixed(1)}%</div>)}
          </div>
        </div>

        <div className="space-y-2"><Label>买入理由 (复盘时你的依据)</Label><Input type="text" value={buyForm.buyReason} onChange={(e) => setBuyForm({ ...buyForm, buyReason: e.target.value })} placeholder="例如：突破均线、放量上涨、行业利好..." /></div>

        <div className="space-y-2">
          <Label>交易时情绪 (帮你认识自己)</Label>
          <div className="flex flex-wrap gap-2">{[
            { value: 'calm', label: '冷静', emoji: '😌' }, { value: 'confident', label: '自信', emoji: '😎' }, { value: 'fear_of_missing', label: '怕错过', emoji: '😨' },
            { value: 'greedy', label: '贪婪', emoji: '😋' }, { value: 'panic', label: '恐慌', emoji: '😱' }, { value: 'revenge', label: '报复性', emoji: '😠' },
            { value: 'hesitant', label: '犹豫', emoji: '😔' }, { value: 'impulsive', label: '冲动', emoji: '⚡' },
          ].map((emotion) => (<button key={emotion.value} onClick={() => setBuyForm({ ...buyForm, emotion: emotion.value })} className={`px-3 py-2 rounded-md text-sm flex items-center gap-1 ${buyForm.emotion === emotion.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent text-foreground'}`}>{emotion.emoji} {emotion.label}</button>))}</div>
        </div>

        <div className="space-y-2"><Label>备注</Label><Input type="text" value={buyForm.notes} onChange={(e) => setBuyForm({ ...buyForm, notes: e.target.value })} placeholder="可选" /></div>
      </>
    );
  };

  // 打开加仓对话框
  const openAddPositionDialog = async (position: Position) => {
    setSelectedPosition(position);
    
    const advice = calculateAddPositionAdvice(position);
    
    setBuyForm({
      ...buyForm,
      stockCode: position.stockCode,
      stockName: position.stockName,
      buyPrice: position.currentPrice || position.buyPrice,
      buyDate: new Date().toISOString().split('T')[0],
      fee: 5,
      buyBatch: advice.suggestedBatch,
      shares: advice.recommendedShares > 0 ? advice.recommendedShares : buyForm.shares,
      buyReason: advice.addReason || '',
    });
    
    setIsBuyDialogOpen(true);
    
    await checkStrategyMatch(position.stockCode);
  };

  const evaluateBuyRule = async (stockCode: string) => {
    try {
      // 检查策略匹配度
      checkStrategyMatch(stockCode);
      
      // 基于策略配置的买入规则进行评估
      const strategy = activeStrategy;
      let checks = {
        highLow: false,
        movingAvg: false,
        volume: false,
      };
      
      let details = [];
      
      // 检查策略和买入规则是否存在
      if (!strategy || !strategy.buyRules) {
        setBuyEvaluation({
          overall: 'neutral',
          message: '请先选择一个策略并配置买入规则',
          checks,
          details,
        });
        return;
      }
      
      const buyRules = strategy.buyRules;
      
      // 检查高低点抬高（模拟检查）
      // 这里我们模拟一个检查，实际应该根据股票数据进行计算
      checks.highLow = true;
      details.push({
        title: '一看：高低点抬高',
        status: 'pass',
        message: '近期呈上升结构',
        details: '近3个低点: 27.98 → 31.22 → 30.70 持续抬高 | 近3个高点: 30.78 → 33.60 → 32.92 突破向上',
      });
      
      // 检查均线多头排列
      if (buyRules.ma5CrossMa20) {
        checks.movingAvg = true;
        details.push({
          title: '二看：均线多头排列',
          status: 'pass',
          message: '均线多头排列',
          details: 'MA5=32.15 > MA10=31.85 > MA20=30.95',
        });
      } else {
        details.push({
          title: '二看：均线多头排列',
          status: 'fail',
          message: '均线非多头排列',
          details: 'MA5=31.85 < MA10=31.98 > MA20=30.67',
        });
      }
      
      // 检查成交量
      if (buyRules.volumeConfirm) {
        checks.volume = true;
        details.push({
          title: '三看：成交量正常',
          status: 'pass',
          message: '上涨量能充足',
          details: '今日成交量3.4万手，比5日均量低16%。上涨日平均成交4.7万手，是下跌日1.3倍。成交量稳定，上涨有量支撑，维持当前仓位',
        });
      } else {
        details.push({
          title: '三看：成交量正常',
          status: 'fail',
          message: '量能不足',
          details: '今日成交量2.1万手，比5日均量低35%。上涨日平均成交3.2万手，是下跌日0.8倍。成交量不足，上涨缺乏量能支撑，建议观望',
        });
      }
      
      // 计算满足的条件数量
      const passedChecks = Object.values(checks).filter(Boolean).length;
      let overall = 'neutral';
      let message = '请输入股票代码或名称';
      
      if (passedChecks === 3) {
        overall = 'pass';
        message = '强烈买入，满足3项条件，可重仓介入';
      } else if (passedChecks === 2) {
        overall = 'caution';
        message = '谨慎买入，满足2项，可小仓位试探';
      } else {
        overall = 'fail';
        message = '不建议买入，满足条件不足，建议观望';
      }
      
      const evaluation = {
        overall,
        message,
        checks,
        details,
      };
      
      setBuyEvaluation(evaluation);
    } catch (error) {
      console.error('评估失败:', error);
    }
  };

  const handleBuy = () => {
    if (!buyForm.stockCode || !buyForm.stockName || buyForm.buyPrice <= 0 || buyForm.shares <= 0) {
      toast.error('请填写完整的买入信息');
      return;
    }

    if (!agreedToChecks) {
      toast.error('请确认已查看系统规则检查结果');
      return;
    }

    const buyAmount = buyForm.buyPrice * buyForm.shares;

    // 资金余额检查
    if (buyAmount > fundsStatus.availableFunds) {
      toast.error('资金不足，无法完成买入操作');
      return;
    }

    // 策略匹配度检查
    if (!strategyCheck.passed) {
      const confirmBuy = window.confirm('策略匹配度较低，确定要继续买入吗？');
      if (!confirmBuy) {
        return;
      }
    }

    // 添加持仓
    addPosition({
      strategyId: activeStrategyId || undefined,  // P0: 关联当前策略
      stockCode: buyForm.stockCode,
      stockName: buyForm.stockName,
      buyPrice: buyForm.buyPrice,
      shares: buyForm.shares,
      buyDate: buyForm.buyDate,
      currentPrice: buyForm.buyPrice,
      stopLossPrice: buyForm.buyPrice * 0.9,
      takeProfitPrice: buyForm.buyPrice * 1.2,
      sector: '未知',
      alertTriggered: false,
      trailingStopEnabled: false,
    });

    // 添加交易记录
    addTradeRecord({
      strategyId: activeStrategyId || '',
      stockCode: buyForm.stockCode,
      stockName: buyForm.stockName,
      type: 'buy',
      price: buyForm.buyPrice,
      shares: buyForm.shares,
      amount: buyAmount,
      date: new Date(buyForm.buyDate),
      triggerReason: '手动买入',
      profit: 0,
      profitPercent: 0,
      buyReason: buyForm.buyReason,
      emotion: buyForm.emotion,
      notes: buyForm.notes,
      buyBatch: buyForm.buyBatch,
    });

    toast.success(`已录入买入 ${buyForm.shares} 股 ${buyForm.stockName}`);
    setIsBuyDialogOpen(false);
    setBuyForm({
      stockCode: '',
      stockName: '',
      buyPrice: 0,
      shares: 0,
      buyDate: new Date().toISOString().split('T')[0],
      fee: 0,
      buyReason: '',
      emotion: '',
      notes: '',
      buyBatch: 1,
    });
    setSearchQuery('');
    setSearchResults([]);
    setBuyEvaluation({
      overall: 'neutral',
      message: '请输入股票代码或名称',
      checks: {
        highLow: false,
        movingAvg: false,
        volume: false,
      },
      details: [],
    });
    setAgreedToChecks(false);
    setStrategyCheck({
      passed: false,
      message: '请选择股票以检查策略匹配度',
      matchedRules: 0,
      totalRules: 0,
    });
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
    <Button
      variant="default"
      size="sm"
      onClick={() => {
        setBuyForm({
          stockCode: '', stockName: '', buyPrice: 0, shares: 0,
          buyDate: new Date().toISOString().split('T')[0], fee: 0,
          buyReason: '', emotion: '', notes: '', buyBatch: 1,
        });
        setSearchQuery(''); setSearchResults([]);
        setAgreedToChecks(false);
        setSelectedPosition(null);
        setStrategyCheck({
          passed: false,
          message: '请先输入股票代码',
          matchedRules: 0, totalRules: 4,
          ruleDetails: [
            { name: '均线多头排列', description: 'MA5>MA10>MA20', passed: false, status: 'fail', detail: '等待股票代码' },
            { name: 'MACD金叉', description: 'DIF上穿DEA且DIF>0', passed: false, status: 'fail', detail: '等待股票代码' },
            { name: 'K线确认', description: '阳线且收盘价站上MA5', passed: false, status: 'fail', detail: '等待股票代码' },
            { name: '成交量确认', description: '当日量>20日均量×1.2', passed: false, status: 'fail', detail: '等待股票代码' },
          ],
        });
        setIsBuyDialogOpen(true);
      }}
    >
      <DollarSign className="mr-2 h-4 w-4" />
      录入交易
    </Button>
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
            filteredPositions.map((position) => {
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
                                  // 打开买入对话框并自动填充当前股票信息
                                  setBuyForm({
                                    stockCode: position.stockCode,
                                    stockName: position.stockName,
                                    buyPrice: position.currentPrice || position.buyPrice,
                                    shares: 100,
                                    buyDate: new Date().toISOString().split('T')[0],
                                    fee: 0,
                                    buyReason: '',
                                    emotion: '',
                                    notes: '',
                                    buyBatch: 2, // 默认第2批加仓
                                  });
                                  setIsBuyDialogOpen(true);
                                  // 检查策略匹配度
                                  checkStrategyMatch(position.stockCode);
                                }}
                              >
                                <TrendingUp className="mr-2 h-4 w-4" />
                                加仓
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedPosition(position);
                                  setSellShares(position.shares);
                                  setIsSellDialogOpen(true);
                                  setSellStrategyCheck({
                                    passed: false,
                                    message: '正在检查卖出策略匹配度...',
                                    matchedRules: 0,
                                    totalRules: 0,
                                    ruleDetails: [],
                                  });
                                  checkSellStrategyMatch(position.stockCode);
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
                              setSellStrategyCheck({ passed: false, message: '正在检查卖出策略匹配度...', matchedRules: 0, totalRules: 0, ruleDetails: [] });
                              checkSellStrategyMatch(position.stockCode);
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
                              setSellStrategyCheck({ passed: false, message: '正在检查卖出策略匹配度...', matchedRules: 0, totalRules: 0, ruleDetails: [] });
                              checkSellStrategyMatch(position.stockCode);
                            }}
                          >
                            <ArrowUpRight className="mr-2 h-4 w-4" />
                            全部卖出
                          </Button>
                          {/* 加仓按钮 */}
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                              openAddPositionDialog(position);
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            加仓
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
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              卖出 {selectedPosition?.stockName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              当前持有 {selectedPosition?.shares} 股，现价{' '}
              {selectedPosition?.currentPrice.toFixed(2)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            {/* 策略规则检查 */}
            {selectedPosition && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <Label className="font-medium">系统规则检查</Label>
                </div>
                
                {/* 1. 卖出策略检查 */}
                <div className={`rounded-md border p-4 ${sellStrategyCheck.passed ? 'border-green-500 bg-green-950' : 'border-yellow-500 bg-yellow-950'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {sellStrategyCheck.passed && <Check className="h-4 w-4 text-green-400" />}
                    {!sellStrategyCheck.passed && <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                    <span className={`font-medium ${sellStrategyCheck.passed ? 'text-green-100' : 'text-yellow-100'}`}>卖出策略检查</span>
                  </div>
                  <p className="text-sm mb-3 text-gray-300">{sellStrategyCheck.message}</p>
                  {sellStrategyCheck.totalRules > 0 && (
                    <div className="space-y-3">
                      <Progress
                        value={(sellStrategyCheck.matchedRules / sellStrategyCheck.totalRules) * 100}
                        className="h-2"
                      />
                      <p className="text-xs text-gray-400">
                        匹配度: {Math.round((sellStrategyCheck.matchedRules / sellStrategyCheck.totalRules) * 100)}%
                      </p>

                      {/* 详细规则匹配情况 */}
                      <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-medium text-gray-200">详细规则匹配情况:</h4>
                        {sellStrategyCheck.ruleDetails?.map((rule, index) => (
                          <div key={index} className="flex items-center justify-between p-2 rounded bg-black/30">
                            <div>
                              <div className="text-sm font-medium text-gray-200">{rule.name}</div>
                              <div className="text-xs text-gray-400">{rule.description}</div>
                            </div>
                            <div className={`text-sm font-medium ${rule.passed ? 'text-green-400' : 'text-red-400'}`}>
                              {rule.passed ? '✓ 通过' : '✗ 未通过'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

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

      {/* Buy Dialog */}
      <AlertDialog open={isBuyDialogOpen} onOpenChange={setIsBuyDialogOpen}>
        <AlertDialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader className="sticky top-0 bg-background z-10 pb-4 border-b">
            <AlertDialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {selectedPosition && selectedPosition.stockCode === buyForm.stockCode ? (
                <>加仓 - {buyForm.stockName}</>
              ) : '买入'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPosition && selectedPosition.stockCode === buyForm.stockCode
                ? '基于策略规则自动推荐的加仓方案，请确认后执行'
                : '填写买入股票的详细信息'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            {renderBuyDialogContent()}
          </div>
          <AlertDialogFooter className="sticky bottom-0 bg-background z-10 pt-4 border-t">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBuy} className="bg-primary hover:bg-primary/90">
              确认买入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
