// 新浪财经股票API封装
// 免费、无需注册、稳定的A股实时行情数据源

import type { RealtimeQuote, StockSearchResult, ApiResponse } from './types';

// 新浪股票API基础URL
const SINA_QUOTE_URL = 'https://hq.sinajs.cn/list=';
const SINA_SUGGEST_URL = 'https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key=';

// 解析股票代码，添加市场前缀
export function formatStockCode(code: string): string {
  // 移除已有的前缀
  const cleanCode = code.replace(/^(sh|sz|bj)/i, '');
  
  // 根据代码规则判断市场
  if (cleanCode.startsWith('6')) {
    return `sh${cleanCode}`; // 上海
  } else if (cleanCode.startsWith('0') || cleanCode.startsWith('3')) {
    return `sz${cleanCode}`; // 深圳
  } else if (cleanCode.startsWith('4') || cleanCode.startsWith('8')) {
    return `bj${cleanCode}`; // 北交所
  }
  
  // 默认返回原代码
  return code.toLowerCase();
}

// 解析新浪行情数据
function parseSinaQuote(code: string, data: string): RealtimeQuote | null {
  // 格式: var hq_str_sh600519="贵州茅台,1800.00,1798.88,..."
  const match = data.match(/="([^"]+)"/);
  if (!match || !match[1]) return null;
  
  const parts = match[1].split(',');
  if (parts.length < 32) return null;
  
  const prevClose = parseFloat(parts[2]) || 0;
  const price = parseFloat(parts[3]) || 0;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
  
  return {
    code: code,
    name: parts[0],
    open: parseFloat(parts[1]) || 0,
    prevClose,
    price,
    high: parseFloat(parts[4]) || 0,
    low: parseFloat(parts[5]) || 0,
    volume: parseFloat(parts[8]) || 0,
    amount: parseFloat(parts[9]) || 0,
    bid1: parseFloat(parts[11]) || 0,
    bid1Vol: parseFloat(parts[10]) || 0,
    ask1: parseFloat(parts[21]) || 0,
    ask1Vol: parseFloat(parts[20]) || 0,
    date: parts[30],
    time: parts[31],
    change,
    changePercent,
  };
}

// 获取单只股票实时行情
export async function getRealtimeQuote(code: string): Promise<ApiResponse<RealtimeQuote>> {
  try {
    const symbol = formatStockCode(code);
    const url = `${SINA_QUOTE_URL}${symbol}`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
      },
      next: { revalidate: 3 }, // 3秒缓存
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    // 新浪返回的是GBK编码，需要处理
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(buffer);
    
    const quote = parseSinaQuote(symbol, text);
    
    if (!quote) {
      return {
        success: false,
        error: '解析行情数据失败',
        timestamp: Date.now(),
      };
    }
    
    return {
      success: true,
      data: quote,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取行情失败',
      timestamp: Date.now(),
    };
  }
}

// 批量获取股票实时行情（自动分批，避免URL过长导致431错误）
export async function getBatchQuotes(codes: string[]): Promise<ApiResponse<RealtimeQuote[]>> {
  try {
    if (codes.length === 0) {
      return { success: true, data: [], timestamp: Date.now() };
    }
    
    // 分批处理，每批最多100只股票，避免URL过长
    const BATCH_SIZE = 100;
    const allQuotes: RealtimeQuote[] = [];
    
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
      const batch = codes.slice(i, i + BATCH_SIZE);
      const symbols = batch.map(formatStockCode);
      const url = `${SINA_QUOTE_URL}${symbols.join(',')}`;
      
      const response = await fetch(url, {
        headers: {
          'Referer': 'https://finance.sina.com.cn',
        },
        next: { revalidate: 3 },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('gbk');
      const text = decoder.decode(buffer);
      
      // 每行一个股票数据
      const lines = text.trim().split('\n');
      
      for (let j = 0; j < lines.length; j++) {
        const quote = parseSinaQuote(symbols[j], lines[j]);
        if (quote) {
          allQuotes.push(quote);
        }
      }
      
      // 批次间短暂延迟，避免请求过快
      if (i + BATCH_SIZE < codes.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return {
      success: true,
      data: allQuotes,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '批量获取行情失败',
      timestamp: Date.now(),
    };
  }
}

// 股票搜索（模糊匹配）
// 优先使用Tushare数据，回退到本地匹配
export async function searchStocks(keyword: string): Promise<ApiResponse<StockSearchResult[]>> {
  try {
    if (!keyword || keyword.length < 1) {
      return { success: true, data: [], timestamp: Date.now() };
    }
    
    const results: StockSearchResult[] = [];
    
    // 尝试从Tushare获取股票列表进行模糊匹配
    if (process.env.TUSHARE_TOKEN) {
      try {
        const { getStockBasic } = await import('./tushare-api');
        const basicResult = await getStockBasic();
        if (basicResult.success && basicResult.data && basicResult.data.length > 0) {
          const lowerKeyword = keyword.toLowerCase();
          for (const stock of basicResult.data) {
            // 代码或名称包含关键词
            if (stock.code.includes(lowerKeyword) || 
                stock.name.includes(keyword) || 
                stock.name.toLowerCase().includes(lowerKeyword) ||
                stock.symbol.includes(lowerKeyword)) {
              results.push({
                code: stock.code,
                name: stock.name,
                market: stock.market,
                symbol: stock.symbol,
              });
            }
            if (results.length >= 10) break;
          }
          if (results.length > 0) {
            return {
              success: true,
              data: results,
              timestamp: Date.now(),
            };
          }
        }
      } catch (e) {
        console.warn('[searchStocks] Tushare fallback failed:', e);
      }
    }
    
    // 如果Tushare不可用，尝试新浪suggest
    const url = `${SINA_SUGGEST_URL}${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
      },
      next: { revalidate: 60 },
    });
    
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('gbk');
      const text = decoder.decode(buffer);
      
      // 格式: var suggestvalue="股票代码,简称,代码,名称,类型;..."
      const match = text.match(/="([^"]+)"/);
      if (match && match[1]) {
        const items = match[1].split(';').filter(Boolean);
        for (const item of items) {
          const parts = item.split(',');
          if (parts.length >= 4) {
            const fullCode = parts[0];
            const market = fullCode.startsWith('sh') ? 'sh' : 
                          fullCode.startsWith('sz') ? 'sz' : 'bj';
            const code = fullCode.replace(/^(sh|sz|bj)/, '');
            
            if (/^[036]\d{5}$/.test(code)) {
              results.push({
                code,
                name: parts[4] || parts[3],
                market: market as 'sh' | 'sz' | 'bj',
                symbol: fullCode,
              });
            }
          }
          if (results.length >= 10) break;
        }
      }
    }
    
    return {
      success: true,
      data: results.slice(0, 10),
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索股票失败',
      timestamp: Date.now(),
    };
  }
}

// 判断是否为交易时间
export function isTradingTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  
  // 周末不交易
  if (day === 0 || day === 6) return false;
  
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;
  
  // 上午 9:30-11:30，下午 13:00-15:00
  const morningStart = 9 * 60 + 30;
  const morningEnd = 11 * 60 + 30;
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60;
  
  return (time >= morningStart && time <= morningEnd) ||
         (time >= afternoonStart && time <= afternoonEnd);
}
