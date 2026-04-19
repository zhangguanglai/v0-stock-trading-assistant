import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// P0 & P1 数据库迁移脚本
// 添加 strategy_id 字段到 alerts 和 stock_pools 表
export async function POST() {
  const supabase = createClient();
  const results: string[] = [];
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({
        success: false,
        error: '未登录，请先登录后再执行迁移',
        results
      });
    }

    results.push(`👤 用户已验证: ${user.email || user.id}`);

    // P0: 为 alerts 表添加 strategy_id 字段
    try {
      const { data: alertColumns, error: alertError } = await supabase
        .from('alerts')
        .select('strategy_id')
        .limit(1);
      
      if (alertError?.message?.includes('strategy_id')) {
        // 字段不存在，需要通过 Supabase Dashboard 手动添加
        results.push('⚠️ alerts.strategy_id 字段不存在');
        results.push('   请在 Supabase Dashboard SQL Editor 执行:');
        results.push('   ALTER TABLE alerts ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id);');
      } else if (!alertError) {
        results.push('✅ alerts.strategy_id 字段已存在');
      } else {
        results.push(`ℹ️ alerts 表检查: ${alertError?.message}`);
      }
    } catch (e: any) {
      results.push(`ℹ️ alerts 表检查: ${e.message}`);
    }

    // P1: 为 stock_pools 表添加 strategy_id 字段
    try {
      const { data: poolColumns, error: poolError } = await supabase
        .from('stock_pools')
        .select('strategy_id')
        .limit(1);
      
      if (poolError?.message?.includes('strategy_id')) {
        // 字段不存在，需要通过 Supabase Dashboard 手动添加
        results.push('⚠️ stock_pools.strategy_id 字段不存在');
        results.push('   请在 Supabase Dashboard SQL Editor 执行:');
        results.push('   ALTER TABLE stock_pools ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id);');
      } else if (!poolError) {
        results.push('✅ stock_pools.strategy_id 字段已存在');
      } else {
        results.push(`ℹ️ stock_pools 表检查: ${poolError?.message}`);
      }
    } catch (e: any) {
      results.push(`ℹ️ stock_pools 表检查: ${e.message}`);
    }

    results.push('📋 迁移检查完成！');

    return NextResponse.json({
      success: true,
      results
    });
  } catch (error: any) {
    results.push(`❌ 迁移异常: ${error.message}`);
    return NextResponse.json({
      success: false,
      error: error.message,
      results
    });
  }
}
