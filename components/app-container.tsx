'use client'

import { useState, useEffect } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardView } from '@/components/views/dashboard-view'
import { StrategyView } from '@/components/views/strategy-view'
import { StockPoolView } from '@/components/views/stock-pool-view'
import { CalculatorView } from '@/components/views/calculator-view'
import { PositionView } from '@/components/views/position-view'
import { TradeLogView } from '@/components/views/trade-log-view'
import { RiskView } from '@/components/views/risk-view'
import { useStore } from '@/lib/store'
import { mockPortfolio, mockPositions } from '@/lib/mock-data'
import { createClient } from '@/lib/supabase/client'

interface AppContainerProps {
  currentView: string
}

export function AppContainer({ currentView }: AppContainerProps) {
  const { initializeStore } = useStore()
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)

  useEffect(() => {
    // 初始化数据
    initializeStore(mockPortfolio, mockPositions)

    // 获取当前用户
    const getUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser({
          id: user.id,
          email: user.email,
        })
      }
    }
    getUser()
  }, [initializeStore])

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />
      case 'strategy':
        return <StrategyView />
      case 'stock-pool':
        return <StockPoolView />
      case 'calculator':
        return <CalculatorView />
      case 'positions':
        return <PositionView />
      case 'trade-log':
        return <TradeLogView />
      case 'risk':
        return <RiskView />
      default:
        return <DashboardView />
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar currentView={currentView} user={user} />
      <SidebarInset className="flex flex-col">
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6">
            {renderView()}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
