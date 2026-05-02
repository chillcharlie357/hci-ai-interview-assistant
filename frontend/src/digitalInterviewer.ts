export type DigitalInterviewerState = "preparing" | "speaking" | "listening" | "finished" | "unsupported";

export type DigitalInterviewerDescription = {
  label: string;
  detail: string;
  isAnimated: boolean;
};

export function shouldAutoSpeakQuestion(
  currentQuestionId: string | null | undefined,
  lastSpokenQuestionId: string | null,
  speechSupported: boolean
): boolean {
  return Boolean(speechSupported && currentQuestionId && currentQuestionId !== lastSpokenQuestionId);
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
