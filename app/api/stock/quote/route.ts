// 股票实时行情API
import { NextRequest, NextResponse } from 'next/server';
import { getRealtimeQuote, getBatchQuotes } from '@/lib/stock-api/sina-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/stock/quote?code=600519 或 ?codes=600519,000001
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const codes = searchParams.get('codes');
    
    // 单只股票查询
    if (code) {
      const result = await getRealtimeQuote(code);
      return NextResponse.json(result);
    }
    
    // 批量查询
    if (codes) {
      const codeList = codes.split(',').filter(Boolean);
      if (codeList.length === 0) {
        return NextResponse.json({
          success: false,
          error: '请提供有效的股票代码',
          timestamp: Date.now(),
        });
      }
      
      if (codeList.length > 50) {
        return NextResponse.json({
          success: false,
          error: '单次最多查询50只股票',
          timestamp: Date.now(),
        });
      }
      
      const result = await getBatchQuotes(codeList);
      return NextResponse.json(result);
    }
    
    return NextResponse.json({
      success: false,
      error: '请提供股票代码参数 code 或 codes',
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
