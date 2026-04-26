# 回测模块优化 + 数据修复 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 修复策略配置与回测模块的规则映射错误，复用 filter-engine 统一过滤逻辑；同时修复 2024-2026 年本地数据完整性

**架构:**
- 回测引擎复用 `filter-engine.ts` 的 `checkStockRules` 函数，消除与实盘选股的规则差异
- 修复 UI 层规则映射错误，确保策略配置的规则正确传递到回测引擎
- 数据修复优先保证 2024-2026 年数据完整性，基于实际交易日历修复

**Tech Stack:** Next.js, SQLite (node:sqlite), Tushare API, Zustand

---

### Task A1: 修复回测引擎复用 filter-engine

**Files:**
- Modify: `app/api/backtest/route.ts`
- Modify: `lib/stock-scan/filter-engine.ts`
- No new files

**Step 1: 分析当前回测引擎的选股逻辑与 filter-engine 的差异**

当前回测引擎（route.ts#L170-L203）硬编码了选股逻辑，与 filter-engine.ts 的 `checkStockRules` 函数存在以下差异：
- filter-engine 支持 ROE、负债率、板块涨幅等规则，回测引擎不支持
- filter-engine 有综合评分系统，回测引擎仅按涨跌幅排序
- filter-engine 的规则检查有详细的 ruleChecks 记录

**Step 2: 修改回测引擎，复用 filter-engine 的 checkStockRules**

修改 `app/api/backtest/route.ts`：

```typescript
// 在文件顶部添加导入
import { checkStockRules, FilterContext } from '@/lib/stock-scan/filter-engine';

// 修改 runBacktest 函数中的选股逻辑（第169-203行）
// 替换原有的硬编码过滤为 checkStockRules 调用
```

具体修改：
1. 导入 `checkStockRules` 和 `FilterContext`
2. 在每日循环中，为每只股票构建 `FilterContext`
3. 调用 `checkStockRules(rules, ctx)` 判断是否通过
4. 使用 `score` 替代原有的涨跌幅排序

**Step 3: 实现代码修改**

```typescript
// 在 runBacktest 函数中，替换第169-203行
// 2. 选股（基于策略规则，复用 filter-engine）
const candidates: typeof marketData = [];
for (const data of marketData) {
  if (!data || data.close <= 0) continue;
  
  // 构建 FilterContext
  const ctx: FilterContext = {
    code: data.code,
    quote: {
      price: data.close,
      changePercent: data.changePercent || 0,
      volume: data.volume || 0,
      amount: data.amount || 0,
      name: data.code, // 本地数据库暂无名称
    },
    basicData: {
      marketCap: data.marketCap || 0,
      pe: data.pe || 0,
      pb: data.pb || 0,
      turnoverRate: data.turnoverRate || 0,
      volumeRatio: data.volumeRatio || 0,
    },
    finance: null, // 回测暂无财务数据
    technical: null, // 下面单独计算
    sector: null, // 回测暂无板块数据
  };
  
  // 技术面数据（从本地数据库查询）
  if (rules.priceAboveMA5 || rules.priceAboveMA20 || rules.weeklyMACDGoldenCross) {
    const histStart = new Date(dateStr);
    histStart.setDate(histStart.getDate() - 40);
    const histStartStr = histStart.toISOString().slice(0, 10).replace(/-/g, '');
    
    const histData = getKlineHistory(data.code, histStartStr, date);
    if (histData.length < 20) continue;
    
    const prices = histData.map(h => h.close);
    const ma5 = calculateMA(prices, 5);
    const ma20 = calculateMA(prices, 20);
    
    ctx.technical = {
      ma5,
      ma20,
      weeklyMACDGoldenCross: calculateMACDGoldenCross(prices),
    };
  }
  
  const filterResult = checkStockRules(rules, ctx);
  if (filterResult.meetsRules) {
    candidates.push({ data, score: filterResult.score });
  }
}
```

**Step 4: 验证编译通过**

Run: `npx tsx --eval "import { checkStockRules } from './lib/stock-scan/filter-engine'; console.log('import ok')"`
Expected: 无错误

**Step 5: Commit**

```bash
git add app/api/backtest/route.ts lib/stock-scan/filter-engine.ts
git commit -m "refactor: 回测引擎复用 filter-engine 统一过滤逻辑"
```

---

### Task A2: 修复 UI 层规则映射错误

**Files:**
- Modify: `components/views/backtest-view.tsx`

**Step 1: 分析当前映射错误**

当前映射（backtest-view.tsx#L56-L67）存在以下问题：
1. `buyRules.ma5CrossMa20` → `priceAboveMA5` 和 `priceAboveMA20`：语义不同（均线多头排列 ≠ 股价在均线上方）
2. `buyRules.macdGoldenCross` → `weeklyMACDGoldenCross`：日线金叉 ≠ 周线金叉
3. `moneyRules.maxSingleStockPercent * 10` → `maxMarketCap`：计算逻辑不合理
4. `moneyRules.totalCapital / 10000` → `minMarketCap`：计算逻辑不合理
5. 缺少 `minSectorGain`、`maxPB`、`minPB` 等规则映射

