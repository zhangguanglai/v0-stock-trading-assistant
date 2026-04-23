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
    weeklyMACDGoldenCross?: boolean;
  } | null;
  sector?: {
    sectorCode: string;
    sectorName: string;
    gain: number;
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
      // 不设置 meetsAllRules = false
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
      // 不设置 meetsAllRules = false
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

  // ── 技术面规则（硬过滤） ──

  // 股价 > MA5
  if (rules.priceAboveMA5) {
    if (!ctx.technical || !ctx.technical.ma5 || ctx.technical.ma5 <= 0) {
      ruleChecks.push({
        rule: `股价 > MA5`,
        pass: false,
        value: '无数据',
      });
      // 无数据不淘汰（与 funnel 一致）
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
      // 无数据不淘汰
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
      // 无数据不淘汰
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

  // ── 板块涨幅规则（硬过滤） ──

  if (rules.minSectorGain && rules.minSectorGain > 0) {
    if (!ctx.sector) {
      // 无板块数据时不淘汰（与 funnel 阶段一致）
      ruleChecks.push({
        rule: `板块涨幅 ≥ ${rules.minSectorGain}%`,
        pass: false,
        value: '无板块数据',
      });
    } else {
      const pass = ctx.sector.gain >= rules.minSectorGain;
      ruleChecks.push({
        rule: `板块涨幅 ≥ ${rules.minSectorGain}%`,
        pass,
        value: `${ctx.sector.sectorName} ${ctx.sector.gain.toFixed(2)}%`,
      });
      if (!pass) meetsAllRules = false;
    }
  }

  // ── 综合评分调整 ──

  if (ctx.quote.changePercent > 0 && ctx.quote.changePercent < 5) score += 10;
  else if (ctx.quote.changePercent >= 5) score += 5;
  else if (ctx.quote.changePercent < -5) score -= 15;

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
