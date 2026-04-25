// SQLite 本地数据库管理
// 使用 Node.js 22+ 内置的 node:sqlite（无需任何外部原生依赖）

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'stock-history.db');

let db: DatabaseSync | null = null;

// 获取数据库实例（单例）
export function getDatabase(): DatabaseSync {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    db = new DatabaseSync(DB_PATH);
    initTables();
  }
  return db;
}

// 初始化表结构
function initTables() {
  const database = db!;

  database.exec(`
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

  database.exec(`
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

  database.exec(`
    CREATE TABLE IF NOT EXISTS update_log (
      table_name TEXT PRIMARY KEY,
      last_update TEXT,
      record_count INTEGER
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_kline_code_date ON daily_kline(code, date);
    CREATE INDEX IF NOT EXISTS idx_kline_date ON daily_kline(date);
    CREATE INDEX IF NOT EXISTS idx_basic_code_date ON daily_basic(code, date);
    CREATE INDEX IF NOT EXISTS idx_basic_date ON daily_basic(date);
  `);
}

// 批量插入K线数据
export function insertKlineBatch(data: {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePercent: number;
}[]): number {
  const database = getDatabase();

  const insert = database.prepare(`
    INSERT OR REPLACE INTO daily_kline (code, date, open, high, low, close, volume, amount, change_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of data) {
    insert.run(
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

  return data.length;
}

// 批量插入基本面数据
export function insertBasicBatch(data: {
  code: string;
  date: string;
  marketCap: number;
  pe: number;
  pb: number;
  turnoverRate: number;
  volumeRatio: number;
}[]): number {
  const database = getDatabase();

  const insert = database.prepare(`
    INSERT OR REPLACE INTO daily_basic (code, date, market_cap, pe, pb, turnover_rate, volume_ratio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of data) {
    insert.run(
      item.code,
      item.date,
      item.marketCap,
      item.pe,
      item.pb,
      item.turnoverRate,
      item.volumeRatio
    );
  }

  return data.length;
}

// 查询单只股票历史K线
export function getKlineHistory(
  code: string,
  startDate: string,
  endDate: string
): {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePercent: number;
}[] {
  const database = getDatabase();

  const stmt = database.prepare(`
    SELECT date, open, high, low, close, volume, amount, change_percent as changePercent
    FROM daily_kline
    WHERE code = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `);

  return stmt.all(code, startDate, endDate) as {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
    changePercent: number;
  }[];
}

// 查询某日期全市场数据
export function getMarketDataByDate(date: string): {
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
}[] {
  const database = getDatabase();

  const stmt = database.prepare(`
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
  `);

  return stmt.all(date) as {
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
  }[];
}

// 获取数据库统计信息
export function getDbStats(): {
  klineCount: number;
  basicCount: number;
  dateRange: { min: string; max: string };
} {
  const database = getDatabase();

  const klineResult = database.prepare('SELECT COUNT(*) as count FROM daily_kline').get() as { count: number };
  const basicResult = database.prepare('SELECT COUNT(*) as count FROM daily_basic').get() as { count: number };
  const dateRange = database.prepare('SELECT MIN(date) as min, MAX(date) as max FROM daily_kline').get() as { min: string; max: string };

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
export function updateLog(tableName: string, date: string, count: number) {
  const database = getDatabase();
  database.prepare(`
    INSERT OR REPLACE INTO update_log (table_name, last_update, record_count)
    VALUES (?, ?, ?)
  `).run(tableName, date, count);
}

// 获取上次更新时间
export function getLastUpdate(tableName: string): string | null {
  const database = getDatabase();
  const row = database.prepare('SELECT last_update FROM update_log WHERE table_name = ?').get(tableName) as { last_update: string } | undefined;
  return row?.last_update || null;
}
