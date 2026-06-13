import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

import { QATimeline } from "./QATimeline";
import type { InterviewSession } from "@/interviewFlow";

function makeSession(overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: "s1",
    candidateName: "张三",
    role: "前端",
    questions: [
      {
        id: "q_001",
        dimension: "专业能力",
        prompt: "请介绍你的技术栈",
        followUps: [],
        evidenceHints: [],
      },
    ],
    currentIndex: 0,
    currentQuestion: null,
    answers: [
      {
        questionId: "q_001",
        dimension: "专业能力",
        prompt: "请介绍你的技术栈",
        text: "我熟悉 React 和 TypeScript",
        durationSec: 30,
        wordCount: 5,
        fillerWordCount: 0,
        recordedAt: new Date().toISOString(),
        videoTimestampSec: 15.0,
      },
    ],
    events: [],
    llmStatus: "ok",
    videoEvents: [],
    keyframes: [],
    videoSummary: { eventCount: 0, keyframeCount: 0, eventTypes: [] },
    enableVideoObservation: true,
    ...overrides,
  };
}

describe("QATimeline", () => {
  it("answer 有 videoTimestampSec 且 onSeekVideo 存在时显示回放按钮", () => {
    const session = makeSession();
    const { container } = render(
      <QATimeline session={session} onSeekVideo={vi.fn()} />
    );
    expect(container.textContent).toContain("回放答题");
  });

  it("点击回放按钮调用 onSeekVideo 并传入正确时间戳", () => {
    const onSeekVideo = vi.fn();
    const session = makeSession();
    const { getByText } = render(
      <QATimeline session={session} onSeekVideo={onSeekVideo} />
    );
    fireEvent.click(getByText("回放答题"));
    expect(onSeekVideo).toHaveBeenCalledWith(15.0);
  });

  it("answer 无 videoTimestampSec 时不显示回放按钮", () => {
    const session = makeSession({
      answers: [
        {
          questionId: "q_001",
          dimension: "专业能力",
          prompt: "请介绍你的技术栈",
          text: "回答",
          durationSec: 10,
          wordCount: 1,
          fillerWordCount: 0,
          recordedAt: new Date().toISOString(),
        },
      ],
    });
    const { container } = render(
      <QATimeline session={session} onSeekVideo={vi.fn()} />
    );
    expect(container.textContent).not.toContain("回放");
  });

  it("onSeekVideo 为 undefined 时不显示回放按钮", () => {
    const session = makeSession();
    const { container } = render(<QATimeline session={session} />);
    expect(container.textContent).not.toContain("回放");
  });

  it("渲染问题和回答摘要", () => {
    const session = makeSession();
    const { container } = render(<QATimeline session={session} />);
    expect(container.textContent).toContain("请介绍你的技术栈");
    expect(container.textContent).toContain("我熟悉 React 和 TypeScript");
  });
});
