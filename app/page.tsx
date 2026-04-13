'use client';

import { useState, useEffect } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { DashboardView } from '@/components/views/dashboard-view';
import { StrategyView } from '@/components/views/strategy-view';
import { StockPoolView } from '@/components/views/stock-pool-view';
import { PositionView } from '@/components/views/position-view';
import { TradeLogView } from '@/components/views/trade-log-view';
import { CalculatorView } from '@/components/views/calculator-view';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useStockStore, initializeDefaultStrategy } from '@/lib/store';
import { mockPositions, mockWatchlist, mockTradeRecords, mockAlerts } from '@/lib/mock-data';

export type ViewType = 'dashboard' | 'strategy' | 'stockpool' | 'position' | 'calculator' | 'tradelog';

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [initialized, setInitialized] = useState(false);
  
  const { 
    strategies, 
    activeStrategyId,
    addPosition, 
    addToWatchlist, 
    addTradeRecord, 
    addAlert,
    positions,
    watchlist,
    tradeRecords
  } = useStockStore();

  // 初始化默认数据
  useEffect(() => {
    if (!initialized) {
      initializeDefaultStrategy();
      
      // 只在没有数据时添加模拟数据
      const store = useStockStore.getState();
      
      if (store.positions.length === 0) {
        mockPositions.forEach((p) => {
          addPosition({ ...p, strategyId: store.activeStrategyId || '' });
        });
      }
      
      if (store.watchlist.length === 0) {
        mockWatchlist.forEach((s) => addToWatchlist(s));
      }
      
      if (store.tradeRecords.length === 0) {
        mockTradeRecords.forEach((r) => {
          addTradeRecord({ ...r, strategyId: store.activeStrategyId || '' });
        });
      }
      
      if (store.alerts.length === 0) {
        mockAlerts.forEach((a) => addAlert(a));
      }
      
      setInitialized(true);
    }
  }, [initialized, addPosition, addToWatchlist, addTradeRecord, addAlert]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={setCurrentView} />;
      case 'strategy':
        return <StrategyView />;
      case 'stockpool':
        return <StockPoolView />;
      case 'position':
        return <PositionView />;
      case 'calculator':
        return <CalculatorView />;
      case 'tradelog':
        return <TradeLogView />;
      default:
        return <DashboardView onNavigate={setCurrentView} />;
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar currentView={currentView} onViewChange={setCurrentView} />
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          {renderView()}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
