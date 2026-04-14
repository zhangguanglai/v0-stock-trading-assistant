// 清除所有本地缓存中的模拟数据
export function clearMockDataFromStorage() {
  try {
    // 清除 Zustand persist 的键
    const zustandKey = 'stock-investment-store';
    localStorage.removeItem(zustandKey);
    
    // 清除其他可能的缓存键
    const keysToRemove = [
      'mock-positions',
      'mock-watchlist',
      'mock-trades',
      'mock-alerts',
      'mock-data',
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    
    console.log('[v0] 已清除本地缓存中的所有模拟数据');
  } catch (error) {
    console.error('[v0] 清除缓存失败:', error);
  }
}

// 验证是否为真实数据
export function isRealDataMode(): boolean {
  try {
    const stored = localStorage.getItem('stock-investment-store');
    if (!stored) return true; // 无缓存 = 真实数据模式
    
    const data = JSON.parse(stored);
    // 检查是否包含硬编码的股票代码
    const mockCodes = ['600036', '601318', '002475', '600519', '000333', '600900'];
    const hasMockData = data.state?.watchlist?.some?.((s: any) => 
      mockCodes.includes(s.stockCode)
    );
    
    return !hasMockData;
  } catch {
    return true;
  }
}
