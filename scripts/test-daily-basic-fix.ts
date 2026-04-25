// 测试修复后的 getAllDailyBasic
import { getAllDailyBasic } from '../lib/stock-api/tushare-api';

async function main() {
  console.log('[Test] 测试修复后的 getAllDailyBasic...');

  const result = await getAllDailyBasic();

  if (result.success && result.data) {
    console.log(`[Test] 成功获取 ${result.data.length} 只股票数据`);

    // 统计 turnoverRate 和 volumeRatio 的分布
    let zeroTurnover = 0;
    let zeroVolumeRatio = 0;
    let validTurnover = 0;
    let validVolumeRatio = 0;
    const turnoverSamples: number[] = [];
    const volumeRatioSamples: number[] = [];

    for (const stock of result.data) {
      if (stock.turnoverRate === 0) zeroTurnover++;
      else {
        validTurnover++;
        if (turnoverSamples.length < 5) turnoverSamples.push(stock.turnoverRate);
      }
      if (stock.volumeRatio === 1 || stock.volumeRatio === 0) zeroVolumeRatio++;
      else {
        validVolumeRatio++;
        if (volumeRatioSamples.length < 5) volumeRatioSamples.push(stock.volumeRatio);
      }
    }

    console.log(`[Test] turnoverRate=0: ${zeroTurnover}只, 有效: ${validTurnover}只`);
    console.log(`[Test] volumeRatio=0/1: ${zeroVolumeRatio}只, 有效: ${validVolumeRatio}只`);
    console.log(`[Test] turnoverRate 样本: ${turnoverSamples.join(', ')}`);
    console.log(`[Test] volumeRatio 样本: ${volumeRatioSamples.join(', ')}`);

    // 打印前3条数据详情
    console.log('\n[Test] 前3条数据详情:');
    for (let i = 0; i < Math.min(3, result.data.length); i++) {
      const s = result.data[i];
      console.log(`  ${s.code} ${s.name}: turnover=${s.turnoverRate}, volumeRatio=${s.volumeRatio}, pe=${s.pe}, pb=${s.pb}, mv=${s.marketCap}`);
    }
  } else {
    console.log('[Test] 失败:', result.error);
  }
}

main().catch(console.error);
