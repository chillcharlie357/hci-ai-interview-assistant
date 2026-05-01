import { describe, expect, it } from "vitest";

import { createSession, submitAnswer, submitVideoEvent } from "./apiClient";
import type { DraftInput } from "./interviewFlow";

describe("apiClient", () => {
  it("creates a session through the Python API and maps snake_case response fields", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          id: "session_1",
          candidate_name: "张三",
          role: "AI 产品全栈工程师",
          questions: [
            {
              id: "q_001",
              dimension: "项目经验",
              prompt: "请介绍项目。",
              follow_ups: ["你负责哪一块？"],
              evidence_hints: ["关注个人贡献。"]
            }
          ],
          current_index: 0,
          current_question: {
            id: "q_001",
            dimension: "项目经验",
            prompt: "请介绍项目。",
            follow_ups: ["你负责哪一块？"],
            evidence_hints: ["关注个人贡献。"]
          },
          answers: [],
          events: []
        }),
        { status: 201 }
      );

    const draft: DraftInput = {
      candidateName: "张三",
      resume: "AI 面试平台",
      jobDescription: "岗位是 AI 产品全栈工程师",
      interviewGoal: "评估项目经验"
    };

    const session = await createSession(draft, { fetcher });

    expect(session.candidateName).toBe("张三");
    expect(session.currentQuestion?.followUps[0]).toBe("你负责哪一块？");
  });

  it("submits an answer and returns the generated report", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          id: "session_1",
          candidate_name: "张三",
          role: "AI 产品全栈工程师",
          questions: [],
          current_index: 1,
          current_question: null,
          answers: [
            {
              question_id: "q_001",
              dimension: "项目经验",
              prompt: "请介绍项目。",
              text: "我负责问题生成。",
              duration_sec: 80,
              word_count: 9,
              filler_word_count: 0,
              recorded_at: "2026-05-01T00:00:00Z"
            }
          ],
          events: [],
          report: "# 智能面试纪要"
        }),
        { status: 200 }
      );

    const result = await submitAnswer("session_1", { text: "我负责问题生成。", durationSec: 80 }, { fetcher });

    expect(result.session.answers[0].questionId).toBe("q_001");
    expect(result.report).toBe("# 智能面试纪要");
  });

  it("submits a video event and maps video summary", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          id: "session_1",
          candidate_name: "张三",
          role: "AI 产品全栈工程师",
          questions: [],
          current_index: 0,
          current_question: null,
          answers: [],
          events: [],
          video_events: [
            {
              timestamp: 12.5,
              event_type: "low_light",
              confidence: 0.8,
              metrics: { face_present: true, brightness: 0.12, blur: 0.3, motion: 0.1 },
              keyframe_index: 0
            }
          ],
          keyframes: [{ timestamp: 12.5, reason: "low_light", data_url: "data:image/jpeg;base64,abc" }],
          video_summary: { event_count: 1, keyframe_count: 1, event_types: ["low_light"] },
          llm_status: "fallback"
        }),
        { status: 200 }
      );

    const session = await submitVideoEvent(
      "session_1",
      {
        timestamp: 12.5,
        eventType: "low_light",
        confidence: 0.8,
        metrics: { facePresent: true, brightness: 0.12, blur: 0.3, motion: 0.1 },
        keyframe: { reason: "low_light", dataUrl: "data:image/jpeg;base64,abc" }
      },
      { fetcher }
    );

    expect(session.videoSummary.eventCount).toBe(1);
    expect(session.keyframes[0].reason).toBe("low_light");
  });
});
