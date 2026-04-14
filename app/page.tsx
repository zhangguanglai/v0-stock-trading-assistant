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
import { clearMockDataFromStorage, isRealDataMode } from '@/lib/clear-cache';
import { createClient } from '@/lib/supabase/client';

export type ViewType = 'dashboard' | 'strategy' | 'stockpool' | 'position' | 'calculator' | 'tradelog' | 'risk' | 'systemcheck';

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const initializedRef = useRef(false);
  
  // 初始化策略（不加载模拟数据）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    // 清除所有旧的硬编码模拟数据
    clearMockDataFromStorage();
    
    // 检查当前是否为真实数据模式
    const isReal = isRealDataMode();
    console.log('[v0] 真实数据模式:', isReal);
    
    initializeDefaultStrategy();
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
