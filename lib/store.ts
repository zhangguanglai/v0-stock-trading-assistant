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
  ScanFunnel,
  TradingCycle,
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
  
  // 扫描漏斗历史
  scanFunnels: ScanFunnel[];
  
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
  
  // 扫描漏斗操作
  addScanFunnel: (funnel: ScanFunnel) => void;
  clearScanFunnels: () => void;
  
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
      watchlist: [],  // 空数组 - 不加载任何硬编码数据
      tradeRecords: [],
      alerts: [],
      scanFunnels: [],
      
      // 策略操作 - 同步到数据库
      addStrategy: (strategy) => {
        const newStrategy: TradingStrategy = {
          ...strategy,
          id: generateId(),
          createdAt: new Date(),
        };
        
        // 同步到Supabase数据库
        const saveToDb = async () => {
          try {
            const { createStrategy: dbCreate } = await import('@/lib/db');
            await dbCreate({
              name: newStrategy.name,
              description: `${newStrategy.cycle}交易策略`,
              strategyType: newStrategy.cycle,
              isActive: newStrategy.status === 'active',
              params: {
                stockRules: newStrategy.stockRules,
                buyRules: newStrategy.buyRules,
                sellRules: newStrategy.sellRules,
                moneyRules: newStrategy.moneyRules,
              },
              entryRules: [],
              exitRules: [],
              positionSizing: {},
            });
          } catch (err) {
            console.error('同步策略到数据库失败:', err);
          }
        };
        saveToDb();
        
        set((state) => ({
          strategies: [...state.strategies, newStrategy],
          activeStrategyId: state.activeStrategyId || newStrategy.id,
        }));
      },
      
      updateStrategy: (id, updates) => {
        // 同步到Supabase数据库
        const saveToDb = async () => {
          try {
            const { updateStrategy: dbUpdate, getStrategies: dbGet } = await import('@/lib/db');
            const strategies = await dbGet();
            const dbStrategy = strategies.find(s => s.id === id);
            if (dbStrategy) {
              const mergedParams = {
                ...dbStrategy.params,
                ...(updates.stockRules && { stockRules: updates.stockRules }),
                ...(updates.buyRules && { buyRules: updates.buyRules }),
                ...(updates.sellRules && { sellRules: updates.sellRules }),
                ...(updates.moneyRules && { moneyRules: updates.moneyRules }),
              };
              await dbUpdate(id, {
                name: updates.name || dbStrategy.name,
                description: updates.name ? `${dbStrategy.strategyType}交易策略` : dbStrategy.description,
                isActive: updates.status === 'active',
                params: mergedParams,
              });
            }
          } catch (err) {
            console.error('同步策略更新到数据库失败:', err);
          }
        };
        saveToDb();
        
        set((state) => ({
          strategies: state.strategies.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },
      
      deleteStrategy: (id) => {
        // 同步到Supabase数据库
        const deleteFromDb = async () => {
          try {
            const { deleteStrategy: dbDelete } = await import('@/lib/db');
            await dbDelete(id);
          } catch (err) {
            console.error('从数据库删除策略失败:', err);
          }
        };
        deleteFromDb();
        
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
        const newPosition: any = {
          ...position,
          id: generateId(),
          buyPrice: position.buyPrice || position.entryPrice,
          shares: position.shares || position.quantity,
          buyDate: position.buyDate || new Date(),
          sector: position.sector || '未知',
          highestPrice: position.buyPrice || position.entryPrice || 0,
          alertTriggered: false,
          trailingStopEnabled: false,
        };
        
        // 同步到Supabase数据库
        const saveToDb = async () => {
          try {
            const { createPosition: dbCreatePosition } = await import('@/lib/db');
            await dbCreatePosition({
              strategyId: position.strategyId,
              stockCode: position.stockCode,
              stockName: position.stockName,
              entryPrice: newPosition.buyPrice || newPosition.entryPrice,
              currentPrice: position.currentPrice || newPosition.buyPrice || newPosition.entryPrice,
              quantity: newPosition.shares || newPosition.quantity,
              stopLossPrice: position.stopLossPrice,
              takeProfitPrice: position.takeProfitPrice,
              trailingStopPercent: position.trailingStopPercent,
              status: position.status || 'open',
              entryDate: position.entryDate || new Date().toISOString().slice(0, 10),
              notes: position.notes,
            });
          } catch (err) {
            console.error('同步持仓到数据库失败:', err);
          }
        };
        saveToDb();
        
        set((state) => ({
          positions: [...state.positions, newPosition],
        }));
      },
      
      updatePosition: (id, updates) => {
        // 同步到Supabase数据库
        const saveToDb = async () => {
          try {
            const { updatePosition: dbUpdatePosition } = await import('@/lib/db');
            const dbUpdates: any = {};
            if (updates.currentPrice !== undefined) dbUpdates.currentPrice = updates.currentPrice;
            if (updates.stopLossPrice !== undefined) dbUpdates.stopLossPrice = updates.stopLossPrice;
            if (updates.takeProfitPrice !== undefined) dbUpdates.takeProfitPrice = updates.takeProfitPrice;
            if (updates.trailingStopPercent !== undefined) dbUpdates.trailingStopPercent = updates.trailingStopPercent;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.exitPrice !== undefined) dbUpdates.exitPrice = updates.exitPrice;
            if (updates.pnl !== undefined) dbUpdates.pnl = updates.pnl;
            if (updates.pnlPercent !== undefined) dbUpdates.pnlPercent = updates.pnlPercent;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
            if (Object.keys(dbUpdates).length > 0) {
              await dbUpdatePosition(id, dbUpdates);
            }
          } catch (err) {
            console.error('同步持仓更新到数据库失败:', err);
          }
        };
        saveToDb();
        
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },
      
      removePosition: (id) => {
        // 同步到Supabase数据库
        const deleteFromDb = async () => {
          try {
            const { deletePosition: dbDeletePosition } = await import('@/lib/db');
            await dbDeletePosition(id);
          } catch (err) {
            console.error('从数据库删除持仓失败:', err);
          }
        };
        deleteFromDb();
        
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
        
        // 同步到Supabase数据库
        const saveToDb = async () => {
          try {
            const { createTrade: dbCreateTrade } = await import('@/lib/db');
            await dbCreateTrade({
              strategyId: record.strategyId || '',
              stockCode: record.stockCode,
              stockName: record.stockName,
              tradeType: record.type,
              price: record.price,
              quantity: record.shares,
              totalAmount: record.amount,
              commission: record.commission || 0,
              tradeDate: (record.date instanceof Date ? record.date : new Date(record.date)).toISOString(),
              reason: record.triggerReason || '',
              emotionState: record.emotionState || record.emotion,
              followedRules: record.followedRules,
              ruleViolations: record.ruleViolations,
              positionId: record.positionId,
            });
          } catch (err) {
            console.error('同步交易记录到数据库失败:', err);
          }
        };
        saveToDb();
        
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
        // P0: 自动关联当前策略
        if (!newAlert.strategyId && get().activeStrategyId) {
          newAlert.strategyId = get().activeStrategyId;
        }
        
        // 同步到Supabase数据库
        const saveToDb = async () => {
          try {
            const { createAlert: dbCreateAlert } = await import('@/lib/db');
            await dbCreateAlert({
              strategyId: newAlert.strategyId,
              positionId: newAlert.positionId,
              stockCode: newAlert.stockCode,
              stockName: newAlert.stockName,
              alertType: newAlert.alertType,
              triggerPrice: newAlert.triggerPrice,
              currentPrice: newAlert.currentPrice,
              message: newAlert.message,
              isRead: false,
              isTriggered: newAlert.isTriggered || false,
              triggeredAt: newAlert.triggeredAt,
            });
          } catch (err) {
            console.error('同步警报到数据库失败:', err);
          }
        };
        saveToDb();
        
        set((state) => ({
          alerts: [newAlert, ...state.alerts].slice(0, 50), // 保留最近50条
        }));
      },
      
      markAlertRead: (id) => {
        // 同步到Supabase数据库
        const saveToDb = async () => {
          try {
            const { markAlertAsRead: dbMarkAlertAsRead } = await import('@/lib/db');
            await dbMarkAlertAsRead(id);
          } catch (err) {
            console.error('同步警报已读状态到数据库失败:', err);
          }
        };
        saveToDb();
        
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, read: true } : a
          ),
        }));
      },
      
      clearAlerts: () => {
        set({ alerts: [] });
      },
      
      // 扫描漏斗操作
      addScanFunnel: (funnel) => {
        set((state) => ({
          scanFunnels: [funnel, ...state.scanFunnels].slice(0, 20), // 保留最近20次
        }));
      },
      
      clearScanFunnels: () => {
        set({ scanFunnels: [] });
      },
      
      // P1: 按策略维度计算Dashboard数据
      getDashboardData: (strategyId?: string) => {
        const state = get();
        const targetStrategyId = strategyId || state.activeStrategyId;
        const activeStrategy = state.strategies.find(
          (s) => s.id === targetStrategyId
        );
        const totalCapital = activeStrategy?.moneyRules.totalCapital || 200000;
        
        // P1: 按策略过滤持仓
        const strategyPositions = targetStrategyId
          ? state.positions.filter(p => p.strategyId === targetStrategyId || !p.strategyId)
          : state.positions;
        
        // 计算持仓市值
        const totalMarketValue = strategyPositions.reduce(
          (sum, p) => sum + p.currentPrice * p.shares,
          0
        );
        
        // 计算持仓成本
        const totalCost = strategyPositions.reduce(
          (sum, p) => sum + p.buyPrice * p.shares,
          0
        );
        
        const totalProfit = totalMarketValue - totalCost;
        const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
        
        const cashAmount = totalCapital - totalCost;
        const cashPercent = (cashAmount / totalCapital) * 100;
        
        // 行业分布
        const sectorMap = new Map<string, number>();
        strategyPositions.forEach((p) => {
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
          positionCount: strategyPositions.length,
          sectorDistribution,
          recentAlerts: state.alerts.filter((a) => !a.read && (!a.strategyId || a.strategyId === targetStrategyId)).slice(0, 5),
          performanceStats: get().getPerformanceStats(targetStrategyId),
        };
      },
      
      // P1: 按策略维度计算绩效统计
      getPerformanceStats: (strategyId?: string) => {
        const state = get();
        const targetStrategyId = strategyId || state.activeStrategyId;
        
        // P1: 按策略过滤交易记录
        const strategyTrades = targetStrategyId
          ? state.tradeRecords.filter(r => r.strategyId === targetStrategyId || !r.strategyId)
          : state.tradeRecords;
        
        const sellRecords = strategyTrades.filter(
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
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        console.log(`[Store Migration] 检测到版本升级: v${version} -> v1`);
        if (version === 0) {
          console.log('[Store Migration] v0 -> v1: 兼容旧版本数据结构');
        }
        return persistedState as StockStore;
      },
      partialize: (state) => ({
        strategies: state.strategies,
        activeStrategyId: state.activeStrategyId,
        positions: state.positions,
        watchlist: state.watchlist,
        tradeRecords: state.tradeRecords,
        alerts: state.alerts,
        scanFunnels: state.scanFunnels,
      }),
    }
  )
);

