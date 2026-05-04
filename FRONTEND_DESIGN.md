# 前端设计文档

AI 辅助面试系统的前端设计规范，基于 stitch 输出的多个设计方案综合整理。

> **文档版本**: v2.0
> **更新日期**: 2026-05-03
> **数据来源**: `stitch_elite_digital_presence/` 目录下的所有设计输出

---

## 1. 设计风格概述

### 1.1 设计语言

本系统采用**现代极简主义 (Modern Minimalism)** 与**玻璃拟态 (Glassmorphism)** 的混合设计风格，核心理念是"智能宁静 (Serene Intelligence)"——将专业主义的严谨与现代科技的灵动相结合。

**设计关键词：**
- 极简、通透、层次感
- 玻璃拟态、半透明材质
- 大圆角、柔和阴影
- 留白充足、呼吸感
- 多巴胺色彩、克制活力

### 1.2 设计哲学

```
┌─────────────────────────────────────────────────────────────┐
│                    "智能宁静" 设计哲学                        │
├─────────────────────────────────────────────────────────────┤
│  专业主义 (Professionalism)     科技灵动 (Tech Agility)       │
│         ↘                    ↙                              │
│              智能宁静 (Serene Intelligence)                  │
│         ↗                    ↖                              │
│  克制活力 (Restrained Energy)   通透层次 (Clear Hierarchy)    │
└─────────────────────────────────────────────────────────────┘
```

**核心原则：**

1. **消除焦虑** - 通过大量留白、通透层次和微妙色彩流动，消除用户在面试过程中的紧张感
2. **正向暗示** - 每次交互都给予用户正向的心理反馈，如同智慧、优雅的面试专家
3. **专业可信** - 视觉语言传达权威性与可靠性，适合企业 HR、资深面试官及高素质候选人

### 1.3 目标氛围

| 场景 | 氛围 | 情感目标 |
|---|---|---|
| 准备页 | 专业、简洁、引导感 | 信心、期待 |
| 面试页 | 沉浸、专注、科技感 | 平静、专注 |
| 报告页 | 权威、清晰、可信赖 | 信任、满意度 |

---

## 2. 色彩系统

### 2.1 Ant Design 默认配色

直接使用 Ant Design 5.x 默认主题配色，简洁专业。

**主色板：**

| 用途 | 色值 | 说明 |
|---|---|---|
| Primary | `#1677ff` | 主色，用于按钮、链接、选中状态 |
| Primary Background | `#e6f4ff` | 主色浅底背景 |
| Primary Border | `#91caff` | 主色边框 |
| Success | `#52c41a` | 成功状态 |
| Warning | `#faad14` | 警告状态 |
| Error | `#ff4d4f` | 错误状态 |

**中性色板：**

| 用途 | 色值 | 说明 |
|---|---|---|
| Heading | `rgba(0, 0, 0, 0.88)` | 标题文字 |
| Text | `rgba(0, 0, 0, 0.88)` | 主文字 |
| Text Secondary | `rgba(0, 0, 0, 0.65)` | 次要文字 |
| Text Tertiary | `rgba(0, 0, 0, 0.45)` | 辅助文字 |
| Border | `#d9d9d9` | 边框 |
| Background | `#ffffff` | 卡片背景 |
| Background Layout | `#f5f5f5` | 页面背景 |

### 2.2 自定义补充色

部分场景需要自定义颜色，通过 CSS 变量定义：

```css
:root {
  /* 数字人头像光环渐变 */
  --avatar-orbit-gradient: linear-gradient(135deg, #1677ff, #52c41a, #1677ff);
  
  /* 字幕区深色背景 */
  --caption-bg: rgba(0, 0, 0, 0.85);
  --caption-text: #ffffff;
  
  /* 视频区渐变背景 */
  --video-area-bg: linear-gradient(180deg, #f5f5f5, #e6f4ff);
}
```

### 2.3 玻璃拟态效果

```css
/* 玻璃卡片 */
.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
}
```

### 2.4 色彩使用原则

1. **优先使用 Ant Design 语义化组件** - Button、Tag、Badge 等直接使用默认配色
2. **自定义组件遵循主色系** - 数字人头像光环等使用主色渐变
3. **深色场景单独处理** - 字幕区使用深色背景 + 浅色文字

---

## 3. 字体系统

### 3.1 字体族定义

