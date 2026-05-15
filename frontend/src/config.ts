export const DEFAULT_FILLER_WORDS: string[] = [];

/**
 * 返回 API 基础 URL。
 * - Docker 环境：从 VITE_API_BASE_URL 读取（构建时注入或运行时注入）
 * - 本地开发：回退到空字符串，由 Vite proxy 代理到后端
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || "";
}

/** 当前运行模式 */
export function getAppEnv(): "development" | "production" {
  return (import.meta.env.VITE_APP_ENV as "development" | "production") || "production";
}

export function getFillerWords(): string[] {
  const configured = import.meta.env.VITE_INTERVIEW_FILLER_WORDS;
  if (!configured) {
    return DEFAULT_FILLER_WORDS;
  }
  const values = configured.split(",").map((value: string) => value.trim()).filter(Boolean);
  return values.length > 0 ? values : DEFAULT_FILLER_WORDS;
}

/**
 * 检查是否启用认证
 * 前端通过环境变量 VITE_REQUIRE_AUTH 控制，后端通过 REQUIRE_AUTH 控制
 */
export function isAuthEnabled(): boolean {
  const value = import.meta.env.VITE_REQUIRE_AUTH;
  if (value === undefined) {
    return import.meta.env.PROD;
  }
  return value === "true";
}
