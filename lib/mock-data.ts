// 格式化金额
export const formatCurrency = (value: number): string => {
  if (value >= 100000000) {
    return (value / 100000000).toFixed(2) + '亿';
  }
  if (value >= 10000) {
    return (value / 10000).toFixed(2) + '万';
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// 格式化百分比
export const formatPercent = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(2) + '%';
};

// 获取颜色类名
export const getProfitColorClass = (value: number): string => {
  if (value > 0) return 'text-chart-1';
  if (value < 0) return 'text-destructive';
  return 'text-muted-foreground';
};