**中文字体优先：**
```css
font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

**英文/数字字体：**
```css
font-family: Inter, Manrope, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

**字体搭配推荐：**

| 场景 | 英文字体 | 中文字体 | 风格 |
|---|---|---|---|
| 标题 | Manrope | PingFang SC | 现代、几何感、权威 |
| 正文 | Inter | PingFang SC | 清晰、易读、专业 |
| 数字数据 | Manrope | - | 清晰、几何、等宽感 |

### 3.2 字号层级系统

**方案 A（青色设计系统）：**

| 层级 | 字号 | 字重 | 行高 | 字间距 | 用途 |
|---|---|---|---|---|---|
| H1 | 28px | 700 | 1.2 | 0 | 页面主标题 |
| H2 | 18px | 600 | 1.45 | 0 | 区域标题 |
| Body | 16px | 400 | 1.5 | 0 | 正文默认 |
| Label | 13px | 700 | 1 | 0 | 表单标签 |
| Eyebrow | 12px | 800 | - | 0.08em | 小标签（大写） |
| Caption | 14px | 400 | 1.4 | 0 | 辅助文字 |

**方案 B/C（蓝色/紫色设计系统）：**

| 层级 | 字号 | 字重 | 行高 | 字间距 | 用途 |
|---|---|---|---|---|---|
| Display LG | 48px | 600 | 1.2 | -0.02em | 大标题、Hero |
| H1 | 32px | 600 | 1.4 | -0.01em | 页面标题 |
| H2 | 24px | 600 | 1.5 | 0 | 区域标题 |
| Body LG | 18px | 400 | 1.7 | 0 | 长文本、重要内容 |
| Body MD | 16px | 400 | 1.6 | 0 | 正文默认 |
| Label SM | 14px | 500 | 1.4 | 0.02em | 表单标签 |
| Label XS | 11px | 600 | 1.2 | 0.05em | 小标签 |

### 3.3 字体 CSS 变量

```css
:root {
  /* 字体族 */
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-sans-cn: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --font-display: Manrope, "PingFang SC", sans-serif;
  
  /* 标题 */
  --text-h1: 700 28px/1.2 var(--font-sans-cn);
  --text-h2: 600 18px/1.45 var(--font-sans-cn);
  
  /* 正文 */
  --text-body: 400 16px/1.5 var(--font-sans-cn);
  --text-body-lg: 400 18px/1.7 var(--font-sans-cn);
  
  /* 标签 */
  --text-label: 700 13px/1 var(--font-sans-cn);
  --text-eyebrow: 800 12px/1.2 var(--font-sans-cn);
  
  /* 字间距 */
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.02em;
  --tracking-wider: 0.08em;
}
```

---

## 4. 圆角系统

### 4.1 圆角层级

| 名称 | 值 | 用途 |
|---|---|---|
| `rounded-sm` | 4px (0.25rem) | 小元素 |
| `rounded` | 8px (0.5rem) | 默认圆角 |
| `rounded-md` | 12px (0.75rem) | 输入框、按钮 |
| `rounded-lg` | 16px (1rem) | 卡片、面板 |
| `rounded-xl` | 24px (1.5rem) | 大容器、模态框 |
| `rounded-full` | 9999px | 胶囊标签、头像 |

### 4.2 应用规范

| 元素 | 圆角 |
|---|---|
| 按钮 | 6-12px |
| 输入框 | 6-16px |
| 卡片/面板 | 8-16px |
| 胶囊标签 | 999px |
| 头像 | 50% (圆形) |
| 模态框 | 16-24px |

---

## 5. 间距系统

### 5.1 基础单位

基于 **4px** 网格系统。

### 5.2 间距规范

| 名称 | 值 | 用途 |
|---|---|---|
| `xs` | 4-8px | 微间距 |
| `sm` | 8-16px | 小间距 |
| `md` | 16-24px | 中间距 |
| `lg` | 24-40px | 大间距 |
| `xl` | 40-64px | 超大间距 |
| `section` | 48px | 区域间距 |

### 5.3 容器间距

| 场景 | 间距 |
|---|---|
| 面板内边距 | 20-32px |
| 网格间距 | 16px |
| 表单元素间距 | 10-16px |
| 视频瓦片间距 | 12px |
| 页面安全边距 | 24-40px |

---

## 6. 阴影与深度

### 6.1 阴影层级

采用**环境阴影**而非硬投影，营造轻盈悬浮感。

