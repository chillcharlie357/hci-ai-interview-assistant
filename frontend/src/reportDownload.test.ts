import { describe, expect, it, vi } from "vitest";

import { buildReportFilename, downloadMarkdownReport } from "./reportDownload";

describe("reportDownload", () => {
  it("builds a safe markdown filename from candidate name and session id", () => {
    expect(buildReportFilename("张三 / AI 工程师", "session_123")).toBe("interview-report-张三-AI-工程师-session_123.md");
    expect(buildReportFilename("", "session_123")).toBe("interview-report-candidate-session_123.md");
  });

  it("downloads markdown through a browser anchor", () => {
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn(() => "blob:report");
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const anchor = {
      href: "",
      download: "",
      click
    };

    downloadMarkdownReport("report.md", "# 智能面试纪要", {
      createBlob: (parts, options) => ({ parts, options }),
      createObjectURL,
      revokeObjectURL,
      createAnchor: () => anchor,
      appendChild,
      removeChild
    });

    expect(createObjectURL).toHaveBeenCalledWith({
      parts: ["# 智能面试纪要"],
      options: { type: "text/markdown;charset=utf-8" }
    });
    expect(anchor.href).toBe("blob:report");
    expect(anchor.download).toBe("report.md");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });
});
