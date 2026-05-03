import type { InterviewQuestion } from "./interviewFlow";

export type QuestionPreviewItem = {
  index: number;
  dimension: string;
  prompt: string;
  followUp: string;
  evidenceHint: string;
};

export function buildQuestionPreviewItems(questions: InterviewQuestion[]): QuestionPreviewItem[] {
  return questions.map((question, index) => ({
    index: index + 1,
    dimension: question.dimension,
    prompt: question.prompt,
    followUp: question.followUps[0] ?? "无",
    evidenceHint: question.evidenceHints[0] ?? "无"
  }));
}
