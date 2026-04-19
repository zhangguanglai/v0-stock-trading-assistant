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
import { BacktestView } from '@/components/views/backtest-view';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Onboarding, useOnboarding } from '@/components/ui/onboarding';
import { useStockStore, initializeDefaultStrategy } from '@/lib/store';
import { clearMockDataFromStorage } from '@/lib/clear-cache';
import { createClient } from '@/lib/supabase/client';

export type ViewType = 'dashboard' | 'strategy' | 'stockpool' | 'position' | 'calculator' | 'tradelog' | 'risk' | 'systemcheck' | 'backtest';

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const initializedRef = useRef(false);
  const { hasCompleted, completeOnboarding } = useOnboarding();
  
  // 初始化策略（不加载模拟数据）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    // 清除所有旧的硬编码模拟数据
    clearMockDataFromStorage();
    
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
      case 'backtest':
        return <BacktestView />;
      default:
        return <DashboardView onNavigate={setCurrentView} />;
    }
  };

  const onboardingSteps = [
    {
      id: 'welcome',
      title: '欢迎使用智能交易助手',
      description: '这是一个基于规则的股票交易系统，帮助您制定和执行交易策略。',
      placement: 'top',
      actionText: '开始探索',
    },
    {
      id: 'strategy',
      title: '创建您的交易策略',
      description: '首先，您需要创建一个交易策略，设置选股规则、买入规则和卖出规则。',
      placement: 'top',
      actionText: '去创建策略',
      onAction: () => setCurrentView('strategy'),
    },
    {
      id: 'stockpool',
      title: '智能股票池',
      description: '使用策略规则筛选符合条件的股票，构建您的观察池。',
      placement: 'top',
      actionText: '去股票池',
      onAction: () => setCurrentView('stockpool'),
    },
    {
      id: 'position',
      title: '持仓管理',
      description: '监控您的持仓，设置止盈止损，管理交易风险。',
      placement: 'top',
      actionText: '去持仓管理',
      onAction: () => setCurrentView('position'),
    },
    {
      id: 'calculator',
      title: '仓位计算器',
      description: '使用仓位计算器确定合适的买入数量，控制风险。',
      placement: 'top',
      actionText: '去计算器',
      onAction: () => setCurrentView('calculator'),
    },
  ];

  return (
    <SidebarProvider>
      <AppSidebar currentView={currentView} onViewChange={setCurrentView} user={user} />
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          {renderView()}
        </main>
      </SidebarInset>
      {!hasCompleted && (
        <Onboarding steps={onboardingSteps} onComplete={completeOnboarding} />
      )}
    </SidebarProvider>
  );
}