**Step 2: 修复规则映射**

```typescript
// 替换第56-67行
const rules = {
  // 选股规则 - 直接映射
  minMarketCap: strategy.stockRules?.minMarketCap,
  maxMarketCap: strategy.stockRules?.maxMarketCap,
  minROE: strategy.stockRules?.minROE,
  maxDebtRatio: strategy.stockRules?.maxDebtRatio,
  minTurnoverRate: strategy.stockRules?.minTurnoverRate5D,
  maxPE: strategy.stockRules?.maxPEPercentile,
  minVolumeRatio: strategy.stockRules?.volumeRatio,
  minSectorGain: strategy.stockRules?.minSectorGain,
  
  // 技术面规则 - 从 stockRules 读取
  priceAboveMA5: strategy.stockRules?.priceAboveMA5,
  priceAboveMA20: strategy.stockRules?.priceAboveMA20,
  weeklyMACDGoldenCross: strategy.stockRules?.weeklyMACDGoldenCross,
};
```

**Step 3: Commit**

```bash
git add components/views/backtest-view.tsx
git commit -m "fix: 修复回测规则映射错误，与策略配置保持一致"
```

---

### Task A3: 确保数据持久化

**Files:**
- Modify: `app/api/backtest/route.ts`

**Step 1: 分析当前数据持久化状态**

回测结果目前仅返回给前端展示，未持久化存储。需要将回测结果保存到 Supabase 或本地 SQLite。

**Step 2: 添加回测结果持久化**

在 `app/api/backtest/route.ts` 中添加保存逻辑：

```typescript
// 在返回结果前，保存回测记录到 SQLite
function saveBacktestResult(params: BacktestParams, result: BacktestResult) {
  const database = getDatabase();
  // 创建 backtest_results 表（如果不存在）
  database.exec(`
    CREATE TABLE IF NOT EXISTS backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id TEXT,
      strategy_name TEXT,
      start_date TEXT,
      end_date TEXT,
      initial_capital REAL,
      final_capital REAL,
      total_return REAL,
      annualized_return REAL,
      max_drawdown REAL,
      sharpe_ratio REAL,
      win_rate REAL,
      total_trades INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  
  const insert = database.prepare(`
    INSERT INTO backtest_results 
    (strategy_id, strategy_name, start_date, end_date, initial_capital, final_capital, 
     total_return, annualized_return, max_drawdown, sharpe_ratio, win_rate, total_trades)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insert.run(
    result.strategyId, result.strategyName,
    result.startDate, result.endDate,
    result.initialCapital, result.finalCapital,
    result.totalReturn, result.annualizedReturn,
    result.maxDrawdown, result.sharpeRatio,
    result.winRate, result.totalTrades
  );
}
```

**Step 3: Commit**

```bash
git add app/api/backtest/route.ts
git commit -m "feat: 回测结果持久化到 SQLite"
```

---

### Task B1: 优化 fix-early-data.ts 优先修复 2024-2026 数据

**Files:**
- Modify: `scripts/fix-early-data.ts`

**Step 1: 分析当前脚本逻辑**

当前 `fix-early-data.ts` 按日期升序修复，会先处理 2023 年的数据。需要改为优先处理 2024-2026 年数据。

**Step 2: 修改脚本逻辑**

```typescript
// 修改查询条件，优先处理 2024-2026 年数据
// 从 WHERE record_count < 4000 改为按年份分组处理

// 1. 先统计各年份的不完整天数
// 2. 优先处理 2024-2026 年
// 3. 再处理 2023 年

const yearPriority = ['2024', '2025', '2026', '2023'];
for (const year of yearPriority) {
  const badDates = database.prepare(`
    SELECT date, COUNT(*) as count
    FROM daily_kline
    WHERE date LIKE '${year}%'
    GROUP BY date
    HAVING count < 4000
    ORDER BY date ASC
  `).all() as { date: string; count: number }[];
  
  console.log(`[${year}] 发现 ${badDates.length} 个不完整交易日`);
  
  for (const row of badDates) {
    // 修复逻辑...
  }
}
```

**Step 3: 运行修复脚本**

Run: `npx tsx scripts/fix-early-data.ts`
Expected: 优先修复 2024-2026 年数据

**Step 4: 验证修复结果**

Run: `npx tsx scripts/verify-data.ts`
Expected: 2024-2026 年数据完整（每天 > 4000 条）

**Step 5: Commit**

```bash
git add scripts/fix-early-data.ts
git commit -m "fix: 优先修复2024-2026年数据完整性"
```
