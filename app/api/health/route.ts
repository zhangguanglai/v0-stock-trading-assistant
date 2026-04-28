// 健康检查 API
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 动态导入，仅在运行时加载 SQLite
    const { getDbStats } = await import('@/lib/db/sqlite');
    const stats = getDbStats();
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: Date.now(),
      database: {
        klineCount: stats.klineCount,
        basicCount: stats.basicCount,
        dateRange: stats.dateRange,
      },
      nodeVersion: process.version,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }, { status: 503 });
  }
}
