import type { Position, WatchlistStock, TradeRecord, Alert } from './types';

// 模拟持仓数据
export const mockPositions: Omit<Position, 'id'>[] = [
  {
    strategyId: '',
    stockCode: '600519',
    stockName: '贵州茅台',
    sector: '白酒',
    buyPrice: 1680,
    currentPrice: 1756.5,
    shares: 100,
    buyDate: new Date('2024-03-15'),
    stopLossPrice: 1545.6,
    takeProfitPrice: 2100,
    trailingStopEnabled: true,
    highestPrice: 1780,
    alertTriggered: false,
  },
  {
    strategyId: '',
    stockCode: '000858',
    stockName: '五粮液',
    sector: '白酒',
    buyPrice: 142.5,
    currentPrice: 156.8,
    shares: 500,
    buyDate: new Date('2024-03-20'),
    stopLossPrice: 131.1,
    takeProfitPrice: 178.13,
    trailingStopEnabled: true,
    highestPrice: 158.2,
    alertTriggered: false,
  },
  {
    strategyId: '',
    stockCode: '300750',
    stockName: '宁德时代',
    sector: '新能源',
    buyPrice: 198.5,
    currentPrice: 185.2,
    shares: 200,
    buyDate: new Date('2024-04-01'),
    stopLossPrice: 182.62,
    takeProfitPrice: 248.13,
    trailingStopEnabled: false,
    highestPrice: 205.3,
    alertTriggered: true,
    alertType: 'stopLoss',
  },
  {
    strategyId: '',
    stockCode: '002594',
    stockName: '比亚迪',
    sector: '新能源',
    buyPrice: 245.0,
    currentPrice: 268.5,
    shares: 200,
    buyDate: new Date('2024-03-25'),
    stopLossPrice: 225.4,
    takeProfitPrice: 306.25,
    trailingStopEnabled: true,
    highestPrice: 272.0,
    alertTriggered: false,
  },
];

// 模拟观察池数据
export const mockWatchlist: Omit<WatchlistStock, 'id' | 'addedAt'>[] = [
  {
    stockCode: '601012',
    stockName: '隆基绿能',
    sector: '光伏',
    currentPrice: 24.56,
    changePercent: 3.25,
    priceVsMA5: 2.1,
    priceVsMA20: 5.8,
    volumeRatio: 1.82,
    roe: 18.5,
    debtRatio: 42.3,
    pePercentile: 22,
    meetsRules: true,
    isSystemPick: true,
  },
  {
    stockCode: '600036',
    stockName: '招商银行',
    sector: '银行',
    currentPrice: 35.82,
    changePercent: 1.56,
    priceVsMA5: 1.2,
    priceVsMA20: 3.5,
    volumeRatio: 1.35,
    roe: 16.2,
    debtRatio: 0, // 银行负债率特殊
    pePercentile: 18,
    meetsRules: true,
    isSystemPick: true,
  },
  {
    stockCode: '000333',
    stockName: '美的集团',
    sector: '家电',
    currentPrice: 62.45,
    changePercent: -0.82,
    priceVsMA5: -1.5,
    priceVsMA20: 2.1,
    volumeRatio: 0.95,
    roe: 22.8,
    debtRatio: 38.5,
    pePercentile: 25,
    meetsRules: false,
    isSystemPick: false,
  },
  {
    stockCode: '002475',
    stockName: '立讯精密',
    sector: '电子',
    currentPrice: 38.92,
    changePercent: 4.15,
    priceVsMA5: 3.8,
    priceVsMA20: 8.2,
    volumeRatio: 2.15,
    roe: 15.6,
    debtRatio: 35.2,
    pePercentile: 28,
    meetsRules: true,
    isSystemPick: true,
  },
  {
    stockCode: '603259',
    stockName: '药明康德',
    sector: '医药',
    currentPrice: 68.35,
    changePercent: 2.35,
    priceVsMA5: 2.5,
    priceVsMA20: 4.8,
    volumeRatio: 1.68,
    roe: 12.8,
    debtRatio: 28.6,
    pePercentile: 32,
    meetsRules: false,
    isSystemPick: false,
  },
];

