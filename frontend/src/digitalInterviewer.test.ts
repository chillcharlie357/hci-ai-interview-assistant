import { describe, expect, it } from "vitest";

import {
  buildConversationCaptions,
  describeDigitalInterviewerState,
  shouldAutoSpeakQuestion,
  type DigitalInterviewerState
} from "./digitalInterviewer";
import { createSessionFromDraft, createDraft, recordAnswer } from "./interviewFlow";

describe("digitalInterviewer", () => {
  it("auto speaks each current question exactly once", () => {
    expect(shouldAutoSpeakQuestion("q_001", null, true)).toBe(true);
    expect(shouldAutoSpeakQuestion("q_001", "q_001", true)).toBe(false);
    expect(shouldAutoSpeakQuestion("q_002", "q_001", true)).toBe(true);
    expect(shouldAutoSpeakQuestion(null, "q_001", true)).toBe(false);
    expect(shouldAutoSpeakQuestion("q_003", "q_002", false)).toBe(false);
  });

  it("describes interviewer states for the meeting tile", () => {
    const speaking = describeDigitalInterviewerState("speaking", 2, 6);
    const listening = describeDigitalInterviewerState("listening", 2, 6);
    const finished = describeDigitalInterviewerState("finished", 6, 6);
    const unsupported = describeDigitalInterviewerState("unsupported", 1, 6);

    expect(speaking.label).toBe("提问中");
    expect(speaking.detail).toContain("2/6");
    expect(speaking.isAnimated).toBe(true);
    expect(listening.label).toBe("等待回答");
    expect(listening.isAnimated).toBe(false);
    expect(finished.label).toBe("已结束");
    expect(unsupported.detail).toContain("不支持自动语音");
  });

  it("returns stable labels for every supported state", () => {
    const states: DigitalInterviewerState[] = ["preparing", "speaking", "listening", "finished", "unsupported"];

    expect(states.map((state) => describeDigitalInterviewerState(state, 1, 3).label)).toEqual([
      "准备中",
      "提问中",
      "等待回答",
      "已结束",
      "语音不可用"
    ]);
  });

  it("builds meeting captions from answered and current questions", () => {
    const session = createSessionFromDraft(createDraft());
    const answered = recordAnswer(session, { text: "我负责数字人提问体验。", durationSec: 42 });
    const captions = buildConversationCaptions(answered, "正在回答第二题。");

    expect(captions.map((caption) => caption.speaker)).toEqual(["ai", "candidate", "ai", "candidate"]);
    expect(captions[0].text).toContain(session.questions[0].prompt);
    expect(captions[1].text).toContain("数字人提问体验");
    expect(captions[2].text).toContain(answered.currentQuestion?.prompt);
    expect(captions[3].text).toBe("正在回答第二题。");
  });
});
