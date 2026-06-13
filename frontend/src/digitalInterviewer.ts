import type { InterviewSession } from "./interviewFlow";

export type DigitalInterviewerState = "preparing" | "speaking" | "listening" | "finished" | "unsupported";

export type DigitalInterviewerDescription = {
  label: string;
  detail: string;
  isAnimated: boolean;
};

export type ConversationCaption = {
  id: string;
  speaker: "ai" | "candidate";
  label: string;
  text: string;
};

export function shouldAutoSpeakQuestion(
  currentQuestionId: string | null | undefined,
  lastSpokenQuestionId: string | null,
  speechSupported: boolean
): boolean {
  return Boolean(speechSupported && currentQuestionId && currentQuestionId !== lastSpokenQuestionId);
}

export function shouldHandleSpeechEvent(speechId: number, activeSpeechId: number): boolean {
  return speechId === activeSpeechId;
}

export function shouldStartPendingSpeech(
  speechId: number,
  activeSpeechId: number,
  pendingSpeechId: number | null
): boolean {
  return speechId === activeSpeechId && speechId === pendingSpeechId;
}

export function describeDigitalInterviewerState(
  state: DigitalInterviewerState,
  currentStep: number,
  totalSteps: number
): DigitalInterviewerDescription {
  const progress = `${currentStep}/${totalSteps}`;
  switch (state) {
    case "preparing":
      return { label: "准备中", detail: `正在进入面试会议，进度 ${progress}`, isAnimated: false };
    case "speaking":
      return { label: "提问中", detail: `AI 面试官正在提问，进度 ${progress}`, isAnimated: true };
    case "listening":
      return { label: "等待回答", detail: `请回答当前问题，进度 ${progress}`, isAnimated: false };
    case "finished":
      return { label: "已结束", detail: `本轮问题已完成，进度 ${progress}`, isAnimated: false };
    case "unsupported":
      return { label: "语音不可用", detail: `当前浏览器不支持自动语音，请阅读问题文本，进度 ${progress}`, isAnimated: false };
  }
}

export function buildConversationCaptions(session: InterviewSession, draftAnswer: string): ConversationCaption[] {
  const captions: ConversationCaption[] = [];
  session.answers.forEach((answer, index) => {
    const questionText = answer.isFollowup ? answer.followupPrompt || answer.prompt : answer.prompt;
    captions.push({
      id: `${answer.questionId}-ai-${index}`,
      speaker: "ai",
      label: answer.isFollowup ? "AI 面试官追问" : "AI 面试官",
      text: questionText
    });
    captions.push({
      id: `${answer.questionId}-candidate-${index}`,
      speaker: "candidate",
      label: session.candidateName,
      text: answer.text || "未记录回答"
    });
  });

  if (session.currentQuestion) {
    const currentPrompt = session.currentFollowup?.trim() || session.currentQuestion.prompt;
    captions.push({
      id: `${session.currentQuestion.id}-ai-current-${session.currentFollowup ?? "main"}`,
      speaker: "ai",
      label: session.currentFollowup ? "AI 面试官追问" : "AI 面试官",
      text: currentPrompt
    });
    if (draftAnswer.trim()) {
      captions.push({
        id: `${session.currentQuestion.id}-candidate-draft`,
        speaker: "candidate",
        label: session.candidateName,
        text: draftAnswer.trim()
      });
    }
  }

  return captions;
}
