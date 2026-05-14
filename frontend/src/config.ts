export const DEFAULT_FILLER_WORDS: string[] = [];

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
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
    // 如果未设置，默认与后端保持一致：开发模式关闭
    return import.meta.env.PROD;
  }
  return value === "true";
}
