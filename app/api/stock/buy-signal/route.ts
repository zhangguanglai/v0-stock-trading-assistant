// 按需获取单只股票的买入信号检测
import { NextRequest, NextResponse } from 'next/server';
import { getDailyKLine, detectBuySignal, isTushareConfigured } from '@/lib/stock-api';
import type { BuyRuleConfig } from '@/lib/stock-api/indicators';
import { getStrategies } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const strategyId = searchParams.get('strategyId');

    if (!code) {
      return NextResponse.json({
        success: false,
        error: '请提供股票代码',
      });
    }

    if (!isTushareConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Tushare未配置，无法获取K线数据',
      });
    }

    // 获取策略的买入规则配置
    let buyRuleConfig: BuyRuleConfig | undefined;
    if (strategyId) {
      try {
        const strategies = await getStrategies();
        const strategy = strategies.find(s => s.id === strategyId);
        if (strategy && strategy.buyRules) {
          buyRuleConfig = {
            ma5CrossMa20: strategy.buyRules.ma5CrossMa20,
            macdGoldenCross: strategy.buyRules.macdGoldenCross,
            candleConfirm: strategy.buyRules.candleConfirm,
            volumeConfirm: strategy.buyRules.volumeConfirm,
          };
        }
      } catch {
        // 如果读取失败，使用默认规则
      }
    }

    // 获取120日K线数据
    const klineResult = await getDailyKLine(code, undefined, undefined, 120);
    
    if (!klineResult.success || !klineResult.data) {
      return NextResponse.json({
        success: false,
        error: klineResult.error || '获取K线数据失败',
      });
    }

    if (klineResult.data.length < 60) {
      return NextResponse.json({
        success: false,
        error: `K线数据不足(${klineResult.data.length}天)，至少需要60天数据`,
      });
    }

    // 执行买入信号检测（传入策略规则）
    const buySignal = detectBuySignal(klineResult.data, buyRuleConfig);

    return NextResponse.json({
      success: true,
      data: buySignal,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[BuySignal] error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '检测失败',
    }, { status: 500 });
  }
}
