import { describe, expect, it } from "vitest";

import { requestAnswerHelp } from "./answerHelp";
import { createSessionFromDraft, createDraft } from "./interviewFlow";

describe("answerHelp", () => {
  it("builds a mock reference answer from the current session and draft", async () => {
    const session = createSessionFromDraft({
      ...createDraft(),
      candidateName: "张三",
      jobDescription: "岗位是 AI 产品全栈工程师，需要 Python、TypeScript 和 LLM 应用经验。",
      interviewGoal: "评估项目经验、技术实现能力。",
    });

    const help = await requestAnswerHelp(session, "我先讲项目背景，再讲实现细节。");

    expect(help.mode).toBe("fallback");
    expect(help.questionId).toBe(session.currentQuestion?.id);
    expect(help.referenceAnswer).toContain("参考这个回答结构");
    expect(help.outline.length).toBeGreaterThan(0);
    expect(help.keyPoints.some((item) => item.includes("保留你草稿"))).toBe(true);
  });
});
