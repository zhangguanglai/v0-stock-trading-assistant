# CLAUDE.md - 项目规范指南

## 核心原则 (Karpathy 编码准则)

> 源自 Andrej Karpathy 对 LLM 编码实践的洞察。执行任务时始终遵循：

### 1. 先思考，后编码
- **不假设**：遇到不确定的需求时，明确提出假设并确认
- **暴露矛盾**：发现现有逻辑不一致时，指出而非默默绕过
- **权衡取舍**：有多种方案时，简述利弊供选择

### 2. 简单优先
- **最小代码解决问题**：200 行能解决的不用 500 行
- **不添加未请求的功能**：不做"顺便优化"、"提高可扩展性"
- **不为单一用途创建抽象**：只在确实需要复用时提取函数/组件
- **测试标准**：资深工程师会说"这过于复杂" → 简化

### 3. 精确修改 (Surgical Changes)
- **只改必须改的**：不"顺便美化"相邻代码、注释、格式
- **不重构没坏的东西**：发现无关的死代码时提及，但不删除
- **匹配现有风格**：即使你有不同偏好
- **清理自己的孤儿**：移除因本次修改变得无用的导入/变量/函数

### 4. 目标驱动执行
- **定义验证标准**：把"修复 bug"转为"写测试复现它，然后让它通过"
- **分步验证**：多步骤任务先简述计划，每步完成后验证

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| **框架** | Next.js (App Router, Turbopack) | 16.2.0 |
| **UI 库** | React | 19 |
| **语言** | TypeScript (strict mode) | 5.7.3 |
| **样式** | Tailwind CSS | 4.2.0 |
| **组件库** | Radix UI + shadcn/ui 风格 | latest |
| **状态管理** | Zustand | 5.0.x |
| **认证/数据库** | Supabase (SSR) | latest |
| **股票数据源** | Tushare Pro API (6000积分) | - |
| **实时行情** | 新浪 Sina API | - |
| **图表** | Recharts | 2.15.0 |
| **表单验证** | Zod + React Hook Form | latest |
| **日期处理** | date-fns | 4.1.0 |
| **图标** | Lucide React | latest |
| **包管理器** | pnpm | - |

## 项目结构

```
app/
├── api/              # API 路由 (stock/*, system/*, database/*)
├── auth/             # 认证页面 (login, sign-up)
├── globals.css       # 全局样式
├── layout.tsx        # 根布局
└── page.tsx          # 首页
components/
├── ui/               # 基础 UI 组件 (shadcn/ui 风格, ~60个)
├── views/            # 页面视图组件 (dashboard, stock-pool, position 等)
├── app-container.tsx # 应用容器
└── app-sidebar.tsx   # 侧边栏
lib/
├── stock-api/        # 股票数据 API 封装
│   ├── tushare-api.ts    # Tushare Pro 接口
│   ├── sina-api.ts       # 新浪实时行情
│   ├── indicators.ts     # 技术指标计算
│   └── types.ts          # 类型定义
├── supabase/         # Supabase 客户端配置
├── store.ts          # Zustand 全局状态
├── types.ts          # 公共类型定义
└── utils.ts          # 工具函数
hooks/                # 自定义 Hooks
scripts/              # SQL 迁移脚本
public/               # 静态资源
```

## 代码规范

### TypeScript 配置
```json
{
  "strict": true,
  "target": "ES6",
  "module": "esnext",
  "moduleResolution": "bundler",
  "jsx": "react-jsx",
  "paths": { "@/*": ["./*"] }
}
```

### 导入路径规则
- 使用 `@/` 别名导入项目内部模块
  ```typescript
  // ✅ 正确
  import { getAllDailyBasic } from '@/lib/stock-api/tushare-api';
  import type { BuySignal } from '@/lib/stock-api/types';
  
  // ❌ 错误
  import { foo } from '../../../lib/bar';
  ```

### 组件编写规范
- 函数组件使用箭头函数
- Props 使用 interface 定义，导出供复用
- 使用 `cn()` 工具函数合并 Tailwind 类名

```typescript
interface StockCardProps {
  code: string;
  name: string;
  price: number;
  onClick?: () => void;
}

export function StockCard({ code, name, price, onClick }: StockCardProps) {
  return (
    <div className="rounded-lg border p-4" onClick={onClick}>
      <span className="font-semibold">{name}</span>
      <span className="text-muted-foreground">{price.toFixed(2)}</span>
    </div>
  );
}
```

### API 路由规范
- 使用 `export const dynamic = 'force-dynamic'` 强制动态渲染
- 统一返回格式: `{ success: boolean; data?: T; error?: string; timestamp: number }`
- 错误处理使用 try-catch，返回 500 状态码

