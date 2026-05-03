import { describe, expect, it } from "vitest";

import { buildQuestionPreviewItems } from "./questionPreview";
import type { InterviewQuestion } from "./interviewFlow";

describe("questionPreview", () => {
  it("keeps generated question details visible for recruiter review", () => {
    const questions: InterviewQuestion[] = [
      {
        id: "q_001",
        dimension: "项目经验",
        prompt: "请介绍项目。",
        followUps: ["你负责哪一块？"],
        evidenceHints: ["关注个人贡献。"]
      }
    ];

    expect(buildQuestionPreviewItems(questions)).toEqual([
      {
        index: 1,
        dimension: "项目经验",
        prompt: "请介绍项目。",
        followUp: "你负责哪一块？",
        evidenceHint: "关注个人贡献。"
      }
    ]);
  });
});
