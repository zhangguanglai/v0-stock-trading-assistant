import type { StrategyRules, ScanStock } from '@/app/api/stock/scan/route';

// 统一过滤引擎 - 一套规则，一处实现
// 避免 route.ts 中多处重复/不一致的过滤逻辑

export interface FilterContext {
  code: string;
  quote: {
    price: number;
    changePercent: number;
    volume: number;
    amount: number;
    name: string;
  };
  basicData?: {
    marketCap: number;
    pe: number;
    pb: number;
    turnoverRate: number;
    volumeRatio: number;
  } | null;
  finance?: {
    roe: number;
    debtRatio: number;
  } | null;
  technical?: {
    ma5?: number;
    ma20?: number;
    ma60?: number;
    weeklyMACDGoldenCross?: boolean;
    // 均值回归指标
    rsi?: number;
    bollingerLower?: number;
    bollingerUpper?: number;
    bollingerMid?: number;
    consecutiveDecline?: number;
  } | null;
  // 统一使用申万行业RPS（替代旧的概念板块gain）
  sector?: {
    sectorName: string;
    rps20: number;
  } | null;
}

export interface RuleCheck {
  rule: string;
  pass: boolean;
  value?: string;
}

export interface FilterResult {
  meetsRules: boolean;
  ruleChecks: RuleCheck[];
  score: number;
}

/**
 * 统一股票规则检查
 * 纯函数：给定规则和上下文，返回检查结果
 * 与 funnel 阶段使用完全一致的逻辑
 */
