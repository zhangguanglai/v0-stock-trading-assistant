// 健康检查 API
import { NextResponse } from 'next/server';
import { getDbStats } from '@/lib/db/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
