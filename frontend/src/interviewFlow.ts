import { getFillerWords } from "./config";

const knownSkills = ["Python", "TypeScript", "JavaScript", "React", "Node.js", "LLM", "LiveKit", "ASR", "TTS", "WebRTC"];
const goalDimensions = ["专业能力", "项目经验", "技术实现能力", "应变能力", "表达能力", "协作能力"];

export type DraftInput = {
  candidateName: string;
  resume: string;
  jobDescription: string;
  interviewGoal: string;
  useLlmQuestions?: boolean;
};

export type ReadySummary = {
  role: string;
  jobDescription: string;
  interviewGoal: string;
  focusAreas: string[];
};

export type PrepSession = {
  id: string;
  candidateName: string;
  resumeMarkdownPreview: string;
  followupQuestions: string[];
  ready: boolean;
  readySummary: ReadySummary | null;
  llmStatus: string;
  extractedCandidateName?: string;
  matchingTemplate?: string | null;
  detectedSkills?: string[];
};

export type InterviewQuestion = {
  id: string;
  dimension: string;
  prompt: string;
  followUps: string[];
  evidenceHints: string[];
};

export type AnswerRecord = {
  questionId: string;
  dimension: string;
  prompt: string;
  text: string;
  durationSec: number;
  wordCount: number;
  fillerWordCount: number;
  recordedAt: string;
  speechRateWpm?: number | null;
  audioRmsDb?: number | null;
  audioF0StdHz?: number | null;
  audioF0StdSemitones?: number | null;
  isFollowup?: boolean;
  followupRound?: number;
  followupPrompt?: string;
};

export type InterviewEvent = {
  type: string;
  timestamp: string;
  message: string;
  questionId?: string;
};

export type VideoMetrics = {
  facePresent?: boolean | null;
  brightness?: number | null;
  blur?: number | null;
  motion?: number | null;
  gazeProxy?: number | null;
  headPoseProxy?: number | null;
  blinkProxy?: number | null;
  blinkCount?: number | null;
  blinkRatePerMinute?: number | null;
  eyeContactRatio?: number | null;
  gazeDeviationDeg?: number | null;
  eyeAspectRatio?: number | null;
  nodProxy?: number | null;
  nodCount?: number | null;
  nodRatePerMinute?: number | null;
  handActivity?: number | null;
  bodyActivity?: number | null;
};

export type VideoSignalEvent = {
  timestamp: number;
  eventType: string;
  confidence: number;
  metrics: VideoMetrics;
  keyframeIndex?: number | null;
};

export type KeyframeRecord = {
  timestamp: number;
  reason: string;
  dataUrl?: string;
  videoTimestampSec?: number | null;
};

export type VideoSummary = {
  eventCount: number;
  keyframeCount: number;
  eventTypes: string[];
};

export type SpeechSummary = {
  chunkCount: number;
  analyzedDurationSec: number;
  voicedDurationSec: number;
  speechRateSps: number;
  rmsDbMean: number | null;
  f0MeanHz: number | null;
  f0StdHz: number | null;
  f0StdSemitones: number | null;
  f0MinHz: number | null;
  f0MaxHz: number | null;
  f0RangeHz: number | null;
};

export type InterviewSession = {
  id: string;
  userId?: string;
  createdAt?: string;
  candidateName: string;
  role: string;
  questions: InterviewQuestion[];
  currentIndex: number;
  currentQuestion: InterviewQuestion | null;
  answers: AnswerRecord[];
  events: InterviewEvent[];
  llmStatus: string;
  videoEvents: VideoSignalEvent[];
  keyframes: KeyframeRecord[];
  videoSummary: VideoSummary;
  speechSummary?: SpeechSummary | null;
  meetingRoom: string;
  enableVideoObservation: boolean;
  videoPath?: string | null;
  videoDurationSec?: number | null;
  videoUploadFailed?: boolean;
  /** 当前主问题尚未结束、且 LLM 决定追问时，待朗读给候选人的追问文本；否则为 null */
  currentFollowup?: string | null;
};

export function createDraft(): DraftInput {
  return {
    candidateName: "候选人",
    resume: "候选人负责 AI 面试平台，包含问题生成、数字人提问、回答记录和纪要生成。",
    jobDescription: "岗位是 AI 产品全栈工程师，需要 Python、TypeScript、LLM 应用和产品工程化经验。",
    interviewGoal: "评估专业能力、项目经验、技术实现能力、应变能力。",
    useLlmQuestions: false
  };
}

export function createSessionFromDraft(draft: DraftInput): InterviewSession {
  const role = extractRole(draft.jobDescription) || "候选人";
  const questions = generateQuestions(draft, role);
  return {
    id: `local_${Date.now()}`,
    candidateName: draft.candidateName || "候选人",
    role,
    questions,
    currentIndex: 0,
    currentQuestion: questions[0] ?? null,
    answers: [],
    llmStatus: "fallback",
    videoEvents: [],
    keyframes: [],
    videoSummary: {
      eventCount: 0,
      keyframeCount: 0,
      eventTypes: []
    },
    meetingRoom: "",
    enableVideoObservation: true,
    currentFollowup: null,
    events: [
      {
        type: "session_started",
        timestamp: new Date().toISOString(),
        message: `数字人面试官已准备，将面向 ${role} 开始提问。`
      }
    ]
  };
}

