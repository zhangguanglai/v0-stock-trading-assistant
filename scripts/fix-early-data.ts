// 修复早期数据缺失脚本
// 检测并重新下载记录数偏少的日期的数据

import { tushareRequest } from '../lib/stock-api/tushare-api';
import {
  insertKlineBatch,
  insertBasicBatch,
  getDatabase,
} from '../lib/db/sqlite';

const API_DELAY = 300;

// 下载单日全市场K线数据
async function downloadDailyKline(tradeDate: string) {
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily', {
    trade_date: tradeDate,
  }, 'ts_code,trade_date,open,high,low,close,vol,amount,pct_chg');

  if (!result.success || !result.data || !result.data.items) {
    return [];
  }

  const fields = result.data.fields || [];
  const getIdx = (name: string) => fields.indexOf(name);

  return result.data.items.map(item => ({
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
}

// 下载单日全市场基本面数据
async function downloadDailyBasic(tradeDate: string) {
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily_basic', {
    trade_date: tradeDate,
  }, 'ts_code,trade_date,total_mv,circ_mv,pe,pb,turnover_rate,volume_ratio');

  if (!result.success || !result.data || !result.data.items) {
    return [];
  }

  const fields = result.data.fields || [];
  const getIdx = (name: string) => fields.indexOf(name);

  return result.data.items.map(item => ({
    code: String(item[getIdx('ts_code')] || '').split('.')[0],
    date: String(item[getIdx('trade_date')] || ''),
    marketCap: Number(item[getIdx('total_mv')] || 0) / 10000,
    pe: Number(item[getIdx('pe')] || 0),
    pb: Number(item[getIdx('pb')] || 0),
    turnoverRate: Number(item[getIdx('turnover_rate')] || 0),
    volumeRatio: Number(item[getIdx('volume_ratio')] || 0),
  }));
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

  let fixedKline = 0;
  let fixedBasic = 0;
  let failedDates = 0;

  for (let i = 0; i < weakDates.length; i++) {
    const { date, cnt } = weakDates[i];
    const dateStr = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

    console.log(`[Fix] ${i + 1}/${weakDates.length}: ${dateStr} (当前 ${cnt} 条)`);

    try {
      // 先删除该日期的旧数据
      db.prepare('DELETE FROM daily_kline WHERE date = ?').run(date);
      db.prepare('DELETE FROM daily_basic WHERE date = ?').run(date);

      // 重新下载
      const klineData = await downloadDailyKline(date);
      if (klineData.length > 0) {
        fixedKline += insertKlineBatch(klineData);
        console.log(`  [K线] +${klineData.length} 条`);
      }

      await new Promise(resolve => setTimeout(resolve, API_DELAY));

      const basicData = await downloadDailyBasic(date);
      if (basicData.length > 0) {
        fixedBasic += insertBasicBatch(basicData);
        console.log(`  [基本面] +${basicData.length} 条`);
      }
    } catch (e) {
      failedDates++;
      console.warn(`[Fix] ${dateStr} 修复失败:`, e);
    }

    await new Promise(resolve => setTimeout(resolve, API_DELAY));
  }

  console.log(`[Fix] 修复完成! K线: ${fixedKline}, 基本面: ${fixedBasic}, 失败: ${failedDates}`);
}

main().catch(console.error);
