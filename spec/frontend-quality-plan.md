# 前端质量改进计划

> **状态：全部完成**（2026-05-14）
>
> 阶段一至五均已实施并验证。本文档保留作为设计决策的参考记录。

基于 `frontend-dev-guidelines` 标准对现有前端代码的审查结果，分阶段解决架构、性能、可维护性问题。

## 实施后状态

| 页面 | 原始行数 | 现行数 | 原FFCI | 现FFCI | 评级 |
|------|---------|--------|--------|--------|------|
| InterviewPage | 1720 | ~189 | -8 | 6 | 良好 |
| ReportPage | 795 | ~169 | 0 | 6 | 良好 |
| RecruiterPage | 701 | ~701 | 2 | 4 | 可接受 |
| DashboardPage | 392 | ~392 | 4 | 4 | 可接受 |
| NoSessionPage | 100 | 100 | 8 | 8 | 良好 |

## 现状评估（原始）

### FFCI 评分

| 页面 | 行数 | FFCI | 评级 |
|------|------|------|------|
| InterviewPage | 1720 | -8 | 需重构 |
| ReportPage | 795 | 0 | 需拆分 |
| RecruiterPage | 701 | 2 | 勉强 |
| DashboardPage | 392 | 4 | 可接受 |
| NoSessionPage | 100 | 8 | 良好 |

### 核心问题

1. **巨型组件**：InterviewPage 1720 行，20+ useState + 18 useRef，任何状态变化导致整棵树重渲染
2. **高频重渲染**：`setFaceMetrics` 在 `requestAnimationFrame` 中每秒约 10 次触发 React 渲染
3. **CSS 碎片化**：全局 CSS 文件 + 组件内 `<style>` 标签 + `antd-style` 三种方案共存
4. **无 Suspense 边界**：所有页面手动管理 loading 状态
5. **构建配置缺失**：无 `vite.config.ts`，5 个 `"latest"` 依赖版本
6. **可访问性薄弱**：缺少 aria 属性、语义化 HTML、键盘导航

---

## 阶段一：基础设施修复（零业务风险）

> 目标：修复构建配置和依赖问题，不涉及业务逻辑变更。

### 1.1 创建 `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
```

**要点**：
- 路径别名 `@/` → `src/`，消除深层相对导入
- API 代理，消除前端硬编码 `127.0.0.1:8000`（`config.ts` 中 `VITE_API_BASE_URL` 可简化为 `/api`）
- 后续可加 `build.rollupOptions.manualChunks` 拆包

### 1.2 锁定依赖版本

将 `package.json` 中的 `"latest"` 替换为当前实际安装的版本：

| 依赖 | 当前 `"latest"` | 替换为 |
|------|-----------------|--------|
| `react` | latest | `^19.1.0` |
| `react-dom` | latest | `^19.1.0` |
| `vite` | latest | `^6.3.5` |
| `typescript` | latest | `^5.8.3` |
| `@vitejs/plugin-react` | latest | `^4.5.0` |

> 实际版本以 `pnpm list` 输出为准。

### 1.3 更新 `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "moduleResolution": "Bundler",  // 从 "Node" 升级，适配 Vite ESM
    "paths": { "@/*": ["./src/*"] } // 配合 vite alias
  }
}
```

### 1.4 添加 `ErrorBoundary`

在 `main.tsx` 的路由外层添加 React 错误边界，防止子组件运行时错误导致白屏：

```tsx
<ErrorBoundary fallback={<ErrorFallback />}>
  <BrowserRouter>...</BrowserRouter>