| 层级 | 模糊半径 | 不透明度 | 偏移 | 用途 |
|---|---|---|---|---|
| Level 1 | 20px | 10% | 0 | 默认卡片 |
| Level 2 | 30-40px | 10-15% | Y: 4px | 浮动元素 |
| Level 3 | 40-50px | 15% | Y: 8px | 模态框、弹出层 |

### 6.2 阴影颜色

- **方案 A：** 使用灰蓝色调 `#637086`
- **方案 B：** 使用蓝色调 `#0047FF`
- **方案 C：** 使用紫色调 `#6b38d4`

### 6.3 玻璃拟态效果

```css
.glass {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12-20px);
  border: 0.5px solid rgba(255, 255, 255, 0.2);
}
```

---

## 7. 组件规范

### 7.1 按钮

#### 主按钮
```css
.btn-primary {
  background: #0f766e;  /* 或方案 B/C 的主色 */
  color: #ffffff;
  font-weight: 700;
  padding: 11px 14px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  filter: brightness(1.1);
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.3);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

#### 次要按钮
```css
.btn-secondary {
  background: #334155;
  color: #ffffff;
  font-weight: 600;
  padding: 11px 14px;
  border-radius: 6px;
  border: none;
}
```

#### 玻璃按钮（方案 B/C）
```css
.btn-glass {
  background: rgba(255, 255, 255, 0.15);
  color: #6b38d4;
  border: 1px solid rgba(107, 56, 212, 0.3);
  backdrop-filter: blur(10px);
}
```

### 7.2 输入框

```css
.input {
  border: 1px solid #d8e0ec;
  border-radius: 6-16px;
  padding: 10px 11px;
  color: #172033;
  background: #ffffff;
  transition: all 0.2s;
}

.input:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15);
  outline: none;
}
```

### 7.3 卡片/面板

```css
.card {
  background: #ffffff;
  border: 1px solid #d8e0ec;
  border-radius: 8-16px;
  padding: 20-32px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08);
}
```

### 7.4 胶囊标签

```css
.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #dff5f2;
  color: #0f766e;
}

.tag-warning {
  background: #fef3c7;
  color: #b45309;
}
```

### 7.5 数字人头像

```css
.avatar-orbit {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0f766e, #22c55e, #0ea5e9);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: avatarPulse 1.4s ease-in-out infinite;
}

.avatar-core {
  width: 82px;
  height: 82px;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 900;
  color: #0f766e;
}

@keyframes avatarPulse {
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.04) rotate(6deg); }
}
```

### 7.6 语音动画条

```css
.voice-bars {
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 28px;
}

.voice-bar {
  width: 4px;
  background: #0f766e;
  border-radius: 2px;
  animation: voiceBounce 0.8s ease-in-out infinite;
}

.voice-bar:nth-child(1) { animation-delay: 0s; }
.voice-bar:nth-child(2) { animation-delay: 0.12s; }
.voice-bar:nth-child(3) { animation-delay: 0.24s; }
.voice-bar:nth-child(4) { animation-delay: 0.36s; }

@keyframes voiceBounce {
  0%, 100% { height: 10px; }
  50% { height: 28px; }
}
```

---

## 8. 页面布局

### 8.1 准备页布局

居中单列卡片布局，最大宽度 720px。

```
┌──────────────────────────────────────┐
│                                      │
│           AI 面试系统                 │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  步骤 1: 基本信息               │  │
│  │  • 候选人姓名                   │  │
│  │  • 简历上传                     │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  步骤 2: 简历预览               │  │
│  │  • 解析结果                     │  │
│  │  • LLM 追问                    │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  步骤 3: 配置                   │  │
│  │  • 报告可见性                   │  │
│  │  • 功能开关                     │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  步骤 4: 面试链接               │  │
│  │  • 生成的链接                   │  │
│  │  • 复制按钮                     │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

### 8.2 面试页布局

全屏会议风格，CSS Grid 布局。

```css
.interview-page {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr auto 72px;
  height: 100vh;
  gap: 0;
}

/* 区域分配：
   [视频会议区]    [题目与说明区]
   [弹幕字幕区]    [监控指标区]
   [回答控制区]    [工具栏]
*/
```

**布局图：**

