// 预设策略模板 - 基于PRD文档的专业交易系统

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'swing' | 'trend' | 'value' | 'growth';
  riskLevel: 'low' | 'medium' | 'high';
  suitableFor: string[];
  
  // 资金管理规则
  capitalRules: {
    maxSinglePositionRatio: number;   // 单股最大仓位
    maxTotalPositionRatio: number;    // 总仓位上限
    maxSingleLossRatio: number;       // 单笔最大亏损
    maxDailyLossRatio: number;        // 日最大亏损
    maxSectorRatio: number;           // 行业集中度上限
    initialPositionRatio: number;     // 首次建仓比例
    addPositionRatio: number;         // 加仓比例
  };
  
  // 选股规则
  selectionRules: {
    minMarketCap: number;             // 最小市值(亿)
    maxMarketCap?: number;            // 最大市值(亿)
    minPeRatio?: number;              // PE下限
    maxPeRatio?: number;              // PE上限
    minPbRatio?: number;              // PB下限
    maxPbRatio?: number;              // PB上限
    sectors?: string[];               // 偏好行业
    excludeSectors?: string[];        // 排除行业
    technicalConditions: string[];    // 技术条件描述
  };
  
  // 买入规则
  entryRules: {
    conditions: string[];             // 买入条件列表
    confirmSignals: string[];         // 确认信号
    avoidConditions: string[];        // 避免情况
  };
  
  // 卖出规则
  exitRules: {
    stopLossPercent: number;          // 止损比例
    takeProfitPercent: number;        // 止盈比例
    trailingStopPercent?: number;     // 移动止损比例
    timeStopDays?: number;            // 时间止损(天)
    timeStopMinProfit?: number;       // 时间止损最低收益要求
    partialExitRules?: string[];      // 分批止盈规则
  };
  
  // 心理纪律
  disciplineRules: string[];
}

// PRD中描述的波段交易系统模板
export const swingTradingTemplate: StrategyTemplate = {
  id: 'swing-trading-pro',
  name: '波段交易系统 Pro',
  description: '基于技术分析的中短期波段交易策略，适合有一定经验的投资者。强调严格的纪律执行和风险控制。',
  category: 'swing',
  riskLevel: 'medium',
  suitableFor: ['有一定技术分析基础', '能每日看盘15-30分钟', '心态较稳定'],
  
  capitalRules: {
    maxSinglePositionRatio: 0.10,     // 单股不超过10%
    maxTotalPositionRatio: 0.80,      // 总仓位不超过80%
    maxSingleLossRatio: 0.02,         // 单笔亏损不超过2%
    maxDailyLossRatio: 0.05,          // 日亏损不超过5%
    maxSectorRatio: 0.30,             // 单一行业不超过30%
    initialPositionRatio: 0.05,       // 首次建仓5%
    addPositionRatio: 0.03,           // 盈利3%后可加仓
  },
  
  selectionRules: {
    minMarketCap: 50,                 // 最小50亿市值
    maxMarketCap: 2000,               // 最大2000亿市值
    minPeRatio: 10,
    maxPeRatio: 50,
    technicalConditions: [
      '股价在20日均线上方',
      '20日均线向上',
      '成交量温和放大',
      'MACD金叉或即将金叉',
      'RSI在40-70区间',
    ],
  },
  
  entryRules: {
    conditions: [
      '股价回踩20日均线获得支撑',
      '缩量回调后放量突破',
      '突破关键压力位',
      '底部放量反转信号',
    ],
    confirmSignals: [
      '第二天继续上涨确认',
      '突破时成交量放大1.5倍以上',
      '板块整体走强',
    ],
    avoidConditions: [
      '大盘处于明显下跌趋势',
      '个股处于下降通道',
      '利空消息未消化',
      '年报/季报发布前一周',
    ],
  },
  
  exitRules: {
    stopLossPercent: 7,               // 跌7%止损
    takeProfitPercent: 20,            // 涨20%止盈
    trailingStopPercent: 8,           // 移动止损8%
    timeStopDays: 15,                 // 15天时间止损
    timeStopMinProfit: 5,             // 时间止损要求至少5%收益
    partialExitRules: [
      '涨10%时卖出1/3仓位',
      '涨15%时卖出1/3仓位',
      '涨20%或触发移动止损时清仓',
    ],
  },
  
  disciplineRules: [
    '严格执行止损，不抱侥幸心理',
    '不在亏损时加仓摊平成本',
    '单日最多操作2只股票',
    '连续亏损3次后休息一周',
    '不追涨已涨超5%的股票',
    '盘前制定计划，盘中严格执行',
  ],
};

