const KNOWN_SKILLS = [
  "React",
  "Vue",
  "Node.js",
  "Python",
  "WebRTC",
  "LiveKit",
  "ASR",
  "OCR",
  "LLM",
  "PaddleOCR",
  "WhisperX",
  "OpenCV",
  "FFmpeg",
  "TypeScript",
  "JavaScript"
];

const GOAL_DIMENSIONS = ["专业能力", "项目经验", "技术实现能力", "应变能力", "表达能力", "协作能力"];

export function extractSignals({ resume = "", jobDescription = "", interviewGoal = "" }) {
  const source = `${resume}\n${jobDescription}\n${interviewGoal}`;
  const role = extractRole(jobDescription) || extractRole(source) || "候选人";
  const skills = extractSkills(source);
  const projects = extractProjects(resume);
  const goals = extractGoals(interviewGoal || source);

  return {
    role,
    skills,
    projects,
    goals
  };
}

export function generateInterviewQuestions(input) {
  const signals = extractSignals(input);
  const primarySkills = signals.skills.slice(0, 4);
  const primaryProject = signals.projects[0] || "你最有代表性的项目";
  const role = signals.role;

  const questionTemplates = [
    {
      dimension: "专业能力",
      prompt: `请结合 ${primarySkills.join("、") || "你的核心技术栈"}，介绍你对 ${role} 这个岗位核心能力的理解。`,
      followUps: ["这些能力里你最有把握的是哪一项？请举一个具体例子。"],
      evidenceHints: ["关注候选人是否能把岗位要求和自身技术经验对应起来。"]
    },
    {
      dimension: "项目经验",
      prompt: `请详细讲一下 ${primaryProject}，重点说明你的职责、技术选型和最终结果。`,
      followUps: ["这个项目里最困难的技术问题是什么？你是怎么解决的？"],
      evidenceHints: ["关注项目背景、个人贡献、技术深度和结果可验证性。"]
    },
    {
      dimension: "技术实现能力",
      prompt: `如果要实现一个 AI 面试系统的实时问题生成和回答记录模块，你会如何设计前后端数据流？`,
      followUps: ["如果候选人回答中断或网络抖动，你会怎么保证状态一致？"],
      evidenceHints: ["关注模块拆分、状态管理、异常处理和工程落地能力。"]
    },
    {
      dimension: "技术实现能力",
      prompt: `针对 ${primarySkills[0] || "核心技术"}，请说一个你在生产项目中做过的性能或稳定性优化。`,
      followUps: ["优化前后你用什么指标证明效果？"],
      evidenceHints: ["关注是否有指标意识和真实线上经验。"]
    },
    {
      dimension: "应变能力",
      prompt: "如果面试系统在候选人答题过程中 ASR 识别错误、截图 OCR 也不稳定，你会如何设计兜底方案？",
      followUps: ["哪些结果应该自动进入待人工确认？"],
      evidenceHints: ["关注候选人是否能识别不确定性并设计人工复核机制。"]
    },
    {
      dimension: "表达能力",
      prompt: "请用两分钟向非技术招聘同事解释这个面试智能纪要系统的价值和边界。",
      followUps: ["你会如何避免系统被误用成自动录用决策？"],
      evidenceHints: ["关注表达清晰度、产品边界意识和风险意识。"]
    }
  ];

  const desiredDimensions = new Set(signals.goals.length > 0 ? signals.goals : GOAL_DIMENSIONS.slice(0, 4));
  const prioritized = questionTemplates.sort((a, b) => {
    return Number(desiredDimensions.has(b.dimension)) - Number(desiredDimensions.has(a.dimension));
  });

  return {
    role,
    signals,
    questions: prioritized.map((question, index) => ({
      id: `q_${String(index + 1).padStart(3, "0")}`,
      ...question
    }))
  };
}

function extractRole(text) {
  const match = text.match(/岗位是\s*([^，。,.；;\n]+)/) || text.match(/招聘\s*([^，。,.；;\n]+)/);
  return match?.[1]?.trim() || "";
}

function extractSkills(text) {
  const found = [];
  for (const skill of KNOWN_SKILLS) {
    const pattern = new RegExp(escapeRegExp(skill), "i");
    const match = text.match(pattern);
    if (match && !found.some((item) => item.skill === skill)) {
      found.push({ skill, index: match.index ?? Number.MAX_SAFE_INTEGER });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((item) => item.skill);
}

function extractProjects(resume) {
  const sentences = resume
    .split(/[。；;\n]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.filter((sentence) => /项目|平台|系统|pipeline|会议|音视频|面试/.test(sentence));
}

function extractGoals(text) {
  return GOAL_DIMENSIONS.filter((goal) => text.includes(goal));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