```
┌────────────────────────────────────────┬──────────────────────────┐
│                                        │                          │
│          视频会议区                      │    题目与说明区            │
│     (数字人面试官 + 候选人视频)           │                          │
│                                        │  当前问题                 │
│                                        │  维度标签                 │
│                                        │  追问建议                 │
│                                        │  观察点                   │
│                                        │                          │
│                                        ├──────────────────────────┤
│                                        │                          │
│                                        │    监控指标区             │
├────────────────────────────────────────┤                          │
│                                        │  视频指标面板             │
│          弹幕字幕区                      │  语音指标面板             │
│     (AI 提问 + 候选人回答 弹幕流)        │  关键帧列表               │
│                                        │                          │
├────────────────────────────────────────┼──────────────────────────┤
│                                        │                          │
│          回答控制区                      │    工具栏                 │
│     (开始回答/结束回答/文本输入)          │  摄像头/麦克风/结束面试    │
│                                        │                          │
└────────────────────────────────────────┴──────────────────────────┘
```

### 8.3 报告页布局

居中单列布局，最大宽度 900px。

```
┌──────────────────────────────────────────────┐
│                   报告页                      │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  报告头部                              │    │
│  │  候选人：xxx    岗位：xxx              │    │
│  │  面试时长：xx分钟    日期：xxxx-xx-xx   │    │
│  │  [下载 Markdown]                       │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  时间线摘要                            │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  问答记录                              │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  技术能力观察                          │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  表达与互动观察                        │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  非语言观察                            │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  待人工确认                            │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [返回准备页]                                  │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 9. 动画规范

### 9.1 动画列表

| 动画名 | 元素 | 效果 | 时长 |
|---|---|---|---|
| `avatarPulse` | 数字人头像光环 | 缩放 0.98-1.04 + 旋转 0-12deg | 1.4s 循环 |
| `voiceBounce` | 语音条 | 高度 10px-28px 弹跳 | 0.8s 循环 |
| 字幕淡入 | 弹幕字幕 | opacity 0→1, translateY(8px→0) | 0.3s |
| 按钮悬停 | 按钮 | 轻微上移 + 阴影增强 | 0.2s |
| 卡片悬停 | 卡片 | 阴影增强 | 0.3s |

### 9.2 动画原则

- 使用 `ease-in-out` 缓动函数
- 避免过度动画，保持克制
- 确保动画不影响可访问性
- 提供 `prefers-reduced-motion` 支持

---

## 10. 响应式设计

### 10.1 断点

| 断点 | 设备 | 布局变化 |
|---|---|---|
| > 1200px | 桌面 | 完整双列布局 |
| 800px - 1200px | 平板 | 面试页堆叠为单列 |
| < 800px | 手机 | 去掉左右留白，全宽 |

### 10.2 响应式策略

- 准备页：小屏去掉左右留白
- 面试页：中屏左右区域堆叠
- 报告页：小屏全宽显示

---

## 11. 设计原则总结

### 11.1 核心原则

| 原则 | 说明 |
|---|---|
| 使用 Ant Design 默认配色 | 无需自定义主题，保持一致性 |
| 玻璃拟态增强层次 | 通过 backdrop-filter 营造通透感 |
| 大圆角柔和视觉 | 卡片、按钮使用 8-12px 圆角 |
| 留白充足 | 面板内边距 20-24px，模块间距 16-24px |

### 11.2 组件分类

| 类型 | 来源 | 示例 |
|---|---|---|
| 基础 UI 组件 | Ant Design | Button、Input、Card、Tag、Switch、Modal |
| 布局组件 | 自定义 | SetupLayout、InterviewLayout、ReportLayout |
| 业务组件 | 自定义 | DigitalInterviewerTile、DanmakuCaptions、MetricsPanel |

---

## 12. 实施计划

### 概览

| 阶段 | 任务 | 预估工时 | 优先级 |
|---|---|---|---|
| 阶段一 | 设计系统搭建 | 1-2 天 | P0 |
| 阶段二 | 准备页实施 | 2-3 天 | P0 |
| 阶段三 | 面试页实施 | 3-5 天 | P0 |
| 阶段四 | 报告页实施 | 2-3 天 | P0 |
| 阶段五 | 动画与交互优化 | 1-2 天 | P1 |
| 阶段六 | 响应式适配 | 1 天 | P1 |
| 阶段七 | 测试与文档 | 1 天 | P2 |

**总预估：10-17 个工作日**

---

### 阶段一：设计系统搭建（1-2 天）

#### 任务清单

**1.1 CSS 变量文件**

```css
/* 文件: frontend/src/styles/variables.css */

