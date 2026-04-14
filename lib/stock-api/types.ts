// 股票数据API类型定义

// 实时行情数据（新浪API返回）
export interface RealtimeQuote {
  code: string;           // 股票代码 (如 sh600519)
  name: string;           // 股票名称
  open: number;           // 开盘价
  prevClose: number;      // 昨收价
  price: number;          // 当前价
  high: number;           // 最高价
  low: number;            // 最低价
  volume: number;         // 成交量（股）
  amount: number;         // 成交额（元）
  bid1: number;           // 买一价
  bid1Vol: number;        // 买一量
  ask1: number;           // 卖一价
  ask1Vol: number;        // 卖一量
  date: string;           // 日期 YYYY-MM-DD
  time: string;           // 时间 HH:MM:SS
  change: number;         // 涨跌额
  changePercent: number;  // 涨跌幅 %
  turnoverRate?: number;  // 换手率 %
  pe?: number;            // 市盈率
  pb?: number;            // 市净率
  marketCap?: number;     // 总市值（亿）
  circulationCap?: number;// 流通市值（亿）
}

// 日K线数据
export interface DailyKLine {
  date: string;           // 日期 YYYY-MM-DD
  open: number;           // 开盘价
  high: number;           // 最高价
  low: number;            // 最低价
  close: number;          // 收盘价
  volume: number;         // 成交量
  amount: number;         // 成交额
  change?: number;        // 涨跌额
  changePercent?: number; // 涨跌幅
  turnover?: number;      // 换手率
}

// 技术指标数据
export interface TechnicalIndicators {
  ma5: number | null;     // 5日均线
  ma10: number | null;    // 10日均线
  ma20: number | null;    // 20日均线
  ma60: number | null;    // 60日均线
  macd: {
    dif: number;          // DIF线
    dea: number;          // DEA线
    macd: number;         // MACD柱
  } | null;
  rsi: {
    rsi6: number;         // 6日RSI
    rsi12: number;        // 12日RSI
    rsi24: number;        // 24日RSI
  } | null;
  kdj: {
    k: number;            // K值
    d: number;            // D值
    j: number;            // J值
  } | null;
  boll: {
    upper: number;        // 上轨
    middle: number;       // 中轨
    lower: number;        // 下轨
  } | null;
  volumeRatio: number;    // 量比
}

// 股票基本信息
export interface StockInfo {
  code: string;           // 股票代码 (不含市场前缀)
  symbol: string;         // 完整代码 (如 sh600519)
  name: string;           // 股票名称
  market: 'sh' | 'sz' | 'bj';  // 市场
  industry: string;       // 行业
  listDate?: string;      // 上市日期
}

// 股票搜索结果
export interface StockSearchResult {
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'bj';
  symbol: string;
  industry?: string;
}

// 选股扫描结果
export interface ScanResult {
  stock: StockInfo;
  quote: RealtimeQuote;
  indicators: TechnicalIndicators;
  signals: StockSignal[];
  score: number;          // 综合评分 0-100
  matchedRules: string[]; // 匹配的规则
}

// 买入信号
export interface StockSignal {
  type: 'buy' | 'sell' | 'hold';
  name: string;           // 信号名称
  strength: 'strong' | 'medium' | 'weak';
  description: string;    // 信号描述
  triggeredAt: string;    // 触发时间
}

// API响应包装
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

// 缓存配置
export interface CacheConfig {
  ttl: number;            // 缓存时间（秒）
  key: string;            // 缓存键
}

// 行情数据缓存
export const CACHE_TTL = {
  REALTIME: 3,            // 实时行情 3秒
  DAILY_KLINE: 3600,      // 日K线 1小时
  STOCK_INFO: 86400,      // 股票信息 1天
  INDICATORS: 60,         // 技术指标 1分钟
} as const;
