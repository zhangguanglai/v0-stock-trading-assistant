// 日增量更新脚本
// 每日收盘后执行，下载最新交易日数据

import { tushareRequest } from '../lib/stock-api/tushare-api';
import {
  insertKlineBatch,
  insertBasicBatch,
  getDatabase,
  updateLog,
  getLastUpdate,
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

// 获取最近交易日
async function getLastTradeDate(): Promise<string | null> {
  const today = new Date();
  // 尝试最近5天
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    
    const result = await tushareRequest<{
      fields: string[];
      items: (string | number | null)[][];
    }>('trade_cal', {
      exchange: 'SSE',
      start_date: dateStr,
      end_date: dateStr,
      is_open: '1',
    });
    
    if (result.success && result.data && result.data.items && result.data.items.length > 0) {
      return dateStr;
    }
  }
  return null;
}

async function main() {
  console.log('[DailyUpdate] 开始日增量更新...');
  
  const lastUpdate = getLastUpdate('daily_kline');
  const tradeDate = await getLastTradeDate();
  
  if (!tradeDate) {
    console.log('[DailyUpdate] 未找到最近交易日');
    process.exit(1);
  }
  
  if (lastUpdate === tradeDate) {
    console.log(`[DailyUpdate] 数据已是最新 (${tradeDate})，无需更新`);
    process.exit(0);
  }
  
  console.log(`[DailyUpdate] 上次更新: ${lastUpdate || '无'}, 目标日期: ${tradeDate}`);
  
  try {
    // 下载K线数据
    const klineData = await downloadDailyKline(tradeDate);
    if (klineData.length > 0) {
      const inserted = insertKlineBatch(klineData);
      console.log(`[DailyUpdate] K线数据: ${inserted} 条`);
    }
    
    await new Promise(resolve => setTimeout(resolve, API_DELAY));
    
    // 下载基本面数据
    const basicData = await downloadDailyBasic(tradeDate);
    if (basicData.length > 0) {
      const inserted = insertBasicBatch(basicData);
      console.log(`[DailyUpdate] 基本面数据: ${inserted} 条`);
    }
    
    // 更新日志
    updateLog('daily_kline', tradeDate, klineData.length);
    updateLog('daily_basic', tradeDate, basicData.length);
    
    console.log(`[DailyUpdate] 完成: ${tradeDate}`);
  } catch (error) {
    console.error('[DailyUpdate] 失败:', error);
    process.exit(1);
  }
}

main().catch(console.error);
