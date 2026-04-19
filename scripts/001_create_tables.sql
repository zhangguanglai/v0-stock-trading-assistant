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

DROP POLICY IF EXISTS "profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON user_profiles;

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
  strategy_type TEXT NOT NULL DEFAULT 'trend',
  is_active BOOLEAN DEFAULT true,
  entry_rules JSONB DEFAULT '[]',
  exit_rules JSONB DEFAULT '[]',
  position_sizing_method TEXT DEFAULT 'fixed_ratio',
  base_position_ratio DECIMAL(5, 4) DEFAULT 0.05,
  max_positions INTEGER DEFAULT 5,
  stop_loss_type TEXT DEFAULT 'percentage',
  stop_loss_value DECIMAL(10, 4) DEFAULT 0.08,
  take_profit_type TEXT DEFAULT 'percentage',
  take_profit_value DECIMAL(10, 4) DEFAULT 0.2,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "strategies_select_own" ON strategies;
DROP POLICY IF EXISTS "strategies_insert_own" ON strategies;
DROP POLICY IF EXISTS "strategies_update_own" ON strategies;
DROP POLICY IF EXISTS "strategies_delete_own" ON strategies;

CREATE POLICY "strategies_select_own" ON strategies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "strategies_insert_own" ON strategies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strategies_update_own" ON strategies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "strategies_delete_own" ON strategies FOR DELETE USING (auth.uid() = user_id);

-- 自动创建用户配置的Trigger
-- 当新用户注册时，自动在user_profiles表中创建一条记录

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '新用户')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 如果Trigger已存在则先删除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 创建Trigger：用户注册时自动创建配置
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 验证Trigger是否创建成功
DO $$
DECLARE
  trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) INTO trigger_exists;
  
  IF trigger_exists THEN
    RAISE NOTICE '✅ Trigger "on_auth_user_created" 创建成功！';
    RAISE NOTICE '新用户注册时将自动创建user_profiles记录';
  ELSE
    RAISE WARNING '⚠️ Trigger "on_auth_user_created" 创建失败';
  END IF;
END $$;