:root {
  /* ===== 自定义补充色 ===== */
  /* 数字人头像光环渐变 */
  --avatar-orbit-gradient: linear-gradient(135deg, #1677ff, #52c41a, #1677ff);
  
  /* 字幕区深色背景 */
  --caption-bg: rgba(0, 0, 0, 0.85);
  --caption-text: #ffffff;
  
  /* 视频区渐变背景 */
  --video-area-bg: linear-gradient(180deg, #f5f5f5, #e6f4ff);
  
  /* ===== 字体变量 ===== */
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-sans-cn: "PingFang SC", "Microsoft YaHei", sans-serif;
  
  /* ===== 圆角变量 ===== */
  --radius-sm: 4px;
  --radius: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;
  
  /* ===== 间距变量 ===== */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  
  /* ===== 阴影变量 ===== */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.1);
  
  /* ===== 动画变量 ===== */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;
}
```

> **注意：** 主色、语义色等直接使用 Ant Design 默认配色，无需在 CSS 变量中重复定义。

**1.2 基础组件库**

| 组件 | 来源 | 说明 |
|---|---|---|
| `Button` | Ant Design `Button` | 直接使用，支持 type="primary" / "default" |
| `Input` | Ant Design `Input` | 直接使用 |
| `Upload` | Ant Design `Upload` | 简历上传，使用 Dragger 模式 |
| `Switch` | Ant Design `Switch` | 功能开关 |
| `Card` | Ant Design `Card` | 卡片容器 |
| `Tag` | Ant Design `Tag` | 维度标签，使用 color 属性 |
| `Progress` | Ant Design `Progress` | 进度指示 |
| `Modal` | Ant Design `Modal` | 确认弹窗 |
| `message` | Ant Design `message` | 操作反馈 |
| `Tag` | `components/ui/Tag.tsx` | 胶囊形、多种颜色 |
| `Avatar` | `components/ui/Avatar.tsx` | 光环动画、状态指示 |
| `Switch` | `components/ui/Switch.tsx` | 开关切换 |
| `Spinner` | `components/ui/Spinner.tsx` | 加载指示器 |

**1.3 工具类 CSS**

```css
/* 文件: frontend/src/styles/utilities.css */

/* 间距工具类 */
.p-panel { padding: var(--space-lg); }
.p-section { padding: var(--space-xl); }
.gap-grid { gap: var(--space-md); }
.gap-form { gap: 10px; }

/* 文字工具类 */
.text-eyebrow {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

/* 布局工具类 */
.container-setup {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-xl);
}

.container-report {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-xl);
}
```

#### 验收标准

- [ ] CSS 变量文件完整定义
- [ ] 所有基础组件可独立运行
- [ ] Storybook 或示例页面展示所有组件状态

---

### 阶段二：准备页实施（2-3 天）

#### 任务清单

**2.1 页面布局**

```
SetupPage/
├── Header              # 页面标题区
├── StepIndicator       # 步骤指示器 (1-4)
├── Card                # 主卡片容器
│   ├── StepOne         # 基本信息
│   │   ├── Input (姓名)
│   │   └── FileUpload (简历)
│   ├── StepTwo         # 简历预览
│   │   ├── ResumePreview
│   │   └── FollowupQuestions
│   ├── StepThree       # 配置
│   │   ├── Switch (报告可见性)
│   │   ├── Switch (LLM 开关)
│   │   └── Switch (视频观察)
│   └── StepFour        # 完成
│       ├── LinkDisplay
│       └── CopyButton
└── Footer              # 底部操作区
```

**2.2 关键组件实现**

| 组件 | 功能要点 |
|---|---|
| `FileUpload` | 拖拽上传、点击上传、文件类型限制（PDF/DOCX/图片）、上传进度 |
| `ResumePreview` | 最大高度 200px、滚动、解析状态显示 |
| `FollowupQuestions` | 动态问题列表、回答输入、提交状态 |
| `LinkDisplay` | 面试链接展示、一键复制功能 |

**2.3 状态管理**

```typescript
// 准备页状态
interface SetupPageState {
  step: 1 | 2 | 3 | 4;
  candidateName: string;
  resumeFile: File | null;
  prepSessionId: string | null;
  followupAnswers: Record<string, string>;
  config: {
    reportVisibility: 'recruiter' | 'candidate';
    useLlmQuestions: boolean;
    enableVideoObservation: boolean;
  };
  interviewLink: string | null;
}
```

#### 验收标准

- [ ] 完整的 4 步流程可正常流转
- [ ] 文件上传功能正常
- [ ] API 调用正确集成
- [ ] 错误状态正确处理

---

### 阶段三：面试页实施（3-5 天）

#### 任务清单

**3.1 页面网格布局**

```css
.interview-page {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr auto 72px;
  height: 100vh;
  gap: 0;
}

