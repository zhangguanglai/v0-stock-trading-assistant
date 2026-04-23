// 历史数据下载脚本
// 从Tushare下载3-5年历史数据到本地SQLite数据库
// 用法: npx ts-node scripts/download-historical-data.ts [years=3]

import { getAllStockBasic } from '../lib/stock-api/tushare-api';
import { tushareRequest } from '../lib/stock-api/tushare-api';
import {
  getDatabase,
  insertKlineBatch,
  insertBasicBatch,
  updateLog,
  getLastUpdate,
  getDbStats,
} from '../lib/db/sqlite';

const BATCH_SIZE = 50; // 每批处理50只股票
const API_DELAY = 200; // API调用间隔(ms)

// 获取交易日列表
async function getTradeDates(startDate: string, endDate: string): Promise<string[]> {
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('trade_cal', {
    exchange: 'SSE',
    start_date: startDate,
    end_date: endDate,
    is_open: '1',
  }, 'cal_date');
  
  if (!result.success || !result.data) {
    throw new Error('获取交易日历失败');
  }
  
  return result.data.items.map(item => String(item[0]));
}

// 下载单只股票的日线数据
async function downloadKline(tsCode: string, startDate: string, endDate: string) {
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily', {
    ts_code: tsCode,
    start_date: startDate,
    end_date: endDate,
  }, 'ts_code,trade_date,open,high,low,close,vol,amount,pct_chg');
  
  if (!result.success || !result.data || !result.data.items) {
    return [];
  }
  
  const fields = result.data.fields || [];
  const getIdx = (name: string) => fields.indexOf(name);
  
  const tsIdx = getIdx('ts_code');
  const dateIdx = getIdx('trade_date');
  const openIdx = getIdx('open');
  const highIdx = getIdx('high');
  const lowIdx = getIdx('low');
  const closeIdx = getIdx('close');
  const volIdx = getIdx('vol');
  const amountIdx = getIdx('amount');
  const pctChgIdx = getIdx('pct_chg');
  
  return result.data.items.map(item => ({
    code: String(item[tsIdx] || '').split('.')[0],
    date: String(item[dateIdx] || ''),
    open: Number(item[openIdx] || 0),
    high: Number(item[highIdx] || 0),
    low: Number(item[lowIdx] || 0),
    close: Number(item[closeIdx] || 0),
    volume: Number(item[volIdx] || 0),
    amount: Number(item[amountIdx] || 0),
    changePercent: Number(item[pctChgIdx] || 0),
  }));
}

// 下载单只股票的基本面数据
async function downloadBasic(tsCode: string, startDate: string, endDate: string) {
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily_basic', {
    ts_code: tsCode,
    start_date: startDate,
    end_date: endDate,
  }, 'ts_code,trade_date,total_mv,circ_mv,pe,pb,turnover_rate,volume_ratio');
  
  if (!result.success || !result.data || !result.data.items) {
    return [];
  }
  
  const fields = result.data.fields || [];
  const getIdx = (name: string) => fields.indexOf(name);
  
  const tsIdx = getIdx('ts_code');
  const dateIdx = getIdx('trade_date');
  const mvIdx = getIdx('total_mv');
  const circIdx = getIdx('circ_mv');
  const peIdx = getIdx('pe');
  const pbIdx = getIdx('pb');
  const trIdx = getIdx('turnover_rate');
  const vrIdx = getIdx('volume_ratio');
  
  return result.data.items.map(item => ({
    code: String(item[tsIdx] || '').split('.')[0],
    date: String(item[dateIdx] || ''),
    marketCap: Number(item[mvIdx] || 0) / 10000, // 万元转亿元
    pe: Number(item[peIdx] || 0),
    pb: Number(item[pbIdx] || 0),
    turnoverRate: Number(item[trIdx] || 0),
    volumeRatio: Number(item[vrIdx] || 0),
  }));
}

