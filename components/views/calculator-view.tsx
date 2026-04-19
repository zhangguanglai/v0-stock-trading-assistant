'use client';

import { useState, useMemo } from 'react';
import {
  Calculator,
  AlertTriangle,
  Check,
  Circle,
  Info,
  TrendingUp,
  DollarSign,
  Target,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { useStockStore } from '@/lib/store';
import { formatCurrency } from '@/lib/mock-data';

// 买入信号状态
type SignalStatus = 'green' | 'yellow' | 'red';

interface SignalCheck {
  name: string;
  status: SignalStatus;
  description: string;
}

export function CalculatorView() {
  const { strategies, activeStrategyId, positions, addPosition, addTradeRecord } =
    useStockStore();

  const activeStrategy = useMemo(
    () => strategies.find((s) => s.id === activeStrategyId),
    [strategies, activeStrategyId]
  );

  // 输入状态
  const [stockCode, setStockCode] = useState('');
  const [stockName, setStockName] = useState('');
  const [stockPrice, setStockPrice] = useState<number>(0);
  const [plannedAmount, setPlannedAmount] = useState<number>(
    activeStrategy?.moneyRules.totalCapital
      ? activeStrategy.moneyRules.totalCapital * 0.2
      : 40000
  );
  const [sector, setSector] = useState('');
  const [useCustomRatios, setUseCustomRatios] = useState(false);
  const [customRatios, setCustomRatios] = useState([30, 30, 40]);

  // 模拟信号检查
  const signals: SignalCheck[] = useMemo(() => {
    if (!stockCode) return [];
    
    // 这里是模拟数据，实际应该从数据源获取
    return [
      {
        name: '股价 > 5日均线',
        status: Math.random() > 0.3 ? 'green' : 'red',
        description: '短期趋势向上',
      },
      {
        name: '股价 > 20日均线',
        status: Math.random() > 0.4 ? 'green' : 'yellow',
        description: '中期趋势确认',
      },
      {
        name: 'MACD金叉',
        status: Math.random() > 0.5 ? 'green' : 'red',
        description: '动能转强信号',
      },
      {
        name: '量比 > 1.5',
        status: Math.random() > 0.4 ? 'green' : 'yellow',
        description: '成交活跃',
      },
      {
        name: 'ROE > 10%',
        status: Math.random() > 0.3 ? 'green' : 'red',
        description: '盈利能力良好',
      },
    ];
  }, [stockCode]);

  const overallSignal = useMemo(() => {
    if (signals.length === 0) return 'none';
    const greenCount = signals.filter((s) => s.status === 'green').length;
    const redCount = signals.filter((s) => s.status === 'red').length;
    
    if (greenCount >= 4) return 'green';
    if (redCount >= 3) return 'red';
    return 'yellow';
  }, [signals]);

  // 计算分批买入计划
  const buyPlan = useMemo(() => {
    const ratios = useCustomRatios
      ? customRatios.map((r) => r / 100)
      : activeStrategy?.buyRules.batchBuyRatios || [0.3, 0.3, 0.4];

    return ratios.map((ratio, index) => {
      const amount = plannedAmount * ratio;
      const shares = stockPrice > 0 ? Math.floor(amount / stockPrice / 100) * 100 : 0;
      const actualAmount = shares * stockPrice;

      return {
        batch: index + 1,
        ratio: ratio * 100,
        amount,
        shares,
        actualAmount,
        trigger:
          index === 0
            ? '信号出现时'
            : index === 1
            ? `下跌${activeStrategy?.buyRules.addPositionOnDip || 5}%时`
            : '站稳60日线时',
      };
    });
  }, [plannedAmount, stockPrice, useCustomRatios, customRatios, activeStrategy]);

  // 计算止损止盈价格
  const priceTargets = useMemo(() => {
    if (stockPrice <= 0) return null;

    const stopLoss = activeStrategy?.sellRules.stopLossPercent || 8;
    const takeProfit = activeStrategy?.sellRules.takeProfitPercent || 25;
    const partialProfit = activeStrategy?.sellRules.partialTakeProfitPercent || 15;

    return {
      stopLossPrice: stockPrice * (1 - stopLoss / 100),
      takeProfitPrice: stockPrice * (1 + takeProfit / 100),
      partialProfitPrice: stockPrice * (1 + partialProfit / 100),
      maxLoss: plannedAmount * (stopLoss / 100),
      expectedProfit: plannedAmount * (takeProfit / 100),
    };
  }, [stockPrice, plannedAmount, activeStrategy]);

  // 风险检查
  const riskChecks = useMemo(() => {
    if (!activeStrategy) return [];

    const totalCapital = activeStrategy.moneyRules.totalCapital;
    const maxSinglePercent = activeStrategy.moneyRules.maxSingleStockPercent;
    const maxSectorPercent = activeStrategy.moneyRules.maxSectorPercent;
    const minCashPercent = activeStrategy.moneyRules.minCashPercent;

    const checks = [];

    // 单股仓位检查
    const singleStockPercent = (plannedAmount / totalCapital) * 100;
    checks.push({
      name: '单股仓位',
      pass: singleStockPercent <= maxSinglePercent,
      current: singleStockPercent.toFixed(1) + '%',
      limit: maxSinglePercent + '%',
    });

    // 行业集中度检查
    if (sector) {
      const existingSectorValue = positions
        .filter((p) => p.sector === sector)
        .reduce((sum, p) => sum + p.currentPrice * p.shares, 0);
      const newSectorPercent =
        ((existingSectorValue + plannedAmount) / totalCapital) * 100;
      checks.push({
        name: '行业集中度',
        pass: newSectorPercent <= maxSectorPercent,
        current: newSectorPercent.toFixed(1) + '%',
        limit: maxSectorPercent + '%',
      });
    }

    // 现金比例检查
    const currentCost = positions.reduce(
      (sum, p) => sum + p.buyPrice * p.shares,
      0
    );
    const afterBuyCash = totalCapital - currentCost - plannedAmount;
    const afterBuyCashPercent = (afterBuyCash / totalCapital) * 100;
    checks.push({
      name: '现金比例',
      pass: afterBuyCashPercent >= minCashPercent,
      current: afterBuyCashPercent.toFixed(1) + '%',
      limit: '>' + minCashPercent + '%',
    });

    // 持仓数量检查
    const maxPositions = activeStrategy.moneyRules.maxPositions;
    const currentPositions = positions.length;
    checks.push({
      name: '持仓数量',
      pass: currentPositions < maxPositions,
      current: currentPositions + '只',
      limit: maxPositions + '只',
    });

    return checks;
  }, [activeStrategy, plannedAmount, sector, positions]);

  const hasRiskWarning = riskChecks.some((c) => !c.pass);

  const handleExecuteBuy = () => {
    if (!stockCode || !stockName || stockPrice <= 0) {
      return;
    }

    const firstBatch = buyPlan[0];
    if (firstBatch.shares <= 0) return;

    // 添加持仓
    addPosition({
      strategyId: activeStrategyId || '',
      stockCode,
      stockName,
      sector: sector || '未知',
      buyPrice: stockPrice,
      currentPrice: stockPrice,
      shares: firstBatch.shares,
      buyDate: new Date(),
      stopLossPrice: priceTargets?.stopLossPrice || 0,
      takeProfitPrice: priceTargets?.takeProfitPrice || 0,
      trailingStopEnabled: true,
      highestPrice: stockPrice,
      alertTriggered: false,
    });

    // 添加交易记录
    addTradeRecord({
      strategyId: activeStrategyId || '',
      stockCode,
      stockName,
      type: 'buy',
      price: stockPrice,
      shares: firstBatch.shares,
      amount: firstBatch.actualAmount,
      date: new Date(),
      triggerReason: '首次建仓 - 信号确认',
    });

    // 重置表单
    setStockCode('');
    setStockName('');
    setStockPrice(0);
    setSector('');
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">仓位计算器</h1>
            <p className="text-sm text-muted-foreground">
              计算分批买入计划，评估买入信号
            </p>
          </div>
          <Badge variant="secondary">
            策略：{activeStrategy?.name || '未选择'}
          </Badge>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 左侧：输入区域 */}
          <div className="space-y-6">
            {/* 股票信息 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">股票信息</CardTitle>
                <CardDescription>输入要评估的股票</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>股票代码</Label>
                    <Input
                      placeholder="例如：600519"
                      value={stockCode}
                      onChange={(e) => setStockCode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>股票名称</Label>
                    <Input
                      placeholder="例如：贵州茅台"
                      value={stockName}
                      onChange={(e) => setStockName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>当前价格</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={stockPrice || ''}
                      onChange={(e) => setStockPrice(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>所属行业</Label>
                    <Select value={sector} onValueChange={setSector}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择行业" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="白酒">白酒</SelectItem>
                        <SelectItem value="新能源">新能源</SelectItem>
                        <SelectItem value="银行">银行</SelectItem>
                        <SelectItem value="医药">医药</SelectItem>
                        <SelectItem value="电子">电子</SelectItem>
                        <SelectItem value="家电">家电</SelectItem>
                        <SelectItem value="光伏">光伏</SelectItem>
                        <SelectItem value="其他">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 仓位设置 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">仓位设置</CardTitle>
                <CardDescription>设定计划投入金额</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>计划投入金额</Label>
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(plannedAmount)}
                    </span>
                  </div>
                  <Slider
                    value={[plannedAmount]}
                    min={10000}
                    max={activeStrategy?.moneyRules.totalCapital || 200000}
                    step={1000}
                    onValueChange={([v]) => setPlannedAmount(v)}
                  />
                  <p className="text-xs text-muted-foreground">
                    占总资金{' '}
                    {(
                      (plannedAmount /
                        (activeStrategy?.moneyRules.totalCapital || 200000)) *
                      100
                    ).toFixed(1)}
                    %
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>自定义分批比例</Label>
                    <p className="text-sm text-muted-foreground">
                      覆盖策略默认设置
                    </p>
                  </div>
                  <Switch
                    checked={useCustomRatios}
                    onCheckedChange={setUseCustomRatios}
                  />
                </div>

                {useCustomRatios && (
                  <div className="space-y-4">
                    {customRatios.map((ratio, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>第{index + 1}批</Label>
                          <span className="text-sm">{ratio}%</span>
                        </div>
                        <Slider
                          value={[ratio]}
                          min={10}
                          max={60}
                          step={5}
                          onValueChange={([v]) => {
                            const newRatios = [...customRatios];
                            newRatios[index] = v;
                            setCustomRatios(newRatios);
                          }}
                        />
                      </div>
                    ))}
                    {customRatios.reduce((a, b) => a + b, 0) !== 100 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          比例总和应为100%，当前为
                          {customRatios.reduce((a, b) => a + b, 0)}%
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 信号灯 */}
            {stockCode && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">交易信号灯</CardTitle>
                      <CardDescription>基于策略规则的买入信号评估</CardDescription>
                    </div>
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full ${
                        overallSignal === 'green'
                          ? 'bg-chart-1/20'
                          : overallSignal === 'yellow'
                          ? 'bg-warning/20'
                          : overallSignal === 'red'
                          ? 'bg-destructive/20'
                          : 'bg-muted'
                      }`}
                    >
                      <Circle
                        className={`h-8 w-8 ${
                          overallSignal === 'green'
                            ? 'fill-chart-1 text-chart-1'
                            : overallSignal === 'yellow'
                            ? 'fill-warning text-warning'
                            : overallSignal === 'red'
                            ? 'fill-destructive text-destructive'
                            : 'fill-muted-foreground text-muted-foreground'
                        }`}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {signals.map((signal, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-3 w-3 rounded-full ${
                              signal.status === 'green'
                                ? 'bg-chart-1'
                                : signal.status === 'yellow'
                                ? 'bg-warning'
                                : 'bg-destructive'
                            }`}
                          />
                          <div>
                            <div className="text-sm font-medium">{signal.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {signal.description}
                            </div>
                          </div>
                        </div>
                        {signal.status === 'green' ? (
                          <Check className="h-4 w-4 text-chart-1" />
                        ) : (
                          <AlertTriangle
                            className={`h-4 w-4 ${
                              signal.status === 'yellow'
                                ? 'text-warning'
                                : 'text-destructive'
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧：计算结果 */}
          <div className="space-y-6">
            {/* 分批买入计划 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-5 w-5" />
                  分批买入计划
                </CardTitle>
                <CardDescription>基于策略规则的建仓计划</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {buyPlan.map((batch) => (
                    <div
                      key={batch.batch}
                      className="rounded-lg border p-4"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant={batch.batch === 1 ? 'default' : 'secondary'}>
                          第{batch.batch}批 · {batch.ratio}%
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {batch.trigger}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-lg font-bold">
                            {formatCurrency(batch.amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">计划金额</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-primary">
                            {batch.shares}
                          </div>
                          <div className="text-xs text-muted-foreground">建议股数</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">
                            {formatCurrency(batch.actualAmount)}
                          </div>
                          <div className="text-xs text-muted-foreground">实际金额</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 止盈止损 */}
            {priceTargets && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-5 w-5" />
                    止盈止损价位
                  </CardTitle>
                  <CardDescription>基于策略规则自动计算</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">止损价</span>
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        {priceTargets.stopLossPrice.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        最大亏损：{formatCurrency(priceTargets.maxLoss)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-chart-1/30 bg-chart-1/5 p-4">
                      <div className="flex items-center gap-2 text-chart-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-sm font-medium">目标价</span>
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        {priceTargets.takeProfitPrice.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        预期收益：{formatCurrency(priceTargets.expectedProfit)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-warning">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-sm font-medium">分批止盈价</span>
                    </div>
                    <div className="mt-2 text-xl font-bold">
                      {priceTargets.partialProfitPrice.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      达到此价位卖出一半，锁定利润
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 风险检查 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">风险检查</CardTitle>
                <CardDescription>基于资金管理规则的风险评估</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {riskChecks.map((check, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between rounded-lg border p-3 ${
                        !check.pass ? 'border-destructive/50 bg-destructive/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {check.pass ? (
                          <Check className="h-4 w-4 text-chart-1" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        )}
                        <span className="text-sm">{check.name}</span>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-medium ${
                            !check.pass ? 'text-destructive' : ''
                          }`}
                        >
                          {check.current}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          限制：{check.limit}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {hasRiskWarning && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>风险警告</AlertTitle>
                    <AlertDescription>
                      当前买入计划违反了资金管理规则，是否仍要执行？
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* 执行按钮 */}
            <div className="flex gap-4">
              <Button
                className="flex-1"
                size="lg"
                disabled={!stockCode || !stockName || stockPrice <= 0}
                onClick={handleExecuteBuy}
              >
                <Calculator className="mr-2 h-5 w-5" />
                执行首批买入
              </Button>
            </div>

            {hasRiskWarning && (
              <p className="text-center text-sm text-muted-foreground">
                <Info className="mr-1 inline h-4 w-4" />
                继续操作将违反资金管理规则
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
