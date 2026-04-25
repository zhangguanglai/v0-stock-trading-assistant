// 测试资金面筛选通过率
import { getAllDailyBasic } from '../lib/stock-api/tushare-api';

async function main() {
  console.log('[Test] 测试资金面筛选通过率...');

  const result = await getAllDailyBasic();
  if (!result.success || !result.data) {
    console.log('[Test] 获取数据失败:', result.error);
    return;
  }

  const stocks = result.data;
  console.log(`[Test] 总股票数: ${stocks.length}`);

  // 模拟不同规则的筛选
  const rules = [
    { name: '市值 10-500亿', minCap: 10, maxCap: 500 },
    { name: '市值 10-500亿 + PE 0-100', minCap: 10, maxCap: 500, minPe: 0, maxPe: 100 },
    { name: '市值 10-500亿 + 换手率≥2%', minCap: 10, maxCap: 500, minTurnover: 2 },
    { name: '市值 10-500亿 + 换手率≥2% + 量比≥0.8', minCap: 10, maxCap: 500, minTurnover: 2, minVolumeRatio: 0.8 },
    { name: '市值 10-500亿 + 换手率≥2% + 量比≥0.8 + PE 0-100', minCap: 10, maxCap: 500, minTurnover: 2, minVolumeRatio: 0.8, minPe: 0, maxPe: 100 },
  ];

  for (const rule of rules) {
    let pass = 0;
    for (const s of stocks) {
      let ok = true;
      if (rule.minCap !== undefined && s.marketCap < rule.minCap) ok = false;
      if (rule.maxCap !== undefined && s.marketCap > rule.maxCap) ok = false;
      if (rule.minPe !== undefined && s.pe < rule.minPe) ok = false;
      if (rule.maxPe !== undefined && s.pe > rule.maxPe) ok = false;
      if (rule.minTurnover !== undefined && s.turnoverRate < rule.minTurnover) ok = false;
      if (rule.minVolumeRatio !== undefined && s.volumeRatio < rule.minVolumeRatio) ok = false;
      if (ok) pass++;
    }
    const rate = ((pass / stocks.length) * 100).toFixed(1);
    console.log(`[Test] ${rule.name}: ${pass}/${stocks.length} (${rate}%)`);
  }

  // 统计换手率分布
  const turnoverRanges = [
    { min: 0, max: 1, label: '0-1%' },
    { min: 1, max: 2, label: '1-2%' },
    { min: 2, max: 5, label: '2-5%' },
    { min: 5, max: 10, label: '5-10%' },
    { min: 10, max: 999, label: '>10%' },
  ];
  console.log('\n[Test] 换手率分布:');
  for (const r of turnoverRanges) {
    const count = stocks.filter(s => s.turnoverRate >= r.min && s.turnoverRate < r.max).length;
    console.log(`  ${r.label}: ${count}只 (${((count/stocks.length)*100).toFixed(1)}%)`);
  }

  // 统计量比分布
  const vrRanges = [
    { min: 0, max: 0.5, label: '0-0.5' },
    { min: 0.5, max: 1, label: '0.5-1' },
    { min: 1, max: 2, label: '1-2' },
    { min: 2, max: 5, label: '2-5' },
    { min: 5, max: 999, label: '>5' },
  ];
  console.log('\n[Test] 量比分布:');
  for (const r of vrRanges) {
    const count = stocks.filter(s => s.volumeRatio >= r.min && s.volumeRatio < r.max).length;
    console.log(`  ${r.label}: ${count}只 (${((count/stocks.length)*100).toFixed(1)}%)`);
  }
}

main().catch(console.error);
