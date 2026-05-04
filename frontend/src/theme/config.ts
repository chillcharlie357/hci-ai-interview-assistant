/**
 * Ant Design 主题配置
 * 使用 Ant Design 5.x 默认配色，仅配置字体
 */

import type { ThemeConfig } from "antd";

export const themeConfig: ThemeConfig = {
  token: {
    // 字体配置
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    // 圆角配置
    borderRadius: 8,
    // 主要颜色使用默认值
    // Primary: #1677ff
    // Success: #52c41a
    // Warning: #faad14
    // Error: #ff4d4f
  },
  components: {
    // 按钮组件配置
    Button: {
      borderRadius: 8,
      controlHeight: 40,
    },
    // 输入框组件配置
    Input: {
      borderRadius: 8,
      controlHeight: 40,
    },
    // 选择器组件配置
    Select: {
      borderRadius: 8,
      controlHeight: 40,
    },
    // 卡片组件配置
    Card: {
      borderRadiusLG: 16,
    },
    // 模态框配置
    Modal: {
      borderRadiusLG: 16,
    },
    // 标签配置
    Tag: {
      borderRadiusSM: 9999,
    },
  },
};