### 样式规范
- 优先使用 Tailwind CSS 原子类
- 避免内联 style 对象
- 响应式设计使用 `sm:`, `md:`, `lg:` 断点
- 暗色模式使用 `dark:` 前缀

## 关键业务逻辑

### 选股漏斗流程
```
A股全市场 (~5000+只)
    ↓ 基本面筛选 (市值、PE、PB)
技术面筛选 (MA5、MA20、MACD金叉、量比)
    ↓ 资金面筛选 (换手率、板块涨幅)
符合选股规则 → 买入信号检测
```

### Tushare API 注意事项
- **`daily_basic` 不带 `ts_code` 参数时返回全市场数据**（约 5000+ 只），不是只有当日有交易的股票
- 单次请求限制 800 次/分钟（6000 积分无总量限制）
- **内置基于交易日的缓存**：非交易日自动复用最近交易日数据，避免开盘前缓存失效
- `total_mv` 字段单位是**万元**，需除以 10000 转为亿元

### 数据源选择规则（详见 docs/PRD-data-source-rules.md）

| 时段 | 时间范围 | 价格数据源 | 说明 |
|------|---------|-----------|------|
| **交易时段** | 工作日 09:15-15:05 | 新浪实时行情 | 调用新浪 API 获取实时价格 |
| **非交易时段** | 工作日 15:05后 ~ 次日09:15前 | Tushare 收盘价 | **跳过新浪请求**，直接使用缓存收盘价+涨跌幅 |
| **周末** | 周六、周日全天 | Tushare 收盘价 | **跳过新浪请求**，使用上一交易日数据 |

**非交易时段优化**：跳过新浪 API 请求，减少约 40% 的 API 调用和响应时间。

## 禁止事项

### 🔴 严重禁止
1. **禁止硬编码默认值**
   ```typescript
   // ❌ 错误: 硬编码默认值导致意外行为
   poolFilters.push(`市值≥${rules.minMarketCap || 30}亿`);
   
   // ✅ 正确: 仅在有明确值时显示
   if (rules.minMarketCap) {
     poolFilters.push(`市值≥${rules.minMarketCap}亿`);
   }
   ```

2. **禁止静默失败**
   - API 调用失败时必须记录详细错误日志
   - 回退到固定池时必须输出 warning 日志说明原因
   - 不得 catch 异常后不处理

3. **禁止泄露敏感信息**
   - `TUSHARE_TOKEN` 等环境变量不得提交到代码仓库
   - 不得在日志中输出完整 token
   - `.env.local` 已加入 `.gitignore`

### 🟡 应当避免
4. **避免漏斗逻辑不一致**
   - 漏斗展示的过滤数量必须与实际 `meetsAllRules` 逻辑一致
   - "无数据" 不应作为淘汰理由（应跳过该条件判断）

5. **避免过度 API 调用**
   - 批量请求控制并发数（建议 5-10 个/批）
   - 批次间添加延迟（100ms）避免限流
   - 客户端缓存短时效数据（5 分钟 TTL）

6. **避免在循环中创建匿名函数**
   ```tsx
   // ❌ 每次 render 创建新函数
   {items.map(item => <button onClick={() => handle(item)}>...</button>)}
   
   // ✅ 使用 data 属性或 curry
   {items.map(item => (
     <button onClick={() => handleItemClick(item.id)}>...</button>
   ))}
   ```

### 🟢 代码风格
7. **不添加不必要的注释**
   - 代码本身应清晰表达意图
   - 仅在复杂业务逻辑处添加简短注释
   - 注释使用中文（与团队语言一致）

8. **不使用 `any` 类型**
   - 优先使用具体类型或 `unknown`
   - 必要时使用类型断言并注释原因

9. **不修改 `node_modules` 或 `.next` 目录**

## 常用命令

```bash
# 开发
pnpm dev          # 启动开发服务器 (http://localhost:3000)

# 构建
pnpm build        # 生产构建
pnpm start        # 启动生产服务器

# 代码质量
pnpm lint         # ESLint 检查

# 测试
npx playwright test  # E2E 测试
```

## 环境变量

| 变量名 | 用途 | 必需 |
|--------|------|------|
| `TUSHARE_TOKEN` | Tushare Pro API 密钥 | 是（核心功能依赖） |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | 是 |

## 当前已知问题

1. **Tushare API 网络不稳定**：偶尔出现 `fetch failed`，需增强重试机制
2. **概念板块 API 限流**：全量获取概念成分可能触发 800 次/分钟限制
3. **选股扫描 API 文件过大**：`route.ts` 超 1000 行，建议后续拆分为多个独立模块（符合 Simplicity First 原则）
