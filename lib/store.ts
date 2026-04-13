'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  TradingStrategy,
  Position,
  WatchlistStock,
  TradeRecord,
  Alert,
  DashboardData,
  PerformanceStats,
  defaultSwingStrategy,
} from './types';

// 生成唯一ID
const generateId = () => Math.random().toString(36).substring(2, 15);

interface StockStore {
  // 策略
  strategies: TradingStrategy[];
  activeStrategyId: string | null;
  
  // 持仓
  positions: Position[];
  
  // 观察池
  watchlist: WatchlistStock[];
  
  // 交易记录
  tradeRecords: TradeRecord[];
  
  // 警报
  alerts: Alert[];
  
  // 策略操作
  addStrategy: (strategy: Omit<TradingStrategy, 'id' | 'createdAt'>) => void;
  updateStrategy: (id: string, updates: Partial<TradingStrategy>) => void;
  deleteStrategy: (id: string) => void;
  setActiveStrategy: (id: string) => void;
  
  // 持仓操作
  addPosition: (position: Omit<Position, 'id'>) => void;
  updatePosition: (id: string, updates: Partial<Position>) => void;
  removePosition: (id: string) => void;
  
  // 观察池操作
  addToWatchlist: (stock: Omit<WatchlistStock, 'id' | 'addedAt'>) => void;
  removeFromWatchlist: (id: string) => void;
  toggleFavorite: (id: string) => void;
  updateWatchlistStock: (id: string, updates: Partial<WatchlistStock>) => void;
  
  // 交易记录操作
  addTradeRecord: (record: Omit<TradeRecord, 'id'>) => void;
  
  // 警报操作
  addAlert: (alert: Omit<Alert, 'id' | 'createdAt' | 'read'>) => void;
  markAlertRead: (id: string) => void;
  clearAlerts: () => void;
  
  // 计算函数
  getDashboardData: () => DashboardData;
  getPerformanceStats: () => PerformanceStats;
}

