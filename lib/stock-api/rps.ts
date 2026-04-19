import type { WatchlistStock } from '@/lib/types';

export interface SectorHeatInfo {
  sectorName: string;
  rpsScore: number;             // RPS20分数 (0-100) - 基于全市场行业排名
  avgChangePercent: number;     // 当日板块平均涨跌幅(%)
  avgVolumeRatio: number;       // 板块平均量比
  avgTurnoverRate: number;      // 板块平均换手率(%)
  stockCount: number;           // 观察池内该行业股票数
  heatScore: number;            // 最终热度分数 (0-100)
  heatLevel: 'extreme' | 'high' | 'medium' | 'low';
  displayColor: string;
  displayIcon: string;
  change20d?: number;           // 全市场该行业20日涨幅(%) - 用于当日无数据时显示
}

// 全市场行业RPS数据接口
interface IndustryRPSData {
  industry: string;
  rps20: number;
  change20d: number;
  stockCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mean(values: (number | null | undefined)[]): number {
  const valid = values.filter(v => v != null && !isNaN(v as number)) as number[];
  if (valid.length === 0) return 0;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

let cachedIndustryRPS: IndustryRPSData[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

async function fetchIndustryRPS(): Promise<IndustryRPSData[]> {
  const now = Date.now();
  
  if (cachedIndustryRPS && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedIndustryRPS;
  }
  
  try {
    const response = await fetch('/api/stock/industry-rps');
    const result = await response.json();
    
    if (result.success && result.data) {
      cachedIndustryRPS = result.data;
      cacheTimestamp = now;
      return result.data;
    }
  } catch (error) {
    console.error('获取全市场行业RPS失败:', error);
  }
  
  return [];
}

export async function calculateSectorHeatMap(stocks: WatchlistStock[]): Promise<Map<string, SectorHeatInfo>> {
  if (!stocks || stocks.length === 0) {
    return new Map();
  }

  // 获取全市场行业RPS数据
  const industryRPSData = await fetchIndustryRPS();
  const industryRPSMap = new Map(industryRPSData.map(d => [d.industry, d]));

  // 按观察池内的行业分组
  const sectors = new Map<string, WatchlistStock[]>();
  
  stocks.forEach(stock => {
    const sector = stock.sector || '未知';
    if (!sectors.has(sector)) {
      sectors.set(sector, []);
    }
    sectors.get(sector)!.push(stock);
  });

  const result = new Map<string, SectorHeatInfo>();

  for (const [name, sectorStocks] of sectors.entries()) {
    // 计算该行业的聚合指标
    const avgChange = mean(sectorStocks.map(s => s.changePercent));
    const avgVolume = mean(sectorStocks.map(s => s.volumeRatio || 0));
    
    // 换手率估算：量比 > 1.5 时，换手率约为 3-8%；量比 ≈ 1 时，换手率约 2%
    const estimatedTurnover = avgVolume > 1 
      ? Math.min(avgVolume * 3, 15)  // 上限15%
      : Math.max(avgVolume * 2, 0.5); // 下限0.5%

    // 获取全市场RPS20分数（核心指标）
    const globalRPS = industryRPSMap.get(name)?.rps20 ?? 50; // 默认中等

    // ===== 实时活跃度计算（权重30%）=====
    // 维度1：当日板块涨幅贡献 (15分)
    //   涨幅>3% → 15分，0% → 7.5分，<-3% → 0分
    const scoreChange = clamp(
      7.5 + (avgChange / 3) * 7.5,
      0, 15
    );

    // 维度2：量比活跃度贡献 (10分)
    //   量比>2 → 10分，量比=1 → 4分，量比<0.8 → 2分
    const scoreVolume = clamp(
      4 + (avgVolume - 1) * 6,
      0, 10
    );

    // 维度3：换手率贡献 (5分)
    //   换手>5% → 5分，换手=2% → 2分，换手<1% → 1分
    const scoreTurnover = clamp(
      1 + (estimatedTurnover / 5) * 4,
      0, 5
    );

    // 实时活跃度总分 (0-30)
    const realtimeActivity = scoreChange + scoreVolume + scoreTurnover;

    // ===== 最终热度评分 =====
    // 热度 = RPS20 × 70% + 实时活跃度 × 30%
    const heatScore = clamp(
      Math.round(globalRPS * 0.7 + realtimeActivity),
      0, 100
    );

    // 热度等级判定
    let heatLevel: SectorHeatInfo['heatLevel'];
    let displayColor: string;
    let displayIcon: string;

    if (heatScore >= 90) {
      heatLevel = 'extreme';
      displayColor = 'text-red-600';
      displayIcon = '🔥🔥';
    } else if (heatScore >= 80) {
      heatLevel = 'high';
      displayColor = 'text-red-500';
      displayIcon = '🔥';
    } else if (heatScore >= 50) {
      heatLevel = 'medium';
      displayColor = 'text-yellow-600';
      displayIcon = '🌡️';
    } else {
      heatLevel = 'low';
      displayColor = 'text-gray-400';
      displayIcon = '❄️';
    }

    result.set(name, {
      sectorName: name,
      rpsScore: globalRPS,
      avgChangePercent: parseFloat(avgChange.toFixed(2)),
      avgVolumeRatio: parseFloat(avgVolume.toFixed(2)),
      avgTurnoverRate: parseFloat(estimatedTurnover.toFixed(1)),
      stockCount: sectorStocks.length,
      heatScore,
      heatLevel,
      displayColor,
      displayIcon,
      change20d: industryRPSMap.get(name)?.change20d,  // 全市场20日涨幅
    });
  }

  return result;
}

export function getSectorHeatDisplayClass(heatScore: number): string {
  if (heatScore >= 90) return 'bg-red-600';
  if (heatScore >= 80) return 'bg-red-500';
  if (heatScore >= 50) return 'bg-yellow-500';
  return 'bg-gray-400';
}

export function getSectorHeatTextColor(heatScore: number): string {
  if (heatScore >= 90) return 'text-red-600 font-bold';
  if (heatScore >= 80) return 'text-red-500';
  if (heatScore >= 50) return 'text-yellow-600';
  return 'text-gray-500';
}
