export const DEFAULT_FILLER_WORDS: string[] = ["嗯", "啊", "呃", "额", "那个", "就是", "然后", "um", "uh", "erm"];

/**
 * 返回 API 基础 URL。
 * - Docker 环境：从 VITE_API_BASE_URL 读取（构建时注入或运行时注入）
 * - 本地开发：回退到空字符串，由 Vite proxy 代理到后端
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || "";
}

/** 当前运行模式（来自 VITE_APP_ENV 环境变量） */
export function getAppEnv(): "development" | "production" {
  return (import.meta.env.VITE_APP_ENV as "development" | "production") || "production";
}

/** 是否在开发模式下运行（Vite dev server 或 Docker 开发模式） */
export function isDevMode(): boolean {
  return import.meta.env.DEV;
}

export function getFillerWords(): string[] {
  const configured = import.meta.env.VITE_INTERVIEW_FILLER_WORDS;
  if (!configured) {
    return DEFAULT_FILLER_WORDS;
  }
  const values = configured.split(",").map((value: string) => value.trim()).filter(Boolean);
  const merged = [...DEFAULT_FILLER_WORDS, ...values];
  return Array.from(new Set(merged.map((value) => value.trim()).filter(Boolean)));
}

/**
 * 检查是否启用认证
 * 前端通过环境变量 VITE_REQUIRE_AUTH 控制，后端通过 REQUIRE_AUTH 控制
 */
export function getLogLevel(): string {
  return (import.meta.env.VITE_LOG_LEVEL as string) || "info";
}

export function isAuthEnabled(): boolean {
  const value = import.meta.env.VITE_REQUIRE_AUTH;
  if (value === undefined) {
    return import.meta.env.PROD;
  }
  return value === "true";
}
