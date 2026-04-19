// 测试买入功能的脚本
// 运行方式: node test-buy-functionality.js

const { useStockStore } = require('./lib/store');

// 模拟用户操作
function testBuyFunctionality() {
  console.log('开始测试买入功能...');
  
  // 1. 初始化store
  const store = useStockStore.getState();
  
  // 2. 确保有策略
  if (store.strategies.length === 0) {
    console.log('没有策略，创建默认策略...');
    const defaultStrategy = {
      name: '测试策略',
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
        minMarketCap: 30,
        maxMarketCap: 200,
        minSectorGain: 2,
      },
      buyRules: {
        ma5CrossMa20: true,
        macdGoldenCross: true,
        candleConfirm: true,
        volumeConfirm: true,
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
    store.addStrategy(defaultStrategy);
    console.log('默认策略创建成功');
  }
  
  // 3. 设置活跃策略
  if (!store.activeStrategyId) {
    store.setActiveStrategy(store.strategies[0].id);
    console.log('已设置活跃策略');
  }
  
  // 4. 模拟买入操作
  console.log('模拟买入操作...');
  
  // 测试 addPosition 函数
  const testPosition = {
    stockCode: '601088',
    stockName: '中国神华',
    buyPrice: 30,
    shares: 100,
    buyDate: new Date().toISOString().split('T')[0],
    currentPrice: 30,
    stopLossPrice: 27,
    takeProfitPrice: 36,
    sector: '煤炭',
    alertTriggered: false,
    trailingStopEnabled: false,
  };
  
  try {
    store.addPosition(testPosition);
    console.log('✅ 买入操作成功，持仓已添加');
    
    // 检查持仓是否添加成功
    const updatedStore = useStockStore.getState();
    console.log('当前持仓数量:', updatedStore.positions.length);
    console.log('最新持仓:', updatedStore.positions[updatedStore.positions.length - 1]);
    
  } catch (error) {
    console.error('❌ 买入操作失败:', error);
  }
  
  // 5. 测试 addTradeRecord 函数
  console.log('测试交易记录...');
  
  const testTradeRecord = {
    strategyId: store.activeStrategyId,
    stockCode: '601088',
    stockName: '中国神华',
    type: 'buy',
    price: 30,
    shares: 100,
    amount: 3000,
    date: new Date(),
    triggerReason: '手动买入',
    profit: 0,
    profitPercent: 0,
    buyReason: '测试买入',
    emotion: 'calm',
    notes: '测试交易',
  };
  
  try {
    store.addTradeRecord(testTradeRecord);
    console.log('✅ 交易记录添加成功');
    
    // 检查交易记录是否添加成功
    const updatedStore = useStockStore.getState();
    console.log('当前交易记录数量:', updatedStore.tradeRecords.length);
    console.log('最新交易记录:', updatedStore.tradeRecords[updatedStore.tradeRecords.length - 1]);
    
  } catch (error) {
    console.error('❌ 交易记录添加失败:', error);
  }
  
  console.log('买入功能测试完成！');
}

// 运行测试
testBuyFunctionality();
