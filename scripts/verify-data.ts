// 数据完整性验证脚本
import { getDbStats, getDatabase } from '../lib/db/sqlite';

const db = getDatabase();

console.log('=== 数据库总体统计 ===');
const stats = getDbStats();
console.log('K线记录数:', stats.klineCount.toLocaleString());
console.log('基本面记录数:', stats.basicCount.toLocaleString());
console.log('日期范围:', stats.dateRange.min, '~', stats.dateRange.max);

console.log('\n=== 最近10个交易日K线记录数 ===');
const dateCounts = db.prepare('SELECT date, COUNT(*) as cnt FROM daily_kline GROUP BY date ORDER BY date DESC LIMIT 10').all() as { date: string; cnt: number }[];
dateCounts.forEach((r) => console.log(r.date, ':', r.cnt, '只'));

console.log('\n=== 记录数偏少的日期 (<4000只) ===');
const weakDates = db.prepare('SELECT date, COUNT(*) as cnt FROM daily_kline GROUP BY date HAVING cnt < 4000 ORDER BY date').all() as { date: string; cnt: number }[];
console.log('共', weakDates.length, '天');
if (weakDates.length > 0) {
  weakDates.slice(0, 10).forEach((r) => console.log(r.date, ':', r.cnt, '只'));
}

console.log('\n=== 最近5个交易日基本面记录数 ===');
const basicDates = db.prepare('SELECT date, COUNT(*) as cnt FROM daily_basic GROUP BY date ORDER BY date DESC LIMIT 5').all() as { date: string; cnt: number }[];
basicDates.forEach((r) => console.log(r.date, ':', r.cnt, '只'));

console.log('\n=== 单只股票K线样本（600519）===');
const sample = db.prepare('SELECT date, open, high, low, close, change_percent FROM daily_kline WHERE code = ? ORDER BY date DESC LIMIT 5').all('600519') as { date: string; open: number; high: number; low: number; close: number; change_percent: number }[];
sample.forEach((r) => console.log(r.date, '开:', r.open, '高:', r.high, '低:', r.low, '收:', r.close, '涨跌:', r.change_percent + '%'));

console.log('\n=== 验证完成 ===');