// 主下载函数
async function downloadHistoricalData(years: number = 3) {
  console.log(`[Download] 开始下载 ${years} 年历史数据...`);
  
  // 计算时间范围
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);
  
  const startStr = startDate.toISOString().slice(0, 10).replace(/-/g, '');
  const endStr = endDate.toISOString().slice(0, 10).replace(/-/g, '');
  
  console.log(`[Download] 时间范围: ${startStr} - ${endStr}`);
  
  // 获取股票列表
  const stockResult = await getAllStockBasic();
  if (!stockResult.success || !stockResult.data) {
    throw new Error('获取股票列表失败');
  }
  
  const stocks = stockResult.data.filter(s => {
    const name = s.name || '';
    return !name.includes('ST') && !name.includes('退');
  });
  
  console.log(`[Download] 共 ${stocks.length} 只股票需要下载`);
  
  // 获取交易日列表
  const tradeDates = await getTradeDates(startStr, endStr);
  console.log(`[Download] 共 ${tradeDates.length} 个交易日`);
  
  // 分批下载
  let totalKline = 0;
  let totalBasic = 0;
  
  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    console.log(`[Download] 处理第 ${i + 1}-${Math.min(i + BATCH_SIZE, stocks.length)} 只...`);
    
    for (const stock of batch) {
      try {
        // 下载K线数据
        const klineData = await downloadKline(stock.tsCode, startStr, endStr);
        if (klineData.length > 0) {
          totalKline += insertKlineBatch(klineData);
        }
        
        // 下载基本面数据
        const basicData = await downloadBasic(stock.tsCode, startStr, endStr);
        if (basicData.length > 0) {
          totalBasic += insertBasicBatch(basicData);
        }
        
        // API限流延迟
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      } catch (e) {
        console.warn(`[Download] ${stock.tsCode} 下载失败:`, e);
      }
    }
    
    // 每批完成后显示进度
    const stats = getDbStats();
    console.log(`[Download] 进度: ${Math.min(i + BATCH_SIZE, stocks.length)}/${stocks.length}, K线: ${stats.klineCount}, 基本面: ${stats.basicCount}`);
  }
  
  // 更新记录
  updateLog('daily_kline', endStr, totalKline);
  updateLog('daily_basic', endStr, totalBasic);
  
  console.log(`[Download] 下载完成! K线: ${totalKline}, 基本面: ${totalBasic}`);
  
  // 显示最终统计
  const finalStats = getDbStats();
  console.log(`[Download] 数据库统计:`);
  console.log(`  - K线记录: ${finalStats.klineCount}`);
  console.log(`  - 基本面记录: ${finalStats.basicCount}`);
  console.log(`  - 日期范围: ${finalStats.dateRange.min} - ${finalStats.dateRange.max}`);
}

// 增量更新
async function incrementalUpdate() {
  console.log('[Update] 开始增量更新...');
  
  const lastUpdate = getLastUpdate('daily_kline');
  if (!lastUpdate) {
    console.log('[Update] 无历史数据，执行全量下载');
    return downloadHistoricalData(3);
  }
  
  const startStr = lastUpdate;
  const endStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  if (startStr >= endStr) {
    console.log('[Update] 数据已是最新');
    return;
  }
  
  console.log(`[Update] 更新范围: ${startStr} - ${endStr}`);
  
  // 获取股票列表
  const stockResult = await getAllStockBasic();
  if (!stockResult.success || !stockResult.data) {
    throw new Error('获取股票列表失败');
  }
  
  const stocks = stockResult.data.filter(s => {
    const name = s.name || '';
    return !name.includes('ST') && !name.includes('退');
  });
  
  let totalKline = 0;
  let totalBasic = 0;
  
  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    
    for (const stock of batch) {
      try {
        const klineData = await downloadKline(stock.tsCode, startStr, endStr);
        if (klineData.length > 0) {
          totalKline += insertKlineBatch(klineData);
        }
        
        const basicData = await downloadBasic(stock.tsCode, startStr, endStr);
        if (basicData.length > 0) {
          totalBasic += insertBasicBatch(basicData);
        }
        
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      } catch (e) {
        console.warn(`[Update] ${stock.tsCode} 更新失败:`, e);
      }
    }
  }
  
  updateLog('daily_kline', endStr, totalKline);
  updateLog('daily_basic', endStr, totalBasic);
  
  console.log(`[Update] 增量更新完成! K线: ${totalKline}, 基本面: ${totalBasic}`);
}

// 主入口
async function main() {
  const years = parseInt(process.argv[2] || '3', 10);
  
  try {
    // 检查是否有历史数据
    const stats = getDbStats();
    if (stats.klineCount === 0) {
      console.log('[Main] 数据库为空，执行全量下载');
      await downloadHistoricalData(years);
    } else {
      console.log('[Main] 数据库已有数据，执行增量更新');
      await incrementalUpdate();
    }
  } catch (error) {
    console.error('[Main] 执行失败:', error);
    process.exit(1);
  }
}

main();
