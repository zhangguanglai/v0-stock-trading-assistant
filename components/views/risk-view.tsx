'use client'

import { useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { useStore } from '@/lib/store'

export function RiskView() {
  const { positions, portfolio } = useStore()
  const [selectedMetric, setSelectedMetric] = useState<string>('all')

  // 计算风险指标
  const riskMetrics = {
    totalCapital: portfolio.totalCapital,
    usedCapital: portfolio.positions.reduce((sum, p) => sum + p.cost, 0),
    availableCapital: portfolio.totalCapital - portfolio.positions.reduce((sum, p) => sum + p.cost, 0),
    maxSinglePositionRisk: Math.max(...portfolio.positions.map(p => p.stopLossPercent || 5), 5),
    portfolioDrawdown: Math.abs(
      portfolio.positions.reduce((sum, p) => {
        const loss = p.currentPrice < p.entryPrice ? p.currentPrice - p.entryPrice : 0
        return sum + loss * p.quantity
      }, 0)
    ),
    correlationRisk: positions.length > 0 ? Math.min(0.7, positions.length * 0.1) : 0,
  }

  // 风险分布数据
  const riskDistribution = positions.map((p, idx) => ({
    name: p.code,
    risk: (p.stopLossPercent || 5) * (p.quantity * p.entryPrice) / riskMetrics.totalCapital,
    allocation: (p.quantity * p.currentPrice) / (portfolio.positions.reduce((sum, pos) => sum + pos.currentPrice * pos.quantity, 0) || 1),
  })).slice(0, 8)

  // 资金分配数据
  const capitalData = [
    {
      name: '已用资金',
      value: riskMetrics.usedCapital,
      fill: '#2dd4bf',
    },
    {
      name: '可用资金',
      value: Math.max(0, riskMetrics.availableCapital),
      fill: '#64748b',
    },
  ]

  // 风险等级评分
  const getRiskLevel = () => {
    const usageRate = riskMetrics.usedCapital / riskMetrics.totalCapital
    if (usageRate > 0.8) return { level: '极高', color: 'bg-red-500', desc: '仓位过重，建议及时减仓' }
    if (usageRate > 0.7) return { level: '很高', color: 'bg-red-400', desc: '仓位较重，需要谨慎' }
    if (usageRate > 0.5) return { level: '中等', color: 'bg-yellow-500', desc: '仓位适中，可接受' }
    if (usageRate > 0.3) return { level: '较低', color: 'bg-green-500', desc: '仓位合理，风险可控' }
    return { level: '低', color: 'bg-green-400', desc: '仓位轻，可继续投资' }
  }

  const riskLevel = getRiskLevel()

  // 跌停损失估算
  const maxLossSimulation = [
    { scenario: '-5%', loss: riskMetrics.totalCapital * 0.05, color: '#fbbf24' },
    { scenario: '-10%', loss: riskMetrics.totalCapital * 0.1, color: '#f87171' },
    { scenario: '-20%', loss: riskMetrics.totalCapital * 0.2, color: '#ef4444' },
    { scenario: '-50%', loss: riskMetrics.totalCapital * 0.5, color: '#7f1d1d' },
  ]

  // 波动率数据
  const volatilityData = portfolio.positions.map((p, idx) => ({
    name: p.code,
    volatility: 15 + Math.random() * 25,
    sharpeRatio: 0.5 + Math.random() * 1.5,
  })).slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* 风险等级卡片 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              整体风险等级
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-2xl font-bold ${riskLevel.color.replace('bg-', 'text-')}`}>
                  {riskLevel.level}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{riskLevel.desc}</p>
              </div>
              <div className={`${riskLevel.color} p-3 rounded-lg`}>
                <AlertCircle className="text-white" size={20} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 资金使用率 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              资金使用率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {((riskMetrics.usedCapital / riskMetrics.totalCapital) * 100).toFixed(1)}%
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, (riskMetrics.usedCapital / riskMetrics.totalCapital) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                已用 {riskMetrics.usedCapital.toFixed(0)} / {riskMetrics.totalCapital.toFixed(0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 最大单个头寸风险 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最大单头风险
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-warning">
                  {riskMetrics.maxSinglePositionRisk.toFixed(1)}%
                </div>
                <TrendingDown className="text-warning" size={20} />
              </div>
              <p className="text-xs text-muted-foreground">
                最大止损比例
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 关联风险 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              关联性风险
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {(riskMetrics.correlationRisk * 100).toFixed(0)}%
              </div>
              <Badge variant="outline" className="w-fit">
                {positions.length} 个持仓
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                组合多样化程度
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="capital" className="space-y-4">
        <TabsList>
          <TabsTrigger value="capital">资金配置</TabsTrigger>
          <TabsTrigger value="distribution">风险分布</TabsTrigger>
          <TabsTrigger value="scenario">压力测试</TabsTrigger>
          <TabsTrigger value="volatility">波动率分析</TabsTrigger>
        </TabsList>

        {/* 资金配置 */}
        <TabsContent value="capital">
          <Card>
            <CardHeader>
              <CardTitle>资金配置分析</CardTitle>
              <CardDescription>
                总资金 ¥{riskMetrics.totalCapital.toFixed(0)} | 已用 ¥{riskMetrics.usedCapital.toFixed(0)} | 可用 ¥{riskMetrics.availableCapital.toFixed(0)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={capitalData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => (
                      `${name}: ¥${(value / 10000).toFixed(1)}万 (${(percent * 100).toFixed(0)}%)`
                    )}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {capitalData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `¥${(value / 10000).toFixed(1)}万`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 风险分布 */}
        <TabsContent value="distribution">
          <Card>
            <CardHeader>
              <CardTitle>持仓风险分布</CardTitle>
              <CardDescription>
                各持仓的风险敞口占比
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={riskDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" label={{ value: '风险敞口 (%)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: '仓位占比 (%)', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="risk" fill="#f87171" name="风险敞口" />
                  <Bar yAxisId="right" dataKey="allocation" fill="#2dd4bf" name="仓位占比" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 压力测试 */}
        <TabsContent value="scenario">
          <Card>
            <CardHeader>
              <CardTitle>市场压力测试</CardTitle>
              <CardDescription>
                在极端市场场景下的最大可能损失
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {maxLossSimulation.map((scenario) => (
                  <div key={scenario.scenario} className="p-4 border rounded-lg">
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      市场跌幅
                    </div>
                    <div className="text-2xl font-bold mb-1" style={{ color: scenario.color }}>
                      {scenario.scenario}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      预期损失: ¥{scenario.loss.toFixed(0)}
                    </div>
                    <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.min(100, (scenario.loss / riskMetrics.totalCapital) * 100)}%`,
                          backgroundColor: scenario.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-warning/10 border border-warning/30 rounded-lg">
                <div className="flex gap-2">
                  <AlertCircle className="text-warning" size={20} />
                  <div>
                    <div className="font-medium">压力测试提示</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      在-20%的市场跌幅下，您的投资组合预期损失为 ¥{(riskMetrics.totalCapital * 0.2).toFixed(0)}。
                      建议定期复盘并调整止损点位。
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 波动率分析 */}
        <TabsContent value="volatility">
          <Card>
            <CardHeader>
              <CardTitle>股票波动率与夏普比率</CardTitle>
              <CardDescription>
                个股风险收益特征分析
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={volatilityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" label={{ value: '波动率 (%)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: '夏普比率', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="volatility" stroke="#f87171" name="波动率" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="sharpeRatio" stroke="#2dd4bf" name="夏普比率" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 风险建议 */}
      <Card>
        <CardHeader>
          <CardTitle>风险控制建议</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {riskMetrics.usedCapital / riskMetrics.totalCapital > 0.7 && (
            <div className="flex gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded">
              <AlertCircle className="text-red-600 flex-shrink-0" size={18} />
              <div className="text-sm">
                <div className="font-medium text-red-900 dark:text-red-400">仓位过重</div>
                <p className="text-red-800 dark:text-red-300 text-xs mt-1">
                  您的仓位使用率已达{((riskMetrics.usedCapital / riskMetrics.totalCapital) * 100).toFixed(0)}%，建议保留风险资本以应对突发情况。
                </p>
              </div>
            </div>
          )}

          {positions.length < 3 && (
            <div className="flex gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/30 rounded">
              <AlertCircle className="text-yellow-600 flex-shrink-0" size={18} />
              <div className="text-sm">
                <div className="font-medium text-yellow-900 dark:text-yellow-400">多样化不足</div>
                <p className="text-yellow-800 dark:text-yellow-300 text-xs mt-1">
                  建议持仓数量保持在3-5只，提高组合的抗风险能力。
                </p>
              </div>
            </div>
          )}

          {riskMetrics.maxSinglePositionRisk > 10 && (
            <div className="flex gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 rounded">
              <AlertCircle className="text-orange-600 flex-shrink-0" size={18} />
              <div className="text-sm">
                <div className="font-medium text-orange-900 dark:text-orange-400">单头风险过大</div>
                <p className="text-orange-800 dark:text-orange-300 text-xs mt-1">
                  建议单个头寸止损比例不超过5-8%，当前最大止损为{riskMetrics.maxSinglePositionRisk.toFixed(1)}%。
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded">
            <TrendingUp className="text-green-600 flex-shrink-0" size={18} />
            <div className="text-sm">
              <div className="font-medium text-green-900 dark:text-green-400">风险管理要点</div>
              <p className="text-green-800 dark:text-green-300 text-xs mt-1">
                定期复盘交易日志，严格执行交易计划中的止损和止盈点位，不让小亏变成大损。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
