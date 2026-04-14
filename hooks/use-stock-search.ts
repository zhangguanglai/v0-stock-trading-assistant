// 股票搜索Hook
// 支持模糊搜索股票代码和名称

import { useState, useCallback, useRef, useEffect } from 'react';
import type { StockSearchResult } from '@/lib/stock-api/types';

interface UseStockSearchOptions {
  debounceMs?: number;
}

interface UseStockSearchReturn {
  results: StockSearchResult[];
  isSearching: boolean;
  error: string | null;
  search: (keyword: string) => void;
  clear: () => void;
}

export function useStockSearch({
  debounceMs = 300,
}: UseStockSearchOptions = {}): UseStockSearchReturn {
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback((keyword: string) => {
    // 清除之前的定时器
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 空关键词直接清空
    if (!keyword.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // 防抖处理
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `/api/stock/search?keyword=${encodeURIComponent(keyword)}`,
          { signal: controller.signal }
        );
        
        const result = await response.json();

        if (result.success && result.data) {
          setResults(result.data);
          setError(null);
        } else {
          setError(result.error || '搜索失败');
          setResults([]);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // 请求被取消，忽略
          return;
        }
        setError(err instanceof Error ? err.message : '搜索失败');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, debounceMs);
  }, [debounceMs]);

  const clear = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    results,
    isSearching,
    error,
    search,
    clear,
  };
}