/* 区域命名 */
.interview-page {
  grid-template-areas:
    "video question"
    "captions metrics"
    "controls toolbar";
}
```

**3.2 视频会议区组件**

```
MeetingArea/
├── DigitalInterviewerTile
│   ├── AvatarOrbit        # 光环（渐变 + 动画）
│   ├── AvatarCore         # 内核 "AI"
│   ├── StatusBadge        # 状态胶囊
│   ├── VoiceBars          # 语音动画条
│   └── ProgressIndicator  # "问题 2/6"
└── CandidateVideoTile
    ├── LiveKitRoom        # 视频组件
    └── Placeholder        # 等待加入占位符
```

**3.3 弹幕字幕区组件**

```typescript
interface DanmakuCaptionsProps {
  entries: CaptionEntry[];
  maxEntries: number;  // 显示数量限制
}

interface CaptionEntry {
  id: string;
  speaker: 'ai' | 'candidate';
  text: string;
  timestamp: number;
  isStreaming?: boolean;  // 实时识别中
}
```

**3.4 题目面板组件**

```
QuestionPanel/
├── Eyebrow ("当前题目")
├── DimensionTag          # 胶囊标签，橙色
├── QuestionText          # 18px，左侧装饰线
├── FollowupSection
│   ├── SectionTitle ("追问建议")
│   └── FollowupList
├── ObservationSection
│   ├── SectionTitle ("观察要点")
│   └── ObservationList
└── ProgressIndicator     # "2 / 6"
```

**3.5 监控指标区组件**

```
MetricsPanel/
├── VideoMetrics
│   ├── MetricGrid (4列)
│   └── MetricItem × 10   # 脸部可见、亮度、清晰度...
├── SpeechMetrics
│   ├── DurationTimer
│   ├── WordCount
│   └── FillerWordCount
└── KeyframeList
    ├── KeyframeItem × N
    └── Disclaimer ("仅作为观察信号")
```

**3.6 回答控制区组件**

```
AnswerControls/
├── StateMessage          # "等待 AI 提问..."
├── PrimaryButton         # "开始回答" / "结束回答"
├── DurationTimer         # 计时器
└── TextInput (fallback)  # 语音识别不可用时
```

**3.7 工具栏组件**

```
Toolbar/
├── CameraToggle          # 摄像头开关
├── MicToggle             # 麦克风开关
└── EndInterviewButton    # 红色，确认弹窗
```

#### 验收标准

- [ ] 视频会议区正常显示数字人和候选人
- [ ] 字幕实时更新，淡入动画正常
- [ ] 题目切换流程正确
- [ ] 指标实时更新
- [ ] 工具栏按钮功能正常
- [ ] LiveKit 集成正常（配置后）

---

### 阶段四：报告页实施（2-3 天）

#### 任务清单

**4.1 页面结构**

```
ReportPage/
├── ReportHeader
│   ├── CandidateInfo     # 候选人、岗位
│   ├── InterviewStats    # 时长、日期
│   └── DownloadButton
├── TimelineSection
│   └── TimelineList
├── Q&ASection
│   └── QATable
├── TechnicalSection
├── ExpressionSection
├── NonverbalSection
│   ├── MetricsGrid
│   ├── KeyframeGallery
│   └── Disclaimer
├── ConfirmationSection
└── BackButton
```

**4.2 Markdown 渲染**

```typescript
// 解析报告 Markdown，分区渲染
function parseReportMarkdown(markdown: string): ReportSections {
  // 按 ## 标题拆分
  // 返回结构化数据
}
```

**4.3 下载功能**

```typescript
function downloadReport(sessionId: string, candidateName: string) {
  const filename = `${candidateName}_${sessionId}.md`;
  // 触发下载
}
```

#### 验收标准

- [ ] 报告正确加载并分区展示
- [ ] 下载功能正常
- [ ] 权限控制正确（招聘官/候选人视角）
- [ ] 返回按钮功能正常

---

### 阶段五：动画与交互优化（1-2 天）

#### 任务清单

**5.1 关键帧动画定义**

```css
/* 文件: frontend/src/styles/animations.css */