export const useStockStore = create<StockStore>()(
  persist(
    (set, get) => ({
      strategies: [],
      activeStrategyId: null,
      positions: [],
      watchlist: [],
      tradeRecords: [],
      alerts: [],
      
      // 策略操作
      addStrategy: (strategy) => {
        const newStrategy: TradingStrategy = {
          ...strategy,
          id: generateId(),
          createdAt: new Date(),
        };
        set((state) => ({
          strategies: [...state.strategies, newStrategy],
          activeStrategyId: state.activeStrategyId || newStrategy.id,
        }));
      },
      
      updateStrategy: (id, updates) => {
        set((state) => ({
          strategies: state.strategies.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },
      
      deleteStrategy: (id) => {
        set((state) => ({
          strategies: state.strategies.filter((s) => s.id !== id),
          activeStrategyId:
            state.activeStrategyId === id
              ? state.strategies[0]?.id || null
              : state.activeStrategyId,
        }));
      },
      
      setActiveStrategy: (id) => {
        set({ activeStrategyId: id });
      },
      
      // 持仓操作
      addPosition: (position) => {
        const newPosition: Position = {
          ...position,
          id: generateId(),
        };
        set((state) => ({
          positions: [...state.positions, newPosition],
        }));
      },
      
      updatePosition: (id, updates) => {
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },
      
      removePosition: (id) => {
        set((state) => ({
          positions: state.positions.filter((p) => p.id !== id),
        }));
      },
      
      // 观察池操作
      addToWatchlist: (stock) => {
        const newStock: WatchlistStock = {
          ...stock,
          id: generateId(),
          addedAt: new Date(),
        };
        set((state) => ({
          watchlist: [...state.watchlist, newStock],
        }));
      },
      
      removeFromWatchlist: (id) => {
        set((state) => ({
          watchlist: state.watchlist.filter((s) => s.id !== id),
        }));
      },
      
      toggleFavorite: (id) => {
        set((state) => ({
          watchlist: state.watchlist.map((s) =>
            s.id === id ? { ...s, isFavorite: !s.isFavorite } : s
          ),
        }));
      },
      
      updateWatchlistStock: (id, updates) => {
        set((state) => ({
          watchlist: state.watchlist.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },
      
      // 交易记录操作
      addTradeRecord: (record) => {
        const newRecord: TradeRecord = {
          ...record,
          id: generateId(),
        };
        set((state) => ({
          tradeRecords: [...state.tradeRecords, newRecord],
        }));
      },
      
      // 警报操作
      addAlert: (alert) => {
        const newAlert: Alert = {
          ...alert,
          id: generateId(),
          createdAt: new Date(),
          read: false,
        };
        set((state) => ({
          alerts: [newAlert, ...state.alerts].slice(0, 50), // 保留最近50条
        }));
      },
      
      markAlertRead: (id) => {
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, read: true } : a
          ),
        }));
      },
      
      clearAlerts: () => {
        set({ alerts: [] });
      },
      
      // 计算Dashboard数据
      getDashboardData: () => {
        const state = get();
        const activeStrategy = state.strategies.find(
          (s) => s.id === state.activeStrategyId
        );
        const totalCapital = activeStrategy?.moneyRules.totalCapital || 200000;
        
        // 计算持仓市值
        const totalMarketValue = state.positions.reduce(
          (sum, p) => sum + p.currentPrice * p.shares,
          0
        );
        
        // 计算持仓成本
        const totalCost = state.positions.reduce(
          (sum, p) => sum + p.buyPrice * p.shares,
          0
        );
        
        const totalProfit = totalMarketValue - totalCost;
        const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
        
        const cashAmount = totalCapital - totalCost;
        const cashPercent = (cashAmount / totalCapital) * 100;
        
        // 行业分布
        const sectorMap = new Map<string, number>();
        state.positions.forEach((p) => {
          const value = p.currentPrice * p.shares;
          sectorMap.set(p.sector, (sectorMap.get(p.sector) || 0) + value);
        });
        
        const sectorDistribution = Array.from(sectorMap.entries()).map(
          ([name, value]) => ({
            name,
            value,
            percent: (value / totalCapital) * 100,
          })
        );
        
        return {
          totalCapital,
          totalMarketValue,
          totalProfit,
          totalProfitPercent,
          cashAmount,
          cashPercent,
          positionCount: state.positions.length,
          sectorDistribution,
          recentAlerts: state.alerts.filter((a) => !a.read).slice(0, 5),
          performanceStats: get().getPerformanceStats(),
        };
      },
      
      // 计算绩效统计
      getPerformanceStats: () => {
        const state = get();
        const sellRecords = state.tradeRecords.filter(
          (r) => r.type === 'sell' && r.profit !== undefined
        );
        
        const winningTrades = sellRecords.filter((r) => (r.profit || 0) > 0);
        const losingTrades = sellRecords.filter((r) => (r.profit || 0) < 0);
        
        const totalTrades = sellRecords.length;
        const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0;
        
        const avgProfit =
          winningTrades.length > 0
            ? winningTrades.reduce((sum, r) => sum + (r.profit || 0), 0) /
              winningTrades.length
            : 0;
        
        const avgLoss =
          losingTrades.length > 0
            ? Math.abs(
                losingTrades.reduce((sum, r) => sum + (r.profit || 0), 0) /
                  losingTrades.length
              )
            : 0;
        
        const profitLossRatio = avgLoss > 0 ? avgProfit / avgLoss : 0;
        
        const totalProfit = sellRecords.reduce(
          (sum, r) => sum + (r.profit || 0),
          0
        );
        
        // 简化的最大回撤计算
        let maxDrawdown = 0;
        let peak = 0;
        let cumulative = 0;
        sellRecords.forEach((r) => {
          cumulative += r.profit || 0;
          if (cumulative > peak) peak = cumulative;
          const drawdown = peak - cumulative;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });
        
        const systemHealth = winRate * profitLossRatio;
        
        return {
          totalTrades,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          winRate,
          avgProfit,
          avgLoss,
          profitLossRatio,
          totalProfit,
          maxDrawdown,
          systemHealth,
        };
      },
    }),
    {
      name: 'stock-investment-store',
      // 处理Date序列化
      partialize: (state) => ({
        strategies: state.strategies,
        activeStrategyId: state.activeStrategyId,
        positions: state.positions,
        watchlist: state.watchlist,
        tradeRecords: state.tradeRecords,
        alerts: state.alerts,
      }),
    }
  )
);

// 初始化默认策略的hook
export const initializeDefaultStrategy = () => {
  const { strategies, addStrategy } = useStockStore.getState();
  if (strategies.length === 0) {
    // 导入默认策略
    const defaultStrategy = {
      name: '波段交易系统',
      cycle: 'swing' as const,
      status: 'active' as const,
      stockRules: {
        priceAboveMA5: true,
        priceAboveMA20: true,
        weeklyMACDGoldenCross: true,
        volumeRatio: 1.5,
        minROE: 10,
        maxDebtRatio: 50,
        maxPEPercentile: 30,
        minTurnoverRate5D: 3,
        maxMarketCap: 100,
        minSectorGain: 2,
      },
      buyRules: {
        signals: ['ma5CrossMa20', 'macdBottomDivergence'] as const,
        batchBuyRatios: [0.3, 0.3, 0.4],
        addPositionOnDip: 5,
        addPositionOnMA60: true,
      },
      sellRules: {
        stopLossPercent: 8,
        takeProfitPercent: 25,
        trailingStopPercent: 5,
        timeStopDays: 20,
        timeStopMinGain: 3,
        partialTakeProfitPercent: 15,
      },
      moneyRules: {
        totalCapital: 200000,
        maxSingleStockPercent: 20,
        maxSectorPercent: 40,
        minCashPercent: 10,
        maxPositions: 5,
      },
    };
    addStrategy(defaultStrategy);
  }
};
