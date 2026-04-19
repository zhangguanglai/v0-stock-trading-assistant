-- 清理生产环境的测试数据
-- 警告：此脚本将删除所有用户数据，仅在需要重置数据库时使用

-- 1. 首先删除子表数据（由于外键约束，需要按顺序删除）

-- 删除所有策略数据
DELETE FROM strategies;

-- 删除所有用户配置
DELETE FROM user_profiles;

-- 2. 重置序列（如果有的话）
-- UUID表不需要重置序列

-- 3. 验证清理结果
DO $$
DECLARE
  strategies_count INTEGER;
  profiles_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO strategies_count FROM strategies;
  SELECT COUNT(*) INTO profiles_count FROM user_profiles;
  
  RAISE NOTICE '清理完成！';
  RAISE NOTICE '- strategies 表剩余记录: %', strategies_count;
  RAISE NOTICE '- user_profiles 表剩余记录: %', profiles_count;
END $$;
