// Tushare Pro API封装
// 用于获取历史K线数据、财务数据等

import type { DailyKLine, ApiResponse, StockInfo } from './types';

const TUSHARE_API_URL = 'http://api.tushare.pro';

// Tushare API请求
export async function tushareRequest<T>(
  apiName: string,
  params: Record<string, unknown>,
  fields?: string
): Promise<ApiResponse<T>> {
  const token = process.env.TUSHARE_TOKEN;
  
  if (!token) {
    // 如果没有配置Token，返回模拟数据提示
    return {
      success: false,
      error: 'TUSHARE_TOKEN 未配置，请在环境变量中设置',
      timestamp: Date.now(),
    };
  }
  
  try {
    const response = await fetch(TUSHARE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_name: apiName,
        token,
        params,
        fields,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.code !== 0) {
      return {
        success: false,
        error: result.msg || 'Tushare API错误',
        timestamp: Date.now(),
      };
    }
    
    return {
      success: true,
      data: result.data as T,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tushare请求失败',
      timestamp: Date.now(),
    };
  }
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
  limit: number = 120
): Promise<ApiResponse<DailyKLine[]>> {
  const tsCode = toTushareCode(code);
  
  // 默认获取最近120个交易日
  const params: Record<string, unknown> = {
    ts_code: tsCode,
    adj: 'qfq', // 前复权
  };
  
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

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

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
  // 检查缓存是否有效（字段结构已变更，清空旧缓存）
  const CACHE_VERSION = 'v2';
  if (allDailyBasicCache && allDailyBasicCache._version === CACHE_VERSION && (Date.now() - allDailyBasicCache.timestamp) < CACHE_TTL) {
    console.log(`[getAllDailyBasic] 使用缓存数据（${allDailyBasicCache.tradeDate}）`);
    return {
      success: true,
      data: allDailyBasicCache.data,
      timestamp: allDailyBasicCache.timestamp,
    };
  }

  console.log('[getAllDailyBasic] 缓存未命中或已过期，请求Tushare API...');

  // 尝试最近5个交易日
  for (let daysBack = 0; daysBack < 5; daysBack++) {
    const tradeDate = new Date();
    tradeDate.setDate(tradeDate.getDate() - daysBack);
    const dateStr = tradeDate.toISOString().slice(0, 10).replace(/-/g, '');

    // 不带ts_code获取全市场（5000积分支持），增加 close 和 pct_chg 字段
    const result = await tushareRequest<{
      fields: string[];
      items: (string | number | null)[][];
    }>('daily_basic', {
      trade_date: dateStr,
    }, 'ts_code,total_mv,circ_mv,pe,pb,turnover_rate,volume_ratio,close,pct_chg');

    if (result.success && result.data) {
      const itemCount = result.data.items ? result.data.items.length : 0;
      const fields = result.data.fields || [];

      if (itemCount > 100) {
        // 根据fields数组动态解析
        const getFieldIndex = (name: string) => fields.indexOf(name);
        const tsIdx = getFieldIndex('ts_code');
        const mvIdx = getFieldIndex('total_mv');
        const circIdx = getFieldIndex('circ_mv');
        const peIdx = getFieldIndex('pe');
        const pbIdx = getFieldIndex('pb');
        const trIdx = getFieldIndex('turnover_rate');
        const vrIdx = getFieldIndex('volume_ratio');
        const closeIdx = getFieldIndex('close');
        const pctChgIdx = getFieldIndex('pct_chg');

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
            close: closeIdx >= 0 ? Number(item[closeIdx] || 0) : 0,
            changePercent: pctChgIdx >= 0 ? Number(item[pctChgIdx] || 0) : 0,
          };
        });

        // 写入缓存
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
  }

  return {
    success: false,
    error: '获取全市场基本面数据失败，近5个交易日无数据',
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

// 概念板块日行情缓存（1天有效期）
let conceptDailyCache: {
  data: Map<string, ConceptDaily>;  // key: tsCode -> ConceptDaily
  timestamp: number;
  tradeDate: string;
} | null = null;

const CONCEPT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

// 获取概念板块当日日行情（6000积分）
// 按交易日获取所有概念板块的涨跌幅
// 内置1天缓存，每日仅需2次API调用
export async function getConceptDaily(
  tradeDate?: string  // YYYYMMDD格式，默认最近交易日
): Promise<ApiResponse<ConceptDaily[]>> {
  // 检查缓存
  if (conceptDailyCache && (Date.now() - conceptDailyCache.timestamp) < CONCEPT_CACHE_TTL) {
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
