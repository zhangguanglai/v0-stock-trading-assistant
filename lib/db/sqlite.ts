// SQLite 本地数据库管理
// 使用 sqlite3 (纯JavaScript版本，无需编译)

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'stock-history.db');

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

// 获取数据库实例（单例）
export async function getDatabase(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (!db) {
    // 确保目录存在
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });
    
    await initTables();
  }
  return db;
}

// 初始化表结构
async function initTables() {
  const database = db!;
  
  // 日线K线数据表
  await database.exec(`
    CREATE TABLE IF NOT EXISTS daily_kline (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      amount REAL,
      change_percent REAL,
      PRIMARY KEY (code, date)
    )
  `);
  
  // 每日基本面数据表
  await database.exec(`
    CREATE TABLE IF NOT EXISTS daily_basic (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      market_cap REAL,
      pe REAL,
      pb REAL,
      turnover_rate REAL,
      volume_ratio REAL,
      PRIMARY KEY (code, date)
    )
  `);
  
  // 数据更新记录表
  await database.exec(`
    CREATE TABLE IF NOT EXISTS update_log (
      table_name TEXT PRIMARY KEY,
      last_update TEXT,
      record_count INTEGER
    )
  `);
  
  // 创建索引优化查询性能
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_kline_code_date ON daily_kline(code, date);
    CREATE INDEX IF NOT EXISTS idx_kline_date ON daily_kline(date);
    CREATE INDEX IF NOT EXISTS idx_basic_code_date ON daily_basic(code, date);
    CREATE INDEX IF NOT EXISTS idx_basic_date ON daily_basic(date);
  `);
}

// 批量插入K线数据
export async function insertKlineBatch(data: {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePercent: number;
}[]): Promise<number> {
  const database = await getDatabase();
  
  const stmt = await database.prepare(`
    INSERT OR REPLACE INTO daily_kline (code, date, open, high, low, close, volume, amount, change_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const item of data) {
    await stmt.run(
      item.code,
      item.date,
      item.open,
      item.high,
      item.low,
      item.close,
      item.volume,
      item.amount,
      item.changePercent
    );
  }
  
  await stmt.finalize();
  return data.length;
}

// 批量插入基本面数据
export async function insertBasicBatch(data: {
  code: string;
  date: string;
  marketCap: number;
  pe: number;
  pb: number;
  turnoverRate: number;
  volumeRatio: number;
}[]): Promise<number> {
  const database = await getDatabase();
  
  const stmt = await database.prepare(`
    INSERT OR REPLACE INTO daily_basic (code, date, market_cap, pe, pb, turnover_rate, volume_ratio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const item of data) {
    await stmt.run(
      item.code,
      item.date,
      item.marketCap,
      item.pe,
      item.pb,
      item.turnoverRate,
      item.volumeRatio
    );
  }
  
  await stmt.finalize();
  return data.length;
}

// 查询单只股票历史K线
export async function getKlineHistory(
  code: string,
  startDate: string,
  endDate: string
): Promise<{
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePercent: number;
}[]> {
  const database = await getDatabase();
  
  return database.all(`
    SELECT date, open, high, low, close, volume, amount, change_percent as changePercent
    FROM daily_kline
    WHERE code = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `, code, startDate, endDate);
}

// 查询某日期全市场数据
export async function getMarketDataByDate(date: string): Promise<{
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePercent: number;
  marketCap?: number;
  pe?: number;
  pb?: number;
  turnoverRate?: number;
  volumeRatio?: number;
}[]> {
  const database = await getDatabase();
  
  return database.all(`
    SELECT 
      k.code,
      k.open,
      k.high,
      k.low,
      k.close,
      k.volume,
      k.amount,
      k.change_percent as changePercent,
      b.market_cap as marketCap,
      b.pe,
      b.pb,
      b.turnover_rate as turnoverRate,
      b.volume_ratio as volumeRatio
    FROM daily_kline k
    LEFT JOIN daily_basic b ON k.code = b.code AND k.date = b.date
    WHERE k.date = ?
  `, date);
}

// 获取数据库统计信息
export async function getDbStats(): Promise<{
  klineCount: number;
  basicCount: number;
  dateRange: { min: string; max: string };
}> {
  const database = await getDatabase();
  
  const klineResult = await database.get('SELECT COUNT(*) as count FROM daily_kline');
  const basicResult = await database.get('SELECT COUNT(*) as count FROM daily_basic');
  const dateRange = await database.get('SELECT MIN(date) as min, MAX(date) as max FROM daily_kline');
  
  return {
    klineCount: klineResult?.count || 0,
    basicCount: basicResult?.count || 0,
    dateRange: {
      min: dateRange?.min || '',
      max: dateRange?.max || '',
    },
  };
}

// 更新记录
export async function updateLog(tableName: string, date: string, count: number) {
  const database = await getDatabase();
  await database.run(`
    INSERT OR REPLACE INTO update_log (table_name, last_update, record_count)
    VALUES (?, ?, ?)
  `, tableName, date, count);
}

// 获取上次更新时间
export async function getLastUpdate(tableName: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.get('SELECT last_update FROM update_log WHERE table_name = ?', tableName);
  return row?.last_update || null;
}