export function buildAvatarPrompt(session: InterviewSession): string {
  if (!session.currentQuestion) {
    return "本轮问题已经结束，请确认是否生成面试纪要。";
  }
  // 优先朗读 LLM 追问；否则朗读主问题
  if (session.currentFollowup && session.currentFollowup.trim()) {
    return session.currentFollowup.trim();
  }
  return `${session.candidateName}，你好。接下来是 ${session.currentQuestion.dimension} 相关问题。${session.currentQuestion.prompt}`;
}

export function recordAnswer(
  session: InterviewSession,
  answer: { text: string; durationSec: number }
): InterviewSession {
  if (!session.currentQuestion) {
    return session;
  }

  const recordedAt = new Date().toISOString();
  const wordCount = countWords(answer.text);
  // 本地语速估算仅用于离线/mock 场景；在线场景通过 API 提交后由后端重新计算
  const speechRateWpm = answer.durationSec > 0 ? Math.round((wordCount / (answer.durationSec / 60)) * 10) / 10 : null;
  const record: AnswerRecord = {
    questionId: session.currentQuestion.id,
    dimension: session.currentQuestion.dimension,
    prompt: session.currentQuestion.prompt,
    text: answer.text.trim(),
    durationSec: answer.durationSec,
    wordCount,
    fillerWordCount: countFillerWords(answer.text),
    recordedAt,
    speechRateWpm
  };
  const nextIndex = session.currentIndex + 1;

  return {
    ...session,
    currentIndex: nextIndex,
    currentQuestion: session.questions[nextIndex] ?? null,
    answers: [...session.answers, record],
    events: [
      ...session.events,
      {
        type: "answer_recorded",
        timestamp: recordedAt,
        questionId: record.questionId,
        message: `已记录 ${record.dimension} 回答，用时 ${record.durationSec} 秒。`
      }
    ]
  };
}

export function generateMarkdownReport(session: InterviewSession): string {
  const answeredIds = new Set(session.answers.map((answer) => answer.questionId));
  const unanswered = session.questions.filter((question) => !answeredIds.has(question.id));
  const lines = [
    "# 智能面试纪要",
    "",
    "## 1. 面试概览",
    `- 候选人：${session.candidateName}`,
    `- 岗位：${session.role}`,
    `- 问题数：${session.questions.length}`,
    `- 已回答：${session.answers.length}`,
    "",
    "## 2. 问答记录"
  ];

  session.answers.forEach((answer, index) => {
    const question = session.questions.find((item) => item.id === answer.questionId);
    lines.push(
      "",
      `### ${index + 1}. ${answer.dimension}`,
      `- 问题：${answer.prompt}`,
      `- 回答摘要：${answer.text || "未记录回答"}`,
      `- 回答用时：${answer.durationSec} 秒`,
      `- 字数/字符数：${answer.wordCount}`,
      `- 语速：${formatSpeechRate(answer.speechRateWpm)}`,
      `- 填充词数量：${answer.fillerWordCount}`,
      `- 建议追问：${question?.followUps[0] ?? "无"}`,
      `- 观察点：${question?.evidenceHints[0] ?? "无"}`
    );
  });

  lines.push("", "## 3. 实时事件");
  session.events.forEach((event) => lines.push(`- ${event.timestamp} ${event.message}`));
  lines.push("", "## 4. 非语言观察", ...buildVideoObservations(session));
  lines.push("", "## 5. 待人工确认", ...buildReviewItems(session.answers, unanswered));
  return lines.join("\n");
}

function generateQuestions(draft: DraftInput, role: string): InterviewQuestion[] {
  const source = `${draft.resume}\n${draft.jobDescription}\n${draft.interviewGoal}`;
  const skills = extractSkills(source);
  const project = extractProject(draft.resume);
  const skillText = skills.slice(0, 4).join("、") || "你的核心技术栈";
  const templates: Omit<InterviewQuestion, "id">[] = [
    {
      dimension: "专业能力",
      prompt: `请结合 ${skillText}，介绍你对 ${role} 这个岗位核心能力的理解。`,
      followUps: ["这些能力里你最有把握的是哪一项？请举一个具体例子。"],
      evidenceHints: ["关注候选人是否能把岗位要求和自身技术经验对应起来。"]
    },
    {
      dimension: "项目经验",
      prompt: `请详细讲一下 ${project}，重点说明你的职责、技术选型和最终结果。`,
      followUps: ["这个项目里最困难的问题是什么？你是怎么解决的？"],
      evidenceHints: ["关注项目背景、个人贡献、技术深度和结果可验证性。"]
    },
    {
      dimension: "技术实现能力",
      prompt: "如果要实现一个 AI 面试系统的问题生成和回答记录模块，你会如何设计前后端数据流？",
      followUps: ["如果候选人回答中断或网络抖动，你会怎么保证状态一致？"],
      evidenceHints: ["关注模块拆分、状态管理、异常处理和工程落地能力。"]
    },
    {
      dimension: "技术实现能力",
      prompt: `针对 ${skills[0] ?? "核心技术"}，请说一个你在生产项目中做过的质量或稳定性优化。`,
      followUps: ["优化前后你用什么指标证明效果？"],
      evidenceHints: ["关注是否有指标意识和真实工程经验。"]
    },
    {
      dimension: "应变能力",
      prompt: "如果候选人回答很短、信息不足，数字人面试官应该如何继续追问？",
      followUps: ["哪些回答应该标记为需要面试官人工复核？"],
      evidenceHints: ["关注候选人是否能识别不确定性并设计人工复核机制。"]
    },
    {
      dimension: "表达能力",
      prompt: "请用两分钟向非技术招聘同事解释这个 AI 辅助面试系统的价值和边界。",
      followUps: ["你会如何避免系统被误用成自动录用决策？"],
      evidenceHints: ["关注表达清晰度、产品边界意识和风险意识。"]
    }
  ];
  const desired = new Set(goalDimensions.filter((dimension) => draft.interviewGoal.includes(dimension)));
  return templates
    .sort((left, right) => Number(!desired.has(left.dimension)) - Number(!desired.has(right.dimension)))
    .map((question, index) => ({ id: `q_${String(index + 1).padStart(3, "0")}`, ...question }));
}

