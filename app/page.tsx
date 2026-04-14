'use client';

import { useState, useEffect, useRef } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { DashboardView } from '@/components/views/dashboard-view';
import { StrategyView } from '@/components/views/strategy-view';
import { StockPoolView } from '@/components/views/stock-pool-view';
import { PositionView } from '@/components/views/position-view';
import { TradeLogView } from '@/components/views/trade-log-view';
import { CalculatorView } from '@/components/views/calculator-view';
import { RiskView } from '@/components/views/risk-view';
import { SystemCheckView } from '@/components/views/system-check-view';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useStockStore, initializeDefaultStrategy } from '@/lib/store';
import { mockPositions, mockWatchlist, mockTradeRecords, mockAlerts } from '@/lib/mock-data';
import { createClient } from '@/lib/supabase/client';

export type ViewType = 'dashboard' | 'strategy' | 'stockpool' | 'position' | 'calculator' | 'tradelog' | 'risk' | 'systemcheck';

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const initializedRef = useRef(false);
  
  // 立即初始化数据（同步执行，不阻塞渲染）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    initializeDefaultStrategy();
    const store = useStockStore.getState();
    
    if (store.positions.length === 0) {
      mockPositions.forEach((p) => {
        store.addPosition({ ...p, strategyId: store.activeStrategyId || '' });
      });
    }
    
    if (store.watchlist.length === 0) {
      mockWatchlist.forEach((s) => store.addToWatchlist(s));
    }
    
    if (store.tradeRecords.length === 0) {
      mockTradeRecords.forEach((r) => {
        store.addTradeRecord({ ...r, strategyId: store.activeStrategyId || '' });
      });
    }
    
    if (store.alerts.length === 0) {
      mockAlerts.forEach((a) => store.addAlert(a));
    }
  }, []);

  // 后台异步检查用户登录状态（不阻塞渲染）
  useEffect(() => {
    const supabase = createClient();
    
    // 异步检查用户
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({ id: user.id, email: user.email });
      }
    }).catch(() => {});

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
      case 'risk':
        return <RiskView />;
      case 'systemcheck':
        return <SystemCheckView />;
      default:
        return <DashboardView onNavigate={setCurrentView} />;
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar currentView={currentView} onViewChange={setCurrentView} user={user} />
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          {renderView()}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
