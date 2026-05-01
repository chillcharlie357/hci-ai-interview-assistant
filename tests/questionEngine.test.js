import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateInterviewQuestions, extractSignals } from "../src/questionEngine.js";

describe("extractSignals", () => {
  it("extracts role, skills, projects, and interview goals from source text", () => {
    const signals = extractSignals({
      resume: "候选人做过实时音视频项目，使用 React、Node.js、WebRTC 和 Python OCR pipeline。",
      jobDescription: "招聘前端工程师，需要 React、WebRTC、LiveKit、ASR 经验，负责 AI 面试系统。",
      interviewGoal: "重点评估技术实现能力、项目经验和应变能力。"
    });

    assert.equal(signals.role, "前端工程师");
    assert.deepEqual(signals.skills.slice(0, 4), ["React", "Node.js", "WebRTC", "Python"]);
    assert.ok(signals.projects.some((project) => project.includes("实时音视频")));
    assert.ok(signals.goals.includes("技术实现能力"));
    assert.ok(signals.goals.includes("项目经验"));
  });
});

describe("generateInterviewQuestions", () => {
  it("generates structured questions with dimensions, follow-ups, and evidence hints", () => {
    const result = generateInterviewQuestions({
      resume: "候选人负责过智能面试平台，包含 React 前端、Node.js 服务、WebRTC 会议、PaddleOCR 截图识别。",
      jobDescription: "岗位是 AI 产品全栈工程师，需要 React、Node.js、LiveKit、ASR、OCR、LLM 应用经验。",
      interviewGoal: "评估专业能力、项目经验、技术实现能力、应变能力。"
    });

    assert.equal(result.role, "AI 产品全栈工程师");
    assert.ok(result.questions.length >= 6);

    const dimensions = result.questions.map((question) => question.dimension);
    assert.ok(dimensions.includes("专业能力"));
    assert.ok(dimensions.includes("项目经验"));
    assert.ok(dimensions.includes("技术实现能力"));
    assert.ok(dimensions.includes("应变能力"));

    for (const question of result.questions) {
      assert.ok(question.id.startsWith("q_"));
      assert.ok(question.prompt.length > 10);
      assert.ok(question.followUps.length >= 1);
      assert.ok(question.evidenceHints.length >= 1);
    }
  });
});