/* 头像光环脉冲 */
@keyframes avatarPulse {
  0%, 100% {
    transform: scale(1) rotate(0deg);
    filter: saturate(1);
  }
  50% {
    transform: scale(1.04) rotate(6deg);
    filter: saturate(1.2);
  }
}

/* 语音条弹跳 */
@keyframes voiceBounce {
  0%, 100% { height: 10px; }
  50% { height: 28px; }
}

/* 字幕淡入 */
@keyframes captionFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 按钮悬停 */
@keyframes buttonHover {
  from {
    transform: translateY(0);
    box-shadow: var(--shadow-md);
  }
  to {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }
}
```

**5.2 状态过渡**

| 状态变化 | 过渡效果 |
|---|---|
| 按钮悬停 | 0.2s ease, 上移 + 阴影增强 |
| 卡片悬停 | 0.3s ease, 阴影增强 |
| 题目切换 | 0.3s ease, 淡入淡出 |
| 数字人状态 | 0.3s ease, 标签颜色变化 |

**5.3 无障碍支持**

```css
/* 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### 阶段六：响应式适配（1 天）

#### 断点定义

```css
/* 断点变量 */
--breakpoint-sm: 800px;
--breakpoint-md: 1200px;
--breakpoint-lg: 1440px;
```

#### 布局变化

| 断点 | 面试页布局 | 准备页/报告页 |
|---|---|---|
| > 1200px | 双列布局（完整） | 居中卡片 |
| 800px - 1200px | 单列堆叠 | 居中卡片 |
| < 800px | 单列堆叠，工具栏移至底部 | 全宽 |

```css
/* 面试页响应式 */
@media (max-width: 1200px) {
  .interview-page {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto auto;
    grid-template-areas:
      "video"
      "question"
      "captions"
      "metrics"
      "controls"
      "toolbar";
  }
}

@media (max-width: 800px) {
  .container-setup,
  .container-report {
    padding: var(--space-md);
  }
}
```

---

### 阶段七：测试与文档（1 天）

#### 测试清单

**单元测试：**
- [ ] 所有 UI 组件渲染测试
- [ ] 工具函数测试
- [ ] 状态管理测试

**集成测试：**
- [ ] 准备页完整流程
- [ ] 面试页状态流转
- [ ] 报告页加载与下载

**E2E 测试：**
- [ ] 完整用户流程（准备 → 面试 → 报告）
- [ ] 错误场景处理

**视觉回归测试：**
- [ ] 关键页面截图对比
- [ ] 组件状态截图对比

#### 文档完善

- [ ] 组件 Props 文档
- [ ] 设计规范文档更新
- [ ] 开发指南文档

---

## 13. 技术栈

### 13.1 核心技术

| 技术 | 版本 | 用途 |
|---|---|---|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型系统 |
| Vite | 5.x | 构建工具 |
| Ant Design | 5.x | UI 组件库 |

### 13.2 专项依赖

| 技术 | 用途 |
|---|---|
| @livekit/components-react | 视频会议组件 |
| @livekit/components-styles | LiveKit 默认样式 |
| livekit-client | LiveKit 客户端 SDK |
| @mediapipe/tasks-vision | 可选，浏览器端视觉分析 |

### 13.3 开发工具

| 技术 | 用途 |
|---|---|
| vitest | 单元测试框架 |
| ESLint | 代码检查 |
| Prettier | 代码格式化 |

### 13.4 Ant Design 主题配置

直接使用 Ant Design 5.x 默认主题，无需自定义配色。仅做少量必要调整：

```typescript
// frontend/src/theme/config.ts
import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    // 字体
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
};
```

**Ant Design 5.x 默认主色：**
- Primary: `#1677ff` (蓝色)
- Success: `#52c41a` (绿色)
- Warning: `#faad14` (橙色)
- Error: `#ff4d4f` (红色)

默认配色已足够美观专业，无需额外定制。

### 13.5 Ant Design 组件使用规划

