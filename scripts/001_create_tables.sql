-- 用户配置表
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  total_capital DECIMAL(15, 2) DEFAULT 100000,
  max_single_position_ratio DECIMAL(5, 4) DEFAULT 0.1,
  max_total_position_ratio DECIMAL(5, 4) DEFAULT 0.8,
  max_single_loss_ratio DECIMAL(5, 4) DEFAULT 0.02,
  max_daily_loss_ratio DECIMAL(5, 4) DEFAULT 0.05,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON user_profiles FOR DELETE USING (auth.uid() = id);

-- 交易策略表
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  strategy_type TEXT NOT NULL DEFAULT 'trend', -- trend, momentum, value, technical
  is_active BOOLEAN DEFAULT true,
  
  -- 入场规则
  entry_rules JSONB DEFAULT '[]',
  
  -- 出场规则
  exit_rules JSONB DEFAULT '[]',
  
  -- 仓位管理
  position_sizing_method TEXT DEFAULT 'fixed_ratio', -- fixed_ratio, kelly, atr_based
  base_position_ratio DECIMAL(5, 4) DEFAULT 0.05,
  max_positions INTEGER DEFAULT 5,
  
  -- 止损设置
  stop_loss_type TEXT DEFAULT 'percentage', -- percentage, atr, support
  stop_loss_value DECIMAL(10, 4) DEFAULT 0.08,
  
  -- 止盈设置
  take_profit_type TEXT DEFAULT 'percentage', -- percentage, trailing, target
  take_profit_value DECIMAL(10, 4) DEFAULT 0.2,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strategies_select_own" ON strategies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "strategies_insert_own" ON strategies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strategies_update_own" ON strategies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "strategies_delete_own" ON strategies FOR DELETE USING (auth.uid() = user_id);

-- 股票池表
CREATE TABLE IF NOT EXISTS stock_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  filter_criteria JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_pools_select_own" ON stock_pools FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "stock_pools_insert_own" ON stock_pools FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stock_pools_update_own" ON stock_pools FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "stock_pools_delete_own" ON stock_pools FOR DELETE USING (auth.uid() = user_id);

-- 股票池中的股票
CREATE TABLE IF NOT EXISTS stock_pool_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES stock_pools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  market TEXT DEFAULT 'A', -- A, HK, US
  sector TEXT,
  notes TEXT,
  signal_status TEXT DEFAULT 'watching', -- watching, buy_signal, holding, sell_signal
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_pool_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_pool_items_select_own" ON stock_pool_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "stock_pool_items_insert_own" ON stock_pool_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stock_pool_items_update_own" ON stock_pool_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "stock_pool_items_delete_own" ON stock_pool_items FOR DELETE USING (auth.uid() = user_id);

-- 持仓记录表
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
  
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  market TEXT DEFAULT 'A',
  
  -- 持仓信息
  quantity INTEGER NOT NULL,
  avg_cost DECIMAL(10, 4) NOT NULL,
  current_price DECIMAL(10, 4),
  
  -- 止损止盈
  stop_loss_price DECIMAL(10, 4),
  take_profit_price DECIMAL(10, 4),
  trailing_stop_percent DECIMAL(5, 4),
  highest_price DECIMAL(10, 4),
  
  -- 状态
  status TEXT DEFAULT 'open', -- open, closed
  open_date TIMESTAMPTZ DEFAULT NOW(),
  close_date TIMESTAMPTZ,
  
  -- 买入理由
  entry_reason TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "positions_select_own" ON positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "positions_insert_own" ON positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "positions_update_own" ON positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "positions_delete_own" ON positions FOR DELETE USING (auth.uid() = user_id);

-- 交易记录表
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
  
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  market TEXT DEFAULT 'A',
  
  -- 交易信息
  trade_type TEXT NOT NULL, -- buy, sell
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 4) NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  commission DECIMAL(10, 2) DEFAULT 0,
  
  -- 盈亏（卖出时计算）
  profit_loss DECIMAL(15, 2),
  profit_loss_percent DECIMAL(10, 4),
  
  -- 交易原因
  trade_reason TEXT,
  followed_strategy BOOLEAN DEFAULT true,
  deviation_reason TEXT,
  
  -- 情绪记录
  emotion_before TEXT, -- calm, anxious, greedy, fearful, confident
  emotion_after TEXT,
  
  trade_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades_select_own" ON trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trades_insert_own" ON trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trades_update_own" ON trades FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "trades_delete_own" ON trades FOR DELETE USING (auth.uid() = user_id);

-- 交易日志/复盘表
CREATE TABLE IF NOT EXISTS trade_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  
  review_date DATE DEFAULT CURRENT_DATE,
  review_type TEXT DEFAULT 'single', -- single, daily, weekly, monthly
  
  -- 复盘内容
  what_went_well TEXT,
  what_went_wrong TEXT,
  lessons_learned TEXT,
  action_items TEXT,
  
  -- 评分
  strategy_adherence_score INTEGER, -- 1-10
  emotion_control_score INTEGER, -- 1-10
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trade_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_reviews_select_own" ON trade_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trade_reviews_insert_own" ON trade_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trade_reviews_update_own" ON trade_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "trade_reviews_delete_own" ON trade_reviews FOR DELETE USING (auth.uid() = user_id);

-- 信号提醒表
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id) ON DELETE CASCADE,
  
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  
  alert_type TEXT NOT NULL, -- stop_loss, take_profit, buy_signal, custom
  trigger_price DECIMAL(10, 4),
  trigger_condition TEXT, -- above, below, cross
  
  is_triggered BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_select_own" ON alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alerts_insert_own" ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts_update_own" ON alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "alerts_delete_own" ON alerts FOR DELETE USING (auth.uid() = user_id);

-- 创建用户配置自动创建触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'display_name', new.email)
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 创建更新时间自动更新函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为各表添加更新时间触发器
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stock_pools_updated_at BEFORE UPDATE ON stock_pools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stock_pool_items_updated_at BEFORE UPDATE ON stock_pool_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trade_reviews_updated_at BEFORE UPDATE ON trade_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
