# 部署指南 - 策略大师

## 部署到Vercel (推荐)

### 前置条件
- GitHub账号
- Vercel账号
- Supabase项目

### 步骤1: 准备GitHub仓库

```bash
# 如果还没有，先初始化Git
git init

# 关联到你的GitHub仓库
git remote add origin https://github.com/yourusername/stock-strategy-master.git

# 提交所有代码
git add .
git commit -m "Initial commit: Stock Strategy Master v1.0"

# 推送到main分支
git push -u origin main
```

### 步骤2: 配置Supabase

1. 访问 https://supabase.com
2. 创建新项目
3. 在项目设置中获取：
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Anon Key)

4. 运行初始化脚本创建数据库表：

```sql
-- 复制 scripts/init-db.sql 中的所有SQL代码
-- 在Supabase SQL Editor中执行
```

### 步骤3: 部署到Vercel

#### 方式A: 通过Vercel Dashboard (最简单)

1. 访问 https://vercel.com
2. 点击 "New Project"
3. 选择你的GitHub仓库
4. 在"Environment Variables"中添加：
   - `NEXT_PUBLIC_SUPABASE_URL` = 你的Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 你的Anon Key
5. 点击 "Deploy"

#### 方式B: 通过CLI

```bash
# 安装Vercel CLI
npm i -g vercel

# 登录Vercel
vercel login

# 部署
vercel

# 按提示输入环境变量
# 项目部署后，编辑vercel.json配置环境变量
```

### 步骤4: 验证部署

1. 部署完成后，Vercel会提供一个URL
2. 访问该URL验证应用是否正常运行
3. 测试以下流程：
   - 用户注册/登录
   - 创建策略
   - 查看股票池
   - 计算仓位

## 自定义域名

1. 在Vercel项目设置中点击"Domains"
2. 添加你的自定义域名
3. 按照提示配置DNS记录

## 监控与日志

### Vercel Dashboard
- 访问 https://vercel.com/projects
- 查看部署历史和日志
- 监控性能指标

### Supabase Console
- 访问 https://supabase.com
- 查看数据库活动
- 监控API调用

## 备份与恢复

### Supabase备份
1. 在Supabase项目设置中启用自动备份
2. 设置备份频率（推荐每天）
3. 需要恢复时，在备份列表中选择还原

## 持续集成 (CI/CD)

Vercel已集成自动化部署：
- 推送到main分支 → 自动部署到生产环境
- 创建Pull Request → 自动创建Preview部署

## 性能优化

### 已启用的优化
- ✅ Next.js Image优化
- ✅ 自动代码分割
- ✅ 缓存策略
- ✅ CDN加速

### 监控性能
- 访问Vercel Dashboard > Analytics
- 查看页面加载时间、流量等指标

## 故障排查

### 常见问题

**Q: 部署后页面是白屏**
- A: 检查环境变量是否正确设置
- 检查Supabase连接是否成功
- 查看浏览器控制台错误信息

**Q: 数据库连接失败**
- A: 验证SUPABASE_URL和ANON_KEY是否正确
- 检查RLS策略是否正确配置
- 确保用户已通过认证

**Q: 部署很慢**
- A: 检查构建时间是否过长
- 查看是否有大量依赖包
- 考虑启用增量静态生成(ISR)

## 升级步骤

```bash
# 1. 更新代码
git pull origin main

# 2. 更新依赖
npm install

# 3. 测试本地环境
npm run build
npm start

# 4. 推送到GitHub
git push origin main

# 5. Vercel会自动部署新版本
```

## 回滚

如果部署出现问题：

1. 在Vercel Dashboard中找到之前的部署
2. 点击"Promote to Production"回滚到上一个版本
3. 同时在GitHub中恢复代码版本

## 安全建议

- ✅ 始终使用HTTPS
- ✅ 保护好Supabase密钥，不要提交到GitHub
- ✅ 启用Supabase RLS策略
- ✅ 定期更新依赖包
- ✅ 定期备份数据库

## 支持

遇到部署问题？
- Vercel文档: https://vercel.com/docs
- Supabase文档: https://supabase.com/docs
- GitHub Issues: 在仓库中提交Issue