// 模拟交易记录
export const mockTradeRecords: Omit<TradeRecord, 'id'>[] = [
  {
    strategyId: '',
    stockCode: '600519',
    stockName: '贵州茅台',
    type: 'buy',
    price: 1680,
    shares: 100,
    amount: 168000,
    date: new Date('2024-03-15'),
    triggerReason: 'MACD底背离+金叉信号',
  },
  {
    strategyId: '',
    stockCode: '000858',
    stockName: '五粮液',
    type: 'buy',
    price: 142.5,
    shares: 500,
    amount: 71250,
    date: new Date('2024-03-20'),
    triggerReason: '5日线上穿20日线',
  },
  {
    strategyId: '',
    stockCode: '601318',
    stockName: '中国平安',
    type: 'buy',
    price: 48.5,
    shares: 1000,
    amount: 48500,
    date: new Date('2024-02-28'),
    triggerReason: '支撑位反弹',
  },
  {
    strategyId: '',
    stockCode: '601318',
    stockName: '中国平安',
    type: 'sell',
    price: 52.8,
    shares: 1000,
    amount: 52800,
    date: new Date('2024-03-18'),
    triggerReason: '达到15%止盈线，执行分批止盈',
    profit: 4300,
    profitPercent: 8.87,
  },
  {
    strategyId: '',
    stockCode: '300750',
    stockName: '宁德时代',
    type: 'buy',
    price: 198.5,
    shares: 200,
    amount: 39700,
    date: new Date('2024-04-01'),
    triggerReason: '放量突破+MACD金叉',
  },
  {
    strategyId: '',
    stockCode: '002594',
    stockName: '比亚迪',
    type: 'buy',
    price: 245.0,
    shares: 200,
    amount: 49000,
    date: new Date('2024-03-25'),
    triggerReason: '站稳60日均线',
  },
  {
    strategyId: '',
    stockCode: '000001',
    stockName: '平安银行',
    type: 'buy',
    price: 12.5,
    shares: 2000,
    amount: 25000,
    date: new Date('2024-02-15'),
    triggerReason: '5日线上穿20日线',
  },
  {
    strategyId: '',
    stockCode: '000001',
    stockName: '平安银行',
    type: 'sell',
    price: 11.8,
    shares: 2000,
    amount: 23600,
    date: new Date('2024-03-05'),
    triggerReason: '触发8%止损线',
    profit: -1400,
    profitPercent: -5.6,
  },
];

// 模拟警报数据
export const mockAlerts: Omit<Alert, 'id' | 'createdAt' | 'read'>[] = [
  {
    type: 'stopLoss',
    severity: 'high',
    stockCode: '300750',
    stockName: '宁德时代',
    message: '已触达止损线 -6.7%，请立即执行卖出规则！',
  },
  {
    type: 'takeProfit',
    severity: 'medium',
    stockCode: '002594',
    stockName: '比亚迪',
    message: '当前收益 9.6%，接近止盈目标，请关注。',
  },
  {
    type: 'riskWarning',
    severity: 'medium',
    message: '白酒行业仓位占比已达 35%，接近上限 40%。',
  },
  {
    type: 'signal',
    severity: 'low',
    stockCode: '601012',
    stockName: '隆基绿能',
    message: '出现买入信号：MACD金叉 + 放量突破',
  },
];

// 净值曲线模拟数据
export const mockNetValueData = [
  { date: '2024-01', value: 200000, benchmark: 200000 },
  { date: '2024-02', value: 208500, benchmark: 204000 },
  { date: '2024-03', value: 215200, benchmark: 198000 },
  { date: '2024-04', value: 228600, benchmark: 206000 },
  { date: '2024-05', value: 221800, benchmark: 202000 },
  { date: '2024-06', value: 235400, benchmark: 210000 },
  { date: '2024-07', value: 248200, benchmark: 215000 },
  { date: '2024-08', value: 242500, benchmark: 208000 },
  { date: '2024-09', value: 258900, benchmark: 218000 },
  { date: '2024-10', value: 265300, benchmark: 222000 },
  { date: '2024-11', value: 278600, benchmark: 228000 },
  { date: '2024-12', value: 285400, benchmark: 232000 },
];

// 格式化金额
export const formatCurrency = (value: number): string => {
  if (value >= 100000000) {
    return (value / 100000000).toFixed(2) + '亿';
  }
  if (value >= 10000) {
    return (value / 10000).toFixed(2) + '万';
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// 格式化百分比
export const formatPercent = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(2) + '%';
};

// 获取颜色类名
export const getProfitColorClass = (value: number): string => {
  if (value > 0) return 'text-chart-1';
  if (value < 0) return 'text-destructive';
  return 'text-muted-foreground';
};
