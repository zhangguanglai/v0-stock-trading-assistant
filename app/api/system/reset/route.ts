import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/system/reset
 * 重置系统 - 清除所有本地缓存和模拟数据
 */
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      message: '系统已重置指令已发送到客户端',
      note: '客户端将清除 localStorage 并重新加载应用',
      instructions: {
        1: '打开浏览器开发者工具 (F12)',
        2: '进入 Application 标签',
        3: '清除所有 Local Storage',
        4: '刷新页面',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '重置失败', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/system/reset
 * 获取重置状态
 */
export async function GET() {
  return NextResponse.json({
    status: '就绪',
    message: '使用 POST 请求来重置系统',
    storageKeys: [
      'stock-investment-store',
      'mock-positions',
      'mock-watchlist',
      'mock-trades',
    ],
  });
}
