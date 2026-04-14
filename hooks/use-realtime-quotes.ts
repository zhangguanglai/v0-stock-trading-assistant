// 实时行情数据Hook
// 自动轮询更新持仓股票的实时价格

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeQuote } from '@/lib/stock-api/types';

interface UseRealtimeQuotesOptions {
  codes: string[];
  interval?: number; // 刷新间隔（毫秒），默认5000
  enabled?: boolean; // 是否启用
}

interface UseRealtimeQuotesReturn {
  quotes: Map<string, RealtimeQuote>;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
}

export function useRealtimeQuotes({
  codes,
  interval = 5000,
  enabled = true,
}: UseRealtimeQuotesOptions): UseRealtimeQuotesReturn {
  const [quotes, setQuotes] = useState<Map<string, RealtimeQuote>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchQuotes = useCallback(async () => {
    if (codes.length === 0) {
      setQuotes(new Map());
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stock/quote?codes=${codes.join(',')}`);
      const result = await response.json();

      if (result.success && result.data) {
        const newQuotes = new Map<string, RealtimeQuote>();
        for (const quote of result.data) {
          // 使用纯数字代码作为key（去除市场前缀）
          const cleanCode = quote.code.replace(/^(sh|sz|bj)/i, '');
          newQuotes.set(cleanCode, quote);
        }
        setQuotes(newQuotes);
        setLastUpdate(new Date());
      } else {
        setError(result.error || '获取行情失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络请求失败');
    } finally {
      setIsLoading(false);
    }
  }, [codes]);

  // 手动刷新
  const refresh = useCallback(async () => {
    await fetchQuotes();
  }, [fetchQuotes]);

  // 自动轮询
  useEffect(() => {
    if (!enabled || codes.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 立即获取一次
    fetchQuotes();

    // 设置定时刷新
    intervalRef.current = setInterval(fetchQuotes, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [codes.join(','), interval, enabled, fetchQuotes]);

  return {
    quotes,
    isLoading,
    error,
    lastUpdate,
    refresh,
  };
}

// 单只股票行情Hook
export function useStockQuote(code: string | null, enabled: boolean = true) {
  const [quote, setQuote] = useState<RealtimeQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = useCallback(async () => {
    if (!code) {
      setQuote(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stock/quote?code=${code}`);
      const result = await response.json();

      if (result.success && result.data) {
        setQuote(result.data);
      } else {
        setError(result.error || '获取行情失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络请求失败');
    } finally {
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (enabled && code) {
      fetchQuote();
    }
  }, [code, enabled, fetchQuote]);

  return {
    quote,
    isLoading,
    error,
    refresh: fetchQuote,
  };
}
