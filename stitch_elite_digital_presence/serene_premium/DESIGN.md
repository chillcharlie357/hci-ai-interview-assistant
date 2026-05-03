---
name: Serene Premium
colors:
  surface: '#f8f9fd'
  surface-dim: '#d8dade'
  surface-bright: '#f8f9fd'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3f7'
  surface-container: '#eceef2'
  surface-container-high: '#e7e8ec'
  surface-container-highest: '#e1e2e6'
  on-surface: '#191c1f'
  on-surface-variant: '#41484e'
  inverse-surface: '#2e3134'
  inverse-on-surface: '#eff1f5'
  outline: '#71787f'
  outline-variant: '#c0c7cf'
  surface-tint: '#1c648e'
  primary: '#1c648e'
  on-primary: '#ffffff'
  primary-container: '#7cb9e8'
  on-primary-container: '#00496d'
  inverse-primary: '#90cdfd'
  secondary: '#4b6267'
  on-secondary: '#ffffff'
  secondary-container: '#cee7ed'
  on-secondary-container: '#51686d'
  tertiary: '#4c616c'
  on-tertiary: '#ffffff'
  tertiary-container: '#9fb6c2'
  on-tertiary-container: '#324852'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cae6ff'
  primary-fixed-dim: '#90cdfd'
  on-primary-fixed: '#001e30'
  on-primary-fixed-variant: '#004b70'
  secondary-fixed: '#cee7ed'
  secondary-fixed-dim: '#b2cbd1'
  on-secondary-fixed: '#061f23'
  on-secondary-fixed-variant: '#344a4f'
  tertiary-fixed: '#cfe6f3'
  tertiary-fixed-dim: '#b3cad6'
  on-tertiary-fixed: '#061e27'
  on-tertiary-fixed-variant: '#344a54'
  background: '#f8f9fd'
  on-background: '#191c1f'
  surface-variant: '#e1e2e6'
typography:
  display-lg:
    fontFamily: PingFang SC, Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.02em
  display-md:
    fontFamily: PingFang SC, Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: PingFang SC, Manrope
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-md:
    fontFamily: PingFang SC, Manrope
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  label-md:
    fontFamily: PingFang SC, Manrope
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: PingFang SC, Manrope
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-padding: 48px
---

## Brand & Style

This design system is built upon the principles of **Minimalism** and **Glassmorphism**, specifically tailored for high-end health and finance sectors. The aesthetic evokes a sense of "quiet luxury"—where the interface feels like a breathable, open space rather than a tool. 

The atmosphere is calm, trustworthy, and sophisticated. It prioritizes clarity and whitespace to reduce cognitive load, fostering an emotional response of security and clarity. By utilizing semi-transparent layers and soft environmental glows, the UI achieves a "floating" quality that feels both modern and premium.

## Colors

The palette is anchored in a pristine White and a muted, cool "Ice Grey" for structural backgrounds. Interaction and emphasis are handled by a trio of blues:
- **Sky Blue (Primary):** Used for primary calls to action and active states.
- **Ice Blue (Secondary):** Used for subtle backgrounds, tag fills, and secondary buttons.
- **Grey-Blue (Tertiary):** Reserved for data visualization, borders, or secondary text to maintain a professional, grounded feel.

All colors should maintain high accessibility ratios against the white background. Gradients should be extremely subtle, moving from primary sky blue to a slightly lighter ice blue to simulate natural light.

## Typography

This design system utilizes **PingFang SC** as the primary typeface for Simplified Chinese, paired with **Manrope** for Latin characters and numerals to provide a balanced, modern tech-lifestyle feel. 

Hierarchy is established through weight and generous line heights rather than excessive size variations. Display headings are set with tighter letter spacing for a premium editorial look, while body text uses a 1.6x line height to ensure readability and a "breathing" layout. Numerical data in finance contexts should always use the Manrope font for its clear, geometric legibility.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model with generous safe areas. For mobile and desktop, use a 12-column grid to allow for flexible card arrangements. 

The spacing rhythm is based on a 4px baseline, but the "serene" feel is achieved by opting for larger-than-standard vertical padding (`stack-lg` and `section-padding`). Components should never feel crowded; when in doubt, increase white space to reinforce the premium, calm aesthetic.

## Elevation & Depth

Depth is created through **Ambient Shadows** and **Glassmorphism**. Surfaces do not use harsh borders; instead, they are defined by soft, multi-layered shadows.

- **Level 1 (Default Cards):** 20px blur, 10% opacity of a Grey-Blue tint.
- **Level 2 (Active/Floating Elements):** 40px blur, 15% opacity, slightly offset on the Y-axis.
- **Glass Effects:** Use a background blur (15-25px) on semi-transparent white (80% opacity) for navigation bars and modal overlays. This creates the "light behind frosted glass" effect, maintaining the user's sense of context while focusing on the foreground.

## Shapes

The shape language is organic and approachable. This design system uses a **Rounded** (Level 2) logic as the baseline. 
- **Buttons and Inputs:** 12px (rounded-lg).
- **Cards and Modals:** 16px to 24px (rounded-xl) to emphasize a soft, protective feel.
- **Icon Containers:** Icons should be housed in circular containers for a softer look or "squircle" containers (rounded square with high curvature) to match the premium finance aesthetic.

## Components

- **Buttons:** Primary buttons use a subtle vertical gradient (Sky Blue to a slightly deeper tone). Text is centered with medium weight. Secondary buttons use the Ice Blue tint as a fill with no border.
- **Cards:** White background, no border, Level 1 shadow. Cards used for lifestyle metrics or financial summaries should feature a delicate inner glow (1px white stroke at 50% opacity) to enhance the glass-like quality.
- **Input Fields:** Large 12px radius. Background is the `background_secondary` grey. On focus, the field transitions to a white background with a thin Sky Blue shadow glow.
- **Chips/Tags:** Fully rounded (pill-shaped) with a light Ice Blue background and Grey-Blue text.
- **Lists:** Clean, borderless rows separated by subtle 1px lines in the `background_secondary` color, with generous 16px vertical padding per item.
- **Progress Indicators:** Use soft, rounded line ends. Avoid harsh edges. Use gradients to indicate progress levels (e.g., Ice Blue to Sky Blue).