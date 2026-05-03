/**
 * 应用入口
 * 使用 React Router 实现路由
 */

import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";

import { themeConfig } from "./theme/config";
import { AppLayout } from "./components/layout";
import { RecruiterPage } from "./pages/RecruiterPage";
import { InterviewPage } from "./pages/InterviewPage";
import { ReportPage } from "./pages/ReportPage";
import { NoSessionPage } from "./pages/NoSessionPage";

// 导入全局样式
import "./styles/global.css";

function App() {
  return (
    <ConfigProvider theme={themeConfig} locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            {/* 招聘端路由 */}
            <Route
              path="/recruiter"
              element={
                <AppLayout title="AI 智能面试系统">
                  <RecruiterPage />
                </AppLayout>
              }
            />
            <Route
              path="/recruiter/setup"
              element={
                <AppLayout title="AI 智能面试系统">
                  <RecruiterPage />
                </AppLayout>
              }
            />

            {/* 面试端路由 - 全屏沉浸式，不显示侧边栏 */}
            <Route
              path="/interview/:sessionId"
              element={
                <AppLayout showSidebar={false} showTopBarActions={false} title="AI 面试间">
                  <InterviewPage />
                </AppLayout>
              }
            />
            {/* 面试间入口 - 无 sessionId 时显示提示 */}
            <Route
              path="/interview"
              element={
                <AppLayout title="AI 面试间">
                  <NoSessionPage type="interview" />
                </AppLayout>
              }
            />

            {/* 报告页路由 */}
            <Route
              path="/report/:sessionId"
              element={
                <AppLayout title="AI 智能面试系统">
                  <ReportPage />
                </AppLayout>
              }
            />
            {/* 报告入口 - 无 sessionId 时显示提示 */}
            <Route
              path="/report"
              element={
                <AppLayout title="评价报告">
                  <NoSessionPage type="report" />
                </AppLayout>
              }
            />

            {/* 默认重定向到招聘端 */}
            <Route path="/" element={<Navigate to="/recruiter" replace />} />
            <Route path="*" element={<Navigate to="/recruiter" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
