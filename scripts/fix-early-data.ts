// 修复早期数据缺失脚本
// 检测并重新下载记录数偏少的日期的数据

import { tushareRequest } from '../lib/stock-api/tushare-api';
import { getDatabase } from '../lib/db/sqlite';

const API_DELAY = 100;

// 下载单日全市场K线数据
async function downloadDailyKline(tradeDate: string) {
  const start = Date.now();
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily', {
    trade_date: tradeDate,
  }, 'ts_code,trade_date,open,high,low,close,vol,amount,pct_chg');

  if (!result.success || !result.data || !result.data.items) {
    console.log(`    [K线] API 耗时 ${Date.now() - start}ms, 返回 0 条`);
    return [];
  }

  const fields = result.data.fields || [];
  const getIdx = (name: string) => fields.indexOf(name);

  const data = result.data.items.map(item => ({
    code: String(item[getIdx('ts_code')] || '').split('.')[0],
    date: String(item[getIdx('trade_date')] || ''),
    open: Number(item[getIdx('open')] || 0),
    high: Number(item[getIdx('high')] || 0),
    low: Number(item[getIdx('low')] || 0),
    close: Number(item[getIdx('close')] || 0),
    volume: Number(item[getIdx('vol')] || 0),
    amount: Number(item[getIdx('amount')] || 0),
    changePercent: Number(item[getIdx('pct_chg')] || 0),
  }));
  console.log(`    [K线] API 耗时 ${Date.now() - start}ms, 返回 ${data.length} 条`);
  return data;
}

// 下载单日全市场基本面数据
async function downloadDailyBasic(tradeDate: string) {
  const start = Date.now();
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily_basic', {
    trade_date: tradeDate,
  }, 'ts_code,trade_date,total_mv,circ_mv,pe,pb,turnover_rate,volume_ratio');

  if (!result.success || !result.data || !result.data.items) {
    console.log(`    [基本面] API 耗时 ${Date.now() - start}ms, 返回 0 条`);
    return [];
  }

  const fields = result.data.fields || [];
  const getIdx = (name: string) => fields.indexOf(name);

  const data = result.data.items.map(item => ({
    code: String(item[getIdx('ts_code')] || '').split('.')[0],
    date: String(item[getIdx('trade_date')] || ''),
    marketCap: Number(item[getIdx('total_mv')] || 0) / 10000,
    pe: Number(item[getIdx('pe')] || 0),
    pb: Number(item[getIdx('pb')] || 0),
    turnoverRate: Number(item[getIdx('turnover_rate')] || 0),
    volumeRatio: Number(item[getIdx('volume_ratio')] || 0),
  }));
  console.log(`    [基本面] API 耗时 ${Date.now() - start}ms, 返回 ${data.length} 条`);
  return data;
}

// 批量插入K线数据（使用手动事务）
function insertKlineBatchTx(db: ReturnType<typeof getDatabase>, data: { code: string; date: string; open: number; high: number; low: number; close: number; volume: number; amount: number; changePercent: number }[]): number {
  const insert = db.prepare(
    'INSERT OR REPLACE INTO daily_kline (code, date, open, high, low, close, volume, amount, change_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  
  db.exec('BEGIN TRANSACTION');
  try {
    for (const item of data) {
      insert.run(item.code, item.date, item.open, item.high, item.low, item.close, item.volume, item.amount, item.changePercent);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return data.length;
}

// 批量插入基本面数据（使用手动事务）
function insertBasicBatchTx(db: ReturnType<typeof getDatabase>, data: { code: string; date: string; marketCap: number; pe: number; pb: number; turnoverRate: number; volumeRatio: number }[]): number {
  const insert = db.prepare(
    'INSERT OR REPLACE INTO daily_basic (code, date, market_cap, pe, pb, turnover_rate, volume_ratio) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  
  db.exec('BEGIN TRANSACTION');
  try {
    for (const item of data) {
      insert.run(item.code, item.date, item.marketCap, item.pe, item.pb, item.turnoverRate, item.volumeRatio);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return data.length;
}

async function main() {
  const db = getDatabase();

  // 找出记录数偏少的日期
  const weakDates = db.prepare(
    'SELECT date, COUNT(*) as cnt FROM daily_kline GROUP BY date HAVING cnt < 4000 ORDER BY date'
  ).all() as { date: string; cnt: number }[];

  console.log(`[Fix] 发现 ${weakDates.length} 天数据不完整`);

  if (weakDates.length === 0) {
    console.log('[Fix] 所有日期数据完整，无需修复');
    return;
  }

  // 按年份分组统计
  const yearStats: Record<string, number> = {};
  for (const d of weakDates) {
    const year = d.date.slice(0, 4);
    yearStats[year] = (yearStats[year] || 0) + 1;
  }
  console.log('[Fix] 各年份不完整天数:', Object.entries(yearStats).sort().map(([y, c]) => `${y}:${c}天`).join(', '));

  // 优先修复 2024-2026 年数据，再修复 2023 年
  const priorityYears = ['2024', '2025', '2026', '2023'];
  const sortedDates = priorityYears
    .flatMap(year => weakDates.filter(d => d.date.startsWith(year)))
    .filter(d => d);

  console.log(`[Fix] 按优先级排序后: ${sortedDates.length} 天（优先 ${priorityYears.slice(0, 3).join('/')}）`);

  let fixedKline = 0;
  let fixedBasic = 0;
  let failedDates = 0;

  const loopStart = Date.now();
  for (let i = 0; i < sortedDates.length; i++) {
    const { date, cnt } = sortedDates[i];
    const dateStr = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const dayStart = Date.now();

    console.log(`[Fix] ${i + 1}/${sortedDates.length}: ${dateStr} (当前 ${cnt} 条)`);

    try {
      // 先删除该日期的旧数据
      db.prepare('DELETE FROM daily_kline WHERE date = ?').run(date);
      db.prepare('DELETE FROM daily_basic WHERE date = ?').run(date);

      // 重新下载
      const klineData = await downloadDailyKline(date);
      const basicData = await downloadDailyBasic(date);

      // 使用事务批量插入（大幅提升性能）
      const txStart = Date.now();
      if (klineData.length > 0) {
        fixedKline += insertKlineBatchTx(db, klineData);
      }
      if (basicData.length > 0) {
        fixedBasic += insertBasicBatchTx(db, basicData);
      }
      console.log(`    [数据库] 事务插入耗时 ${Date.now() - txStart}ms`);
    } catch (e) {
      failedDates++;
      console.warn(`[Fix] ${dateStr} 修复失败:`, e);
    }

    const dayElapsed = Date.now() - dayStart;
    const avgElapsed = (Date.now() - loopStart) / (i + 1);
    const remainingDays = sortedDates.length - (i + 1);
    const etaSeconds = Math.round((remainingDays * avgElapsed) / 1000);
    const etaMin = Math.floor(etaSeconds / 60);
    const etaSec = etaSeconds % 60;
    console.log(`  本日耗时 ${dayElapsed}ms, 平均 ${Math.round(avgElapsed)}ms/天, 预计剩余 ${etaMin}分${etaSec}秒`);

    // 只在需要时延迟
    if (dayElapsed < API_DELAY * 2) {
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
  }

  console.log(`[Fix] 修复完成! K线: ${fixedKline}, 基本面: ${fixedBasic}, 失败: ${failedDates}`);
}

main().catch(console.error);
