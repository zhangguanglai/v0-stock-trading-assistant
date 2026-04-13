'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { DashboardView } from '@/components/views/dashboard-view';
import { StrategyView } from '@/components/views/strategy-view';
import { StockPoolView } from '@/components/views/stock-pool-view';
import { PositionView } from '@/components/views/position-view';
import { TradeLogView } from '@/components/views/trade-log-view';
import { CalculatorView } from '@/components/views/calculator-view';
import { RiskView } from '@/components/views/risk-view';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useStockStore, initializeDefaultStrategy } from '@/lib/store';
import { mockPositions, mockWatchlist, mockTradeRecords, mockAlerts } from '@/lib/mock-data';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

export type ViewType = 'dashboard' | 'strategy' | 'stockpool' | 'position' | 'calculator' | 'tradelog' | 'risk';

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const router = useRouter();
  
  const { 
    addPosition, 
    addToWatchlist, 
    addTradeRecord, 
    addAlert,
  } = useStockStore();

  // 检查用户登录状态（可选，不阻止访问）
  useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUser({ id: user.id, email: user.email });
        }
      } catch (error) {
        console.log('[v0] Auth check failed, continuing without user:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    // 监听认证状态变化
    const supabase = createClient();
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

  // 初始化默认数据
  useEffect(() => {
    if (!initialized && !loading) {
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
  }, [initialized, loading, addPosition, addToWatchlist, addTradeRecord, addAlert]);

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
      default:
        return <DashboardView onNavigate={setCurrentView} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

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
