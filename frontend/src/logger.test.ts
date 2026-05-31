import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_LOG_LEVEL", "info");
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function importLogger() {
    vi.resetModules();
    return import("./logger");
  }

  it("createLogger returns an object with debug, info, warn, error methods", async () => {
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    expect(log.debug).toBeInstanceOf(Function);
    expect(log.info).toBeInstanceOf(Function);
    expect(log.warn).toBeInstanceOf(Function);
    expect(log.error).toBeInstanceOf(Function);
  });

  it("logs info at VITE_LOG_LEVEL=info", async () => {
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    log.info("hello");
    expect(console.info).toHaveBeenCalledWith("[HCI:test] hello");
  });

  it("logs warn and error at VITE_LOG_LEVEL=info", async () => {
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    log.warn("warning message", "detail");
    log.error("error message");
    expect(console.warn).toHaveBeenCalledWith("[HCI:test] warning message", "detail");
    expect(console.error).toHaveBeenCalledWith("[HCI:test] error message");
  });

  it("does not log debug at VITE_LOG_LEVEL=info", async () => {
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    log.debug("debug message");
    expect(console.debug).not.toHaveBeenCalled();
  });

  it("logs debug at VITE_LOG_LEVEL=debug", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "debug");
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    log.debug("debug message");
    expect(console.debug).toHaveBeenCalledWith("[HCI:test] debug message");
  });

  it("suppresses info and debug at VITE_LOG_LEVEL=warn", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "warn");
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    log.debug("debug msg");
    log.info("info msg");
    log.warn("warn msg");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[HCI:test] warn msg");
  });

  it("only logs error at VITE_LOG_LEVEL=error", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "error");
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[HCI:test] error msg");
  });

  it("defaults to info level when VITE_LOG_LEVEL is not set", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "");
    const { createLogger } = await importLogger();
    const log = createLogger("test");
    log.debug("debug msg");
    log.info("info msg");
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith("[HCI:test] info msg");
  });

  it("prefixes all logs with [HCI:component]", async () => {
    const { createLogger } = await importLogger();
    const log = createLogger("api");
    log.info("request");
    log.warn("slow");
    log.error("fail");
    expect(console.info).toHaveBeenCalledWith("[HCI:api] request");
    expect(console.warn).toHaveBeenCalledWith("[HCI:api] slow");
    expect(console.error).toHaveBeenCalledWith("[HCI:api] fail");
  });
});
