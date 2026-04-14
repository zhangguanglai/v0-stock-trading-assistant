// Tushare Pro API封装
// 用于获取历史K线数据、财务数据等

import type { DailyKLine, ApiResponse, StockInfo } from './types';

const TUSHARE_API_URL = 'http://api.tushare.pro';

// Tushare API请求
async function tushareRequest<T>(
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
  
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number)[][];
  }>('fina_indicator', { ts_code: tsCode, limit: 1 }, 'roe,debt_to_assets,eps,bps');
  
  if (!result.success || !result.data || result.data.items.length === 0) {
    // 返回默认值
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
  
  const item = result.data.items[0];
  
  return {
    success: true,
    data: {
      roe: Number(item[0]) || 0,
      debtRatio: Number(item[1]) || 0,
      pe: 0, // 需要单独计算
      pb: 0, // 需要单独计算
      eps: Number(item[2]) || 0,
      bps: Number(item[3]) || 0,
    },
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
  // 获取最新交易日期
  const today = new Date();
  const tradeDate = today.toISOString().slice(0, 10).replace(/-/g, '');
  
  const tsCodes = codes.map(toTushareCode).join(',');
  
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily_basic', { 
    ts_code: tsCodes,
    trade_date: tradeDate,
  }, 'ts_code,total_mv,circ_mv,pe,pb,turnover_rate,volume_ratio');
  
  if (!result.success || !result.data) {
    // 如果当日无数据，尝试前一个交易日
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
    
    const retryResult = await tushareRequest<{
      fields: string[];
      items: (string | number | null)[][];
    }>('daily_basic', { 
      ts_code: tsCodes,
      trade_date: yesterdayStr,
    }, 'ts_code,total_mv,circ_mv,pe,pb,turnover_rate,volume_ratio');
    
    if (!retryResult.success || !retryResult.data) {
      return {
        success: false,
        error: result.error || '获取基本面数据失败',
        timestamp: Date.now(),
      };
    }
    
    result.data = retryResult.data;
  }
  
  const basicData = result.data.items.map((item) => {
    const tsCode = String(item[0] || '');
    const code = tsCode.split('.')[0];
    
    return {
      code,
      marketCap: Number(item[1] || 0) / 10000,    // 转换为亿（Tushare返回万元）
      circulatingCap: Number(item[2] || 0) / 10000,
      pe: Number(item[3] || 0),
      pb: Number(item[4] || 0),
      turnoverRate: Number(item[5] || 0),
      volumeRatio: Number(item[6] || 1),
    };
  });
  
  return {
    success: true,
    data: basicData,
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
