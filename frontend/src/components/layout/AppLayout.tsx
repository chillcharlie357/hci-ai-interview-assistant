/**
 * 主布局组件
 * 包含顶部导航、侧边导航和内容区
 */

import { ReactNode } from "react";
import { TopNavBar } from "./TopNavBar";
import { SideNavBar } from "./SideNavBar";
import { useAppStore } from "../../store";

interface AppLayoutProps {
  children: ReactNode;
  /** 是否显示侧边栏 */
  showSidebar?: boolean;
  /** 是否显示顶部导航操作按钮 */
  showTopBarActions?: boolean;
  /** 页面标题 */
  title?: string;
}

export function AppLayout({
  children,
  showSidebar = true,
  showTopBarActions = true,
  title,
}: AppLayoutProps) {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);

  return (
    <div className="app-layout">
      <TopNavBar title={title} showActions={showTopBarActions} />
      {showSidebar && <SideNavBar />}
      <main
        className={`app-layout-content ${showSidebar ? "with-sidebar" : ""} ${showSidebar && sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        {children}
      </main>
      <style>{`
        .app-layout {
          min-height: 100vh;
          background: var(--color-bg-layout);
        }

        .app-layout-content {
          min-height: 100vh;
          padding-top: var(--topbar-height);
          transition: margin-left 0.3s ease;
        }

        .app-layout-content.with-sidebar {
          margin-left: var(--sidebar-width);
        }

        .app-layout-content.with-sidebar.sidebar-collapsed {
          margin-left: 72px;
        }

        @media (max-width: 1200px) {
          .app-layout-content.with-sidebar {
            margin-left: 0;
          }

          .app-layout-content.with-sidebar.sidebar-collapsed {
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
}
