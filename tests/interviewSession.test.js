import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createInterviewSession,
  recordAnswer,
  buildAvatarPrompt,
  generateMarkdownReport
} from "../src/interviewSession.js";

const questions = [
  {
    id: "q_001",
    dimension: "项目经验",
    prompt: "请介绍你做过的实时音视频项目。",
    followUps: ["你在项目里负责哪一块？"],
    evidenceHints: ["关注个人贡献。"]
  },
  {
    id: "q_002",
    dimension: "技术实现能力",
    prompt: "你会如何设计面试问题生成模块？",
    followUps: ["如何处理简历和 JD 信息不足？"],
    evidenceHints: ["关注方案完整性。"]
  }
];

describe("createInterviewSession", () => {
  it("creates a session with queued questions and an opening avatar prompt", () => {
    const session = createInterviewSession({
      candidateName: "张三",
      role: "AI 产品全栈工程师",
      questions
    });

    assert.equal(session.candidateName, "张三");
    assert.equal(session.currentQuestion.id, "q_001");
    assert.ok(session.events[0].message.includes("数字人面试官已准备"));
    assert.ok(buildAvatarPrompt(session).includes("请介绍你做过的实时音视频项目"));
  });
});

describe("recordAnswer", () => {
  it("records answer metrics and advances the current question", () => {
    const session = createInterviewSession({
      candidateName: "张三",
      role: "AI 产品全栈工程师",
      questions
    });

    const updated = recordAnswer(session, {
      text: "嗯，我主要负责 WebRTC 会议和 React 前端，啊，也处理过录制链路。",
      durationSec: 76
    });

    assert.equal(updated.answers.length, 1);
    assert.equal(updated.answers[0].questionId, "q_001");
    assert.equal(updated.answers[0].fillerWordCount, 2);
    assert.equal(updated.answers[0].durationSec, 76);
    assert.equal(updated.currentQuestion.id, "q_002");
    assert.ok(updated.events.some((event) => event.type === "answer_recorded"));
  });
});

describe("generateMarkdownReport", () => {
  it("generates a report with overview, answers, metrics, and follow-up hints", () => {
    let session = createInterviewSession({
      candidateName: "张三",
      role: "AI 产品全栈工程师",
      questions
    });

    session = recordAnswer(session, {
      text: "我主要负责实时音视频会议和面试录制，解决过网络抖动下的状态同步。",
      durationSec: 90
    });

    const report = generateMarkdownReport(session);

    assert.ok(report.includes("# 智能面试纪要"));
    assert.ok(report.includes("张三"));
    assert.ok(report.includes("项目经验"));
    assert.ok(report.includes("实时音视频会议"));
    assert.ok(report.includes("你在项目里负责哪一块？"));
    assert.ok(report.includes("待人工确认"));
  });
});