export function checkStockRules(
  rules: StrategyRules,
  ctx: FilterContext
): FilterResult {
  const ruleChecks: RuleCheck[] = [];
  let meetsAllRules = true;
  let score = 50;

  // ── 基本面规则（硬过滤） ──

  // 市值上限
  if (ctx.basicData && rules.maxMarketCap !== undefined) {
    const pass = ctx.basicData.marketCap <= rules.maxMarketCap;
    ruleChecks.push({
      rule: `市值 ≤ ${rules.maxMarketCap}亿`,
      pass,
      value: `${ctx.basicData.marketCap.toFixed(0)}亿`,
    });
    if (!pass) meetsAllRules = false;
  }

  // 市值下限
  if (ctx.basicData && rules.minMarketCap !== undefined) {
    const pass = ctx.basicData.marketCap >= rules.minMarketCap;
    ruleChecks.push({
      rule: `市值 ≥ ${rules.minMarketCap}亿`,
      pass,
      value: `${ctx.basicData.marketCap.toFixed(0)}亿`,
    });
    if (!pass) meetsAllRules = false;
  }

  // PE上限
  if (ctx.basicData && rules.maxPE !== undefined && ctx.basicData.pe > 0) {
    const pass = ctx.basicData.pe <= rules.maxPE;
    ruleChecks.push({
      rule: `PE ≤ ${rules.maxPE}`,
      pass,
      value: ctx.basicData.pe.toFixed(1),
    });
    if (!pass) meetsAllRules = false;
  }

  // PB下限
  if (ctx.basicData && rules.minPB !== undefined && ctx.basicData.pb > 0) {
    const pass = ctx.basicData.pb >= rules.minPB;
    ruleChecks.push({
      rule: `PB ≥ ${rules.minPB}`,
      pass,
      value: ctx.basicData.pb.toFixed(2),
    });
    if (!pass) meetsAllRules = false;
  }

  // PB上限
  if (ctx.basicData && rules.maxPB !== undefined && ctx.basicData.pb > 0) {
    const pass = ctx.basicData.pb <= rules.maxPB;
    ruleChecks.push({
      rule: `PB ≤ ${rules.maxPB}`,
      pass,
      value: ctx.basicData.pb.toFixed(2),
    });
    if (!pass) meetsAllRules = false;
  }

  // ── 资金面规则（硬过滤） ──

  // 换手率
  if (ctx.basicData && rules.minTurnoverRate !== undefined) {
    const pass = ctx.basicData.turnoverRate >= rules.minTurnoverRate;
    ruleChecks.push({
      rule: `换手率 ≥ ${rules.minTurnoverRate}%`,
      pass,
      value: `${ctx.basicData.turnoverRate.toFixed(2)}%`,
    });
    if (!pass) meetsAllRules = false;
  }

  // 量比
  if (ctx.basicData && rules.minVolumeRatio !== undefined) {
    const pass = ctx.basicData.volumeRatio >= rules.minVolumeRatio;
    ruleChecks.push({
      rule: `量比 ≥ ${rules.minVolumeRatio}`,
      pass,
      value: ctx.basicData.volumeRatio.toFixed(2),
    });
    if (!pass) meetsAllRules = false;
  }

  // ── 财务规则（加分项，无数据不淘汰） ──

  // ROE
  if (rules.minROE !== undefined) {
    if (!ctx.finance || ctx.finance.roe <= 0) {
      ruleChecks.push({
        rule: `ROE ≥ ${rules.minROE}%`,
        pass: false,
        value: '无数据',
      });
    } else {
      const pass = ctx.finance.roe >= rules.minROE;
      ruleChecks.push({
        rule: `ROE ≥ ${rules.minROE}%`,
        pass,
        value: `${ctx.finance.roe.toFixed(1)}%`,
      });
      if (!pass) score -= 10;
    }
  }

  // 负债率
  if (rules.maxDebtRatio !== undefined) {
    if (!ctx.finance || ctx.finance.debtRatio <= 0) {
      ruleChecks.push({
        rule: `负债率 ≤ ${rules.maxDebtRatio}%`,
        pass: false,
        value: '无数据',
      });
    } else {
      const pass = ctx.finance.debtRatio <= rules.maxDebtRatio;
      ruleChecks.push({
        rule: `负债率 ≤ ${rules.maxDebtRatio}%`,
        pass,
        value: `${ctx.finance.debtRatio.toFixed(1)}%`,
      });
      if (!pass) score -= 10;
    }
  }

  // ── 趋势策略技术面规则（硬过滤） ──

  // 股价 > MA5
  if (rules.priceAboveMA5) {
    if (!ctx.technical || !ctx.technical.ma5 || ctx.technical.ma5 <= 0) {
      ruleChecks.push({
        rule: `股价 > MA5`,
        pass: false,
        value: '无数据',
      });
    } else {
      const pass = ctx.quote.price > ctx.technical.ma5;
      ruleChecks.push({
        rule: `股价 > MA5`,
        pass,
        value: `现价${ctx.quote.price.toFixed(2)} MA5=${ctx.technical.ma5.toFixed(2)}`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // 股价 > MA20
  if (rules.priceAboveMA20) {
    if (!ctx.technical || !ctx.technical.ma20 || ctx.technical.ma20 <= 0) {
      ruleChecks.push({
        rule: `股价 > MA20`,
        pass: false,
        value: '无数据',
      });
    } else {
      const pass = ctx.quote.price > ctx.technical.ma20;
      ruleChecks.push({
        rule: `股价 > MA20`,
        pass,
        value: `现价${ctx.quote.price.toFixed(2)} MA20=${ctx.technical.ma20.toFixed(2)}`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // 周MACD金叉
  if (rules.weeklyMACDGoldenCross) {
    if (!ctx.technical || ctx.technical.weeklyMACDGoldenCross === undefined) {
      ruleChecks.push({
        rule: `周MACD金叉`,
        pass: false,
        value: '无数据',
      });
    } else {
      const pass = ctx.technical.weeklyMACDGoldenCross;
      ruleChecks.push({
        rule: `周MACD金叉`,
        pass,
        value: pass ? '已金叉' : '未金叉',
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // ── 均值回归策略技术面规则 ──

  // 股价 < MA5（跌破短期均线）
  if (rules.priceBelowMA5) {
    if (!ctx.technical || !ctx.technical.ma5 || ctx.technical.ma5 <= 0) {
      ruleChecks.push({ rule: `股价 < MA5`, pass: false, value: '无数据' });
    } else {
      const pass = ctx.quote.price < ctx.technical.ma5;
      ruleChecks.push({
        rule: `股价 < MA5`,
        pass,
        value: `现价${ctx.quote.price.toFixed(2)} MA5=${ctx.technical.ma5.toFixed(2)}`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // 股价 < MA20（跌破中期均线）
  if (rules.priceBelowMA20) {
    if (!ctx.technical || !ctx.technical.ma20 || ctx.technical.ma20 <= 0) {
      ruleChecks.push({ rule: `股价 < MA20`, pass: false, value: '无数据' });
    } else {
      const pass = ctx.quote.price < ctx.technical.ma20;
      ruleChecks.push({
        rule: `股价 < MA20`,
        pass,
        value: `现价${ctx.quote.price.toFixed(2)} MA20=${ctx.technical.ma20.toFixed(2)}`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // RSI超卖
  if (rules.rsiOversold !== undefined && rules.rsiOversold > 0) {
    if (!ctx.technical || ctx.technical.rsi === undefined) {
      ruleChecks.push({ rule: `RSI超卖 < ${rules.rsiOversold}`, pass: false, value: '无数据' });
    } else {
      const pass = ctx.technical.rsi <= rules.rsiOversold;
      ruleChecks.push({
        rule: `RSI超卖 < ${rules.rsiOversold}`,
        pass,
        value: `RSI=${ctx.technical.rsi.toFixed(1)}`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // 布林带下轨
  if (rules.bollingerBelowLower) {
    if (!ctx.technical || ctx.technical.bollingerLower === undefined) {
      ruleChecks.push({ rule: `股价触及布林带下轨`, pass: false, value: '无数据' });
    } else {
      const pass = ctx.quote.price <= ctx.technical.bollingerLower;
      ruleChecks.push({
        rule: `股价触及布林带下轨`,
        pass,
        value: `现价${ctx.quote.price.toFixed(2)} 下轨=${ctx.technical.bollingerLower.toFixed(2)}`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // 连续下跌天数
  if (rules.maxConsecutiveDecline !== undefined && rules.maxConsecutiveDecline > 0) {
    if (!ctx.technical || ctx.technical.consecutiveDecline === undefined) {
      ruleChecks.push({ rule: `连续下跌 ≥ ${rules.maxConsecutiveDecline}天`, pass: false, value: '无数据' });
    } else {
      const pass = ctx.technical.consecutiveDecline >= rules.maxConsecutiveDecline;
      ruleChecks.push({
        rule: `连续下跌 ≥ ${rules.maxConsecutiveDecline}天`,
        pass,
        value: `${ctx.technical.consecutiveDecline}天`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // ── 行业RPS规则（硬过滤 + 评分） ──

  const minSectorRPS = rules.minSectorRPS ?? rules.minSectorGain;
  if (minSectorRPS && minSectorRPS > 0) {
    if (!ctx.sector) {
      // 无行业数据时不淘汰（防御性处理）
      ruleChecks.push({
        rule: `行业RPS ≥ ${minSectorRPS}`,
        pass: false,
        value: '无行业数据',
      });
    } else {
      const pass = ctx.sector.rps20 >= minSectorRPS;
      ruleChecks.push({
        rule: `行业RPS ≥ ${minSectorRPS}`,
        pass,
        value: `${ctx.sector.sectorName} RPS:${ctx.sector.rps20}`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // ── 综合评分调整 ──

  // 根据策略类型调整评分逻辑
  const isMeanReversion = rules.strategyType === 'mean-reversion';

  if (isMeanReversion) {
    // 均值回归策略评分：回调越深、超卖越严重，分数越高
    if (ctx.quote.changePercent < -3 && ctx.quote.changePercent > -8) score += 15;
    else if (ctx.quote.changePercent < -1 && ctx.quote.changePercent >= -3) score += 10;
    else if (ctx.quote.changePercent >= 0) score -= 10;

    // RSI超卖加分
    if (ctx.technical && ctx.technical.rsi !== undefined) {
      if (ctx.technical.rsi < 20) score += 20;
      else if (ctx.technical.rsi < 30) score += 15;
      else if (ctx.technical.rsi < 40) score += 8;
    }

    // 布林带偏离加分
    if (ctx.technical && ctx.technical.bollingerLower !== undefined && ctx.technical.bollingerMid !== undefined) {
      const bollingerDeviation = (ctx.quote.price - ctx.technical.bollingerMid) / (ctx.technical.bollingerMid - ctx.technical.bollingerLower);
      if (bollingerDeviation < -1) score += 15;
      else if (bollingerDeviation < -0.5) score += 10;
    }

    // 连续下跌加分
    if (ctx.technical && ctx.technical.consecutiveDecline !== undefined) {
      if (ctx.technical.consecutiveDecline >= 5) score += 10;
      else if (ctx.technical.consecutiveDecline >= 3) score += 5;
    }

    // 缩量回调加分（抛压减轻）
    if (ctx.basicData && ctx.basicData.volumeRatio < 0.8) score += 8;
    else if (ctx.basicData && ctx.basicData.volumeRatio < 1.0) score += 4;

  } else {
    // 趋势策略评分（原有逻辑）
    if (ctx.quote.changePercent > 0 && ctx.quote.changePercent < 5) score += 10;
    else if (ctx.quote.changePercent >= 5) score += 5;
    else if (ctx.quote.changePercent < -5) score -= 15;
  }

  // 基本面评分（两种策略通用）
  if (ctx.basicData) {
    if (ctx.basicData.marketCap > 0 && ctx.basicData.marketCap < 50) score += 15;
    else if (ctx.basicData.marketCap < 100) score += 10;
    else if (ctx.basicData.marketCap < 200) score += 5;
    if (ctx.basicData.pe > 0 && ctx.basicData.pe < 20) score += 10;
    else if (ctx.basicData.pe < 40) score += 5;
  }

  if (ctx.finance) {
    if (ctx.finance.roe > 15) score += 15;
    else if (ctx.finance.roe > 10) score += 10;
    else if (ctx.finance.roe > 5) score += 5;

    if (ctx.finance.debtRatio > 0 && ctx.finance.debtRatio < 40) score += 5;
  }

  if (ctx.basicData && ctx.basicData.volumeRatio > 2) score += 5;

  // ── 行业RPS评分加成 ──
  if (ctx.sector) {
    const rps = ctx.sector.rps20;
    if (rps >= 90) score += 15;
    else if (rps >= 80) score += 10;
    else if (rps >= 60) score += 5;
    else if (rps < 40) score -= 10;
  }

  return {
    meetsRules: meetsAllRules,
    ruleChecks,
    score: Math.max(0, Math.min(100, score)),
  };
}

/**
 * 批量检查股票规则
 * 用于 route.ts 中统一计算 meetsRules 和 ruleChecks
 */
export function batchCheckStockRules(
  stocks: ScanStock[],
  rules: StrategyRules,
  contextMap: Map<string, FilterContext>
): FilterResult[] {
  return stocks.map(stock => {
    const ctx = contextMap.get(stock.code);
    if (!ctx) {
      return {
        meetsRules: false,
        ruleChecks: [{ rule: '数据缺失', pass: false, value: '无上下文数据' }],
        score: 0,
      };
    }
    return checkStockRules(rules, ctx);
  });
}
