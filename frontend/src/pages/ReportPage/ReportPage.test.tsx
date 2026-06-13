import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { InterviewSession } from "@/interviewFlow";

const mockFetchVideoUrl = vi.fn().mockResolvedValue(
  "https://example.com/video/test-session-001.webm"
);
const mockGetSession = vi.fn();
const mockFetchReport = vi.fn();

vi.mock("@/apiClient", () => ({
  fetchVideoUrl: (...args: unknown[]) => mockFetchVideoUrl(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
  fetchReport: (...args: unknown[]) => mockFetchReport(...args),
  downloadPdfReport: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual };
});

vi.mock("@/store", () => ({
  useAppStore: vi.fn(() => ({ interviewSession: null })),
}));

vi.mock("@/reportDownload", () => ({
  downloadMarkdownReport: vi.fn(),
  downloadPdfReport: vi.fn(),
}));

vi.mock("antd", async () => {
  const actual = await vi.importActual("antd");
  return { ...actual };
});

import { ReportPage } from "./index";

const mockSession: InterviewSession = {
  id: "test-session-001",
  userId: "test-user",
  createdAt: "2026-06-03T00:00:00Z",
  candidateName: "张三",
  role: "高级前端工程师",
  questions: [
    {
      id: "q_001",
      dimension: "专业能力",
      prompt: "请介绍你的技术栈",
      followUps: ["你最擅长哪一项？"],
      evidenceHints: ["关注技术水平"],
    },
    {
      id: "q_002",
      dimension: "项目经验",
      prompt: "请讲一下项目经验",
      followUps: ["你的职责是什么？"],
      evidenceHints: ["关注项目深度"],
    },
  ],
  currentIndex: 1,
  currentQuestion: null,
  answers: [
    {
      questionId: "q_001",
      dimension: "专业能力",
      prompt: "请介绍你的技术栈",
      text: "我熟悉 React 和 TypeScript，有多年全栈经验。",
      durationSec: 45,
      wordCount: 12,
      fillerWordCount: 2,
      recordedAt: "2026-06-03T00:01:00Z",
      videoTimestampSec: 10.5,
    },
    {
      questionId: "q_002",
      dimension: "项目经验",
      prompt: "请讲一下项目经验",
      text: "做过B2B数据平台前端架构升级。",
      durationSec: 30,
      wordCount: 8,
      fillerWordCount: 0,
      recordedAt: "2026-06-03T00:03:00Z",
      videoTimestampSec: 55.0,
    },
  ],
  events: [],
  llmStatus: "ok",
  videoEvents: [],
  keyframes: [
    {
      timestamp: 120,
      reason: "low_light",
      dataUrl: "data:image/jpeg;base64,test123",
      videoTimestampSec: 25.0,
    },
    {
      timestamp: 240,
      reason: "high_motion",
      videoTimestampSec: 70.0,
    },
  ],
  videoSummary: { eventCount: 0, keyframeCount: 2, eventTypes: [] },
  enableVideoObservation: true,
  videoPath: "test-user/test-session-001.webm",
  videoDurationSec: 120,
};

describe("ReportPage (集成)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(mockSession);
    mockFetchReport.mockResolvedValue({
      report: "# 测试报告\n这是测试内容。",
    });
  });

  function renderPage(sessionId = "test-session-001") {
    return render(
      React.createElement(
        MemoryRouter,
        { initialEntries: [`/report/${sessionId}`] },
        React.createElement(Routes, null, [
          React.createElement(Route, {
            key: "report",
            path: "/report/:sessionId",
            element: React.createElement(ReportPage),
          }),
        ])
      )
    );
  }

  it("session.videoPath 存在时渲染 VideoPlaybackCard", async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(
        container.querySelector(".video-playback-card")
      ).toBeTruthy();
    }, { timeout: 5000 });
  });

  it("videoPath 存在时自动调用 fetchVideoUrl", async () => {
    renderPage();
    await waitFor(() => {
      expect(mockFetchVideoUrl).toHaveBeenCalledWith("test-session-001");
    }, { timeout: 5000 });
  });

  it("渲染 KeyframesGallery 关键帧", async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const gallery = container.querySelector(".keyframes-card");
      expect(gallery).toBeTruthy();
      const items = gallery!.querySelectorAll(".keyframe-item");
      expect(items.length).toBe(2);
    }, { timeout: 5000 });
  });

  it("点击关键帧调用 fetchVideoUrl", async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector(".keyframe-item")).toBeTruthy();
    }, { timeout: 5000 });

    const items = container.querySelectorAll(".keyframe-item");
    fireEvent.click(items[0]);
    expect(mockFetchVideoUrl).toHaveBeenCalled();
  });

  it("QATimeline 有 videoTimestampSec 时显示回放按钮", async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const qaCard = container.querySelector(".qa-card");
      expect(qaCard).toBeTruthy();
      expect(qaCard!.textContent).toContain("回放答题");
    }, { timeout: 5000 });
  });

  it("videoPath 为 null 时不渲染 VideoPlaybackCard", async () => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      ...mockSession,
      videoPath: null,
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(
        container.querySelector(".video-playback-card")
      ).toBeNull();
    }, { timeout: 5000 });
  });

  it("渲染 RatingsCard 和 SkillsRadar", async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("AI 综合评分");
    }, { timeout: 5000 });
  });

  it("渲染完整 Markdown 报告", async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("测试报告");
    }, { timeout: 5000 });
  });
});