// 价值投资模板
export const valueInvestingTemplate: StrategyTemplate = {
  id: 'value-investing',
  name: '价值投资系统',
  description: '基于基本面分析的长期价值投资策略，适合追求稳健收益的投资者。',
  category: 'value',
  riskLevel: 'low',
  suitableFor: ['长期投资视角', '能接受短期波动', '有基本面分析能力'],
  
  capitalRules: {
    maxSinglePositionRatio: 0.15,
    maxTotalPositionRatio: 0.90,
    maxSingleLossRatio: 0.03,
    maxDailyLossRatio: 0.08,
    maxSectorRatio: 0.35,
    initialPositionRatio: 0.08,
    addPositionRatio: 0.05,
  },
  
  selectionRules: {
    minMarketCap: 100,
    minPeRatio: 5,
    maxPeRatio: 25,
    minPbRatio: 0.5,
    maxPbRatio: 3,
    sectors: ['消费', '医药', '金融', '公用事业'],
    technicalConditions: [
      '股价处于历史估值低位',
      'ROE连续3年>15%',
      '负债率<60%',
      '连续5年分红',
    ],
  },
  
  entryRules: {
    conditions: [
      'PE低于行业平均',
      '股息率>3%',
      '业绩稳定增长',
      '股价回调至支撑位',
    ],
    confirmSignals: [
      '机构资金流入',
      '业绩预告超预期',
      '行业政策利好',
    ],
    avoidConditions: [
      '业绩大幅下滑',
      '管理层频繁变动',
      '行业处于衰退期',
      '财务数据存疑',
    ],
  },
  
  exitRules: {
    stopLossPercent: 15,
    takeProfitPercent: 50,
    trailingStopPercent: 12,
    timeStopDays: 180,
    timeStopMinProfit: 10,
  },
  
  disciplineRules: [
    '基于估值而非股价波动做决策',
    '定期复核基本面是否恶化',
    '不因短期波动而恐慌卖出',
    '保持至少20%现金应对机会',
  ],
};

// 趋势跟踪模板
export const trendFollowingTemplate: StrategyTemplate = {
  id: 'trend-following',
  name: '趋势跟踪系统',
  description: '顺势而为的趋势交易策略，在确认趋势后入场，趋势反转时离场。',
  category: 'trend',
  riskLevel: 'high',
  suitableFor: ['能承受较大波动', '执行力强', '有趋势判断能力'],
  
  capitalRules: {
    maxSinglePositionRatio: 0.08,
    maxTotalPositionRatio: 0.70,
    maxSingleLossRatio: 0.015,
    maxDailyLossRatio: 0.04,
    maxSectorRatio: 0.25,
    initialPositionRatio: 0.04,
    addPositionRatio: 0.02,
  },
  
  selectionRules: {
    minMarketCap: 30,
    technicalConditions: [
      '处于明显上升趋势',
      '突破60日均线',
      '成交量持续放大',
      'ADX>25表明趋势强度',
    ],
  },
  
  entryRules: {
    conditions: [
      '突破前期高点',
      '均线多头排列',
      '趋势确认后回踩入场',
    ],
    confirmSignals: [
      '突破后3日内不回落',
      '量价配合良好',
    ],
    avoidConditions: [
      '趋势末期追高',
      '震荡市入场',
      '逆势操作',
    ],
  },
  
  exitRules: {
    stopLossPercent: 5,
    takeProfitPercent: 30,
    trailingStopPercent: 6,
    timeStopDays: 20,
    timeStopMinProfit: 8,
  },
  
  disciplineRules: [
    '只做趋势明确的股票',
    '趋势不明时空仓等待',
    '严格移动止损保护利润',
    '不预测顶底，让市场告诉你',
  ],
};

