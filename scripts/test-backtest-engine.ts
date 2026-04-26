// 直接测试回测引擎核心逻辑（不通过HTTP API）
import { getMarketDataByDate, getKlineHistory, getDatabase } from '../lib/db/sqlite';

async function testBacktestEngine() {
  console.log('=== 回测引擎核心逻辑测试 ===\n');

  // 1. 测试数据库查询
  console.log('[1] 测试数据库查询');
  const db = getDatabase();
  const stats = db.prepare('SELECT COUNT(*) as cnt FROM daily_kline').get() as { cnt: number };
  console.log(`  ✅ K线总记录: ${stats.cnt.toLocaleString()}`);

  // 2. 测试 getMarketDataByDate
  console.log('\n[2] 测试全市场数据查询 (2024-01-02)');
  const marketData = getMarketDataByDate('20240102');
  console.log(`  ✅ 返回 ${marketData.length} 只股票`);
  if (marketData.length > 0) {
    const sample = marketData[0];
    console.log(`     样本: ${sample.code}, 收盘价: ${sample.close}, 市值: ${sample.marketCap?.toFixed(2)}亿, 换手率: ${sample.turnoverRate?.toFixed(2)}%`);
  }

  // 3. 测试 getKlineHistory
  console.log('\n[3] 测试历史K线查询 (600519, 40天)');
  const histData = getKlineHistory('600519', '20231101', '20240102');
  console.log(`  ✅ 返回 ${histData.length} 条记录`);
  if (histData.length > 0) {
    console.log(`     最早: ${histData[0].date}, 收盘价: ${histData[0].close}`);
    console.log(`     最晚: ${histData[histData.length - 1].date}, 收盘价: ${histData[histData.length - 1].close}`);
  }

  // 4. 测试股票名称查询
  console.log('\n[4] 测试股票名称查询');
  const nameRow = db.prepare('SELECT name FROM stock_names WHERE code = ?').get('600519') as { name: string } | undefined;
  console.log(`  ✅ 600519: ${nameRow?.name || '未找到'}`);

  // 5. 测试交易日查询
  console.log('\n[5] 测试交易日查询');
  const tradeDates = db.prepare(
    "SELECT date FROM daily_kline WHERE date >= '20240101' AND date <= '20240131' GROUP BY date ORDER BY date LIMIT 10"
  ).all() as { date: string }[];
  console.log(`  ✅ 2024年1月有 ${tradeDates.length} 个交易日`);
  console.log(`     前5个: ${tradeDates.slice(0, 5).map(d => d.date).join(', ')}`);

  // 6. 模拟选股逻辑
  console.log('\n[6] 模拟选股逻辑测试');
  const rules = {
    minMarketCap: 10,
    maxMarketCap: 500,
    minTurnoverRate: 2,
    minVolumeRatio: 0.8,
  };

  let candidates = 0;
  for (const stock of marketData) {
    if (stock.marketCap && (stock.marketCap < rules.minMarketCap || stock.marketCap > rules.maxMarketCap)) continue;
    if (stock.turnoverRate && stock.turnoverRate < rules.minTurnoverRate) continue;
    if (stock.volumeRatio && stock.volumeRatio < rules.minVolumeRatio) continue;
    candidates++;
  }
  console.log(`  ✅ 符合规则的股票: ${candidates}/${marketData.length} (${(candidates/marketData.length*100).toFixed(1)}%)`);

  console.log('\n=== 测试完成 ===');
}

testBacktestEngine().catch(console.error);
