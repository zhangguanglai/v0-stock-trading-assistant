// 交易周期类型
export type TradingCycle = 'short' | 'swing' | 'long';

// 策略状态
export type StrategyStatus = 'active' | 'inactive';

// 用户配置
export interface UserProfile {
  id: string;
  displayName?: string;
  totalCapital: number;
  maxSinglePositionRatio: number;
  maxTotalPositionRatio: number;
  maxSingleLossRatio: number;
  maxDailyLossRatio: number;
  createdAt?: string;
  updatedAt?: string;
}

// 数据库策略模型
export interface Strategy {
  id: string;
  name: string;
  description?: string;
  strategyType: string;
  isActive: boolean;
  params: Record<string, unknown>;
  entryRules: unknown[];
  exitRules: unknown[];
  positionSizing: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

// 股票池
export interface StockPool {
  id: string;
  name: string;
  description?: string;
  strategyId?: string;  // P1: 关联策略
  filterCriteria: Record<string, unknown>;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// 股票池项目
export interface StockPoolItem {
  id: string;
  poolId: string;
  stockCode: string;
  stockName: string;
  sector?: string;
  marketCap?: number;
  peRatio?: number;
  currentPrice?: number;
  signalStatus: string;
  notes?: string;
  addedAt?: string;
  updatedAt?: string;
}

// 交易记录(数据库)
export interface Trade {
  id: string;
  positionId?: string;
  strategyId?: string;
  stockCode: string;
  stockName: string;
  tradeType: string;
  price: number;
  quantity: number;
  totalAmount: number;
  commission: number;
  tradeDate: string;
  reason?: string;
  emotionState?: string;
  followedRules: boolean;
  ruleViolations?: string[];
  createdAt?: string;
}

// 交易复盘
export interface TradeReview {
  id: string;
  tradeId?: string;
  positionId?: string;
  reviewDate: string;
  reviewType: string;
  whatWentWell?: string;
  whatWentWrong?: string;
  lessonsLearned?: string;
  actionItems?: string[];
  emotionalReflection?: string;
  rating?: number;
  createdAt?: string;
  updatedAt?: string;
}

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
  minMarketCap: number; // 亿（下限）
  maxMarketCap: number; // 亿（上限，0表示不限）
  minSectorGain: number;
}

// 买入规则
export interface BuyRules {
  // 买入信号（可勾选条件）
  ma5CrossMa20: boolean;          // 均线多头排列（MA5>MA10>MA20）
  macdGoldenCross: boolean;       // 日MACD金叉且零轴上方
  candleConfirm: boolean;         // K线确认（阳线+站上MA5）
  volumeConfirm: boolean;         // 成交量确认（量>20日均量x1.2）
  // 分批买入比例
  batchBuyRatios: number[]; // 如 [0.3, 0.3, 0.4]
  // 加仓条件
  addPositionOnDip: number; // 下跌X%加仓
  addPositionOnMA60: boolean; // 站稳60日线加仓
}

// 买入信号
export interface StockSignal {
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

// 持仓股票(数据库)
export interface Position {
  id: string;
  strategyId?: string;
  stockCode: string;
  stockName: string;
  entryPrice: number;
  currentPrice?: number;
  quantity: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  trailingStopPercent?: number;
  status: string;
  entryDate?: string;
  exitDate?: string;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 旧版持仓接口（向后兼容）
export interface LegacyPosition {
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
  priceSource?: 'realtime' | 'close'; // 价格来源：实时行情或收盘价
  changePercent: number;
  // 技术指标
  priceVsMA5: number;
  priceVsMA20: number;
  volumeRatio: number;
  // 基本面
  roe: number;
  debtRatio: number;
  pePercentile: number;
  marketCap?: number;
  // 是否符合策略
  meetsRules: boolean;
  isSystemPick: boolean;
  isFavorite: boolean;
  strategyId?: string;
  notes?: string;
  addedAt: Date;
  buySignal?: import('@/lib/stock-api/types').BuySignal;
  ruleChecks?: { rule: string; pass: boolean; value?: string }[];
  sectorHeat?: import('@/lib/stock-api/rps').SectorHeatInfo;
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

// 扫描漏斗信息
export interface ScanFunnelStep {
  label: string;       // 步骤名称
  count: number;       // 该步骤后的股票数
  filter: string;      // 筛选条件描述
}

export interface ScanFunnel {
  strategyId: string;
  strategyName: string;
  scannedAt: string;   // ISO时间
  steps: ScanFunnelStep[];
  totalResult: number; // 最终结果数
  error?: string;      // 扫描错误信息（如果有）
}

// 回测相关类型
export interface BacktestParams {
  strategyId: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  commissionRate: number;
  slippage: number;
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
}

export interface BacktestTrade {
  id: string;
  stockCode: string;
  stockName: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  profit: number;
  profitPercent: number;
  holdingPeriod: number; // 持有天数
  signal: string;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

// 警报(数据库)
export interface Alert {
  id: string;
  strategyId?: string;  // P0: 关联策略，用于区分不同策略的止盈止损提醒
  positionId?: string;
  stockCode: string;
  stockName: string;
  alertType: string;
  triggerPrice?: number;
  currentPrice?: number;
  message: string;
  isRead: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  createdAt?: string;
}

// 旧版警报接口（向后兼容）
export interface LegacyAlert {
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