// 成长股投资模板
export const growthInvestingTemplate: StrategyTemplate = {
  id: 'growth-investing',
  name: '成长股投资系统',
  description: '专注于高成长性企业的投资策略，追求业绩和股价的双重增长。',
  category: 'growth',
  riskLevel: 'high',
  suitableFor: ['能深入研究行业', '接受高波动', '长期持有心态'],
  
  capitalRules: {
    maxSinglePositionRatio: 0.12,
    maxTotalPositionRatio: 0.85,
    maxSingleLossRatio: 0.025,
    maxDailyLossRatio: 0.06,
    maxSectorRatio: 0.40,
    initialPositionRatio: 0.06,
    addPositionRatio: 0.04,
  },
  
  selectionRules: {
    minMarketCap: 50,
    maxMarketCap: 1000,
    minPeRatio: 20,
    maxPeRatio: 80,
    sectors: ['科技', '医药', '新能源', '消费升级'],
    technicalConditions: [
      '营收增速>30%',
      '净利润增速>40%',
      '行业处于成长期',
      '市场份额提升',
    ],
  },
  
  entryRules: {
    conditions: [
      '业绩拐点确认',
      '新产品/新业务放量',
      '估值相对合理',
    ],
    confirmSignals: [
      '机构调研增加',
      '分析师上调评级',
      '订单超预期',
    ],
    avoidConditions: [
      '增速明显放缓',
      '竞争格局恶化',
      '估值泡沫化',
    ],
  },
  
  exitRules: {
    stopLossPercent: 12,
    takeProfitPercent: 60,
    trailingStopPercent: 15,
    timeStopDays: 90,
    timeStopMinProfit: 15,
  },
  
  disciplineRules: [
    '深入研究再下手',
    '关注业绩而非股价',
    '成长逻辑被证伪时果断离场',
    '分批建仓，分批止盈',
  ],
};

// 所有预设模板
export const strategyTemplates: StrategyTemplate[] = [
  swingTradingTemplate,
  valueInvestingTemplate,
  trendFollowingTemplate,
  growthInvestingTemplate,
];

// 根据模板创建策略配置
export function createStrategyFromTemplate(template: StrategyTemplate): {
  name: string;
  description: string;
  strategyType: string;
  params: Record<string, unknown>;
  entryRules: unknown[];
  exitRules: unknown[];
  positionSizing: Record<string, unknown>;
} {
  return {
    name: template.name,
    description: template.description,
    strategyType: template.category,
    params: {
      riskLevel: template.riskLevel,
      suitableFor: template.suitableFor,
      selectionRules: template.selectionRules,
      disciplineRules: template.disciplineRules,
    },
    entryRules: template.entryRules.conditions.map((condition, index) => ({
      id: `entry-${index}`,
      condition,
      confirmSignals: template.entryRules.confirmSignals,
      avoidConditions: template.entryRules.avoidConditions,
    })),
    exitRules: [
      { type: 'stopLoss', value: template.exitRules.stopLossPercent },
      { type: 'takeProfit', value: template.exitRules.takeProfitPercent },
      { type: 'trailingStop', value: template.exitRules.trailingStopPercent },
      { type: 'timeStop', days: template.exitRules.timeStopDays, minProfit: template.exitRules.timeStopMinProfit },
    ],
    positionSizing: template.capitalRules,
  };
}
