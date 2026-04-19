// 不再清除用户数据 - 仅清除旧的硬编码缓存键（已不再使用）
export function clearMockDataFromStorage() {
  try {
    // 只清除已废弃的独立 mock 缓存键，不再清除 Zustand persist 的存储
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
    
    console.log('[v0] 已清除旧的缓存键（保留用户数据）');
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
