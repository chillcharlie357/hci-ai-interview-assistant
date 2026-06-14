import { describe, expect, it } from "vitest";

import {
  isLikelyPromptEcho,
  looksLikeInterviewerPrompt,
  shouldIgnoreAsrTranscript,
} from "./asrTranscriptGuard";

describe("asrTranscriptGuard", () => {
  const prompt = "候选人，你好。接下来是系统设计相关问题。请描述你设计的企业内部任务编排平台的整体架构，包括关键组件、数据流以及如何支持租户隔离和审计日志。";

  it("detects direct interviewer prompt echoes", () => {
    expect(isLikelyPromptEcho("请描述你设计的企业内部任务编排平台的整体架构。", [prompt])).toBe(true);
  });

  it("detects prompt-like hallucinated interviewer questions", () => {
    expect(looksLikeInterviewerPrompt("如果依赖的外部服务使用数据库，你是如何设计日志系统在你的平台?")).toBe(true);
  });

  it("ignores interviewer-like ASR text before the candidate starts answering", () => {
    expect(shouldIgnoreAsrTranscript({
      transcript: "如果依赖的外部服务使用数据库，你是如何设计日志系统在你的平台?",
      prompts: [prompt],
      answerText: "",
      asrStartedAtMs: 1000,
      nowMs: 9000,
    })).toBe(true);
  });

  it("keeps candidate answers that explain a conditional design", () => {
    expect(shouldIgnoreAsrTranscript({
      transcript: "如果依赖外部服务，我会用 outbox 和重试队列隔离失败。",
      prompts: [prompt],
      answerText: "",
      asrStartedAtMs: 1000,
      nowMs: 9000,
    })).toBe(false);
  });

  it("keeps non-echo text after the answer has content", () => {
    expect(shouldIgnoreAsrTranscript({
      transcript: "我会先拆分调度服务、执行器和审计日志三个模块。",
      prompts: [prompt],
      answerText: "我先讲整体架构。",
      asrStartedAtMs: 1000,
      nowMs: 3000,
    })).toBe(false);
  });
});
