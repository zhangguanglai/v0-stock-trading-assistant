// 股票池自动刷新Hook
// 交易时段(9:30-15:00)每30秒自动刷新，非交易时段不刷新
// 提供手动刷新功能

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WatchlistStock } from '@/lib/types';

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

// 获取距离下一个交易时段的分钟数（用于非交易时段倒计时）
function getNextTradingTimeMinutes(): number | null {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 100 + minute;
  
  // 周末
  if (day === 0) return (24 - hour) * 60 - minute + 9 * 60 + 30; // 到下周一9:30
  if (day === 6) return (24 - hour) * 60 - minute + 9 * 60 + 30; // 到下周一9:30
  
  // 工作日但非交易时段
  if (time < 930) return (9 * 60 + 30) - (hour * 60 + minute); // 到9:30
  if (time >= 1135 && time < 1300) return (13 * 60) - (hour * 60 + minute); // 到13:00
  if (time >= 1505) return (24 - hour) * 60 - minute + 9 * 60 + 30; // 到次日9:30
  
  return null; // 交易时段
}

export interface UseStockPoolRefreshReturn {
  isRefreshing: boolean;
  lastUpdateTime: Date | null;
  isTradingHours: boolean;
  nextRefreshTime: Date | null; // 下次自动刷新时间
  refresh: () => Promise<void>;
}

export function useStockPoolRefresh(
  watchlist: WatchlistStock[],
  onRefresh: (updatedStocks: Partial<WatchlistStock>[]) => void
): UseStockPoolRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [nextRefreshTime, setNextRefreshTime] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const watchlistRef = useRef<WatchlistStock[]>(watchlist);
  const onRefreshRef = useRef<(updatedStocks: Partial<WatchlistStock>[]) => void>(onRefresh);

  // 更新 ref 以跟踪最新的 watchlist 和 onRefresh
  useEffect(() => {
    watchlistRef.current = watchlist;
  }, [watchlist]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const refresh = useCallback(async () => {
    const systemStocks = watchlistRef.current.filter(s => s.isSystemPick && s.currentPrice > 0);
    if (systemStocks.length === 0) return;

    setIsRefreshing(true);
    try {
      const sinaCodes = systemStocks.map(s => {
        if (s.stockCode.startsWith('6') || s.stockCode.startsWith('9')) return `sh${s.stockCode}`;
        if (s.stockCode.startsWith('0') || s.stockCode.startsWith('3')) return `sz${s.stockCode}`;
        if (s.stockCode.startsWith('4') || s.stockCode.startsWith('8')) return `bj${s.stockCode}`;
        return `sh${s.stockCode}`;
      });

      const response = await fetch(`/api/stock/quote?codes=${sinaCodes.join(',')}`);
      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        const updatedStocks: Partial<WatchlistStock>[] = [];
        for (const quote of result.data) {
          const code = quote.code.replace(/^(sh|sz|bj)/i, '');
          const stock = systemStocks.find(s => s.stockCode === code);
          if (stock && quote.price > 0) {
            updatedStocks.push({
              id: stock.id,
              currentPrice: quote.price,
              changePercent: quote.changePercent,
            });
          }
        }
        if (updatedStocks.length > 0) {
          onRefreshRef.current(updatedStocks);
          setLastUpdateTime(new Date());
        }
      }
    } catch (err) {
      console.error('[StockPoolRefresh] 刷新失败:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []); // 空依赖数组，因为使用了 ref

  // 自动刷新逻辑
  useEffect(() => {
    const systemStockCount = watchlistRef.current.filter(s => s.isSystemPick).length;
    if (systemStockCount === 0) return;

    const setupAutoRefresh = () => {
      // 清除旧定时器
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      const trading = isTradingHours();
      
      if (trading) {
        // 交易时段：设置30秒刷新
        refresh();
        intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
        // 计算下次刷新时间
        setNextRefreshTime(new Date(Date.now() + REFRESH_INTERVAL));
      } else {
        // 非交易时段：设置倒计时检查
        const checkNextTrading = () => {
          if (isTradingHours()) {
            // 进入交易时段，开始自动刷新
            refresh();
            intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
            setNextRefreshTime(new Date(Date.now() + REFRESH_INTERVAL));
          } else {
            // 更新下次交易时间
            const nextMin = getNextTradingTimeMinutes();
            if (nextMin !== null && nextMin > 0) {
              setNextRefreshTime(new Date(Date.now() + nextMin * 60 * 1000));
            }
          }
        };
        
        checkNextTrading();
        countdownRef.current = setInterval(checkNextTrading, 60000); // 每分钟检查一次
      }
    };

    setupAutoRefresh();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [refresh]); // 只依赖 refresh 函数

  return {
    isRefreshing,
    lastUpdateTime,
    isTradingHours: isTradingHours(),
    nextRefreshTime,
    refresh,
  };
}