| 组件 | 使用场景 | 自定义需求 |
|---|---|---|
| Button | 主按钮、次要按钮、工具栏按钮 | 渐变背景、悬停光晕 |
| Input | 表单输入、文本输入 | 聚焦光晕效果 |
| Upload | 简历文件上传 | 拖拽区域样式 |
| Switch | 功能开关配置 | 颜色定制 |
| Card | 卡片容器、面板 | 阴影、边框定制 |
| Tag | 维度标签、状态标签 | 胶囊形、颜色定制 |
| Progress | 进度指示器 | 渐变进度条 |
| Spin | 加载状态 | 自定义加载图标 |
| Tooltip | 提示信息 | - |
| Modal | 结束面试确认弹窗 | - |
| message | 操作反馈提示 | - |
| Typography | 文字排版 | 标题、正文样式 |

### 13.6 自定义组件清单

以下组件需要自行开发，不依赖 Ant Design：

| 组件 | 说明 |
|---|---|
| `DigitalInterviewerTile` | 数字人头像 + 光环动画 + 状态胶囊 |
| `VoiceBars` | 语音动画条 |
| `DanmakuCaptions` | 弹幕式实时字幕流 |
| `QuestionPanel` | 题目面板（维度标签、追问、观察点） |
| `MetricsPanel` | 指标监控面板 |
| `KeyframeGallery` | 关键帧缩略图列表 |
| `MeetingArea` | 视频会议区容器 |
| `CandidateVideoTile` | LiveKit 视频容器 |

---

## 14. 文件结构

```
frontend/src/
├── main.tsx                  # 应用入口
├── App.tsx                   # 根组件，路由匹配
├── theme/
│   ├── config.ts             # Ant Design 主题配置
│   └── variables.css         # CSS 变量
├── styles/
│   ├── reset.css             # 样式重置
│   ├── typography.css        # 字体样式
│   ├── animations.css        # 动画定义
│   └── utilities.css         # 工具类
├── components/
│   ├── ui/                   # 基于 Ant Design 封装的组件
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Tag.tsx
│   │   └── Upload.tsx
│   ├── custom/               # 自定义业务组件
│   │   ├── DigitalInterviewerTile.tsx
│   │   ├── VoiceBars.tsx
│   │   ├── DanmakuCaptions.tsx
│   │   ├── QuestionPanel.tsx
│   │   ├── MetricsPanel.tsx
│   │   └── KeyframeGallery.tsx
│   └── layout/               # 布局组件
│       ├── SetupLayout.tsx
│       ├── InterviewLayout.tsx
│       └── ReportLayout.tsx
├── pages/
│   ├── SetupPage/
│   │   ├── index.tsx
│   │   ├── StepOne.tsx
│   │   ├── StepTwo.tsx
│   │   ├── StepThree.tsx
│   │   └── StepFour.tsx
│   ├── InterviewPage/
│   │   ├── index.tsx
│   │   ├── MeetingArea.tsx
│   │   ├── Toolbar.tsx
│   │   └── AnswerControls.tsx
│   └── ReportPage/
│       ├── index.tsx
│       └── ReportSections.tsx
├── hooks/                    # 自定义 Hooks
│   ├── useInterviewSession.ts
│   ├── useSpeechRecognition.ts
│   ├── useVideoAnalyzer.ts
│   └── useDanmaku.ts
├── api/                      # API 客户端
│   ├── client.ts
│   └── types.ts
├── utils/                    # 工具函数
│   ├── download.ts
│   └── format.ts
└── types/                    # 类型定义
    ├── session.ts
    ├── question.ts
    └── metrics.ts
```

---

## 附录：Stitch 输出索引

| 目录 | 内容 | 备注 |
|---|---|---|
| ai_1 - ai_8 | AI 面试系统各页面 | 参考 UI 布局 |
| ai_9 | AI 面试官瓦片 | 参考数字人头像设计 |
| ai_10 - ai_13 | 报告页、题目面板、工具栏 | 参考 UI 布局 |
| ai_14 | AI 面试系统启动页 | 参考 UI 布局 |
| ai_15 - ai_16 | 面试结束页、指标面板 | 参考 UI 布局 |
| ai_interview_system | 完整设计系统 | 参考设计理念 |
| dopamine_azure_system | 多巴胺蓝色设计系统 | 参考设计理念 |
| serene_premium | 宁静设计系统 | 参考设计理念 |

> **说明：** 最终实现使用 Ant Design 默认配色，以上输出仅供参考 UI 布局和设计理念。
