import { requestAnswerHelp as requestAnswerHelpApi } from "./apiClient";
import type { InterviewQuestion, InterviewSession } from "./interviewFlow";

export type AnswerHelpResult = {
  mode: "llm" | "fallback";
  questionId: string;
  questionPrompt: string;
  summary: string;
  referenceAnswer: string;
  outline: string[];
  keyPoints: string[];
  cautions: string[];
  generatedAt: string;
};

export async function requestAnswerHelp(
  session: InterviewSession,
  draftText: string,
): Promise<AnswerHelpResult> {
  const question = session.currentQuestion;
  if (!question) {
    throw new Error("当前没有可求助的问题");
  }

  const effectivePrompt = session.currentFollowup?.trim() || question.prompt;

  try {
    const response = await requestAnswerHelpApi(session.id, { draftText });
    return {
      mode: response.mode,
      questionId: response.question_id,
      questionPrompt: response.question_prompt,
      summary: response.summary,
      referenceAnswer: response.reference_answer,
      outline: response.outline,
      keyPoints: response.key_points,
      cautions: response.cautions,
      generatedAt: response.generated_at,
    };
  } catch {
    await delay(120);
    return buildFallbackAnswerHelp(session, question, effectivePrompt, draftText);
  }
}

function buildFallbackAnswerHelp(
  session: InterviewSession,
  question: InterviewQuestion,
  prompt: string,
  draftText: string,
): AnswerHelpResult {
  const normalizedDraft = draftText.trim();
  const draftLength = normalizedDraft.length;
  const outline = buildOutline(question, prompt);
  const keyPoints = buildKeyPoints(question, prompt, normalizedDraft);
  const summary = normalizedDraft
    ? `你已经写了 ${draftLength} 个字符，可以保留现有思路，再补上背景、方法和结果。`
    : "你还没有输入草稿，可以先按提纲组织，再结合自己的真实经历填充。";

  const referenceAnswer = [
    `可以参考这个回答结构：我会先从"${outline[0]}"切入，再说明"${outline[1]}"，最后用"${outline[2]}"收尾。`,
    `结合当前问题"${prompt}"，你可以说：在${session.role}相关场景中，我负责[你的职责]，通过[你的方法]解决[你的问题]，并用[结果数据]验证效果。`,
    normalizedDraft
      ? `你现在的草稿里已经有一些内容，建议保留其中最具体的一点，再补上清晰的结论。`
      : "如果一时想不起来细节，可以先用一句话概括结论，再回补过程和结果。"
  ].join("\n\n");

  const cautions = [
    "这是一份参考答案，不要直接照抄，必须替换成自己的真实经历。",
    '如果没有量化结果，不要编造数据，可以说成「结果明显改善」并说明依据。',
    "如果你对某个细节不确定，直接说明边界，比硬编答案更安全。"
  ];

  return {
    mode: "fallback",
    questionId: question.id,
    questionPrompt: prompt,
    summary,
    referenceAnswer,
    outline,
    keyPoints,
    cautions,
    generatedAt: new Date().toISOString(),
  };
}

function buildOutline(question: InterviewQuestion, prompt: string): [string, string, string] {
  const text = `${question.dimension} ${prompt}`.toLowerCase();
  if (text.includes("项目")) {
    return ["项目背景", "你的职责和方法", "结果与复盘"];
  }
  if (text.includes("架构") || text.includes("设计") || text.includes("系统")) {
    return ["需求和目标", "核心设计和数据流", "异常处理和扩展性"];
  }
  if (text.includes("协作") || text.includes("沟通")) {
    return ["协作背景", "你如何推进", "最终协作结果"];
  }
  if (text.includes("应变") || text.includes("追问") || text.includes("短")) {
    return ["先承认边界", "给出思考路径", "补充真实例子"];
  }
  if (text.includes("表达")) {
    return ["先给结论", "分点展开", "最后收束到岗位"];
  }
  return ["回答结论", "举例说明", "结果与反思"];
}

function buildKeyPoints(question: InterviewQuestion, prompt: string, draftText: string): string[] {
  const normalized = `${question.dimension} ${prompt}`.toLowerCase();
  const points: string[] = [];

  if (normalized.includes("项目")) {
    points.push("项目目标和场景", "你的具体职责", "技术方案或方法", "结果或影响");
  } else if (normalized.includes("架构") || normalized.includes("设计") || normalized.includes("系统")) {
    points.push("需求拆解", "模块划分", "状态和数据流", "容错和扩展");
  } else if (normalized.includes("协作") || normalized.includes("沟通")) {
    points.push("协作对象", "推进方式", "你做了什么", "最后达成了什么");
  } else if (normalized.includes("应变") || normalized.includes("追问")) {
    points.push("先说明不确定性", "再讲思考过程", "给出真实例子", "明确人工复核边界");
  } else {
    points.push("先给结论", "再用例子支撑", "最后补结果", "收束到岗位要求");
  }

  if (draftText.trim()) {
    points.push("保留你草稿里最具体的一句");
  }

  return points;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
