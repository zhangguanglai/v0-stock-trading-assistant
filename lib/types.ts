// 交易周期类型
export type TradingCycle = 'short' | 'swing' | 'long';

// 策略状态
export type StrategyStatus = 'active' | 'inactive';

// 交易策略
export interface TradingStrategy {
  id: string;
  name: string;
  cycle: TradingCycle;
  status: StrategyStatus;
  createdAt: Date;
  // 选股规则
  stockRules: StockSelectionRules;
  // 买入规则
  buyRules: BuyRules;
  // 卖出规则
  sellRules: SellRules;
  // 资金管理规则
  moneyRules: MoneyManagementRules;
}

// 选股规则
export interface StockSelectionRules {
  // 技术面
  priceAboveMA5: boolean;
  priceAboveMA20: boolean;
  weeklyMACDGoldenCross: boolean;
  volumeRatio: number; // 量比阈值
  // 基本面
  minROE: number;
  maxDebtRatio: number;
  maxPEPercentile: number;
  // 资金面
  minTurnoverRate5D: number;
  maxMarketCap: number; // 亿
  minSectorGain: number;
}

// 买入规则
export interface BuyRules {
  // 买入信号
  signals: BuySignal[];
  // 分批买入比例
  batchBuyRatios: number[]; // 如 [0.3, 0.3, 0.4]
  // 加仓条件
  addPositionOnDip: number; // 下跌X%加仓
  addPositionOnMA60: boolean; // 站稳60日线加仓
}

export type BuySignal = 
  | 'ma5CrossMa20'
  | 'macdBottomDivergence'
  | 'macdGoldenCross'
  | 'volumeBreakout'
  | 'supportBounce';

// 卖出规则
export interface SellRules {
  // 止损
  stopLossPercent: number;
  // 止盈
  takeProfitPercent: number;
  // 移动止盈
  trailingStopPercent: number;
  // 时间止损
  timeStopDays: number;
  timeStopMinGain: number;
  // 分批止盈
  partialTakeProfitPercent: number; // 达到X%卖一半
}

// 资金管理规则
export interface MoneyManagementRules {
  totalCapital: number;
  maxSingleStockPercent: number;
  maxSectorPercent: number;
  minCashPercent: number;
  maxPositions: number;
}

// 持仓股票
export interface Position {
  id: string;
  strategyId: string;
  stockCode: string;
  stockName: string;
  sector: string;
  buyPrice: number;
  currentPrice: number;
  shares: number;
  buyDate: Date;
  // 止盈止损设置
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopEnabled: boolean;
  highestPrice: number;
  // 提醒状态
  alertTriggered: boolean;
  alertType?: 'stopLoss' | 'takeProfit' | 'timeStop';
}

// 股票池中的股票
export interface WatchlistStock {
  id: string;
  stockCode: string;
  stockName: string;
  sector: string;
  currentPrice: number;
  changePercent: number;
  // 技术指标
  priceVsMA5: number;
  priceVsMA20: number;
  volumeRatio: number;
  // 基本面
  roe: number;
  debtRatio: number;
  pePercentile: number;
  // 是否符合策略
  meetsRules: boolean;
  isSystemPick: boolean; // 系统选出 vs 手动添加
  addedAt: Date;
}

// 交易记录
export interface TradeRecord {
  id: string;
  strategyId: string;
  stockCode: string;
  stockName: string;
  type: 'buy' | 'sell';
  price: number;
  shares: number;
  amount: number;
  date: Date;
  // 触发规则
  triggerReason: string;
  // 收益（卖出时）
  profit?: number;
  profitPercent?: number;
}

// 系统绩效统计
export interface PerformanceStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitLossRatio: number;
  totalProfit: number;
  maxDrawdown: number;
  systemHealth: number; // 胜率 x 盈亏比
}

// Dashboard 数据
export interface DashboardData {
  totalCapital: number;
  totalMarketValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  cashAmount: number;
  cashPercent: number;
  positionCount: number;
  sectorDistribution: { name: string; value: number; percent: number }[];
  recentAlerts: Alert[];
  performanceStats: PerformanceStats;
}

// 警报
export interface Alert {
  id: string;
  type: 'stopLoss' | 'takeProfit' | 'timeStop' | 'riskWarning' | 'signal';
  severity: 'high' | 'medium' | 'low';
  stockCode?: string;
  stockName?: string;
  message: string;
  createdAt: Date;
  read: boolean;
}

// 默认策略模板 - 波段交易系统
export const defaultSwingStrategy: Omit<TradingStrategy, 'id' | 'createdAt'> = {
  name: '波段交易系统',
  cycle: 'swing',
  status: 'active',
  stockRules: {
    priceAboveMA5: true,
    priceAboveMA20: true,
    weeklyMACDGoldenCross: true,
    volumeRatio: 1.5,
    minROE: 10,
    maxDebtRatio: 50,
    maxPEPercentile: 30,
    minTurnoverRate5D: 3,
    maxMarketCap: 100,
    minSectorGain: 2,
  },
  buyRules: {
    signals: ['ma5CrossMa20', 'macdBottomDivergence'],
    batchBuyRatios: [0.3, 0.3, 0.4],
    addPositionOnDip: 5,
    addPositionOnMA60: true,
  },
  sellRules: {
    stopLossPercent: 8,
    takeProfitPercent: 25,
    trailingStopPercent: 5,
    timeStopDays: 20,
    timeStopMinGain: 3,
    partialTakeProfitPercent: 15,
  },
  moneyRules: {
    totalCapital: 200000,
    maxSingleStockPercent: 20,
    maxSectorPercent: 40,
    minCashPercent: 10,
    maxPositions: 5,
  },
};