// 初始化策略的hook - 从数据库加载
export const initializeDefaultStrategy = async () => {
  try {
    const { getStrategies: dbGetStrategies, getPositions: dbGetPositions, getTrades: dbGetTrades, getAlerts: dbGetAlerts } = await import('@/lib/db');
    const [dbStrategies, dbPositions, dbTrades, dbAlerts] = await Promise.all([
      dbGetStrategies(),
      dbGetPositions(),
      dbGetTrades(),
      dbGetAlerts(),
    ]);
    
    if (dbStrategies.length > 0) {
      // 从数据库加载所有策略，覆盖localStorage中的旧数据
      const loadedStrategies: TradingStrategy[] = dbStrategies.map(s => ({
        id: s.id,
        name: s.name,
        cycle: (s.params?.['stockRules'] ? 'swing' : 'swing') as TradingCycle,
        status: s.isActive ? 'active' : 'inactive',
        createdAt: new Date(s.createdAt || Date.now()),
        stockRules: (s.params?.['stockRules'] as any) || {
          priceAboveMA5: true,
          priceAboveMA20: true,
          weeklyMACDGoldenCross: true,
          volumeRatio: 1.5,
          minROE: 10,
          maxDebtRatio: 50,
          maxPEPercentile: 30,
          minTurnoverRate5D: 3,
          minMarketCap: 30,
          maxMarketCap: 200,
          minSectorGain: 2,
        },
        buyRules: (s.params?.['buyRules'] as any) || {
          ma5CrossMa20: true,
          macdGoldenCross: true,
          candleConfirm: true,
          volumeConfirm: true,
          batchBuyRatios: [0.3, 0.3, 0.4],
          addPositionOnDip: 5,
          addPositionOnMA60: true,
        },
        sellRules: (s.params?.['sellRules'] as any) || {
          stopLossPercent: 8,
          takeProfitPercent: 25,
          trailingStopPercent: 5,
          timeStopDays: 20,
          timeStopMinGain: 3,
          partialTakeProfitPercent: 15,
        },
        moneyRules: (s.params?.['moneyRules'] as any) || {
          totalCapital: 200000,
          maxSingleStockPercent: 20,
          maxSectorPercent: 40,
          minCashPercent: 10,
          maxPositions: 5,
        },
      }));
      
      // 将数据库Position类型映射为store使用的LegacyPosition格式
      const mappedPositions = dbPositions.map(p => ({
        id: p.id,
        strategyId: p.strategyId,
        stockCode: p.stockCode,
        stockName: p.stockName,
        buyPrice: p.entryPrice,
        currentPrice: p.currentPrice || p.entryPrice,
        shares: p.quantity,
        buyDate: p.entryDate ? new Date(p.entryDate) : new Date(),
        stopLossPrice: p.stopLossPrice || 0,
        takeProfitPrice: p.takeProfitPrice || 0,
        trailingStopEnabled: false,
        highestPrice: p.currentPrice || p.entryPrice,
        alertTriggered: false,
        sector: (p as any).sector || '未知',
        status: p.status,
        entryPrice: p.entryPrice,
        quantity: p.quantity,
        entryDate: p.entryDate,
        exitDate: p.exitDate,
        exitPrice: p.exitPrice,
        pnl: p.pnl,
        pnlPercent: p.pnlPercent,
        notes: p.notes,
      }));
      
      // 将数据库Trade类型映射为TradeRecord格式
      const mappedTrades = dbTrades.map(t => ({
        id: t.id,
        strategyId: t.strategyId || '',
        stockCode: t.stockCode,
        stockName: t.stockName,
        type: t.tradeType as 'buy' | 'sell',
        price: t.price,
        shares: t.quantity,
        amount: t.totalAmount,
        date: new Date(t.tradeDate),
        triggerReason: t.reason || '',
        profit: (t as any).profit,
        profitPercent: (t as any).profitPercent,
        emotion: (t as any).emotionState,
        notes: (t as any).notes,
        positionId: (t as any).positionId,
      }));
      
      // 将数据库Alert类型映射为store使用的Alert格式
      const mappedAlerts = dbAlerts.map(a => ({
        id: a.id,
        strategyId: a.strategyId,
        positionId: a.positionId,
        stockCode: a.stockCode,
        stockName: a.stockName,
        alertType: a.alertType,
        triggerPrice: a.triggerPrice,
        currentPrice: a.currentPrice,
        message: a.message,
        read: a.isRead,
        isTriggered: a.isTriggered,
        triggeredAt: a.triggeredAt,
        createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
      }));
      
      // 覆盖store中的策略数据（优先使用数据库数据），同时加载其他数据
      useStockStore.setState(() => ({
        strategies: loadedStrategies,
        activeStrategyId: loadedStrategies.find(s => s.status === 'active')?.id || loadedStrategies[0]?.id || null,
        positions: mappedPositions,
        tradeRecords: mappedTrades,
        alerts: mappedAlerts,
      }));
    } else {
      // 数据库无策略，检查store中是否有（可能来自localStorage）
      const { strategies, addStrategy } = useStockStore.getState();
      if (strategies.length === 0) {
        // 创建默认策略并同步到数据库
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
            minMarketCap: 30,
            maxMarketCap: 200,
            minSectorGain: 2,
          },
          buyRules: {
            ma5CrossMa20: true,
            macdGoldenCross: true,
            candleConfirm: true,
            volumeConfirm: true,
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
    }
  } catch (err) {
    console.error('从数据库加载策略失败，使用localStorage数据:', err);
    // 数据库连接失败，降级使用localStorage中的数据
    const { strategies, addStrategy } = useStockStore.getState();
    if (strategies.length === 0) {
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
          minMarketCap: 30,
          maxMarketCap: 200,
          minSectorGain: 2,
        },
        buyRules: {
          ma5CrossMa20: true,
          macdGoldenCross: true,
          candleConfirm: true,
          volumeConfirm: true,
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
  }
};