</ErrorBoundary>
```

`ErrorFallback` 展示简明的错误信息 + 重试按钮，不依赖任何业务组件。

### 1.5 提取共享工具函数

`blobToBase64`（InterviewPage）和 `fileToBase64`（RecruiterPage）逻辑重复，提取到 `src/utils/file.ts`。

**影响范围**：配置文件、`package.json`、`main.tsx`，不改业务逻辑。

---

## 阶段二：InterviewPage 拆分（最关键）

> 目标：将 1720 行巨型组件拆分为 hooks + 子组件，解决 FFCI -8 问题。

### 2.1 目录结构

```
src/pages/InterviewPage/
  index.tsx                      -- 主页面，组合子组件（~150 行）
  InterviewPage.styles.ts        -- 抽离样式
  hooks/
    useInterviewSession.ts       -- 会话加载、答案提交
    useLiveKit.ts                -- LiveKit 连接管理
    useSpeechRecognition.ts      -- ASR + PCM 录制 + 分片上传
    useVideoAnalysis.ts          -- MediaPipe 面部分析循环
  components/
    InterviewerTile.tsx          -- 数字人画面
    CandidateVideo.tsx           -- 候选人视频 + 实时指标
    CaptionBar.tsx               -- 弹幕字幕区
    AnswerPanel.tsx              -- 答案输入 + 提交按钮
    MetricsSidebar.tsx           -- 右侧实时指标面板
