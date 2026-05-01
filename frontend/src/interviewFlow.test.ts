import { describe, expect, it, vi } from "vitest";

import {
  createDraft,
  createSessionFromDraft,
  generateMarkdownReport,
  recordAnswer
} from "./interviewFlow";

describe("interviewFlow", () => {
  it("creates a question session from draft inputs", () => {
    const draft = createDraft();
    draft.candidateName = "张三";
    draft.resume = "候选人负责 AI 面试平台，包含问题生成和面试纪要。";
    draft.jobDescription = "岗位是 AI 产品全栈工程师，需要 Python、TypeScript 和 LLM 应用经验。";
    draft.interviewGoal = "评估专业能力、项目经验、技术实现能力、应变能力。";

    const session = createSessionFromDraft(draft);

    expect(session.candidateName).toBe("张三");
    expect(session.role).toBe("AI 产品全栈工程师");
    expect(session.questions.length).toBeGreaterThanOrEqual(6);
    expect(session.currentQuestion?.id).toBe("q_001");
  });

  it("records an answer and generates an auditable report", () => {
    vi.stubEnv("VITE_INTERVIEW_FILLER_WORDS", "嗯,啊");
    const session = createSessionFromDraft(createDraft());
    const updated = recordAnswer(session, {
      text: "嗯，我主要负责问题生成和纪要模块，啊，也处理过追问策略。",
      durationSec: 76
    });

    expect(updated.answers).toHaveLength(1);
    expect(updated.answers[0].fillerWordCount).toBe(2);
    expect(updated.currentQuestion?.id).toBe("q_002");

    const report = generateMarkdownReport(updated);
    expect(report).toContain("# 智能面试纪要");
    expect(report).toContain("问题生成和纪要模块");
    expect(report).toContain("待人工确认");
    vi.unstubAllEnvs();
  });
});
