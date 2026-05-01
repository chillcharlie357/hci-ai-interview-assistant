import { describe, expect, it } from "vitest";

import {
  createInterviewSessionFromPrep,
  createSession,
  fetchReport,
  getSession,
  requestLiveKitToken,
  submitAnswer,
  submitPrepFollowup,
  submitResume,
  submitVideoEvent
} from "./apiClient";
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

  it("uploads a resume and maps prep session followups", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          prep_session_id: "prep_1",
          candidate_name: "张三",
          resume_markdown_preview: "# 简历",
          followup_questions: ["请补充岗位要求。"],
          ready: false,
          ready_summary: null,
          llm_status: "fallback"
        }),
        { status: 201 }
      );

    const prep = await submitResume(
      {
        candidateName: "张三",
        fileName: "resume.pdf",
        contentType: "application/pdf",
        dataBase64: "abc"
      },
      { fetcher }
    );

    expect(prep.id).toBe("prep_1");
    expect(prep.followupQuestions[0]).toBe("请补充岗位要求。");
  });

  it("submits recruiter followup answers and creates an interview session", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/followups")) {
        return new Response(
          JSON.stringify({
            prep_session_id: "prep_1",
            candidate_name: "张三",
            resume_markdown_preview: "# 简历",
            followup_questions: [],
            ready: true,
            ready_summary: {
              role: "AI 产品全栈工程师",
              job_description: "负责 AI 面试平台。",
              interview_goal: "评估 LLM 应用。",
              focus_areas: ["工程落地"]
            },
            llm_status: "ok"
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          id: "session_1",
          candidate_name: "张三",
          role: "AI 产品全栈工程师",
          questions: [],
          current_index: 0,
          current_question: null,
          answers: [],
          events: [],
          report_visibility: "shared_with_candidate",
          meeting_room: "interview-session_1",
          enable_video_observation: true
        }),
        { status: 201 }
      );
    };

    const prep = await submitPrepFollowup("prep_1", "岗位看 LLM 应用", { fetcher });
    const session = await createInterviewSessionFromPrep(
      "prep_1",
      { reportVisibility: "shared_with_candidate", useLlmQuestions: true, enableVideoObservation: true },
      { fetcher }
    );

    expect(prep.readySummary?.role).toBe("AI 产品全栈工程师");
    expect(session.reportVisibility).toBe("shared_with_candidate");
    expect(session.meetingRoom).toBe("interview-session_1");
  });

  it("requests LiveKit tokens and report visibility", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("livekit-token")) {
        return new Response(JSON.stringify({ url: "wss://livekit.test", token: "jwt", room: "interview-session_1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ report: "# 智能面试纪要", llm_status: "fallback" }), { status: 200 });
    };

    const token = await requestLiveKitToken("session_1", { participantName: "张三", participantRole: "candidate" }, { fetcher });
    const report = await fetchReport("session_1", "candidate", { fetcher });

    expect(token.url).toBe("wss://livekit.test");
    expect(report.report).toContain("智能面试纪要");
  });

  it("fetches a session by id", async () => {
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
          report_visibility: "recruiter_only",
          meeting_room: "interview-session_1",
          enable_video_observation: false
        }),
        { status: 200 }
      );

    const session = await getSession("session_1", { fetcher });

    expect(session.id).toBe("session_1");
    expect(session.enableVideoObservation).toBe(false);
  });
});
