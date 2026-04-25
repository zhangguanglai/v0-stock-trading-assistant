// 测试 bak_daily 接口返回的字段
import { tushareRequest } from '../lib/stock-api/tushare-api';

async function main() {
  const tradeDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  console.log(`[Test] 测试 bak_daily 接口 (${tradeDate})...`);

  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('bak_daily', {
    trade_date: tradeDate,
  }, 'ts_code,name,close,pct_change,turnover_rate,volume_ratio,pe,pb,total_mv,circ_mv');

  if (result.success && result.data) {
    console.log('[Test] bak_daily 返回字段:', result.data.fields?.join(', '));
    console.log('[Test] 数据条数:', result.data.items?.length);

    if (result.data.items && result.data.items.length > 0) {
      const firstItem = result.data.items[0];
      console.log('[Test] 第一条数据:');
      result.data.fields?.forEach((field, idx) => {
        console.log(`  ${field}: ${firstItem[idx]}`);
      });
    }
  } else {
    console.log('[Test] 失败:', result.error);
  }

  // 同时测试 daily_basic 接口
  console.log('\n[Test] 测试 daily_basic 接口...');
  const result2 = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('daily_basic', {
    trade_date: tradeDate,
  }, 'ts_code,turnover_rate,volume_ratio,pe,pb,total_mv,circ_mv');

  if (result2.success && result2.data) {
    console.log('[Test] daily_basic 返回字段:', result2.data.fields?.join(', '));
    console.log('[Test] 数据条数:', result2.data.items?.length);

    if (result2.data.items && result2.data.items.length > 0) {
      const firstItem = result2.data.items[0];
      console.log('[Test] 第一条数据:');
      result2.data.fields?.forEach((field, idx) => {
        console.log(`  ${field}: ${firstItem[idx]}`);
      });
    }
  } else {
    console.log('[Test] daily_basic 失败:', result2.error);
  }
}

main().catch(console.error);
