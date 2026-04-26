// 回测模块功能测试脚本
import { getDatabase, getDbStats } from '../lib/db/sqlite';

async function testBacktest() {
  console.log('=== 回测模块功能测试 ===\n');

  // 1. 检查数据库状态
  console.log('[1] 数据库状态检查');
  const stats = getDbStats();
  console.log(`  K线记录: ${stats.klineCount.toLocaleString()}`);
  console.log(`  基本面记录: ${stats.basicCount.toLocaleString()}`);
  console.log(`  日期范围: ${stats.dateRange.min} ~ ${stats.dateRange.max}`);

  if (stats.klineCount === 0) {
    console.log('  ❌ 数据库为空，无法测试回测');
    return;
  }

  // 2. 检查最近交易日数据完整性
  console.log('\n[2] 最近交易日数据完整性');
  const db = getDatabase();
  const recentDates = db.prepare(
    'SELECT date, COUNT(*) as cnt FROM daily_kline WHERE date >= ? GROUP BY date ORDER BY date DESC LIMIT 5'
  ).all(stats.dateRange.max.slice(0, 6) + '01') as { date: string; cnt: number }[];

  for (const d of recentDates) {
    const status = d.cnt >= 4000 ? '✅' : '⚠️';
    console.log(`  ${status} ${d.date}: ${d.cnt} 只`);
  }

  // 3. 测试单只股票历史数据查询
  console.log('\n[3] 单只股票历史数据查询测试');
  const sampleStock = db.prepare(
    'SELECT * FROM daily_kline WHERE code = ? ORDER BY date DESC LIMIT 3'
  ).all('600519') as { date: string; close: number; change_percent: number }[];

  if (sampleStock.length > 0) {
    console.log(`  ✅ 贵州茅台(600519) 最近 ${sampleStock.length} 条记录:`);
    for (const row of sampleStock) {
      console.log(`     ${row.date}: 收盘价 ${row.close}, 涨跌幅 ${row.change_percent}%`);
    }
  } else {
    console.log('  ❌ 未找到贵州茅台数据');
  }

  // 4. 测试全市场某日数据查询
  console.log('\n[4] 全市场某日数据查询测试');
  const marketData = db.prepare(
    'SELECT COUNT(*) as cnt, AVG(close) as avg_close, MAX(close) as max_close FROM daily_kline WHERE date = ?'
  ).get(stats.dateRange.max) as { cnt: number; avg_close: number; max_close: number };

  if (marketData.cnt > 0) {
    console.log(`  ✅ ${stats.dateRange.max}: ${marketData.cnt} 只股票`);
    console.log(`     平均收盘价: ${marketData.avg_close?.toFixed(2) || 'N/A'}`);
    console.log(`     最高收盘价: ${marketData.max_close?.toFixed(2) || 'N/A'}`);
  } else {
    console.log('  ❌ 未找到数据');
  }

  // 5. 测试 JOIN 查询（回测引擎核心查询）
  console.log('\n[5] JOIN 查询测试（回测引擎核心）');
  const joinData = db.prepare(
    `SELECT k.code, k.date, k.close, k.change_percent, b.market_cap, b.pe, b.turnover_rate, b.volume_ratio
     FROM daily_kline k
     LEFT JOIN daily_basic b ON k.code = b.code AND k.date = b.date
     WHERE k.date = ?
     LIMIT 3`
  ).all(stats.dateRange.max) as { code: string; close: number; market_cap: number; turnover_rate: number }[];

  if (joinData.length > 0) {
    console.log(`  ✅ JOIN 查询成功，样本数据:`);
    for (const row of joinData) {
      console.log(`     ${row.code}: 收盘价=${row.close}, 市值=${row.market_cap?.toFixed(2) || 'N/A'}亿, 换手率=${row.turnover_rate?.toFixed(2) || 'N/A'}%`);
    }
  } else {
    console.log('  ❌ JOIN 查询失败');
  }

  // 6. 测试 backtest_results 表
  console.log('\n[6] 回测结果持久化表检查');
  try {
    const backtestCount = db.prepare('SELECT COUNT(*) as cnt FROM backtest_results').get() as { cnt: number };
    console.log(`  ✅ backtest_results 表存在，已有 ${backtestCount.cnt} 条记录`);
  } catch {
    console.log('  ℹ️ backtest_results 表尚未创建（回测后自动创建）');
  }

  console.log('\n=== 测试完成 ===');
}

testBacktest().catch(console.error);
