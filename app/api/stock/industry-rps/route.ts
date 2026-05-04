// 全市场行业RPS20数据 API
// 使用本地SQLite计算 + 内存缓存（1小时），避免大量Tushare API调用
import { NextRequest, NextResponse } from 'next/server';
import { isTushareConfigured, tushareRequest } from '@/lib/stock-api';

export const dynamic = 'force-dynamic';

export interface IndustryRPS {
  industry: string;
  rps20: number;
  change20d: number;
  stockCount: number;
}

// 内存缓存
let cachedIndustryRPS: IndustryRPS[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1小时

// 行业映射缓存（stock_basic数据变化极少，缓存1天）
let cachedIndustryMap: Map<string, string> | null = null;
let industryMapCacheTime = 0;
const INDUSTRY_MAP_CACHE = 24 * 60 * 60 * 1000; // 24小时

// 获取股票行业映射（带缓存）
async function getIndustryMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedIndustryMap && (now - industryMapCacheTime) < INDUSTRY_MAP_CACHE) {
    return cachedIndustryMap;
  }

  const map = new Map<string, string>();

  if (!isTushareConfigured()) {
    return map;
  }

  try {
    const result = await tushareRequest<{
      fields: string[];
      items: (string | number)[][];
    }>('stock_basic', { list_status: 'L' }, 'ts_code,symbol,name,industry');

    if (result.success && result.data) {
      const fields = result.data.fields || [];
      const tsIdx = fields.indexOf('ts_code');
      const industryIdx = fields.indexOf('industry');

      for (const item of result.data.items) {
        const tsCode = String(item[tsIdx]);
        const code = tsCode.split('.')[0];
        const industry = String(item[industryIdx] || '未知');
        map.set(code, industry);
      }
    }
  } catch (e) {
    console.error('[IndustryRPS] 获取行业映射失败:', e);
  }

  cachedIndustryMap = map;
  industryMapCacheTime = now;
  return map;
}

// 从本地SQLite获取20日涨幅
async function get20DayChangesFromSQLite(): Promise<Map<string, number>> {
  const { getDatabase } = await import('@/lib/db/sqlite');
  const db = await getDatabase();

  // 获取最近20个交易日
  const dateRows = db.prepare(
    `SELECT DISTINCT date FROM daily_kline ORDER BY date DESC LIMIT 20`
  ).all() as { date: string }[];

  if (dateRows.length < 2) {
    return new Map();
  }

  const latestDate = dateRows[0].date;
  const earliestDate = dateRows[dateRows.length - 1].date;

  // 获取每只股票最早和最新的收盘价
  const rows = db.prepare(`
    SELECT code,
      MAX(CASE WHEN date = ? THEN close END) as latestClose,
      MAX(CASE WHEN date = ? THEN close END) as earliestClose
    FROM daily_kline
    WHERE date IN (?, ?)
    GROUP BY code
    HAVING latestClose > 0 AND earliestClose > 0
  `).all(latestDate, earliestDate, latestDate, earliestDate) as {
    code: string;
    latestClose: number;
    earliestClose: number;
  }[];

  const changes = new Map<string, number>();
  for (const row of rows) {
    const change = ((row.latestClose - row.earliestClose) / row.earliestClose) * 100;
    changes.set(row.code, change);
  }

  return changes;
}

// 计算行业RPS
async function calculateIndustryRPS(): Promise<IndustryRPS[]> {
  const [industryMap, changesMap] = await Promise.all([
    getIndustryMap(),
    get20DayChangesFromSQLite(),
  ]);

  if (industryMap.size === 0 || changesMap.size === 0) {
    return [];
  }

  // 按行业分组统计
  const industryStats = new Map<string, { totalChange: number; count: number }>();

  for (const [code, change] of changesMap.entries()) {
    const industry = industryMap.get(code);
    if (!industry || industry === '未知') continue;

    const stat = industryStats.get(industry) || { totalChange: 0, count: 0 };
    stat.totalChange += change;
    stat.count += 1;
    industryStats.set(industry, stat);
  }

  // 计算各行业平均涨幅并排序
  const industries = Array.from(industryStats.entries())
    .map(([name, stat]) => ({
      industry: name,
      change20d: stat.count > 0 ? stat.totalChange / stat.count : 0,
      stockCount: stat.count,
    }))
    .sort((a, b) => b.change20d - a.change20d);

  const total = industries.length;
  if (total === 0) return [];

  // RPS20 = (1 - 排名/总数) × 100
  return industries.map((item, index) => ({
    ...item,
    rps20: total > 1 ? Math.round((1 - index / (total - 1)) * 100) : 100,
  }));
}

// GET /api/stock/industry-rps
export async function GET(request: NextRequest) {
  try {
    const now = Date.now();

    // 检查缓存
    if (cachedIndustryRPS && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: cachedIndustryRPS,
        total: cachedIndustryRPS.length,
        cached: true,
        timestamp: now,
      });
    }

    // 重新计算
    const result = await calculateIndustryRPS();

    if (result.length === 0) {
      return NextResponse.json({
        success: false,
        error: '无法计算行业RPS，请检查本地数据是否完整',
        data: [],
        timestamp: now,
      });
    }

    // 更新缓存
    cachedIndustryRPS = result;
    cacheTimestamp = now;

    return NextResponse.json({
      success: true,
      data: result,
      total: result.length,
      cached: false,
      timestamp: now,
    });

  } catch (error) {
    console.error('Industry RPS API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误',
      data: [],
      timestamp: Date.now(),
    });
  }
}
