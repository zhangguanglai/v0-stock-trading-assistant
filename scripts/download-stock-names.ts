// 下载股票名称到 stock_names 表
import { tushareRequest } from '../lib/stock-api/tushare-api';
import { insertStockNames } from '../lib/db/sqlite';

async function main() {
  console.log('[StockNames] 开始下载股票名称...');
  
  const result = await tushareRequest<{
    fields: string[];
    items: (string | number | null)[][];
  }>('stock_basic', {
    exchange: '',
    list_status: 'L',
  }, 'ts_code,name');
  
  if (!result.success || !result.data || !result.data.items) {
    console.error('[StockNames] 下载失败');
    process.exit(1);
  }
  
  const fields = result.data.fields || [];
  const tsIdx = fields.indexOf('ts_code');
  const nameIdx = fields.indexOf('name');
  
  const stocks = result.data.items.map(item => ({
    code: String(item[tsIdx] || '').split('.')[0],
    name: String(item[nameIdx] || ''),
  })).filter(s => s.code && s.name);
  
  insertStockNames(stocks);
  
  console.log(`[StockNames] 完成: ${stocks.length} 只股票`);
}

main().catch(console.error);
