const FILLER_WORDS = ["嗯", "啊", "呃", "额", "那个", "就是"];

export function createInterviewSession({ candidateName = "候选人", role = "候选人", questions = [] }) {
  const now = new Date().toISOString();
  return {
    id: `session_${Date.now()}`,
    candidateName,
    role,
    questions,
    currentIndex: 0,
    currentQuestion: questions[0] ?? null,
    answers: [],
    events: [
      {
        type: "session_started",
        timestamp: now,
        message: `数字人面试官已准备，将面向 ${role} 开始提问。`
      }
    ]
  };
}

export function buildAvatarPrompt(session) {
  if (!session.currentQuestion) {
    return "本轮问题已经结束，请确认是否生成面试纪要。";
  }

  return [
    `${session.candidateName}，你好。`,
    `接下来是 ${session.currentQuestion.dimension} 相关问题。`,
    session.currentQuestion.prompt
  ].join("");
}

export function recordAnswer(session, { text = "", durationSec = 0 }) {
  if (!session.currentQuestion) {
    return session;
  }

  const answer = {
    questionId: session.currentQuestion.id,
    dimension: session.currentQuestion.dimension,
    prompt: session.currentQuestion.prompt,
    text: text.trim(),
    durationSec,
    wordCount: countWords(text),
    fillerWordCount: countFillerWords(text),
    recordedAt: new Date().toISOString()
  };

  const nextIndex = session.currentIndex + 1;
  const nextQuestion = session.questions[nextIndex] ?? null;

  return {
    ...session,
    currentIndex: nextIndex,
    currentQuestion: nextQuestion,
    answers: [...session.answers, answer],
    events: [
      ...session.events,
      {
        type: "answer_recorded",
        timestamp: answer.recordedAt,
        questionId: answer.questionId,
        message: `已记录 ${answer.dimension} 回答，用时 ${durationSec} 秒。`
      }
    ]
  };
}

export function generateMarkdownReport(session) {
  const answeredQuestionIds = new Set(session.answers.map((answer) => answer.questionId));
  const unanswered = session.questions.filter((question) => !answeredQuestionIds.has(question.id));

  return [
    "# 智能面试纪要",
    "",
    "## 1. 面试概览",
    `- 候选人：${session.candidateName}`,
    `- 岗位：${session.role}`,
    `- 问题数：${session.questions.length}`,
    `- 已回答：${session.answers.length}`,
    "",
    "## 2. 问答记录",
    ...session.answers.flatMap((answer, index) => {
      const question = session.questions.find((item) => item.id === answer.questionId);
      return [
        "",
        `### ${index + 1}. ${answer.dimension}`,
        `- 问题：${answer.prompt}`,
        `- 回答摘要：${answer.text || "未记录回答"}`,
        `- 回答用时：${answer.durationSec} 秒`,
        `- 字数/字符数：${answer.wordCount}`,
        `- 填充词数量：${answer.fillerWordCount}`,
        `- 建议追问：${question?.followUps?.[0] ?? "无"}`,
        `- 观察点：${question?.evidenceHints?.[0] ?? "无"}`
      ];
    }),
    "",
    "## 3. 实时事件",
    ...session.events.map((event) => `- ${event.timestamp} ${event.message}`),
    "",
    "## 4. 待人工确认",
    ...buildReviewItems(session, unanswered)
  ].join("\n");
}

function countFillerWords(text) {
  return FILLER_WORDS.reduce((count, word) => count + countOccurrences(text, word), 0);
}

function countOccurrences(text, word) {
  const matches = text.match(new RegExp(word, "g"));
  return matches ? matches.length : 0;
}

function countWords(text) {
  const compact = text.trim();
  if (!compact) {
    return 0;
  }
  const latinWords = compact.match(/[A-Za-z0-9_.+-]+/g) ?? [];
  const chineseChars = compact.replace(/[A-Za-z0-9_.+\-\s，。！？、；：,.!?;:]/g, "").length;
  return latinWords.length + chineseChars;
}

function buildReviewItems(session, unanswered) {
  const items = [];
  const answersWithManyFillers = session.answers.filter((answer) => answer.fillerWordCount >= 3);

  for (const answer of answersWithManyFillers) {
    items.push(`- ${answer.dimension} 回答填充词较多，建议人工复核表达流畅度。`);
  }

  for (const question of unanswered) {
    items.push(`- 问题「${question.prompt}」尚未回答，建议确认是否跳过。`);
  }

  if (items.length === 0) {
    items.push("- 当前无明显异常，仍建议面试官复核关键结论。");
  }

  return items;
}
