// 回测历史记录 API
import { NextRequest, NextResponse } from 'next/server';
import { getBacktestHistory, deleteBacktestRecord } from '@/lib/db/sqlite';

export const dynamic = 'force-dynamic';

// GET /api/backtest/history - 获取回测历史记录
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    const records = getBacktestHistory(limit);
    
    return NextResponse.json({
      success: true,
      data: records,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('获取回测历史失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '获取回测历史失败',
      timestamp: Date.now(),
    });
  }
}

// DELETE /api/backtest/history?id=xxx - 删除回测记录
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id') || '0', 10);
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: '缺少记录ID',
      });
    }
    
    deleteBacktestRecord(id);
    
    return NextResponse.json({
      success: true,
      message: '记录已删除',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('删除回测记录失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '删除回测记录失败',
      timestamp: Date.now(),
    });
  }
}
