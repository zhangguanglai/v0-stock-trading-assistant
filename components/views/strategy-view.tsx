'use client';

import { useState, useMemo } from 'react';
import {
  Settings2,
  Plus,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Zap,
  Target,
  Shield,
  Wallet,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useStockStore } from '@/lib/store';
import { toast } from 'sonner';
import type { TradingStrategy, TradingCycle, BuySignal } from '@/lib/types';
import { strategyTemplates, createStrategyFromTemplate, type StrategyTemplate } from '@/lib/strategy-templates';

const cycleLabels: Record<TradingCycle, string> = {
  short: '短线交易',
  swing: '波段交易',
  long: '长线投资',
};

const signalLabels: Record<BuySignal, string> = {
  ma5CrossMa20: '5日线上穿20日线',
  macdBottomDivergence: 'MACD底背离',
  macdGoldenCross: 'MACD金叉',
  volumeBreakout: '放量突破',
  supportBounce: '支撑位反弹',
};

export function StrategyView() {
  const {
    strategies,
    activeStrategyId,
    addStrategy,
    updateStrategy,
    deleteStrategy,
    setActiveStrategy,
  } = useStockStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyCycle, setNewStrategyCycle] = useState<TradingCycle>('swing');
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    stock: true,
    buy: true,
    sell: true,
    money: true,
  });

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === activeStrategyId),
    [strategies, activeStrategyId]
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCreateFromTemplate = (template: StrategyTemplate) => {
    // 使用与TradingStrategy类型一致的数据结构（不包含id和createdAt，由store生成）
    const strategyData = {
      name: template.name,
      status: 'active' as const,
      cycle: (template.category === 'swing' ? 'swing' : template.category === 'trend' ? 'short' : 'long') as TradingCycle,
      // 选股规则 - 使用stockRules结构
      stockRules: {
        priceAboveMA5: true,
        priceAboveMA20: true,
        weeklyMACDGoldenCross: template.category === 'swing',
        volumeRatio: 1.5,
        minROE: template.selectionRules.minRoe || 10,
        maxDebtRatio: template.selectionRules.maxDebtRatio || 50,
        maxPEPercentile: 30,
        minTurnoverRate5D: 3,
        maxMarketCap: template.selectionRules.maxMarketCap || 500,
        minSectorGain: 2,
      },
      // 买入规则
      buyRules: {
        signals: ['ma5CrossMa20', 'macdGoldenCross'] as BuySignal[],
        batchBuyRatios: [0.3, 0.3, 0.4],
        addPositionOnDip: 5,
        addPositionOnMA60: true,
      },
      // 卖出规则
      sellRules: {
        stopLossPercent: template.exitRules.stopLossPercent,
        takeProfitPercent: template.exitRules.takeProfitPercent,
        trailingStopPercent: template.exitRules.trailingStopPercent || 8,
        timeStopDays: template.exitRules.timeStopDays || 20,
        timeStopMinGain: template.exitRules.timeStopMinProfit || 3,
        partialTakeProfitPercent: Math.floor(template.exitRules.takeProfitPercent * 0.6),
      },
      // 资金管理规则
      moneyRules: {
        totalCapital: 200000,
        maxSingleStockPercent: Math.round(template.capitalRules.maxSinglePositionRatio * 100),
        maxSectorPercent: Math.round(template.capitalRules.maxSectorRatio * 100),
        minCashPercent: 10,
        maxPositions: 5,
      },
    };
    
    addStrategy(strategyData);
    // 获取新创建的策略ID（store会自动设置为activeStrategyId）
    setShowTemplates(false);
    setSelectedTemplate(null);
    toast.success(`已从模板创建策略：${template.name}`);
  };

  const handleCreateStrategy = () => {
    if (!newStrategyName.trim()) {
      toast.error('请输入策略名称');
      return;
    }

    addStrategy({
      name: newStrategyName,
      cycle: newStrategyCycle,
      status: 'inactive',
      stockRules: {
        priceAboveMA5: true,
        priceAboveMA20: true,
        weeklyMACDGoldenCross: false,
        volumeRatio: 1.5,
        minROE: 10,
        maxDebtRatio: 50,
        maxPEPercentile: 30,
        minTurnoverRate5D: 3,
        maxMarketCap: 100,
        minSectorGain: 2,
      },
      buyRules: {
        signals: ['ma5CrossMa20'],
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
    });

    setNewStrategyName('');
    setIsCreating(false);
    toast.success('策略创建成功');
  };

  const handleUpdateRules = (
    strategyId: string,
    path: string,
    value: unknown
  ) => {
    const strategy = strategies.find((s) => s.id === strategyId);
    if (!strategy) return;

    const pathParts = path.split('.');
    const updates: Partial<TradingStrategy> = {};
    
    if (pathParts.length === 2) {
      const [category, field] = pathParts;
      if (category === 'stockRules') {
        updates.stockRules = { ...strategy.stockRules, [field]: value };
      } else if (category === 'buyRules') {
        updates.buyRules = { ...strategy.buyRules, [field]: value };
      } else if (category === 'sellRules') {
        updates.sellRules = { ...strategy.sellRules, [field]: value };
      } else if (category === 'moneyRules') {
        updates.moneyRules = { ...strategy.moneyRules, [field]: value };
      }
    }

    updateStrategy(strategyId, updates);
  };

  const toggleSignal = (strategyId: string, signal: BuySignal) => {
    const strategy = strategies.find((s) => s.id === strategyId);
    if (!strategy) return;

    const signals = strategy.buyRules.signals.includes(signal)
      ? strategy.buyRules.signals.filter((s) => s !== signal)
      : [...strategy.buyRules.signals, signal];

    updateStrategy(strategyId, {
      buyRules: { ...strategy.buyRules, signals },
    });
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">策略配置中心</h1>
            <p className="text-sm text-muted-foreground">创建和管理您的交易系统</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTemplates(true)}>
              <Zap className="mr-2 h-4 w-4" /> 从模板创建
            </Button>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> 自定义策略
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 p-6">
        {/* Strategy List */}
        <div className="mb-6 flex gap-4 overflow-x-auto pb-2">
          {strategies.map((strategy) => (
            <Card
              key={strategy.id}
              className={`min-w-[200px] cursor-pointer transition-all ${
                strategy.id === activeStrategyId
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'hover:border-primary/50'
              }`}
              onClick={() => setActiveStrategy(strategy.id)}
            >
              <CardHeader className="p-4">
                <div className="flex items-center justify-between">
                  <Badge variant={strategy.id === activeStrategyId ? 'default' : 'secondary'}>
                    {cycleLabels[strategy.cycle]}
                  </Badge>
                  {strategy.id === activeStrategyId && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
                <CardTitle className="text-base">{strategy.name}</CardTitle>
              </CardHeader>
            </Card>
          ))}

          {isCreating && (
            <Card className="min-w-[280px] border-dashed">
              <CardHeader className="p-4">
                <CardTitle className="text-base">新建策略</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                <div className="space-y-2">
                  <Label>策略名称</Label>
                  <Input
                    placeholder="例如：我的波段系统"
                    value={newStrategyName}
                    onChange={(e) => setNewStrategyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>交易周期</Label>
                  <Select
                    value={newStrategyCycle}
                    onValueChange={(v) => setNewStrategyCycle(v as TradingCycle)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">短线交易（1-5天）</SelectItem>
                      <SelectItem value="swing">波段交易（1-4周）</SelectItem>
                      <SelectItem value="long">长线投资（1个月+）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateStrategy}>
                    创建
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsCreating(false)}
                  >
                    取消
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Strategy Config */}
        {activeStrategy && (
          <div className="space-y-6">
            {/* Strategy Header */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Settings2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle>{activeStrategy.name}</CardTitle>
                      <CardDescription>
                        {cycleLabels[activeStrategy.cycle]} · 创建于{' '}
                        {new Date(activeStrategy.createdAt).toLocaleDateString('zh-CN')}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={activeStrategy.status === 'active' ? 'default' : 'secondary'}
                    >
                      {activeStrategy.status === 'active' ? '已激活' : '未激活'}
                    </Badge>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认删除策略？</AlertDialogTitle>
                          <AlertDialogDescription>
                            此操作将永久删除策略"{activeStrategy.name}"，且无法恢复。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              deleteStrategy(activeStrategy.id);
                              toast.success('策略已删除');
                            }}
                          >
                            删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Tabs defaultValue="stock" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="stock" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">选股规则</span>
                </TabsTrigger>
                <TabsTrigger value="buy" className="gap-2">
                  <Zap className="h-4 w-4" />
                  <span className="hidden sm:inline">买入规则</span>
                </TabsTrigger>
                <TabsTrigger value="sell" className="gap-2">
                  <Target className="h-4 w-4" />
                  <span className="hidden sm:inline">卖出规则</span>
                </TabsTrigger>
                <TabsTrigger value="money" className="gap-2">
                  <Wallet className="h-4 w-4" />
                  <span className="hidden sm:inline">资金管理</span>
                </TabsTrigger>
              </TabsList>

              {/* 选股规则 */}
              <TabsContent value="stock" className="space-y-4">
                {!activeStrategy.stockRules ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-4 font-medium">选股规则未配置</h3>
                      <p className="mt-2 text-sm text-muted-foreground text-center">
                        此策略可能是从模板导入的旧版本，请重新创建策略或手动配置选股规则
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">技术面条件</CardTitle>
                    <CardDescription>筛选技术形态符合条件的股票</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>股价 &gt; 5日均线</Label>
                        <p className="text-sm text-muted-foreground">短期趋势向上</p>
                      </div>
                      <Switch
                        checked={activeStrategy.stockRules.priceAboveMA5}
                        onCheckedChange={(v) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.priceAboveMA5', v)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>股价 &gt; 20日均线</Label>
                        <p className="text-sm text-muted-foreground">中期趋势向上</p>
                      </div>
                      <Switch
                        checked={activeStrategy.stockRules.priceAboveMA20}
                        onCheckedChange={(v) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.priceAboveMA20', v)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>周线MACD金叉</Label>
                        <p className="text-sm text-muted-foreground">周级别趋势确认</p>
                      </div>
                      <Switch
                        checked={activeStrategy.stockRules.weeklyMACDGoldenCross}
                        onCheckedChange={(v) =>
                          handleUpdateRules(
                            activeStrategy.id,
                            'stockRules.weeklyMACDGoldenCross',
                            v
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>量比阈值</Label>
                        <span className="text-sm text-muted-foreground">
                          &gt; {activeStrategy.stockRules.volumeRatio}
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.stockRules.volumeRatio]}
                        min={1}
                        max={5}
                        step={0.1}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.volumeRatio', v)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">基本面条件</CardTitle>
                    <CardDescription>筛选财务��量良好的股票</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>最低 ROE</Label>
                        <span className="text-sm text-muted-foreground">
                          &gt; {activeStrategy.stockRules.minROE}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.stockRules.minROE]}
                        min={0}
                        max={30}
                        step={1}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.minROE', v)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>最高资产负债率</Label>
                        <span className="text-sm text-muted-foreground">
                          &lt; {activeStrategy.stockRules.maxDebtRatio}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.stockRules.maxDebtRatio]}
                        min={20}
                        max={80}
                        step={5}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.maxDebtRatio', v)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>PE历史分位</Label>
                        <span className="text-sm text-muted-foreground">
                          &lt; {activeStrategy.stockRules.maxPEPercentile}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.stockRules.maxPEPercentile]}
                        min={10}
                        max={80}
                        step={5}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.maxPEPercentile', v)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">资金面条件</CardTitle>
                    <CardDescription>筛选交投活跃的股票</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>5日换手率</Label>
                        <span className="text-sm text-muted-foreground">
                          &gt; {activeStrategy.stockRules.minTurnoverRate5D}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.stockRules.minTurnoverRate5D]}
                        min={1}
                        max={20}
                        step={0.5}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.minTurnoverRate5D', v)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>最大流通市值</Label>
                        <span className="text-sm text-muted-foreground">
                          &lt; {activeStrategy.stockRules.maxMarketCap}亿
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.stockRules.maxMarketCap]}
                        min={10}
                        max={500}
                        step={10}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.maxMarketCap', v)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>板块涨幅</Label>
                        <span className="text-sm text-muted-foreground">
                          &gt; {activeStrategy.stockRules.minSectorGain}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.stockRules.minSectorGain]}
                        min={0}
                        max={10}
                        step={0.5}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'stockRules.minSectorGain', v)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
                </>
                )}
              </TabsContent>

              {/* 买入规则 */}
              <TabsContent value="buy" className="space-y-4">
                {!activeStrategy.buyRules ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Zap className="h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-4 font-medium">买入规则未配置</h3>
                      <p className="mt-2 text-sm text-muted-foreground text-center">
                        请重新创建策略或手动配置买入规则
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">买入信号</CardTitle>
                    <CardDescription>触发买入的技术信号</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(Object.keys(signalLabels) as BuySignal[]).map((signal) => (
                        <div
                          key={signal}
                          className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                            activeStrategy.buyRules.signals.includes(signal)
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-primary/50'
                          }`}
                          onClick={() => toggleSignal(activeStrategy.id, signal)}
                        >
                          <span className="text-sm">{signalLabels[signal]}</span>
                          <Switch
                            checked={activeStrategy.buyRules.signals.includes(signal)}
                            onCheckedChange={() => toggleSignal(activeStrategy.id, signal)}
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">分批买入</CardTitle>
                    <CardDescription>控制单次买入比例，降低风险</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {activeStrategy.buyRules.batchBuyRatios.map((ratio, index) => (
                        <div key={index} className="rounded-lg border p-4 text-center">
                          <div className="text-2xl font-bold text-primary">
                            {(ratio * 100).toFixed(0)}%
                          </div>
                          <div className="text-sm text-muted-foreground">
                            第{index + 1}批
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      当前设置：首次买入30%，回调加仓30%，突破加仓40%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">加仓条件</CardTitle>
                    <CardDescription>触发加仓的条件设置</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>回调加仓点</Label>
                        <span className="text-sm text-muted-foreground">
                          下跌 {activeStrategy.buyRules.addPositionOnDip}% 加仓
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.buyRules.addPositionOnDip]}
                        min={3}
                        max={15}
                        step={1}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'buyRules.addPositionOnDip', v)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>站稳60日线加仓</Label>
                        <p className="text-sm text-muted-foreground">
                          股价站上60日均线时触发加仓
                        </p>
                      </div>
                      <Switch
                        checked={activeStrategy.buyRules.addPositionOnMA60}
                        onCheckedChange={(v) =>
                          handleUpdateRules(activeStrategy.id, 'buyRules.addPositionOnMA60', v)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
                </>
                )}
              </TabsContent>

              {/* 卖出规则 */}
              <TabsContent value="sell" className="space-y-4">
                {!activeStrategy.sellRules ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Target className="h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-4 font-medium">卖出规则未配置</h3>
                      <p className="mt-2 text-sm text-muted-foreground text-center">
                        请重新创建策略或手动配置卖出规则
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">止损设置</CardTitle>
                    <CardDescription>控制最大亏损，保护本金</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>固定止损线</Label>
                        <span className="text-sm font-medium text-destructive">
                          -{activeStrategy.sellRules.stopLossPercent}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.sellRules.stopLossPercent]}
                        min={3}
                        max={15}
                        step={0.5}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'sellRules.stopLossPercent', v)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        持仓亏损达到此比例时，强制止损卖出
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">止盈设置</CardTitle>
                    <CardDescription>锁定利润，落袋为安</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>分批止盈点</Label>
                        <span className="text-sm font-medium text-chart-1">
                          +{activeStrategy.sellRules.partialTakeProfitPercent}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.sellRules.partialTakeProfitPercent]}
                        min={5}
                        max={30}
                        step={1}
                        onValueChange={([v]) =>
                          handleUpdateRules(
                            activeStrategy.id,
                            'sellRules.partialTakeProfitPercent',
                            v
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        盈利达到此比例时，卖出一半锁定利润
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>目标止盈线</Label>
                        <span className="text-sm font-medium text-chart-1">
                          +{activeStrategy.sellRules.takeProfitPercent}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.sellRules.takeProfitPercent]}
                        min={10}
                        max={50}
                        step={1}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'sellRules.takeProfitPercent', v)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>移动止盈回撤</Label>
                        <span className="text-sm text-muted-foreground">
                          从高点回撤 {activeStrategy.sellRules.trailingStopPercent}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.sellRules.trailingStopPercent]}
                        min={3}
                        max={15}
                        step={0.5}
                        onValueChange={([v]) =>
                          handleUpdateRules(
                            activeStrategy.id,
                            'sellRules.trailingStopPercent',
                            v
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        股价从最高点回撤此比例时卖出，保护浮盈
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">时间止损</CardTitle>
                    <CardDescription>避免资金长期被套</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>持有天数上限</Label>
                        <span className="text-sm text-muted-foreground">
                          {activeStrategy.sellRules.timeStopDays} 个交易日
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.sellRules.timeStopDays]}
                        min={5}
                        max={60}
                        step={1}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'sellRules.timeStopDays', v)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>最低盈利要求</Label>
                        <span className="text-sm text-muted-foreground">
                          {activeStrategy.sellRules.timeStopMinGain}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.sellRules.timeStopMinGain]}
                        min={0}
                        max={10}
                        step={0.5}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'sellRules.timeStopMinGain', v)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        持有超过时间上限且盈利未达此要求时，执行卖出
                      </p>
                    </div>
                  </CardContent>
                </Card>
                </>
                )}
              </TabsContent>

              {/* 资金管理 */}
              <TabsContent value="money" className="space-y-4">
                {!activeStrategy.moneyRules ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Wallet className="h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-4 font-medium">资金管理规则未配置</h3>
                      <p className="mt-2 text-sm text-muted-foreground text-center">
                        请重新创建策略或手动配置资金管理规则
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">账户设置</CardTitle>
                    <CardDescription>设置总资金和仓位限制</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>总资金（元）</Label>
                      <Input
                        type="number"
                        value={activeStrategy.moneyRules.totalCapital}
                        onChange={(e) =>
                          handleUpdateRules(
                            activeStrategy.id,
                            'moneyRules.totalCapital',
                            Number(e.target.value)
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>最大持仓数量</Label>
                        <span className="text-sm text-muted-foreground">
                          {activeStrategy.moneyRules.maxPositions} 只
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.moneyRules.maxPositions]}
                        min={1}
                        max={10}
                        step={1}
                        onValueChange={([v]) =>
                          handleUpdateRules(activeStrategy.id, 'moneyRules.maxPositions', v)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">风险控制</CardTitle>
                    <CardDescription>分散投资，控制集中度</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>单股上限</Label>
                        <span className="text-sm text-muted-foreground">
                          {activeStrategy.moneyRules.maxSingleStockPercent}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.moneyRules.maxSingleStockPercent]}
                        min={10}
                        max={50}
                        step={5}
                        onValueChange={([v]) =>
                          handleUpdateRules(
                            activeStrategy.id,
                            'moneyRules.maxSingleStockPercent',
                            v
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        单只股票占总资金比例上限
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>行业上限</Label>
                        <span className="text-sm text-muted-foreground">
                          {activeStrategy.moneyRules.maxSectorPercent}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.moneyRules.maxSectorPercent]}
                        min={20}
                        max={80}
                        step={5}
                        onValueChange={([v]) =>
                          handleUpdateRules(
                            activeStrategy.id,
                            'moneyRules.maxSectorPercent',
                            v
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        同一行业股票总占比上限
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>最低现金比例</Label>
                        <span className="text-sm text-muted-foreground">
                          {activeStrategy.moneyRules.minCashPercent}%
                        </span>
                      </div>
                      <Slider
                        value={[activeStrategy.moneyRules.minCashPercent]}
                        min={0}
                        max={30}
                        step={5}
                        onValueChange={([v]) =>
                          handleUpdateRules(
                            activeStrategy.id,
                            'moneyRules.minCashPercent',
                            v
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        始终保持一定现金应对突发机会
                      </p>
                    </div>
                  </CardContent>
                </Card>
                </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {strategies.length === 0 && !isCreating && (
          <div className="flex flex-col items-center justify-center py-20">
            <Settings2 className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">还没有创建策略</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              选择预设模板快速开始，或自定义创建您的交易系统
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setShowTemplates(true)}>
                <Zap className="mr-2 h-4 w-4" /> 从模板创建
              </Button>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="mr-2 h-4 w-4" /> 自定义策略
              </Button>
            </div>
          </div>
        )}

        {/* 策略模板选择对话框 */}
        <AlertDialog open={showTemplates} onOpenChange={setShowTemplates}>
          <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                选择策略模板
              </AlertDialogTitle>
              <AlertDialogDescription>
                基于专业投资理论设计的预设策略模板，帮助您快速建立规则化交易系统
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="grid gap-4 md:grid-cols-2 py-4">
              {strategyTemplates.map((template) => (
                <Card 
                  key={template.id}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${
                    selectedTemplate?.id === template.id ? 'border-primary ring-2 ring-primary/20' : ''
                  }`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant={
                        template.riskLevel === 'low' ? 'secondary' :
                        template.riskLevel === 'medium' ? 'default' : 'destructive'
                      }>
                        {template.riskLevel === 'low' ? '低风险' :
                         template.riskLevel === 'medium' ? '中风险' : '高风险'}
                      </Badge>
                      <Badge variant="outline">
                        {template.category === 'swing' ? '波段交易' :
                         template.category === 'trend' ? '趋势跟踪' :
                         template.category === 'value' ? '价值投资' : '成长投资'}
                      </Badge>
                    </div>
                    <CardTitle className="text-base mt-2">{template.name}</CardTitle>
                    <CardDescription className="text-xs">{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Target className="h-3 w-3" />
                        止损 {template.exitRules.stopLossPercent}% / 止盈 {template.exitRules.takeProfitPercent}%
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Wallet className="h-3 w-3" />
                        单股上限 {(template.capitalRules.maxSinglePositionRatio * 100).toFixed(0)}%
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Shield className="h-3 w-3" />
                        单笔风险 {(template.capitalRules.maxSingleLossRatio * 100).toFixed(0)}%
                      </div>
                    </div>
                    
                    {selectedTemplate?.id === template.id && (
                      <div className="mt-4 pt-3 border-t space-y-2">
                        <p className="text-xs font-medium">适合人群：</p>
                        <div className="flex flex-wrap gap-1">
                          {template.suitableFor.map((item, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {item}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs font-medium mt-2">纪律要求：</p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {template.disciplineRules.slice(0, 3).map((rule, idx) => (
                            <li key={idx} className="flex items-start gap-1">
                              <Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                              {rule}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setSelectedTemplate(null);
                setShowTemplates(false);
              }}>
                取消
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => selectedTemplate && handleCreateFromTemplate(selectedTemplate)}
                disabled={!selectedTemplate}
              >
                使用此模板创建策略
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
