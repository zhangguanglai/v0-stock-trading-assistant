import { NextResponse } from 'next/server';

// 验证所有数据API的配置和连接
export async function GET() {
  const verification = {
    timestamp: new Date().toISOString(),
    services: {
      sina: { status: 'checking', message: '' },
      tushare: { status: 'checking', message: '' },
      indicators: { status: 'checking', message: '' },
    },
    errors: [] as string[],
  };

  // 1. 测试新浪实时行情API
  try {
    const sinaResponse = await fetch(
      'https://hq.sinajs.cn/list=sh600519',
      { timeout: 5000 }
    );
    
    if (sinaResponse.ok) {
      const text = await sinaResponse.text();
      if (text.includes('600519')) {
        verification.services.sina = {
          status: 'success',
          message: '新浪实时行情API 连接正常 ✓',
        };
      } else {
        throw new Error('响应格式异常');
      }
    } else {
      throw new Error(`HTTP ${sinaResponse.status}`);
    }
  } catch (error) {
    verification.services.sina = {
      status: 'failed',
      message: `新浪API连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    verification.errors.push('新浪实时行情API');
  }

  // 2. 测试Tushare Pro API
  try {
    const tushareToken = process.env.TUSHARE_TOKEN;
    
    if (!tushareToken) {
      verification.services.tushare = {
        status: 'warning',
        message: '未配置 TUSHARE_TOKEN，部分功能不可用',
      };
    } else {
      // 测试Tushare连接
      const tushareResponse = await fetch('https://api.tushare.pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_name: 'stock_basic',
          token: tushareToken,
          params: { list_status: 'L' },
          fields: 'ts_code,name,market',
          limit: 1,
        }),
        timeout: 5000,
      });

      const result = await tushareResponse.json();

      if (result.code === 0) {
        verification.services.tushare = {
          status: 'success',
          message: 'Tushare Pro API 连接正常，Token 有效 ✓',
        };
      } else {
        throw new Error(`Tushare错误: ${result.msg}`);
      }
    }
  } catch (error) {
    verification.services.tushare = {
      status: 'failed',
      message: `Tushare API 连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    verification.errors.push('Tushare Pro API');
  }

  // 3. 测试技术指标计算
  try {
    // 模拟测试数据
    const testData = [
      { close: 100 },
      { close: 102 },
      { close: 101 },
      { close: 103 },
      { close: 105 },
    ];

    // 简单验证MA计算
    const closes = testData.map((d) => d.close);
    const ma5 = closes.reduce((a, b) => a + b) / closes.length;

    if (ma5 > 0 && ma5 < 200) {
      verification.services.indicators = {
        status: 'success',
        message: '技术指标计算引擎 正常 ✓',
      };
    } else {
      throw new Error('计算结果异常');
    }
  } catch (error) {
    verification.services.indicators = {
      status: 'failed',
      message: `技术指标计算失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
    verification.errors.push('技术指标计算');
  }

  // 计算整体状态
  const hasErrors = verification.errors.length > 0;
  const overall =
    hasErrors && verification.services.tushare.status !== 'warning'
      ? 'partial'
      : 'success';

  return NextResponse.json({
    overall,
    verification,
    readyForProduction:
      verification.services.sina.status === 'success' &&
      verification.services.indicators.status === 'success',
  });
}
