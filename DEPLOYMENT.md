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

## 生产环境要求

### Node.js 版本

本项目使用 Node.js 22+ 内置的 `node:sqlite` 模块，**必须**使用 Node.js 22 或更高版本。

```bash
# 检查 Node.js 版本
node --version  # 应显示 v22.x.x 或更高
```

### 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | 是 |
| `TUSHARE_TOKEN` | Tushare Pro API Token | 是（回测/选股依赖） |

### 本地 SQLite 数据库

回测功能依赖本地 SQLite 数据库（`data/stock-history.db`）：

- **Vercel 部署**：Vercel 是无状态环境，不支持持久化本地文件。回测功能在 Vercel 上**不可用**。
- **自有服务器/VPS 部署**：推荐方案，支持完整的回测功能。
- **Docker 部署**：可通过挂载卷持久化数据库文件。

## 历史数据管理

### 初始全量下载

首次部署后，需要下载历史数据到本地 SQLite：

```bash
# 下载3年历史数据（约5000只股票 × 700交易日 = 350万条记录）
npx tsx scripts/download-historical-data.ts 3

# 或下载5年数据
npx tsx scripts/download-historical-data.ts 5
```

**耗时参考**：
- 3年数据：约 8-10 分钟（1454 次 API 调用）
- 5年数据：约 15-20 分钟（2400+ 次 API 调用）

**存储参考**：
- 3年数据：约 50-80 MB
- 5年数据：约 100-150 MB

### 日增量更新（定时任务）

配置每日自动更新，获取最新交易日数据：

#### Linux/macOS (crontab)

```bash
# 编辑 crontab
crontab -e

# 每个交易日 18:00 执行增量更新（收盘后）
0 18 * * 1-5 cd /path/to/project && TUSHARE_TOKEN=your_token npx tsx scripts/download-historical-data.ts >> logs/data-update.log 2>&1
```

#### Windows (任务计划程序)

1. 打开「任务计划程序」
2. 创建基本任务：
   - 名称：`StockDataDailyUpdate`
   - 触发器：每周一至周五 18:00
   - 操作：启动程序
   - 程序：`powershell.exe`
   - 参数：`-ExecutionPolicy Bypass -Command "cd D:\MyWorkspace\stock-trading-assistant; $env:TUSHARE_TOKEN='your_token'; npx tsx scripts/download-historical-data.ts"`

#### Docker (推荐)

使用 `node:22-alpine` 镜像，配合 cron：

```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY . .
RUN npm install

# 安装 cron
RUN apk add --no-cache dcron

# 创建 cron 任务：每日 18:00 执行
RUN echo "0 18 * * 1-5 cd /app && TUSHARE_TOKEN=\$TUSHARE_TOKEN npx tsx scripts/download-historical-data.ts >> /var/log/data-update.log 2>&1" > /etc/crontabs/root

# 启动 cron 和 Next.js
CMD crond -f -l 2 & npm start
```

运行容器时挂载数据库卷：

```bash
docker run -d \
  -e TUSHARE_TOKEN=your_token \
  -e NEXT_PUBLIC_SUPABASE_URL=your_url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key \
  -v /host/data:/app/data \
  -p 3000:3000 \
  stock-strategy-master
```

### 数据备份

SQLite 数据库备份非常简单：

```bash
# 热备份（无需停止服务）
cp data/stock-history.db data/stock-history.db.backup.$(date +%Y%m%d)

# 或导出为 SQL
sqlite3 data/stock-history.db ".dump" > backup.sql
```

## 部署架构建议

### 方案 A：Vercel + 自有服务器混合部署

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| Next.js 前端 | Vercel | 全球 CDN，快速访问 |
| Supabase 数据库 | Supabase Cloud | 用户数据、持仓、交易记录 |
| 回测引擎 | 自有服务器/VPS | 需要 Node.js 22 + SQLite |

**回测 API 路由**：在 Vercel 上访问 `/api/backtest` 会返回错误提示，引导用户到自有服务器执行回测。

### 方案 B：全栈自有服务器部署（推荐）

使用单台 VPS（如阿里云 ECS、腾讯云 CVM）：

```bash
# 1. 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 克隆代码
git clone https://github.com/yourusername/stock-strategy-master.git
cd stock-strategy-master

# 3. 安装依赖
npm install

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 填入所有配置

# 5. 下载历史数据
npx tsx scripts/download-historical-data.ts 3

# 6. 构建
npm run build

# 7. 使用 PM2 启动
npm install -g pm2
pm2 start npm --name "stock-strategy" -- start

# 8. 配置 Nginx 反向代理（可选）
# 监听 80/443，代理到 localhost:3000

# 9. 配置定时任务（日增量更新）
crontab -e
# 添加：0 18 * * 1-5 cd /path/to/project && npx tsx scripts/download-historical-data.ts
```

### 方案 C：Docker Compose 部署

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - TUSHARE_TOKEN=${TUSHARE_TOKEN}
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  # 可选：使用 ofelia 作为容器内定时任务调度器
  scheduler:
    image: mcuadros/ofelia:latest
    command: daemon --docker
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      ofelia.job-run.data-update.schedule: "0 18 * * 1-5"
      ofelia.job-run.data-update.container: "app"
      ofelia.job-run.data-update.command: "npx tsx scripts/download-historical-data.ts"
```

## 支持

遇到部署问题？
- Vercel文档: https://vercel.com/docs
- Supabase文档: https://supabase.com/docs
- Node.js SQLite: https://nodejs.org/api/sqlite.html
- GitHub Issues: 在仓库中提交Issue
