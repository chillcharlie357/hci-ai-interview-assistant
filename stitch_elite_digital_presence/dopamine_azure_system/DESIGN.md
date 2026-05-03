---
name: Dopamine Azure System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3f4852'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6f7883'
  outline-variant: '#bec7d4'
  surface-tint: '#00629d'
  primary: '#00629d'
  on-primary: '#ffffff'
  primary-container: '#00a3ff'
  on-primary-container: '#00375a'
  inverse-primary: '#98cbff'
  secondary: '#5b3cdd'
  on-secondary: '#ffffff'
  secondary-container: '#7459f7'
  on-secondary-container: '#fffbff'
  tertiary: '#00677f'
  on-tertiary: '#ffffff'
  tertiary-container: '#00aad0'
  on-tertiary-container: '#003948'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cfe5ff'
  primary-fixed-dim: '#98cbff'
  on-primary-fixed: '#001d33'
  on-primary-fixed-variant: '#004a77'
  secondary-fixed: '#e5deff'
  secondary-fixed-dim: '#c9bfff'
  on-secondary-fixed: '#1a0063'
  on-secondary-fixed-variant: '#441cc8'
  tertiary-fixed: '#b7eaff'
  tertiary-fixed-dim: '#4cd6ff'
  on-tertiary-fixed: '#001f28'
  on-tertiary-fixed-variant: '#004e60'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  h1:
    fontFamily: Manrope, PingFang SC
    fontSize: 40px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Manrope, PingFang SC
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Manrope, PingFang SC
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Manrope, PingFang SC
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.7'
  body-md:
    fontFamily: Manrope, PingFang SC
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Manrope, PingFang SC
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base-unit: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  container-margin: 24px
  gutter: 16px
---

## Brand & Style
该设计系统的核心理念是“愉悦的秩序感”。它通过高饱和度的浅蓝色调激发用户的情绪能量，同时利用大量的留白和通透的质感维持职业化的冷静与克制。

设计风格采用**现代轻量化玻璃拟态 (Modern Glassmorphism)**。这种风格不追求厚重的堆叠，而是利用柔和的渐变、半透明的材质和灵动的光晕效果，营造出一种轻盈、漂浮的视觉感。整体氛围旨在传达健康、高效且充满活力的生活方式，适合高端健康管理、现代金融服务或生活方式类应用。

## Colors
色彩调色板旨在通过“高彩度粉彩”引发多巴胺反应。

*   **Primary (Sky Blue):** 核心互动色彩，充满活力的天蓝色，用于关键行动点。
*   **Secondary (Periwinkle):** 长春花色，用于强调辅助信息和渐变过渡，增添感性维度。
*   **Tertiary (Ice Blue):** 冰蓝色，提供清爽的视觉间歇，多用于背景点缀或轻量级装饰。
*   **Neutrals:** 背景限定为纯白 (`#FFFFFF`) 或极淡的灰蓝色 (`#F8FAFC`)，确保界面通透。
*   **Gradients:** 推荐使用从 `Sky Blue` 到 `Periwinkle` 的线性渐变，角度设定为 135度，以增加界面的动态感和深度。

## Typography
该设计系统选用 **Manrope** 作为主英文字体，搭配 **PingFang SC** 处理中文。这种组合展现了平衡、平衡且极具现代感的气质。

*   **Hierarchy:** 采用显著的字号差异来区分信息层级。大标题使用极粗的字重（Bold/ExtraBold）并配合紧凑的字间距。
*   **Readability:** 正文部分提供慷慨的行高（1.6x - 1.7x），确保在移动端阅读时拥有充足的视觉呼吸空间。
*   **Alignment:** 建议所有长文本内容左对齐，以维持专业和整洁的视觉轴线。

## Layout & Spacing
布局遵循 **8像素栅格系统**，但通过宽大的边距（Margins）和间距（Padding）来强调“高级感”和“呼吸感”。

*   **Grid:** 采用 12 列流动栅格（桌面端）或 4 列栅格（移动端）。
*   **Margins:** 侧边距统一设为 24px，确保内容不会显得局促。
*   **Rhythm:** 在垂直布局上，模块之间建议使用 40px 或 64px 的大间距，以创造清晰的功能分区，减少认知负荷。

## Elevation & Depth
深度感是通过模仿物理世界的透光性而非重力感来实现的。

*   **Shadows:** 严禁使用深色或高不透明度的阴影。仅使用颜色值为 `#0047FF`（带蓝色偏向）、不透明度在 10% - 15% 之间、模糊半径为 30px - 50px 的长阴影。这种阴影应呈现出一种“环境光遮蔽”的效果，使组件看起来像是悬浮在光源之上。
*   **Backdrop Blur:** 半透明容器需应用 20px - 30px 的背景模糊（Backdrop Filter: blur），并配合 1px 的白色半透明描边（Opacity 20%），模拟精致的磨砂玻璃质感。
*   **Glows:** 关键按钮和进度条下方可添加与其主色调一致的微弱外发光，增强“多巴胺”式的能量感。

## Shapes
形状语言以**大圆角**为核心，传递友好、安全且包容的心理暗示。

*   **Global Radius:** 按钮、卡片、输入框和弹窗均统一使用 **16px** 的大圆角。
*   **Consistency:** 避免在同一个界面中使用不同弧度的圆角，以维持系统的几何逻辑统一。
*   **Special Shapes:** 对于头像或分类图标，可以使用平滑的超椭圆（Squircle）而非正圆，以契合整体系统的精致度。

## Components
*   **Buttons:** 采用全填充渐变色或带有微弱投影的纯色块。点击态应有轻微的缩放反馈（Scale down to 0.98）。
*   **Cards:** 背景使用纯白或 80% 不透明度的白色，边缘带有 1px 的浅蓝色极细描边。卡片不设硬边框，全靠大半径阴影区分层级。
*   **Inputs:** 输入框背景建议使用 `Neutral` 浅灰色，获得焦点时边框变为 `Primary Sky Blue` 并带有柔和的发光。
*   **Chips/Tags:** 采用 `Surface Ice` 或 `Surface Periwinkle` 作为背景色，文字使用对应的高饱和度深色，圆角设为完全圆柱状（Pill-shaped）。
*   **Progress Indicators:** 进度条应带有微弱的水平渐变，并随进度增长伴有光晕流动的动态纹理。