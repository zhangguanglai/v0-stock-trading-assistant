'use client';

import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Settings2,
  ListFilter,
  Briefcase,
  Calculator,
  FileText,
  TrendingUp,
  Bell,
  Moon,
  Sun,
  Shield,
  LogOut,
  User,
  Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from 'next-themes';
import { useStockStore } from '@/lib/store';
import type { ViewType } from '@/app/page';

const menuItems = [
  {
    id: 'dashboard' as ViewType,
    label: '总览',
    icon: LayoutDashboard,
  },
  {
    id: 'strategy' as ViewType,
    label: '策略配置',
    icon: Settings2,
  },
  {
    id: 'stockpool' as ViewType,
    label: '智能股票池',
    icon: ListFilter,
  },
  {
    id: 'position' as ViewType,
    label: '持仓管理',
    icon: Briefcase,
  },
  {
    id: 'calculator' as ViewType,
    label: '仓位计算器',
    icon: Calculator,
  },
  {
    id: 'tradelog' as ViewType,
    label: '交易日志',
    icon: FileText,
  },
  {
    id: 'risk' as ViewType,
    label: '风险透视仪',
    icon: Shield,
  },
  {
    id: 'systemcheck' as ViewType,
    label: '系统诊断',
    icon: Zap,
  },
];

interface AppSidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  user?: { id: string; email?: string } | null;
}

export function AppSidebar({ currentView, onViewChange, user }: AppSidebarProps) {
  const { theme, setTheme } = useTheme();
  const alerts = useStockStore((state) => state.alerts);
  const unreadAlerts = alerts.filter((a) => !a.read).length;
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <TrendingUp className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-sidebar-foreground">策略大师</span>
            <span className="text-xs text-sidebar-foreground/60">个人投资助手</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>功能模块</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => onViewChange(item.id)}
                    isActive={currentView === item.id}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {user && (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-sidebar-foreground/70">
            <User className="h-4 w-4" />
            <span className="truncate flex-1">{user.email || '用户'}</span>
          </div>
        )}
        <div className="flex items-center justify-between px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Bell className="h-5 w-5" />
            {unreadAlerts > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs"
              >
                {unreadAlerts}
              </Badge>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">切换主题</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
            title="退出登录"
          >
            <LogOut className="h-5 w-5" />
            <span className="sr-only">退出登录</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
