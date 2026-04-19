'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CheckResult {
  table: string;
  column: string;
  exists: boolean | null;
  error?: string;
}

export default function DatabasePage() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function checkSchema() {
      const checks: CheckResult[] = [];

      // Check alerts.strategy_id
      try {
        const { error } = await supabase
          .from('alerts')
          .select('strategy_id')
          .limit(1);
        
        checks.push({
          table: 'alerts',
          column: 'strategy_id',
          exists: !error?.message?.includes('strategy_id'),
          error: error?.message,
        });
      } catch (e: any) {
        checks.push({
          table: 'alerts',
          column: 'strategy_id',
          exists: false,
          error: e.message,
        });
      }

      // Check stock_pools.strategy_id
      try {
        const { error } = await supabase
          .from('stock_pools')
          .select('strategy_id')
          .limit(1);
        
        checks.push({
          table: 'stock_pools',
          column: 'strategy_id',
          exists: !error?.message?.includes('strategy_id'),
          error: error?.message,
        });
      } catch (e: any) {
        checks.push({
          table: 'stock_pools',
          column: 'strategy_id',
          exists: false,
          error: e.message,
        });
      }

      setResults(checks);
      setLoading(false);
    }

    checkSchema();
  }, []);

  const allExists = results.every(r => r.exists === true);
  const needsMigration = results.some(r => r.exists === false);

  const sqlCommands = `-- P0: 为 alerts 表添加 strategy_id 字段
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id);

-- P1: 为 stock_pools 表添加 strategy_id 字段
ALTER TABLE stock_pools ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id);

-- 验证迁移结果
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('alerts', 'stock_pools') 
  AND column_name = 'strategy_id';`;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">数据库迁移</h1>
          <p className="text-muted-foreground">
            检查并执行 P0 & P1 级别的数据库 schema 更新
          </p>
        </div>

        {/* Status Card */}
        <div className="p-4 rounded-lg border bg-card">
          <h2 className="text-lg font-medium mb-3">字段状态检查</h2>
          {loading ? (
            <p className="text-muted-foreground">检查中...</p>
          ) : (
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <code className="text-sm">{r.table}.{r.column}</code>
                  <span className={`text-sm font-medium ${
                    r.exists === true ? 'text-green-500' : 
                    r.exists === false ? 'text-red-500' : 'text-yellow-500'
                  }`}>
                    {r.exists === true ? '✅ 已存在' : 
                     r.exists === false ? '❌ 缺失' : '⚠️ 未知'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Migration Instructions */}
        {needsMigration && (
          <div className="p-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10">
            <h2 className="text-lg font-medium mb-2 text-yellow-500">⚠️ 需要执行迁移</h2>
            <p className="text-sm text-muted-foreground mb-3">
              请在 Supabase Dashboard 的 SQL Editor 中执行以下 SQL：
            </p>
            <pre className="bg-black/50 p-4 rounded-md text-sm overflow-x-auto">
              <code>{sqlCommands}</code>
            </pre>
            <div className="mt-3 flex gap-2">
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
              >
                打开 Supabase Dashboard
              </a>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted"
              >
                刷新检查
              </button>
            </div>
          </div>
        )}

        {allExists && (
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <h2 className="text-lg font-medium mb-2 text-green-500">✅ 所有字段已就绪</h2>
            <p className="text-sm text-muted-foreground">
              数据库 schema 已是最新，无需额外迁移。
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              返回首页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