```

### 2.2 核心 hook 设计

#### `useVideoAnalysis`

**当前问题**：`setFaceMetrics` 每秒约 10 次触发 React 重渲染。

**改进方案**：

```ts
export function useVideoAnalysis(sessionId: string) {
  const metricsRef = useRef<VideoMetrics | null>(null);  // 高频更新走 ref
  const [metricsSnapshot, setMetricsSnapshot] = useState<VideoMetrics | null>(null); // 低频快照

  // requestAnimationFrame 循环只更新 ref
  const analyzeFrame = useCallback(() => {
    const metrics = /* ... 面部分析 ... */;
    metricsRef.current = metrics;
  }, []);

  // 每 2 秒取一次快照到 state，触发 UI 更新
  useEffect(() => {
    const timer = setInterval(() => {
      if (metricsRef.current) {
        setMetricsSnapshot({ ...metricsRef.current });
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return { metricsSnapshot, metricsRef };
}
```

**效果**：渲染频率从 ~10 FPS 降至 0.5 FPS，同时保持实时指标面板的可用性。

#### `useSpeechRecognition`

封装 ASR 选择（webspeech/qwen）、PCM 录制、分片上传队列、失败计数。

```ts
export function useSpeechRecognition(sessionId: string) {
  // 返回：transcript、start/stop、uploadFailCount、cumulativeMetrics
}
```

#### `useLiveKit`

封装 LiveKit token 获取、房间连接/断开、错误状态。

#### `useInterviewSession`

封装 session 加载、答案提交、报告获取，返回统一的 loading/error/data 状态。

### 2.3 子组件设计原则

- 所有子组件使用 `React.memo` 包裹
- 回调通过 `useCallback` 传递
- 样式从 `InterviewPage.styles.ts` 导入
- 不直接访问全局 store，通过 props 接收数据

### 2.4 迁移策略

1. 先抽 hooks，保持 `index.tsx` 渲染逻辑不变，验证功能不回归
2. 再抽子组件，逐个替换内联 JSX
3. 最后抽离样式

每步后运行 `pnpm test` 确认测试通过。

**影响范围**：`frontend/src/pages/InterviewPage/`

---

## 阶段三：CSS 方案统一

> 目标：消除组件内 `<style>` 标签，统一为 `.css` 文件 + CSS 变量体系。

### 3.1 方案选择

| 方案 | 优势 | 劣势 |
|------|------|------|
| A. `antd-style` 全量迁移 | 类型安全、主题集成 | 学习成本、大量重写 |
| B. 独立 `.css` 文件 | 零学习成本、Vite 可 tree-shake | 无类型安全 |
| C. CSS Modules | 局部作用域、Vite 原生支持 | 与 Ant Design 主题变量结合需额外配置 |

**推荐方案 B**（独立 `.css` 文件）：

- 项目已有完善的 CSS 变量体系（`variables.css`）
- 所有页面组件都是路由级独占，不需要局部作用域
- 迁移成本最低：直接将 `<style>` 标签内容移入 `.css` 文件

### 3.2 迁移步骤

1. 为每个页面创建同名 `.css` 文件：`InterviewPage.css`、`ReportPage.css` 等
2. 将 `<style>` 标签内容移入对应 `.css` 文件
3. 在组件中 `import "./InterviewPage.css"` 替换 `<style>` 标签
4. 保留 `variables.css` + `global.css` + `animations.css` 不变

### 3.3 命名规范

页面级样式使用 `.page-` 前缀避免冲突：

```css
/* InterviewPage.css */
.interview-page { ... }
.interview-page .video-grid { ... }
.interview-page .caption-bar { ... }
```

**影响范围**：所有页面组件的样式部分

---

## 阶段四：ReportPage 改进

> 目标：补全数据对接后的 UI 完善，FFCI 从 0 提升至 6+。

### 4.1 数据计算 memo 化

```ts
const dimensionScores = useMemo(() => computeDimensionScores(session), [session]);
const radarData = useMemo(() => /* ... */, [dimensionScores]);
```

### 4.2 拆分为子组件

```
ReportPage/
  index.tsx
  components/
    RatingCard.tsx          -- AI 综合评分卡
    SkillsRadar.tsx         -- 雷达图 + 技能条
    KeyframesGallery.tsx    -- 关键帧展示
    QATimeline.tsx          -- 问答追踪时间线
    FullReportSection.tsx   -- 完整 Markdown 报告
  helpers/
    scoring.ts              -- computeDimensionScores、computeAnswerScore、generateRatingSummary
```

### 4.3 错误处理

- `loadReport` 失败时显示用户可见错误提示（`message.error`）
- 空数据状态：无回答时雷达图显示空状态提示，而非空白

### 4.4 语音观察可视化

从 `session.speechSummary` 中提取数据，在雷达图下方添加语音指标卡片：

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  语速        │ │  音量        │ │  语调起伏    │
│  135 字/分钟 │ │  -22 dBFS   │ │  2.8 st      │
│  ●●●●○ 合理  │ │  ●●●●○ 合理  │ │  ●●●●○ 合理  │
└─────────────┘ └─────────────┘ └─────────────┘
```

**影响范围**：`frontend/src/pages/ReportPage/`

---

## 阶段五：可访问性与体验改进

> 目标：达到 WCAG 2.1 AA 基本合规。

### 5.1 语义化 HTML

| 当前 | 改为 |
|------|------|
| 可点击 `<div>` | `<button>` 或 `<div role="button" tabIndex={0}>` |
| 缺少 `alt` 的图片 | 语义化 `alt` 描述 |
| 无 landmark 的区域 | `<nav>`、`<main>`、`<aside>` |

### 5.2 ARIA 属性

- 所有图标按钮添加 `aria-label`
- 雷达图/图表添加 `aria-label` + 文字 fallback
- 实时指标面板添加 `aria-live="polite"`
- 弹幕区域标记 `role="log" aria-live="polite"`

### 5.3 键盘导航

- 答案提交区域支持 Enter 键提交
- 弹幕区域支持键盘滚动
- 侧边栏折叠按钮可 Tab 聚焦

### 5.4 焦点管理

- 面试页面加载后自动聚焦到答案输入区
- 问题切换后焦点回到输入区
- 弹窗关闭后焦点回到触发元素

**影响范围**：所有页面组件

---

## 实施优先级与依赖

```
阶段一（基础设施）─── 无依赖，可立即开始
    │
    ├── 阶段二（InterviewPage 拆分）─── 依赖阶段一的 alias 配置
    │       │
    │       ├── 阶段三（CSS 统一）─── 可与阶段二后期并行
    │       │
    │       └── 阶段四（ReportPage 改进）─── 依赖阶段三的样式规范
    │
    └── 阶段五（可访问性）─── 依赖阶段二、四的组件结构稳定后
```

### 工作量估算

| 阶段 | 预估工时 | 可并行 |
|------|---------|--------|
| 一：基础设施 | 2h | 是 |
| 二：InterviewPage 拆分 | 8h | 否 |
| 三：CSS 统一 | 3h | 与二后期并行 |
| 四：ReportPage 改进 | 4h | 否 |
| 五：可访问性 | 4h | 否 |
| **合计** | **~21h** | |

---

## 不在范围内

| 项目 | 原因 |
|------|------|
| 全量 Suspense + react-query 迁移 | 改动面过大，需要独立的重构计划 |
| 深色模式完善 | 当前 CSS 变量层已预留，但 Ant Design token 层未适配，属于视觉增强 |
| E2E 测试 | 现有 E2E 覆盖通过 `scripts/e2e.sh`，本计划聚焦代码质量 |
| 国际化 | 产品面向中文用户，当前不需要 |
