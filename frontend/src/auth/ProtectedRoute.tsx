/**
 * 路由守卫组件
 */

import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { isAuthEnabled } from "../config";

interface ProtectedRouteProps {
  children: ReactNode;
  fallbackPath?: string;
}

export function ProtectedRoute({ children, fallbackPath = "/login" }: ProtectedRouteProps) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  // 如果认证未启用（开发模式），直接放行
  if (!isAuthEnabled()) {
    return <>{children}</>;
  }

  // 检查登录状态
  if (!user || !accessToken) {
    return <Navigate to={fallbackPath} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
