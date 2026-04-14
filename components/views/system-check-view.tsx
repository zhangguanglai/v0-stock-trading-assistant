'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Server,
  Database,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

interface VerificationResult {
  overall: 'success' | 'partial' | 'failed';
  verification: {
    timestamp: string;
    services: {
      sina: { status: string; message: string };
      tushare: { status: string; message: string };
      indicators: { status: string; message: string };
    };
    errors: string[];
  };
  readyForProduction: boolean;
}

export function SystemCheckView() {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSystem = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const response = await fetch('/api/system/verify');
      const data = await response.json();
      setResult(data);

      if (data.overall === 'success') {
        toast.success('系统检查完成：所有服务正常');
      } else if (data.overall === 'partial') {
        toast.warning('系统检查完成：部分服务需要配置');
      } else {
        toast.error('系统检查完成：存在异常服务');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '检查失败');
      toast.error('系统检查失败');
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkSystem();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500">正常</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500">警告</Badge>;
      case 'failed':
        return <Badge className="bg-red-500">异常</Badge>;
      default:
        return <Badge className="bg-gray-400">检查中</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-3xl font-bold">系统诊断</h1>
        <p className="text-muted-foreground">验证数据API配置和连接状态</p>
      </div>

      {/* 整体状态 */}
      {result && (
        <Card className={`border-2 ${
          result.overall === 'success'
            ? 'border-green-500/20 bg-green-50 dark:bg-green-950/20'
            : result.overall === 'partial'
            ? 'border-yellow-500/20 bg-yellow-50 dark:bg-yellow-950/20'
            : 'border-red-500/20 bg-red-50 dark:bg-red-950/20'
        }`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {result.overall === 'success' && (
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                )}
                {result.overall === 'partial' && (
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                )}
                {result.overall === 'failed' && (
                  <AlertCircle className="h-8 w-8 text-red-500" />
                )}
                <div>
                  <CardTitle>
                    {result.overall === 'success'
                      ? '系统正常运行'
                      : result.overall === 'partial'
                      ? '系统部分可用'
                      : '系统存在异常'}
                  </CardTitle>
                  <CardDescription>
                    检查时间：{new Date(result.verification.timestamp).toLocaleString()}
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={checkSystem}
                disabled={isChecking}
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isChecking ? '检查中' : '重新检查'}
              </Button>
            </div>
          </CardHeader>
          {result.readyForProduction && (
            <CardContent>
              <Alert className="bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  系统已就绪，可以投入生产使用。所有关键服务运行正常。
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 服务详情 */}
      {result && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* 新浪实时行情 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-base">新浪实时行情</CardTitle>
                </div>
                {getStatusBadge(result.verification.services.sina.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                {getStatusIcon(result.verification.services.sina.status)}
                <div className="text-sm">
                  <p className="font-medium">
                    {result.verification.services.sina.message}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    • 无需配置
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • 实时价格更新
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • 涨跌幅计算
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tushare Pro */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-purple-500" />
                  <CardTitle className="text-base">Tushare Pro</CardTitle>
                </div>
                {getStatusBadge(result.verification.services.tushare.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                {getStatusIcon(result.verification.services.tushare.status)}
                <div className="text-sm">
                  <p className="font-medium">
                    {result.verification.services.tushare.message}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    • 历史K线数据
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • 财务数据（ROE、负债率）
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • 技术指标完整计算
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 技术指标 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-base">技术指标引擎</CardTitle>
                </div>
                {getStatusBadge(result.verification.services.indicators.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                {getStatusIcon(result.verification.services.indicators.status)}
                <div className="text-sm">
                  <p className="font-medium">
                    {result.verification.services.indicators.message}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    • MA5/20/60均线
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • MACD/RSI/KDJ
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • BOLL布林带
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 错误列表 */}
      {result && result.verification.errors.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">
              需要关注的问题
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.verification.errors.map((error) => (
                <li key={error} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 使用说明 */}
      <Card>
        <CardHeader>
          <CardTitle>功能说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium">无需配置即可使用（实时行情）</h4>
            <p className="text-sm text-muted-foreground">
              新浪财经API完全免费且无需注册，系统可立即使用以下功能：
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• 实时持仓监控和止损提醒</li>
              <li>• 股票搜索添加</li>
              <li>• 基础行情查看</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">配置Tushare Token后解锁完整功能</h4>
            <p className="text-sm text-muted-foreground">
              获取历史K线和财务数据，实现完整的技术分析和智能选股：
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• 技术指标计算（MA、MACD、RSI等）</li>
              <li>• 智能选股扫描</li>
              <li>• 买入信号检测</li>
              <li>• 完整的财务分析</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
