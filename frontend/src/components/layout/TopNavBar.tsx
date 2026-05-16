/**
 * 顶部导航栏组件
 * 参考 ai_9-12 设计
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { App as AntApp, Button, Space, Tooltip, Dropdown, Input } from "antd";
import {
  BellOutlined,
  SettingOutlined,
  PlusOutlined,
  BulbOutlined,
  BgColorsOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useAppStore, useThemeStore, type ThemeMode } from "../../store";
import { useAuthStore } from "../../auth";
import { getApiBaseUrl } from "../../config";

interface TopNavBarProps {
  title?: string;
  showActions?: boolean;
}

export function TopNavBar({ title = "AI 智能面试系统", showActions = true }: TopNavBarProps) {
  const navigate = useNavigate();
  const clearAll = useAppStore((state) => state.clearAll);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { modal, message: messageApi } = AntApp.useApp();

  const nextMode: ThemeMode = themeMode === "default" ? "illustration" : "default";
  const themeLabels: Record<ThemeMode, string> = {
    default: "默认主题",
    illustration: "插画风格",
  };
  const themeIcons: Record<ThemeMode, React.ReactNode> = {
    default: <BulbOutlined />,
    illustration: <BgColorsOutlined />,
  };

  const handleNewInterview = () => {
    clearAll();
    navigate("/recruiter/setup");
  };

  const handleLogout = () => {
    modal.confirm({
      title: "确认退出登录？",
      content: "退出后需要重新登录才能访问系统。",
      okText: "退出",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          // 调用后端退出登录 API（可选）
          const token = useAuthStore.getState().accessToken;
          if (token) {
            await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {}); // 忽略错误
          }
        } finally {
          logout();
          messageApi.success("已退出登录");
          navigate("/login");
        }
      },
    });
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const userMenuItems = [
    {
      key: "user-info",
      label: (
        <div style={{ padding: "4px 0" }}>
          <div style={{ fontWeight: 600 }}>{user?.fullName || "用户"}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{user?.email}</div>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" as const },
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "个人资料",
      onClick: () => navigate("/profile"),
    },
    {
      key: "change-password",
      icon: <KeyOutlined />,
      label: "修改密码",
      onClick: () => {
        modal.info({
          title: "修改密码",
          content: (
            <div>
              <p>请前往 Supabase 控制台修改密码，或使用忘记密码功能。</p>
              <p style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
                后续版本将支持在应用内修改密码。
              </p>
            </div>
          ),
          okText: "知道了",
        });
      },
    },
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <header className="top-nav-bar">
      <div className="top-nav-bar-left">
        <span className="top-nav-bar-logo">{title}</span>
      </div>
      {showActions && (
        <div className="top-nav-bar-right">
          <Button type="primary" icon={<PlusOutlined />} className="top-nav-bar-action-btn" onClick={handleNewInterview}>
            开启新面试
          </Button>
          <Space size={8}>
            <Tooltip title={`切换到${themeLabels[nextMode]}`}>
              <Button
                type="text"
                icon={themeIcons[themeMode]}
                className="top-nav-bar-icon-btn"
                aria-label={`切换到${themeLabels[nextMode]}`}
                onClick={() => setThemeMode(nextMode)}
              />
            </Tooltip>
            <Button type="text" icon={<BellOutlined />} className="top-nav-bar-icon-btn" aria-label="通知" />
            <Dropdown menu={{ items: userMenuItems }} trigger={["click"]} placement="bottomRight">
              <button type="button" className="top-nav-bar-user" aria-label="用户菜单">
                <div className="top-nav-bar-avatar" aria-hidden="true">
                  <span>{user ? getInitials(user.fullName || user.email) : "U"}</span>
                </div>
                <span className="top-nav-bar-username">{user?.fullName || "用户"}</span>
                <DownOutlined style={{ fontSize: 10 }} aria-hidden="true" />
              </button>
            </Dropdown>
          </Space>
        </div>
      )}
      <style>{`
        .top-nav-bar {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: var(--topbar-height);
          z-index: 100;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 32px;
          background: var(--topnav-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: var(--topnav-shadow);
        }

        .top-nav-bar-left {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .top-nav-bar-logo {
          font-size: 20px;
          font-weight: 800;
          color: var(--color-primary);
          letter-spacing: -0.02em;
        }

        .top-nav-bar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .top-nav-bar-action-btn {
          border-radius: var(--radius-full);
          box-shadow: var(--shadow-glow-primary);
        }

        .top-nav-bar-icon-btn {
          color: var(--color-text-secondary);
          border-radius: var(--radius-full);
        }

        .top-nav-bar-icon-btn:hover {
          color: var(--color-primary);
          background: rgba(22, 119, 255, 0.1);
        }

        .top-nav-bar-user {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: var(--radius-full);
          cursor: pointer;
          transition: background var(--transition-fast);
          background: none;
          border: none;
          font: inherit;
          color: inherit;
        }

        .top-nav-bar-user:hover {
          background: var(--topnav-user-hover-bg);
        }

        .top-nav-bar-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-primary), #69b1ff);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
        }

        .top-nav-bar-username {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text);
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 768px) {
          .top-nav-bar {
            padding: 0 16px;
          }

          .top-nav-bar-action-btn {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
