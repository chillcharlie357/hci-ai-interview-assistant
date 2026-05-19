/**
 * 结构化日志工具，用于前端可观测性。
 * 所有日志以 [HCI:component] 前缀输出，方便 agent 在 console 中过滤。
 *
 * 使用示例：
 *   const log = createLogger("api");
 *   log.info("GET /api/sessions -> 200 (42ms)");
 *   log.warn("speech chunk upload failed", err);
 *
 * 日志级别控制：
 *   VITE_LOG_LEVEL=debug   输出所有日志
 *   VITE_LOG_LEVEL=info    输出 info/warn/error（默认）
 *   VITE_LOG_LEVEL=warn    仅输出 warn/error
 *   VITE_LOG_LEVEL=error   仅输出 error
 *   不设置或空字符串       等同于 info
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const env =
    typeof import.meta !== "undefined" &&
    (import.meta as unknown as Record<string, unknown>).env
      ? (
          import.meta.env as Record<string, string | undefined>
        ).VITE_LOG_LEVEL
      : undefined;
  if (env && env in LOG_LEVELS) return env as LogLevel;
  return "info";
}

const currentLevel = getConfiguredLevel();
const minLevel = LOG_LEVELS[currentLevel];

export function createLogger(component: string) {
  const prefix = `[HCI:${component}]`;
  return {
    debug: (...args: unknown[]) => {
      if (minLevel <= 0) console.debug(prefix, ...args);
    },
    info: (...args: unknown[]) => {
      if (minLevel <= 1) console.info(prefix, ...args);
    },
    warn: (...args: unknown[]) => {
      if (minLevel <= 2) console.warn(prefix, ...args);
    },
    error: (...args: unknown[]) => {
      if (minLevel <= 3) console.error(prefix, ...args);
    },
  };
}
