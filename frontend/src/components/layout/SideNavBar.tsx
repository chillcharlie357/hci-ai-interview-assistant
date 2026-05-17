/**
 * 侧边导航栏组件
 * 参考 ai_9-12 设计
 */

import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "antd";
import {
  DashboardOutlined,
  SettingOutlined,
  VideoCameraOutlined,
  BarChartOutlined,
  CustomerServiceOutlined,
  RobotOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../../store";

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  getPath: (sessionId: string | null) => string;
}

const navItems: NavItem[] = [
  { key: "dashboard", label: "控制面板", icon: <DashboardOutlined />, getPath: () => "/recruiter" },
  { key: "setup", label: "面试配置", icon: <SettingOutlined />, getPath: () => "/recruiter/setup" },
  { key: "interview", label: "面试间", icon: <VideoCameraOutlined />, getPath: (sessionId) => sessionId ? `/interview/${sessionId}` : "/interview" },
  { key: "report", label: "评价报告", icon: <BarChartOutlined />, getPath: (sessionId) => sessionId ? `/report/${sessionId}` : "/report" },
];

export function SideNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const interviewSession = useAppStore((state) => state.interviewSession);
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const setCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const sessionId = interviewSession?.id ?? null;

  // 没有活跃面试时隐藏"面试间"导航项
  const visibleNavItems = navItems.filter((item) => item.key !== "interview" || sessionId);

  // 根据路由自动更新激活项
  const getActiveKey = (pathname: string) => {
    if (pathname.startsWith("/interview")) return "interview";
    if (pathname.startsWith("/report")) return "report";
    if (pathname.startsWith("/recruiter/setup")) return "setup";
    return "dashboard";
  };

  const activeKey = getActiveKey(location.pathname);

  const handleNavClick = (item: NavItem) => {
    navigate(item.getPath(sessionId));
  };

  return (
    <aside className={`side-nav-bar ${collapsed ? "collapsed" : ""}`}>
      {/* 顶部区域：面试管家 + 收起按钮 */}
      <div className="side-nav-bar-header">
        {collapsed ? (
          <button
            className="side-nav-bar-collapse-btn"
            onClick={() => setCollapsed(false)}
            title="展开菜单"
          >
            <MenuUnfoldOutlined />
          </button>
        ) : (
          <>
            <div className="side-nav-bar-assistant">
              <div className="side-nav-bar-assistant-avatar">
                <RobotOutlined />
              </div>
              <div className="side-nav-bar-assistant-info">
                <h3>面试管家</h3>
                <div className="side-nav-bar-assistant-status">
                  <span className="status-dot" />
                  <span>在线活跃</span>
                </div>
              </div>
            </div>
            <button
              className="side-nav-bar-collapse-btn"
              onClick={() => setCollapsed(true)}
              title="收起菜单"
            >
              <MenuFoldOutlined />
            </button>
          </>
        )}
      </div>

      {/* 导航菜单 */}
      <nav className="side-nav-bar-menu">
        {visibleNavItems.map((item) => (
          <button
            key={item.key}
            className={`side-nav-bar-menu-item ${activeKey === item.key ? "active" : ""}`}
            onClick={() => handleNavClick(item)}
            title={collapsed ? item.label : undefined}
          >
            <span className="side-nav-bar-menu-icon">{item.icon}</span>
            {!collapsed && <span className="side-nav-bar-menu-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* 底部支持按钮 */}
      <div className="side-nav-bar-footer">
        <Button
          icon={<CustomerServiceOutlined />}
          block
          className="side-nav-bar-support-btn"
        >
          {!collapsed && "联系技术支持"}
        </Button>
      </div>

      <style>{`
        .side-nav-bar {
          position: fixed;
          left: 0;
          top: 0;
          width: var(--sidebar-width);
          height: calc(100vh - var(--topbar-height));
          margin-top: var(--topbar-height);
          z-index: 90;
          display: flex;
          flex-direction: column;
          padding: 16px;
          background: var(--sidenav-bg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-right: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: var(--sidenav-shadow);
          border-radius: 0 24px 0 0;
          transition: width 0.3s ease, padding 0.3s ease;
        }

        .side-nav-bar.collapsed {
          width: 72px;
          padding: 16px 8px;
        }

        .side-nav-bar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          min-height: 40px;
        }

        .side-nav-bar.collapsed .side-nav-bar-header {
          justify-content: center;
        }

        .side-nav-bar-assistant {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .side-nav-bar-assistant-avatar {
          width: 40px;
          height: 40px;
          border-radius: var(--radius);
          background: linear-gradient(135deg, #91caff, #1677ff);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 20px;
          box-shadow: 0 4px 12px rgba(22, 119, 255, 0.3);
          flex-shrink: 0;
        }

        .side-nav-bar-assistant-info h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-primary);
          margin: 0;
        }

        .side-nav-bar-assistant-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--color-text-tertiary);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-success);
          animation: breathe 2s ease-in-out infinite;
        }

        .side-nav-bar-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: var(--radius);
          background: transparent;
          color: var(--color-text-tertiary);
          font-size: 16px;
          cursor: pointer;
          transition: all var(--transition-normal);
          flex-shrink: 0;
        }

        .side-nav-bar-collapse-btn:hover {
          background: var(--sidenav-hover-bg);
          color: var(--color-primary);
        }

        .side-nav-bar-menu {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .side-nav-bar-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border: none;
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--color-text-secondary);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition-normal);
          text-align: left;
          width: 100%;
        }

        .side-nav-bar.collapsed .side-nav-bar-menu-item {
          padding: 12px;
          justify-content: center;
        }

        .side-nav-bar-menu-item:hover {
          background: var(--sidenav-hover-bg);
          color: var(--color-primary);
        }

        .side-nav-bar-menu-item.active {
          background: var(--sidenav-active-bg);
          color: var(--color-primary);
          font-weight: 600;
        }

        .side-nav-bar.collapsed .side-nav-bar-menu-item.active {
          background: var(--sidenav-active-bg);
        }

        .side-nav-bar-menu-icon {
          font-size: 18px;
          flex-shrink: 0;
        }

        .side-nav-bar-footer {
          padding-top: 16px;
          border-top: 1px solid var(--sidenav-footer-border);
        }

        .side-nav-bar-support-btn {
          color: var(--color-primary);
          border-color: rgba(22, 119, 255, 0.3);
          border-radius: var(--radius-md);
        }

        .side-nav-bar.collapsed .side-nav-bar-support-btn {
          padding: 8px;
        }

        .side-nav-bar-support-btn:hover {
          background: rgba(22, 119, 255, 0.08);
          border-color: var(--color-primary);
        }

        @media (max-width: 1200px) {
          .side-nav-bar {
            display: none;
          }
        }
      `}</style>
    </aside>
  );
}
