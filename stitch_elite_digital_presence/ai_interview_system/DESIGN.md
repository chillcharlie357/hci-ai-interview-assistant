---
name: AI Interview System
colors:
  surface: '#fef7ff'
  surface-dim: '#ded7e4'
  surface-bright: '#fef7ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f1fe'
  surface-container: '#f3ebf8'
  surface-container-high: '#ede5f3'
  surface-container-highest: '#e7e0ed'
  on-surface: '#1d1a23'
  on-surface-variant: '#494454'
  inverse-surface: '#322f39'
  inverse-on-surface: '#f5eefb'
  outline: '#7b7486'
  outline-variant: '#cbc3d7'
  surface-tint: '#6d3bd7'
  primary: '#6b38d4'
  on-primary: '#ffffff'
  primary-container: '#8455ef'
  on-primary-container: '#fffbff'
  inverse-primary: '#d0bcff'
  secondary: '#006686'
  on-secondary: '#ffffff'
  secondary-container: '#7ed4fd'
  on-secondary-container: '#005b78'
  tertiary: '#855000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a76500'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#c0e8ff'
  secondary-fixed-dim: '#7bd1fa'
  on-secondary-fixed: '#001e2b'
  on-secondary-fixed-variant: '#004d66'
  tertiary-fixed: '#ffdcbb'
  tertiary-fixed-dim: '#ffb869'
  on-tertiary-fixed: '#2c1700'
  on-tertiary-fixed-variant: '#673d00'
  background: '#fef7ff'
  on-background: '#1d1a23'
  surface-variant: '#e7e0ed'
typography:
  display-lg:
    fontFamily: PingFang SC, Manrope
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.2'
  h1:
    fontFamily: PingFang SC, Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.4'
  h2:
    fontFamily: PingFang SC, Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.5'
  body-lg:
    fontFamily: PingFang SC, Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.7'
  body-md:
    fontFamily: PingFang SC, Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: PingFang SC, Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  container-margin: 40px
  gutter: 24px
---

## 品牌与风格 (Brand & Style)

本设计系统致力于营造一种“智能宁静”的氛围，专门为高端 AI 面试场景打造。其核心理念是将专业主义的严谨与现代科技的灵动相结合。我们采用**极简主义 (Minimalism)** 与 **玻璃拟态 (Glassmorphism)** 混合的设计风格，通过大量留白、通透的层次感以及微妙的色彩流动，消除用户在面试过程中的焦虑感。

目标受众是追求卓越体验的企业 HR、资深面试官以及高素质候选人。UI 应当传达出一种“多巴胺紫色”般的活力，但这种活力是被克制、被精致化处理过的。整体视觉感受应当是安静而充满能量的，如同一个智慧、优雅且值得信赖的面试专家，在每一次交互中都能给予用户正向的心理暗示。

## 色彩 (Colors)

色彩策略以紫色系为核心，旨在传达智慧与高级感。

- **主色 (Primary):** 电击薰衣草紫 (#8B5CF6)，用于引导视觉重心，展现系统的现代感与亲和力。
- **辅助色 (Secondary):** 冰蓝 (#7DD3FC) 与浅紫罗兰色，用于多色阶的渐变填充和微光特效，增加界面的深度与维度。
- **背景色 (Background):** 纯白 (#FFFFFF) 为主，辅以极浅的灰白色 (#F9FAFB) 容器，确保阅读环境的纯净与专业。
- **强调色 (Accent):** 高饱和度的深紫色 (#6D28D9)，专门用于关键的操作按钮 (CTA) 和激活状态，确保在视觉上具有极强的指引力。
- **语义色:** 采用低饱和度的红绿色彩，以维持整体和谐的视觉调性。

## 字体 (Typography)

本设计系统优先选用 **PingFang SC (萍方)** 作为中文显示字体，英文及数字部分搭配 **Manrope** (用于标题) 和 **Inter** (用于正文)。

排版强调清晰的层级关系与呼吸感：
- **标题:** 使用较大的字号与加粗的字重，配合 Manrope 现代的几何感，确立权威性。
- **正文:** 设定了慷慨的行间距 (1.6x - 1.7x)，以提升长段文字（如面试反馈、职位描述）的可读性。
- **标签与辅助文字:** 适当增加字间距，确保在小字号下依然清晰可辨。

## 布局与间距 (Layout & Spacing)

采用基于 **8px** 的网格系统，但在特定组件间距上提供 4px 的微调能力。

- **布局模型:** 推荐使用 12 列流式栅格系统，但在容器内部建议使用 Flexbox 实现灵活的间距分布。
- **节奏感:** 采用动态的内边距，卡片内部统一使用 `lg (24px)` 或 `xl (32px)` 的内衬，营造出宽敞、奢华的视觉空间感。
- **安全边距:** 页面边缘保留至少 `40px` 的安全边距，确保内容不会显得局促。

## 高度与深度 (Elevation & Depth)

本设计系统拒绝使用生硬的投影，而是通过 **环境阴影 (Ambient Shadows)** 和 **玻璃拟态 (Glassmorphism)** 来构建层级。

- **浮动层级:** 核心卡片使用超大模糊半径 (30-50px) 和极低不透明度 (10-15%) 的紫色系投影，产生一种轻盈悬浮在背景之上的视觉错觉。
- **材质分层:**
  - **背景层:** 纯色表面。
  - **内容层:** 带有极细白色边框 (0.5px, 20% opacity) 的半透明白色材质，背景模糊度设定为 12px - 20px。
  - **交互层:** 激活状态下伴随微弱的外发光 (Micro-glow)，模拟科技感的呼吸跳动。

## 形状 (Shapes)

本设计系统采用全方位的圆润处理方案。

- **全局圆角:** 所有主容器、操作按钮及输入框均采用 `16px (rounded-lg)` 作为基础圆角。
- **组件差异:** 
  - 大型装饰性背景元素或浮动模态框可使用 `24px (rounded-xl)`。
  - 小型标签 (Tags) 推荐使用完全圆角的胶囊形状 (Pill-shaped)，以平衡整体的方圆比例。
这种大圆角的设定旨在柔化 AI 技术的冰冷感，提升产品的易用性感知。

## 组件 (Components)

### 按钮 (Buttons)
- **主操作:** 采用高饱和紫色背景，文字为纯白，带有柔和的紫色外阴影。
- **次要操作:** 玻璃材质感，浅紫半透明背景，紫色描边。
- **悬停状态:** 增加内部辉光效果，按钮轻微向上位移。

### 卡片 (Cards)
- 必须包含 `backdrop-filter: blur()` 效果。
- 边框应使用 1px 的浅紫到透明的线性渐变，模拟光影掠过的质感。

### 输入框 (Input Fields)
- 默认状态为极浅灰背景，16px 圆角。
- 聚焦状态下，边框变为电击紫色，并伴随微弱的紫色呼吸光晕。

### 面试监控组件 (AI Monitor)
- 使用动态的波形图或微光粒子效果代表 AI 的思考状态。
- 采用冰蓝色作为辅助视觉，区分人类面试官与 AI 模块。

### 进度指示器 (Progress Indicators)
- 采用带有细腻渐变的厚线条，从冰蓝过渡到紫色，象征面试进度的推进。