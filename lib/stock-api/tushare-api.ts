// Tushare Pro API封装
// 用于获取历史K线数据、财务数据等

import type { DailyKLine, ApiResponse, StockInfo } from './types';

const TUSHARE_API_URL = 'http://api.tushare.pro';
const FETCH_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

// Tushare API请求（带超时和重试）
export async function tushareRequest<T>(
  apiName: string,
  params: Record<string, unknown>,
  fields?: string
): Promise<ApiResponse<T>> {
  const token = process.env.TUSHARE_TOKEN;
  
  if (!token) {
    return {
      success: false,
      error: 'TUSHARE_TOKEN 未配置，请在环境变量中设置',
      timestamp: Date.now(),
    };
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      
      const response = await fetch(TUSHARE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ api_name: apiName, token, params, fields }),
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.code !== 0) {
        return { success: false, error: result.msg || 'Tushare API错误', timestamp: Date.now() };
      }
      
      return { success: true, data: result.data as T, timestamp: Date.now() };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isAbort = lastError.name === 'AbortError';
      const errMsg = isAbort ? '请求超时' : lastError.message;
      
      if (attempt < MAX_RETRIES) {
        console.warn(`[Tushare] ${apiName} 第${attempt + 1}次失败 (${errMsg})，重试中...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  
  return {
    success: false,
    error: lastError?.message || 'Tushare请求失败',
    timestamp: Date.now(),
  };
}

// 转换股票代码格式 (600519 -> 600519.SH)
function toTushareCode(code: string): string {
  const cleanCode = code.replace(/^(sh|sz|bj)/i, '');
  
  if (cleanCode.startsWith('6')) {
    return `${cleanCode}.SH`;
  } else if (cleanCode.startsWith('0') || cleanCode.startsWith('3')) {
    return `${cleanCode}.SZ`;
  } else if (cleanCode.startsWith('4') || cleanCode.startsWith('8')) {
    return `${cleanCode}.BJ`;
  }
  
  return cleanCode;
}

// 获取日K线数据
export async function getDailyKLine(
  code: string,
  startDate?: string,
  endDate?: string,
  limit: number = 120,
  adj: 'qfq' | 'hfq' | '' = ''
): Promise<ApiResponse<DailyKLine[]>> {
  const tsCode = toTushareCode(code);

  const params: Record<string, unknown> = {
    ts_code: tsCode,
  };

  if (adj) params.adj = adj;
  if (startDate) params.start_date = startDate.replace(/-/g, '');
  if (endDate) params.end_date = endDate.replace(/-/g, '');
  
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number)[][];
  }>('daily', params, 'trade_date,open,high,low,close,vol,amount,pct_chg');
  
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      timestamp: Date.now(),
    };
  }
  
  // 转换数据格式
  const klines: DailyKLine[] = result.data.items
    .slice(0, limit)
    .map((item) => ({
      date: String(item[0]).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      open: Number(item[1]) || 0,
      high: Number(item[2]) || 0,
      low: Number(item[3]) || 0,
      close: Number(item[4]) || 0,
      volume: Number(item[5]) || 0,
      amount: Number(item[6]) || 0,
      changePercent: Number(item[7]) || 0,
    }))
    .reverse(); // 按日期升序排列
  
  return {
    success: true,
    data: klines,
    timestamp: Date.now(),
  };
}

// 获取股票基本信息
export async function getStockBasic(code?: string): Promise<ApiResponse<StockInfo[]>> {
  const params: Record<string, unknown> = {
    list_status: 'L', // 上市状态
  };
  
  if (code) {
    params.ts_code = toTushareCode(code);
  }
  
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number)[][];
  }>('stock_basic', params, 'ts_code,symbol,name,area,industry,list_date,market');
  
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      timestamp: Date.now(),
    };
  }
  
  const stocks: StockInfo[] = result.data.items.map((item) => {
    const tsCode = String(item[0]);
    const market = tsCode.endsWith('.SH') ? 'sh' : 
                   tsCode.endsWith('.SZ') ? 'sz' : 'bj';
    
    return {
      code: String(item[1]),
      symbol: market + String(item[1]),
      name: String(item[2]),
      market: market as 'sh' | 'sz' | 'bj',
      industry: String(item[4]) || '未知',
      listDate: String(item[5]),
    };
  });
  
  return {
    success: true,
    data: stocks,
    timestamp: Date.now(),
  };
}

// 获取财务指标
export async function getFinanceIndicators(code: string): Promise<ApiResponse<{
  roe: number;
  debtRatio: number;
  pe: number;
  pb: number;
  eps: number;
  bps: number;
}>> {
  const tsCode = toTushareCode(code);
  
  // Tushare fina_indicator字段名: roe, debt_to_assets(负债率), eps, bps
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('fina_indicator', { ts_code: tsCode, limit: 1 }, 'ts_code,roe,debt_to_assets,eps,bps');
  
  if (!result.success || !result.data || result.data.items.length === 0) {
    return {
      success: true,
      data: {
        roe: 0,
        debtRatio: 0,
        pe: 0,
        pb: 0,
        eps: 0,
        bps: 0,
      },
      timestamp: Date.now(),
    };
  }
  
  // 根据fields数组动态解析
  const fields = result.data.fields || [];
  const item = result.data.items[0];
  
  const getFieldIndex = (name: string) => fields.indexOf(name);
  
  const roeIdx = getFieldIndex('roe');
  const debtIdx = getFieldIndex('debt_to_assets');
  const epsIdx = getFieldIndex('eps');
  const bpsIdx = getFieldIndex('bps');
  
  return {
    success: true,
    data: {
      roe: roeIdx >= 0 ? Number(item[roeIdx] || 0) : 0,
      debtRatio: debtIdx >= 0 ? Number(item[debtIdx] || 0) : 0,
      pe: 0,
      pb: 0,
      eps: epsIdx >= 0 ? Number(item[epsIdx] || 0) : 0,
      bps: bpsIdx >= 0 ? Number(item[bpsIdx] || 0) : 0,
    },
    timestamp: Date.now(),
  };
}

// 全市场基本面数据缓存（1天有效期）
let allDailyBasicCache: {
  data: {
    code: string;
    marketCap: number;
    circulatingCap: number;
    pe: number;
    pb: number;
    turnoverRate: number;
    volumeRatio: number;
    close: number;       // 收盘价
    changePercent: number; // 涨跌幅
  }[];
  timestamp: number;
  tradeDate: string;
  _version: string;
} | null = null;

// 判断当前是否为交易时段
export function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  
  if (day === 0 || day === 6) return false;
  
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentTime = hour * 100 + minute;
  
  return currentTime >= 915 && currentTime < 1505;
}

// 判断缓存是否过期（基于交易日而非固定24小时）
function isCacheExpired(cacheTradeDate: string): boolean {
  const now = new Date();
  const cacheDate = new Date(cacheTradeDate.slice(0, 4) + '-' + cacheTradeDate.slice(4, 6) + '-' + cacheTradeDate.slice(6, 8));
  
  const currentTradeDate = getLatestTradeDateString(now);
  
  return cacheTradeDate !== currentTradeDate;
}

// 获取最近的交易日字符串 (YYYYMMDD)
function getLatestTradeDateString(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  
  if (day === 0) d.setDate(d.getDate() - 2);
  else if (day === 6) d.setDate(d.getDate() - 1);
  
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// 获取全市场每日基本面数据（不带ts_code，获取所有股票）
// 5000积分支持，无总量限制
// 内置1天缓存，提升二次查询效率
export async function getAllDailyBasic(): Promise<ApiResponse<{
  code: string;
  marketCap: number;      // 总市值（亿）
  circulatingCap: number; // 流通市值（亿）
  pe: number;             // 市盈率
  pb: number;             // 市净率
  turnoverRate: number;   // 换手率（%）
  volumeRatio: number;    // 量比
  close: number;          // 收盘价
  changePercent: number;  // 涨跌幅
}[]>> {
  // 检查缓存是否有效（基于交易日判断）
  const CACHE_VERSION = 'v5'; // 修复: 改用 daily_basic 获取 turnover_rate/volume_ratio
  if (allDailyBasicCache && 
      allDailyBasicCache._version === CACHE_VERSION && 
      !isCacheExpired(allDailyBasicCache.tradeDate)) {
    console.log(`[getAllDailyBasic] 使用缓存数据（${allDailyBasicCache.tradeDate}）`);
    return {
      success: true,
      data: allDailyBasicCache.data,
      timestamp: allDailyBasicCache.timestamp,
    };
  }

  console.log('[getAllDailyBasic] 缓存未命中或已过期，请求Tushare API...');

  // 修复: bak_daily 不返回 turnover_rate/volume_ratio，改用 daily_basic 获取资金面数据
  // daily_basic 接口规则：ts_code 和 trade_date 二选一必选
  // 不传 ts_code + 传 trade_date = 获取全市场当日数据（~5000+只）
  // 尝试最近5个交易日
  for (let daysBack = 0; daysBack < 5; daysBack++) {
    const tradeDate = new Date();
    tradeDate.setDate(tradeDate.getDate() - daysBack);
    const dateStr = tradeDate.toISOString().slice(0, 10).replace(/-/g, '');

    // 并行请求 daily_basic（资金面数据：换手率、量比）和 bak_daily（名称、收盘价、涨跌幅）
    const [dailyBasicResult, bakDailyResult] = await Promise.all([
      tushareRequest<{
        fields: string[];
        items: (string | number | null)[][];
      }>('daily_basic', {
        trade_date: dateStr,
      }, 'ts_code,turnover_rate,volume_ratio,pe,pb,total_mv,circ_mv'),
      tushareRequest<{
        fields: string[];
        items: (string | number | null)[][];
      }>('bak_daily', {
        trade_date: dateStr,
      }, 'ts_code,name,close,pct_change,total_mv'),
    ]);

    if (dailyBasicResult.success && dailyBasicResult.data && dailyBasicResult.data.items && dailyBasicResult.data.items.length > 0) {
      const dbFields = dailyBasicResult.data.fields || [];
      const bkFields = bakDailyResult.success && bakDailyResult.data ? bakDailyResult.data.fields || [] : [];

      console.log(`[getAllDailyBasic] daily_basic 返回字段: ${dbFields.join(',')}, 条数: ${dailyBasicResult.data.items.length}`);
      if (bakDailyResult.success && bakDailyResult.data) {
        console.log(`[getAllDailyBasic] bak_daily 返回字段: ${bkFields.join(',')}, 条数: ${bakDailyResult.data.items.length}`);
      }

      const getDbIdx = (name: string) => dbFields.indexOf(name);
      const getBkIdx = (name: string) => bkFields.indexOf(name);

      const dbTsIdx = getDbIdx('ts_code');
      const dbTrIdx = getDbIdx('turnover_rate');
      const dbVrIdx = getDbIdx('volume_ratio');
      const dbPeIdx = getDbIdx('pe');
      const dbPbIdx = getDbIdx('pb');
      const dbMvIdx = getDbIdx('total_mv');
      const dbCircIdx = getDbIdx('circ_mv');

      const bkTsIdx = getBkIdx('ts_code');
      const bkNameIdx = getBkIdx('name');
      const bkCloseIdx = getBkIdx('close');
      const bkPctChgIdx = getBkIdx('pct_change');

      // 构建 bak_daily 映射表（用于补充 name/close/changePercent）
      const bakDailyMap = new Map<string, { name: string; close: number; changePercent: number }>();
      if (bakDailyResult.success && bakDailyResult.data && bakDailyResult.data.items) {
        for (const item of bakDailyResult.data.items) {
          const tsCode = bkTsIdx >= 0 ? String(item[bkTsIdx] || '') : '';
          if (!tsCode) continue;
          const code = tsCode.split('.')[0];
          bakDailyMap.set(code, {
            name: bkNameIdx >= 0 ? String(item[bkNameIdx] || '') : '',
            close: bkCloseIdx >= 0 ? Number(item[bkCloseIdx] || 0) : 0,
            changePercent: bkPctChgIdx >= 0 ? Number(item[bkPctChgIdx] || 0) : 0,
          });
        }
      }

      // 打印第一条数据用于调试
      if (dailyBasicResult.data.items.length > 0) {
        const firstItem = dailyBasicResult.data.items[0];
        const tsCode = dbTsIdx >= 0 ? String(firstItem[dbTsIdx] || '') : '';
        const code = tsCode.split('.')[0];
        const bkData = bakDailyMap.get(code);
        console.log(`[getAllDailyBasic] 第一条数据: ts_code=${tsCode}, turnover_rate=${firstItem[dbTrIdx]}, volume_ratio=${firstItem[dbVrIdx]}, total_mv=${firstItem[dbMvIdx]}, name=${bkData?.name || ''}`);
      }

      const basicData = dailyBasicResult.data.items.map((item) => {
        const tsCode = dbTsIdx >= 0 ? String(item[dbTsIdx] || '') : '';
        const code = tsCode.split('.')[0];
        const bkData = bakDailyMap.get(code);
        return {
          code,
          name: bkData?.name || '',
          marketCap: dbMvIdx >= 0 ? Number(item[dbMvIdx] || 0) / 10000 : 0,
          circulatingCap: dbCircIdx >= 0 ? Number(item[dbCircIdx] || 0) / 10000 : 0,
          pe: dbPeIdx >= 0 ? Number(item[dbPeIdx] || 0) : 0,
          pb: dbPbIdx >= 0 ? Number(item[dbPbIdx] || 0) : 0,
          turnoverRate: dbTrIdx >= 0 ? Number(item[dbTrIdx] || 0) : 0,
          volumeRatio: dbVrIdx >= 0 ? Number(item[dbVrIdx] || 1) : 1,
          close: bkData?.close || 0,
          changePercent: bkData?.changePercent || 0,
        };
      });

      allDailyBasicCache = {
        data: basicData,
        timestamp: Date.now(),
        tradeDate: dateStr,
        _version: CACHE_VERSION,
      };
      console.log(`[getAllDailyBasic] 缓存已更新（${dateStr}，${basicData.length}只）`);

      return {
        success: true,
        data: basicData,
        timestamp: Date.now(),
      };
    }
  }

  return {
    success: false,
    error: '获取全市场基本面数据失败，近5个交易日返回数据均不足',
    timestamp: Date.now(),
  };
}

// 获取全市场股票基本信息（行业、地区等）
export async function getAllStockBasic(): Promise<ApiResponse<{
  code: string;
  name: string;
  industry: string;
  area: string;
}[]>> {
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number)[][];
  }>('stock_basic', { list_status: 'L' }, 'ts_code,symbol,name,area,industry');
  
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      timestamp: Date.now(),
    };
  }
  
  const fields = result.data.fields || [];
  const getFieldIndex = (name: string) => fields.indexOf(name);
  
  const tsIdx = getFieldIndex('ts_code');
  const nameIdx = getFieldIndex('name');
  const industryIdx = getFieldIndex('industry');
  const areaIdx = getFieldIndex('area');
  
  const stockList = result.data.items.map((item) => {
    const tsCode = String(item[tsIdx] || '');
    const code = tsCode.split('.')[0];
    
    return {
      code,
      name: nameIdx >= 0 ? String(item[nameIdx] || '') : '',
      industry: industryIdx >= 0 ? (String(item[industryIdx] || '未知')) : '未知',
      area: areaIdx >= 0 ? String(item[areaIdx] || '') : '',
    };
  });
  
  return {
    success: true,
    data: stockList,
    timestamp: Date.now(),
  };
}

// 获取每日基本面数据（含市值、PE、PB、换手率等）
export async function getDailyBasic(codes: string[]): Promise<ApiResponse<{
  code: string;
  name?: string;
  marketCap: number;      // 总市值（亿）
  circulatingCap: number; // 流通市值（亿）
  pe: number;             // 市盈率
  pb: number;             // 市净率
  turnoverRate: number;   // 换手率（%）
  volumeRatio: number;    // 量比
}[]>> {
  const tsCodes = codes.map(toTushareCode).join(',');
  
  // 尝试最近5个交易日
  for (let daysBack = 0; daysBack < 5; daysBack++) {
    const tradeDate = new Date();
    tradeDate.setDate(tradeDate.getDate() - daysBack);
    const dateStr = tradeDate.toISOString().slice(0, 10).replace(/-/g, '');
    
    const result = await tushareRequest<{
      fields: string[];
      items: (string | number | null)[][];
    }>('daily_basic', { 
      ts_code: tsCodes,
      trade_date: dateStr,
    }, 'ts_code,total_mv,circ_mv,pe,pb,turnover_rate,volume_ratio');
    
    if (result.success && result.data && result.data.items.length > 0) {
      const fields = result.data.fields || [];
      const getFieldIndex = (name: string) => fields.indexOf(name);
      
      const tsIdx = getFieldIndex('ts_code');
      const mvIdx = getFieldIndex('total_mv');
      const circIdx = getFieldIndex('circ_mv');
      const peIdx = getFieldIndex('pe');
      const pbIdx = getFieldIndex('pb');
      const trIdx = getFieldIndex('turnover_rate');
      const vrIdx = getFieldIndex('volume_ratio');
      
      const basicData = result.data.items.map((item) => {
        const tsCode = String(item[tsIdx] || '');
        const code = tsCode.split('.')[0];
        
        return {
          code,
          marketCap: mvIdx >= 0 ? Number(item[mvIdx] || 0) / 10000 : 0,
          circulatingCap: circIdx >= 0 ? Number(item[circIdx] || 0) / 10000 : 0,
          pe: peIdx >= 0 ? Number(item[peIdx] || 0) : 0,
          pb: pbIdx >= 0 ? Number(item[pbIdx] || 0) : 0,
          turnoverRate: trIdx >= 0 ? Number(item[trIdx] || 0) : 0,
          volumeRatio: vrIdx >= 0 ? Number(item[vrIdx] || 1) : 1,
        };
      });
      
      return {
        success: true,
        data: basicData,
        timestamp: Date.now(),
      };
    }
  }
  
  return {
    success: false,
    error: '获取基本面数据失败，近5个交易日无数据',
    timestamp: Date.now(),
  };
}

// 根据市值范围筛选股票
export async function getStocksByMarketCap(
  minCap: number = 0,
  maxCap: number = 100,
  limit: number = 50
): Promise<ApiResponse<{
  code: string;
  name: string;
  marketCap: number;
  industry: string;
}[]>> {
  // 使用daily_basic获取所有股票的市值
  // 注意：Tushare免费用户每分钟有次数限制
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily_basic', {
    trade_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  }, 'ts_code,total_mv');
  
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || '获取市值数据失败',
      timestamp: Date.now(),
    };
  }
  
  // 筛选市值范围内的股票
  const filteredStocks = result.data.items
    .filter((item) => {
      const marketCap = Number(item[1] || 0) / 10000; // 转换为亿
      return marketCap >= minCap && marketCap <= maxCap;
    })
    .slice(0, limit)
    .map((item) => {
      const tsCode = String(item[0] || '');
      return {
        code: tsCode.split('.')[0],
        name: '', // 需要另外获取
        marketCap: Number(item[1] || 0) / 10000,
        industry: '',
      };
    });
  
  return {
    success: true,
    data: filteredStocks,
    timestamp: Date.now(),
  };
}

// 检查Tushare Token是否配置
export function isTushareConfigured(): boolean {
  return !!process.env.TUSHARE_TOKEN;
}

// ==================== 概念板块相关API（需6000积分） ====================

// 概念板块信息（ths_index返回）
export interface ConceptIndex {
  tsCode: string;   // 板块代码 如 885835.TI
  name: string;     // 板块名称 如 "参股银行"
  count: number;    // 成分个数
  exchange: string; // A/HK/US
  listDate: string; // 上市日期
  type: string;     // N-概念 I-行业 R-地域 S-特色 ST-风格 TH-主题 BB-宽基
}

// 概念板块成分（ths_member返回）
export interface ConceptMember {
  tsCode: string;     // 板块代码
  conCode: string;    // 股票代码 如 000001.SZ
  conName: string;    // 股票名称
}

// 概念板块日行情（ths_daily返回）
export interface ConceptDaily {
  tsCode: string;      // 板块代码
  tradeDate: string;   // 交易日期
  open: number;        // 开盘点位
  close: number;       // 收盘点位
  high: number;        // 最高点位
  low: number;         // 最低点位
  pctChange: number;   // 涨跌幅(%)
  volume: number;      // 成交量
  amount: number;      // 成交额
}

// 获取同花顺概念/行业/特色指数列表（6000积分）
// 一次性获取全部概念板块，无需分页
// type: N-概念指数 I-行业指数 S-特色指数 ST-风格指数 TH-主题指数 BB-宽基指数
export async function getConceptIndices(
  type: 'N' | 'I' | 'S' | 'ST' | 'TH' | 'BB' = 'N',
  exchange: 'A' | 'HK' | 'US' = 'A'
): Promise<ApiResponse<ConceptIndex[]>> {
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number)[][];
  }>('ths_index', { exchange, type }, 'ts_code,name,count,exchange,list_date,type');

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      timestamp: Date.now(),
    };
  }

  const fields = result.data.fields || [];
  const getFieldIndex = (name: string) => fields.indexOf(name);

  const tsIdx = getFieldIndex('ts_code');
  const nameIdx = getFieldIndex('name');
  const countIdx = getFieldIndex('count');
  const exchangeIdx = getFieldIndex('exchange');
  const listDateIdx = getFieldIndex('list_date');
  const typeIdx = getFieldIndex('type');

  const indices: ConceptIndex[] = result.data.items.map((item) => ({
    tsCode: tsIdx >= 0 ? String(item[tsIdx] || '') : '',
    name: nameIdx >= 0 ? String(item[nameIdx] || '') : '',
    count: countIdx >= 0 ? Number(item[countIdx] || 0) : 0,
    exchange: exchangeIdx >= 0 ? String(item[exchangeIdx] || '') : '',
    listDate: listDateIdx >= 0 ? String(item[listDateIdx] || '') : '',
    type: typeIdx >= 0 ? String(item[typeIdx] || '') : '',
  }));

  return {
    success: true,
    data: indices,
    timestamp: Date.now(),
  };
}

// 获取概念板块成分股列表（6000积分）
// 可按板块代码获取成分，也可按股票代码反向查询所属概念
export async function getConceptMembers(
  tsCode?: string,   // 板块代码（如 885800.TI）
  conCode?: string   // 股票代码（如 000001.SZ），与 tsCode 二选一
): Promise<ApiResponse<ConceptMember[]>> {
  const params: Record<string, string> = {};
  if (tsCode) params.ts_code = tsCode;
  if (conCode) params.con_code = conCode;

  const result = await tushareRequest<{
    fields: string[];
    items: (string | number)[][];
  }>('ths_member', params, 'ts_code,con_code,con_name');

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      timestamp: Date.now(),
    };
  }

  const fields = result.data.fields || [];
  const getFieldIndex = (name: string) => fields.indexOf(name);

  const tsIdx = getFieldIndex('ts_code');
  const conIdx = getFieldIndex('con_code');
  const conNameIdx = getFieldIndex('con_name');

  const members: ConceptMember[] = result.data.items.map((item) => ({
    tsCode: tsIdx >= 0 ? String(item[tsIdx] || '') : '',
    conCode: conIdx >= 0 ? String(item[conIdx] || '') : '',
    conName: conNameIdx >= 0 ? String(item[conNameIdx] || '') : '',
  }));

  return {
    success: true,
    data: members,
    timestamp: Date.now(),
  };
}

// 概念板块日行情缓存（基于交易日）
let conceptDailyCache: {
  data: Map<string, ConceptDaily>;  // key: tsCode -> ConceptDaily
  timestamp: number;
  tradeDate: string;
} | null = null;

// 股票所属概念缓存（基于交易日）
// key: conCode (如 000001.SZ), value: 所属概念列表 [{tsCode, tsName}]
let stockConceptsCache: {
  data: Map<string, { tsCode: string; tsName: string }[]>;
  timestamp: number;
  tradeDate: string;
} | null = null;

// 获取概念板块当日日行情（6000积分）
// 按交易日获取所有概念板块的涨跌幅
// 内置缓存，基于交易日判断是否刷新
export async function getConceptDaily(
  tradeDate?: string  // YYYYMMDD格式，默认最近交易日
): Promise<ApiResponse<ConceptDaily[]>> {
  // 检查缓存（基于交易日判断）
  if (conceptDailyCache && !isCacheExpired(conceptDailyCache.tradeDate)) {
    console.log(`[getConceptDaily] 使用缓存数据（${conceptDailyCache.tradeDate}）`);
    return {
      success: true,
      data: Array.from(conceptDailyCache.data.values()),
      timestamp: conceptDailyCache.timestamp,
    };
  }

  console.log('[getConceptDaily] 缓存未命中，请求Tushare API...');

  // 尝试最近5个交易日
  for (let daysBack = 0; daysBack < 5; daysBack++) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    const dateStr = tradeDate || d.toISOString().slice(0, 10).replace(/-/g, '');

    const result = await tushareRequest<{
      fields: string[];
      items: (string | number | null)[][];
    }>('ths_daily', { trade_date: dateStr }, 'ts_code,trade_date,open,close,high,low,pct_chg,vol,amount');

    if (result.success && result.data && result.data.items.length > 10) {
      const fields = result.data.fields || [];
      const getFieldIndex = (name: string) => fields.indexOf(name);

      const tsIdx = getFieldIndex('ts_code');
      const tradeDateIdx = getFieldIndex('trade_date');
      const openIdx = getFieldIndex('open');
      const closeIdx = getFieldIndex('close');
      const highIdx = getFieldIndex('high');
      const lowIdx = getFieldIndex('low');
      const pctIdx = getFieldIndex('pct_chg');
      const volIdx = getFieldIndex('vol');
      const amountIdx = getFieldIndex('amount');

      const dailyData: ConceptDaily[] = result.data.items.map((item) => ({
        tsCode: tsIdx >= 0 ? String(item[tsIdx] || '') : '',
        tradeDate: tradeDateIdx >= 0 ? String(item[tradeDateIdx] || '') : '',
        open: openIdx >= 0 ? Number(item[openIdx] || 0) : 0,
        close: closeIdx >= 0 ? Number(item[closeIdx] || 0) : 0,
        high: highIdx >= 0 ? Number(item[highIdx] || 0) : 0,
        low: lowIdx >= 0 ? Number(item[lowIdx] || 0) : 0,
        pctChange: pctIdx >= 0 ? Number(item[pctIdx] || 0) : 0,
        volume: volIdx >= 0 ? Number(item[volIdx] || 0) : 0,
        amount: amountIdx >= 0 ? Number(item[amountIdx] || 0) : 0,
      }));

      // 写入缓存
      const dataMap = new Map<string, ConceptDaily>();
      dailyData.forEach(d => dataMap.set(d.tsCode, d));
      conceptDailyCache = {
        data: dataMap,
        timestamp: Date.now(),
        tradeDate: dateStr,
      };
      console.log(`[getConceptDaily] 缓存已更新（${dateStr}，${dailyData.length}个板块）`);

      return {
        success: true,
        data: dailyData,
        timestamp: Date.now(),
      };
    }
  }

  return {
    success: false,
    error: '获取概念板块日行情失败，近5个交易日无数据',
    timestamp: Date.now(),
  };
}

// 获取个股所属概念（带交易日缓存）
// 按股票代码反向查询所属概念板块，结果缓存至下一交易日
export async function getStockConceptsWithCache(
  code: string
): Promise<{ tsCode: string; tsName: string }[]> {
  // 检查缓存
  if (stockConceptsCache && !isCacheExpired(stockConceptsCache.tradeDate)) {
    const cached = stockConceptsCache.data.get(code);
    if (cached) {
      return cached;
    }
  }

  // 初始化缓存
  if (!stockConceptsCache || isCacheExpired(stockConceptsCache.tradeDate)) {
    stockConceptsCache = {
      data: new Map(),
      timestamp: Date.now(),
      tradeDate: getLatestTradeDateString(new Date()),
    };
  }

  // 获取板块名称映射
  const indexResult = await getConceptIndices('N');
  const nameMap = new Map<string, string>();
  if (indexResult.success && indexResult.data) {
    indexResult.data.forEach(idx => nameMap.set(idx.tsCode, idx.name));
  }

  // 调用ths_member API（按股票代码查询）
  const memberResult = await getConceptMembers(undefined, code);
  const concepts: { tsCode: string; tsName: string }[] = [];
  
  if (memberResult.success && memberResult.data && memberResult.data.length > 0) {
    const seenCodes = new Set<string>();
    memberResult.data.forEach(m => {
      if (!seenCodes.has(m.tsCode)) {
        seenCodes.add(m.tsCode);
        concepts.push({
          tsCode: m.tsCode,
          tsName: nameMap.get(m.tsCode) || m.tsCode,
        });
      }
    });
  }

  // 写入缓存
  stockConceptsCache.data.set(code, concepts);

  return concepts;
}

// 批量获取股票所属概念（分批限流，带缓存）
export async function batchGetStockConcepts(
  codes: string[],
  batchSize: number = 10,
  delayMs: number = 200
): Promise<Map<string, { tsCode: string; tsName: string }[]>> {
  const result = new Map<string, { tsCode: string; tsName: string }[]>();
  const failedCodes: string[] = [];

  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const promises = batch.map(async (code) => {
      try {
        const concepts = await getStockConceptsWithCache(code);
        if (concepts.length > 0) {
          result.set(code, concepts);
        }
      } catch (err) {
        console.warn(`[batchGetStockConcepts] ${code} 查询失败:`, err);
        failedCodes.push(code);
      }
    });
    await Promise.all(promises);

    // 批次间延迟，避免限流
    if (i + batchSize < codes.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (failedCodes.length > 0) {
    console.warn(`[batchGetStockConcepts] ${failedCodes.length} 只股票查询失败:`, failedCodes.slice(0, 10).join(', '));
  }

  return result;
}

// 获取个股所属概念列表（按股票代码查询）
// 返回该股票所属的全部概念板块代码和名称
export async function getStockConcepts(code: string): Promise<ApiResponse<string[]>> {
  const tsCode = toTushareCode(code);
  
  const memberResult = await getConceptMembers(undefined, tsCode);
  
  if (!memberResult.success || !memberResult.data) {
    return {
      success: false,
      error: memberResult.error,
      timestamp: Date.now(),
    };
  }

  const conceptCodes = memberResult.data.map(m => m.tsCode);
  
  return {
    success: true,
    data: conceptCodes,
    timestamp: Date.now(),
  };
}

// 获取个股所属概念名称列表
export async function getStockConceptNames(code: string): Promise<ApiResponse<string[]>> {
  const tsCode = toTushareCode(code);
  
  const memberResult = await getConceptMembers(undefined, tsCode);
  
  if (!memberResult.success || !memberResult.data || memberResult.data.length === 0) {
    return {
      success: true,
      data: [],
      timestamp: Date.now(),
    };
  }

  // 从成分股结果中提取板块代码，再获取板块名称
  const conceptCodes = [...new Set(memberResult.data.map(m => m.tsCode))];
  
  // 批量获取板块信息
  const indexResult = await getConceptIndices('N');
  if (!indexResult.success || !indexResult.data) {
    return {
      success: true,
      data: conceptCodes, // 降级返回代码
      timestamp: Date.now(),
    };
  }

  const indexMap = new Map(indexResult.data.map(i => [i.tsCode, i.name]));
  const conceptNames = conceptCodes.map(c => indexMap.get(c) || c);

  return {
    success: true,
    data: conceptNames,
    timestamp: Date.now(),
  };
}
