// 股票搜索API
import { NextRequest, NextResponse } from 'next/server';
import { searchStocks } from '@/lib/stock-api/sina-api';

export const dynamic = 'force-dynamic';

// GET /api/stock/search?keyword=贵州茅台
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || searchParams.get('q');
    
    if (!keyword) {
      return NextResponse.json({
        success: false,
        error: '请提供搜索关键词',
        timestamp: Date.now(),
      });
    }
    
    const result = await searchStocks(keyword);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '搜索失败',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
