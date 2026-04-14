// 股票技术指标API
import { NextRequest, NextResponse } from 'next/server';
import { getStockFullData } from '@/lib/stock-api';

export const dynamic = 'force-dynamic';

// GET /api/stock/indicators?code=600519
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    
    if (!code) {
      return NextResponse.json({
        success: false,
        error: '请提供股票代码',
        timestamp: Date.now(),
      });
    }
    
    const result = await getStockFullData(code);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '获取指标失败',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
