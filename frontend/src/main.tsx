/**
 * 应用入口
 * 使用 React Router 实现路由
 */

import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";

import { themeConfig } from "./theme/config";
import useIllustrationTheme from "./theme/illustrationTheme";
import { AppLayout } from "./components/layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DashboardPage } from "./pages/DashboardPage";
import { RecruiterPage } from "./pages/RecruiterPage";
import { InterviewPage } from "./pages/InterviewPage";
import { ReportPage } from "./pages/ReportPage";
import { NoSessionPage } from "./pages/NoSessionPage";
import { LoginPage, RegisterPage, ProtectedRoute } from "./auth";
import { useThemeStore } from "./store";

// 导入全局样式
import "./styles/global.css";

function App() {
  const mode = useThemeStore((s) => s.mode);
  const illustrationTheme = useIllustrationTheme();

  // 根据主题模式选择配置
  const currentThemeConfig = mode === "illustration" ? illustrationTheme : { theme: themeConfig };

  return (
    <ConfigProvider {...currentThemeConfig} locale={zhCN}>
      <AntApp>
        <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            {/* 公开路由 - 登录/注册 */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* 受保护路由 - 招聘端 */}
            <Route
              path="/recruiter"
              element={
                <ProtectedRoute>
                  <AppLayout title="AI 智能面试系统">
                    <DashboardPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/setup"
              element={
                <ProtectedRoute>
                  <AppLayout title="面试配置">
                    <RecruiterPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            {/* 面试端路由 - 带侧边栏 */}
            <Route
              path="/interview/:sessionId"
              element={
                <ProtectedRoute>
                  <AppLayout showSidebar={true} showTopBarActions={false} title="AI 面试间">
                    <InterviewPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            {/* 面试间入口 - 无 sessionId 时显示提示 */}
            <Route
              path="/interview"
              element={
                <ProtectedRoute>
                  <AppLayout title="AI 面试间">
                    <NoSessionPage type="interview" />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            {/* 报告页路由 */}
            <Route
              path="/report/:sessionId"
              element={
                <ProtectedRoute>
                  <AppLayout title="AI 智能面试系统">
                    <ReportPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            {/* 报告入口 - 无 sessionId 时显示提示 */}
            <Route
              path="/report"
              element={
                <ProtectedRoute>
                  <AppLayout title="评价报告">
                    <NoSessionPage type="report" />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            {/* 默认重定向 */}
            <Route path="/" element={<Navigate to="/recruiter" replace />} />
            <Route path="*" element={<Navigate to="/recruiter" replace />} />
          </Routes>
        </BrowserRouter>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
