'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CheckCircle2, XCircle, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export interface RuleCheckResult {
  ruleName: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface RuleViolationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  actionType: 'buy' | 'sell';
  stockCode: string;
  stockName: string;
  ruleChecks: RuleCheckResult[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function RuleViolationDialog({
  open,
  onOpenChange,
  title,
  actionType,
  stockCode,
  stockName,
  ruleChecks,
  onConfirm,
  onCancel,
}: RuleViolationDialogProps) {
  const passedRules = ruleChecks.filter((r) => r.passed);
  const failedRules = ruleChecks.filter((r) => !r.passed);
  const complianceRate = ruleChecks.length > 0 
    ? Math.round((passedRules.length / ruleChecks.length) * 100) 
    : 100;
  
  const hasErrors = failedRules.some((r) => r.severity === 'error');
  const hasWarnings = failedRules.some((r) => r.severity === 'warning');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasErrors ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <div>
                  <p className="font-medium text-foreground">
                    {actionType === 'buy' ? '买入' : '卖出'}: {stockName}
                  </p>
                  <p className="text-sm text-muted-foreground">{stockCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">规则执行率</p>
                  <p className={`text-lg font-bold ${
                    complianceRate >= 80 ? 'text-green-500' : 
                    complianceRate >= 60 ? 'text-yellow-500' : 'text-destructive'
                  }`}>
                    {complianceRate}%
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>规则检查进度</span>
                  <span>{passedRules.length}/{ruleChecks.length} 通过</span>
                </div>
                <Progress value={complianceRate} className="h-2" />
              </div>

              {/* 规则检查结果列表 */}
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {ruleChecks.map((rule, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      rule.passed 
                        ? 'border-green-500/30 bg-green-500/5' 
                        : rule.severity === 'error'
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-yellow-500/30 bg-yellow-500/5'
                    }`}
                  >
                    {rule.passed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    ) : rule.severity === 'error' ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">
                          {rule.ruleName}
                        </span>
                        <Badge 
                          variant={rule.passed ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {rule.passed ? '通过' : rule.severity === 'error' ? '违反' : '警告'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {rule.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 警告提示 */}
              {hasErrors && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
                  <Shield className="mt-0.5 h-4 w-4 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive">纪律提醒</p>
                    <p className="text-muted-foreground">
                      此操作违反了您设定的交易规则。坚持纪律是长期盈利的关键。
                      确定要继续吗？
                    </p>
                  </div>
                </div>
              )}
              
              {!hasErrors && hasWarnings && (
                <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500" />
                  <div>
                    <p className="font-medium text-yellow-600">温馨提示</p>
                    <p className="text-muted-foreground">
                      此操作存在一些风险提示，建议仔细考虑后再做决定。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            取消操作
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={hasErrors ? 'bg-destructive hover:bg-destructive/90' : ''}
          >
            {hasErrors ? '我已知晓风险，继续执行' : '确认执行'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// 规则检查工具函数
export interface TradeContext {
  stockCode: string;
  stockName: string;
  price: number;
  quantity: number;
  totalCapital: number;
  currentPositions: Array<{
    stockCode: string;
    stockName: string;
    sector: string;
    buyPrice: number;
    currentPrice: number;
    shares: number;
  }>;
  strategy: {
    maxPositionRatio: number;      // 单股最大仓位比例
    maxTotalPositionRatio: number; // 总仓位上限
    maxSingleLossRatio: number;    // 单笔最大亏损比例
    stopLossPercent: number;       // 止损比例
    takeProfitPercent: number;     // 止盈比例
    maxSectorRatio: number;        // 行业集中度上限
    minPeRatio?: number;           // PE下限
    maxPeRatio?: number;           // PE上限
    minMarketCap?: number;         // 最小市值
  };
  stockInfo?: {
    sector: string;
    peRatio: number;
    marketCap: number;
  };
}

export function checkBuyRules(context: TradeContext): RuleCheckResult[] {
  const results: RuleCheckResult[] = [];
  const { 
    price, 
    quantity, 
    totalCapital, 
    currentPositions, 
    strategy,
    stockInfo,
    stockCode,
  } = context;

  const tradeAmount = price * quantity;
  const currentUsedCapital = currentPositions.reduce(
    (sum, p) => sum + p.buyPrice * p.shares, 
    0
  );

  // 1. 单股仓位检查
  const positionRatio = tradeAmount / totalCapital;
  const existingPosition = currentPositions.find(p => p.stockCode === stockCode);
  const totalPositionForStock = existingPosition 
    ? (existingPosition.buyPrice * existingPosition.shares + tradeAmount) / totalCapital
    : positionRatio;

  results.push({
    ruleName: '单股仓位限制',
    passed: totalPositionForStock <= strategy.maxPositionRatio,
    message: totalPositionForStock <= strategy.maxPositionRatio
      ? `仓位${(totalPositionForStock * 100).toFixed(1)}%，在限制${(strategy.maxPositionRatio * 100).toFixed(0)}%以内`
      : `仓位${(totalPositionForStock * 100).toFixed(1)}%超过限制${(strategy.maxPositionRatio * 100).toFixed(0)}%`,
    severity: totalPositionForStock > strategy.maxPositionRatio * 1.2 ? 'error' : 'warning',
  });

  // 2. 总仓位检查
  const newTotalRatio = (currentUsedCapital + tradeAmount) / totalCapital;
  results.push({
    ruleName: '总仓位限制',
    passed: newTotalRatio <= strategy.maxTotalPositionRatio,
    message: newTotalRatio <= strategy.maxTotalPositionRatio
      ? `总仓位${(newTotalRatio * 100).toFixed(1)}%，在限制${(strategy.maxTotalPositionRatio * 100).toFixed(0)}%以内`
      : `总仓位${(newTotalRatio * 100).toFixed(1)}%超过限制${(strategy.maxTotalPositionRatio * 100).toFixed(0)}%`,
    severity: newTotalRatio > strategy.maxTotalPositionRatio ? 'error' : 'info',
  });

  // 3. 单笔风险检查（基于止损）
  const potentialLoss = tradeAmount * (strategy.stopLossPercent / 100);
  const lossRatio = potentialLoss / totalCapital;
  results.push({
    ruleName: '单笔风险限制',
    passed: lossRatio <= strategy.maxSingleLossRatio,
    message: lossRatio <= strategy.maxSingleLossRatio
      ? `潜在亏损${(lossRatio * 100).toFixed(2)}%，在限制${(strategy.maxSingleLossRatio * 100).toFixed(0)}%以内`
      : `潜在亏损${(lossRatio * 100).toFixed(2)}%超过限制${(strategy.maxSingleLossRatio * 100).toFixed(0)}%`,
    severity: lossRatio > strategy.maxSingleLossRatio ? 'error' : 'info',
  });

  // 4. 行业集中度检查
  if (stockInfo && strategy.maxSectorRatio) {
    const sectorPositions = currentPositions.filter(p => p.sector === stockInfo.sector);
    const sectorCapital = sectorPositions.reduce((sum, p) => sum + p.buyPrice * p.shares, 0);
    const newSectorRatio = (sectorCapital + tradeAmount) / totalCapital;
    
    results.push({
      ruleName: '行业集中度限制',
      passed: newSectorRatio <= strategy.maxSectorRatio,
      message: newSectorRatio <= strategy.maxSectorRatio
        ? `${stockInfo.sector}行业仓位${(newSectorRatio * 100).toFixed(1)}%，在限制${(strategy.maxSectorRatio * 100).toFixed(0)}%以内`
        : `${stockInfo.sector}行业仓位${(newSectorRatio * 100).toFixed(1)}%超过限制${(strategy.maxSectorRatio * 100).toFixed(0)}%`,
      severity: newSectorRatio > strategy.maxSectorRatio ? 'warning' : 'info',
    });
  }

  // 5. PE估值检查
  if (stockInfo && (strategy.minPeRatio || strategy.maxPeRatio)) {
    const peValid = (!strategy.minPeRatio || stockInfo.peRatio >= strategy.minPeRatio) &&
                    (!strategy.maxPeRatio || stockInfo.peRatio <= strategy.maxPeRatio);
    results.push({
      ruleName: 'PE估值范围',
      passed: peValid,
      message: peValid
        ? `PE ${stockInfo.peRatio.toFixed(1)} 在合理范围内`
        : `PE ${stockInfo.peRatio.toFixed(1)} 超出设定范围 (${strategy.minPeRatio || 0}-${strategy.maxPeRatio || '∞'})`,
      severity: peValid ? 'info' : 'warning',
    });
  }

  // 6. 市值检查
  if (stockInfo && strategy.minMarketCap) {
    const marketCapBillion = stockInfo.marketCap / 100000000;
    const marketCapValid = marketCapBillion >= strategy.minMarketCap;
    results.push({
      ruleName: '最小市值要求',
      passed: marketCapValid,
      message: marketCapValid
        ? `市值${marketCapBillion.toFixed(0)}亿，满足最低${strategy.minMarketCap}亿要求`
        : `市值${marketCapBillion.toFixed(0)}亿，低于最低${strategy.minMarketCap}亿要求`,
      severity: marketCapValid ? 'info' : 'warning',
    });
  }

  // 7. 重复买入检查
  if (existingPosition) {
    const currentProfitPercent = ((existingPosition.currentPrice - existingPosition.buyPrice) / existingPosition.buyPrice) * 100;
    results.push({
      ruleName: '重复买入检查',
      passed: currentProfitPercent >= 0,
      message: currentProfitPercent >= 0
        ? `已持有该股票，当前盈利${currentProfitPercent.toFixed(2)}%，可考虑加仓`
        : `已持有该股票，当前亏损${Math.abs(currentProfitPercent).toFixed(2)}%，加仓需谨慎`,
      severity: currentProfitPercent < -5 ? 'warning' : 'info',
    });
  }

  return results;
}

export function checkSellRules(
  context: TradeContext & { 
    sellType: 'stopLoss' | 'takeProfit' | 'manual' | 'timeStop';
    holdingDays?: number;
    currentProfit?: number;
  }
): RuleCheckResult[] {
  const results: RuleCheckResult[] = [];
  const { strategy, sellType, holdingDays, currentProfit } = context;

  // 1. 止损规则检查
  if (sellType === 'stopLoss' || (currentProfit !== undefined && currentProfit < 0)) {
    const isValidStopLoss = currentProfit !== undefined && 
      Math.abs(currentProfit) >= strategy.stopLossPercent * 0.8;
    results.push({
      ruleName: '止损规则执行',
      passed: isValidStopLoss || sellType === 'stopLoss',
      message: isValidStopLoss || sellType === 'stopLoss'
        ? `按照止损规则执行卖出，纪律执行良好`
        : `当前亏损${Math.abs(currentProfit || 0).toFixed(2)}%，未达到止损点${strategy.stopLossPercent}%，提前卖出可能错过反弹`,
      severity: isValidStopLoss || sellType === 'stopLoss' ? 'info' : 'warning',
    });
  }

  // 2. 止盈规则检查
  if (sellType === 'takeProfit' || (currentProfit !== undefined && currentProfit > 0)) {
    const isValidTakeProfit = currentProfit !== undefined && 
      currentProfit >= strategy.takeProfitPercent * 0.8;
    results.push({
      ruleName: '止盈规则执行',
      passed: isValidTakeProfit || sellType === 'takeProfit',
      message: isValidTakeProfit || sellType === 'takeProfit'
        ? `按照止盈规则执行卖出，纪律执行良好`
        : `当前盈利${(currentProfit || 0).toFixed(2)}%，未达到止盈点${strategy.takeProfitPercent}%，提前卖出可能错失更多收益`,
      severity: isValidTakeProfit || sellType === 'takeProfit' ? 'info' : 'warning',
    });
  }

  // 3. 持股时间检查
  if (holdingDays !== undefined) {
    const isLongHold = holdingDays > 30;
    results.push({
      ruleName: '持股时间记录',
      passed: true,
      message: `已持有${holdingDays}天${isLongHold ? '，注意波段交易不宜持股过长' : ''}`,
      severity: isLongHold && sellType === 'manual' ? 'info' : 'info',
    });
  }

  // 4. 卖出类型记录
  const sellTypeNames = {
    stopLoss: '止损卖出',
    takeProfit: '止盈卖出',
    manual: '手动卖出',
    timeStop: '时间止损',
  };
  results.push({
    ruleName: '卖出类型',
    passed: sellType !== 'manual',
    message: sellType !== 'manual'
      ? `${sellTypeNames[sellType]} - 遵守系统规则`
      : `手动卖出 - 请确认有充分理由`,
    severity: sellType === 'manual' ? 'warning' : 'info',
  });

  return results;
}