function extractRole(text: string): string {
  return (
    text.match(/岗位是\s*([^，。,.；;\n]+)/)?.[1]?.trim() ??
    text.match(/职位是\s*([^，。,.；;\n]+)/)?.[1]?.trim() ??
    text.match(/招聘\s*([^，。,.；;\n]+(?:岗位|职位|工程师|开发|专家|架构师|经理))/)?.[1]?.trim() ??
    ""
  );
}

function extractSkills(text: string): string[] {
  return knownSkills
    .map((skill) => ({ skill, index: text.toLowerCase().indexOf(skill.toLowerCase()) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.skill);
}

function extractProject(resume: string): string {
  return resume.split(/[。；;\n]/).find((part) => /项目|平台|系统|面试|产品|模块/.test(part))?.trim() ?? "你最有代表性的项目";
}

function countFillerWords(text: string): number {
  const fillerWords = getFillerWords();
  return fillerWords.reduce((count, word) => count + (text.match(new RegExp(word, "g"))?.length ?? 0), 0);
}

function countWords(text: string): number {
  const latinWords = text.match(/[A-Za-z0-9_.+-]+/g)?.length ?? 0;
  const chineseChars = text.replace(/[A-Za-z0-9_.+\-\s，。！？、；：,.!?;:]/g, "").length;
  return latinWords + chineseChars;
}

// 参考范围 120–160 仅适用中文口语场景；英文口语约为 130–170 wpm
function formatSpeechRate(value: number | null | undefined): string {
  if (value == null) return "未知";
  let hint = "";
  if (value < 120) hint = "（偏慢，中文参考范围 120–160 字/分钟）";
  else if (value > 160) hint = "（偏快，中文参考范围 120–160 字/分钟）";
  return `${Math.round(value)} 字/分钟${hint}`;
}

function buildReviewItems(answers: AnswerRecord[], unanswered: InterviewQuestion[]): string[] {
  const items = answers.flatMap((answer) => [
    ...(answer.fillerWordCount >= 3 ? [`- ${answer.dimension} 回答填充词较多，建议人工复核表达流畅度。`] : []),
    ...(answer.wordCount < 8 ? [`- ${answer.dimension} 回答较短，建议确认是否需要追问。`] : [])
  ]);
  unanswered.forEach((question) => items.push(`- 问题「${question.prompt}」尚未回答，建议确认是否跳过。`));
  return items.length > 0 ? items : ["- 当前无明显异常，仍建议面试官复核关键结论。"];
}

function buildVideoObservations(session: InterviewSession): string[] {
  if (session.videoEvents.length === 0) {
    return ["- 未记录实时摄像头非语言观察。"];
  }
  const latest = session.videoEvents.slice(-5).map((event) => {
    const brightness = typeof event.metrics.brightness === "number" ? event.metrics.brightness.toFixed(2) : "未知";
    const motion = typeof event.metrics.motion === "number" ? event.metrics.motion.toFixed(2) : "未知";
    const blinkRate = typeof event.metrics.blinkRatePerMinute === "number" ? `${event.metrics.blinkRatePerMinute.toFixed(1)} 次/分钟` : "未知";
    const eyeContact = typeof event.metrics.eyeContactRatio === "number" ? `${(event.metrics.eyeContactRatio * 100).toFixed(0)}%` : "未知";
    return `- ${event.timestamp.toFixed(1)}s：${event.eventType}，置信度 ${event.confidence.toFixed(2)}，亮度 ${brightness}，运动量 ${motion}，眨眼频率 ${blinkRate}，眼神接触占比 ${eyeContact}。`;
  });
  return [
    `- 共记录 ${session.videoEvents.length} 条观察、${session.keyframes.length} 张关键帧。以下内容仅作为观察信号，不代表能力结论。`,
    ...latest
  ];
}
