// 回测功能端到端测试
// 模拟策略配置，执行回测，验证结果

async function testBacktestE2E() {
  console.log('=== 回测功能端到端测试 ===\n');

  // 1. 测试健康检查 API
  console.log('[1] 测试健康检查 API');
  try {
    const healthRes = await fetch('http://localhost:3000/api/health');
    const health = await healthRes.json();
    console.log(`  ✅ 状态: ${health.status}, K线: ${health.database?.klineCount?.toLocaleString()}`);
  } catch {
    console.log('  ⚠️ 健康检查失败（开发服务器未启动）');
  }

  // 2. 直接测试回测 API
  console.log('\n[2] 测试回测 API');
  const testParams = {
    strategyId: 'test-strategy',
    startDate: '2024-01-01',
    endDate: '2024-03-31',
    initialCapital: 100000,
    commissionRate: 0.0003,
    slippage: 0.001,
  };

  const testRules = {
    minMarketCap: 10,
    maxMarketCap: 500,
    minTurnoverRate: 2,
    minVolumeRatio: 0.8,
    priceAboveMA5: true,
    priceAboveMA20: false,
    weeklyMACDGoldenCross: false,
    stopLossPercent: 8,
    takeProfitPercent: 15,
    maxPositions: 5,
  };

  try {
    const res = await fetch('http://localhost:3000/api/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: testParams, rules: testRules }),
    });

    if (!res.ok) {
      console.log(`  ❌ HTTP ${res.status}: ${await res.text()}`);
      return;
    }

    const result = await res.json();
    if (!result.success) {
      console.log(`  ❌ 回测失败: ${result.error}`);
      return;
    }

    const data = result.data;
    console.log('  ✅ 回测成功!');
    console.log(`     策略: ${data.strategyName}`);
    console.log(`     日期: ${data.startDate} ~ ${data.endDate}`);
    console.log(`     初始资金: ${data.initialCapital.toLocaleString()}`);
    console.log(`     最终资金: ${Math.round(data.finalCapital).toLocaleString()}`);
    console.log(`     总收益率: ${data.totalReturn.toFixed(2)}%`);
    console.log(`     年化收益率: ${data.annualizedReturn.toFixed(2)}%`);
    console.log(`     最大回撤: ${data.maxDrawdown.toFixed(2)}%`);
    console.log(`     夏普比率: ${data.sharpeRatio.toFixed(2)}`);
    console.log(`     胜率: ${data.winRate.toFixed(1)}%`);
    console.log(`     交易次数: ${data.totalTrades} 笔`);
    console.log(`     盈利交易: ${data.winningTrades} 笔`);
    console.log(`     亏损交易: ${data.losingTrades} 笔`);

    if (data.trades && data.trades.length > 0) {
      console.log(`\n     最近 3 笔交易:`);
      for (const trade of data.trades.slice(-3)) {
        const profitIcon = trade.profit >= 0 ? '📈' : '📉';
        console.log(`       ${profitIcon} ${trade.stockCode} ${trade.stockName}: 买入 ${trade.entryDate} @ ${trade.entryPrice.toFixed(2)}, 卖出 ${trade.exitDate} @ ${trade.exitPrice.toFixed(2)}, 收益 ${trade.profit.toFixed(0)} (${trade.profitPercent.toFixed(2)}%), 信号: ${trade.signal}`);
      }
    }

    // 3. 验证回测结果持久化
    console.log('\n[3] 验证回测结果持久化');
    try {
      const historyRes = await fetch('http://localhost:3000/api/backtest/history?limit=5');
      const history = await historyRes.json();
      if (history.success && history.data.length > 0) {
        console.log(`  ✅ 历史记录: ${history.data.length} 条`);
        const latest = history.data[0];
        console.log(`     最新: ${latest.strategy_name}, 收益 ${latest.total_return.toFixed(2)}%, ${latest.total_trades} 笔交易`);
      } else {
        console.log('  ⚠️ 暂无历史记录');
      }
    } catch {
      console.log('  ⚠️ 历史记录 API 不可用');
    }

  } catch (error) {
    console.log(`  ❌ 请求失败: ${error instanceof Error ? error.message : String(error)}`);
    console.log('     请确保开发服务器已启动: npm run dev');
  }

  console.log('\n=== 测试完成 ===');
}

testBacktestE2E().catch(console.error);
