import type { InterviewSession, AnswerRecord } from "@/interviewFlow";

/**
 * 评分算法说明
 *
 * 基础分 3.0/5.0，根据以下可量化信号加减分：
 * - 回答长度（wordCount）：长回答加分，极短回答扣分
 * - 填充词数量（fillerWordCount）：过多填充词扣分
 * - 语速（speechRateWpm）：120-160 字/分钟（中文参考）加分，极端值扣分
 * - 音量（audioRmsDb）：-35 至 -10 dBFS 区间加分
 * - 语调变化（audioF0StdSemitones）：1.5-4.0 st 区间加分
 *
 * 最终分数映射到 0-100（百分制）：score / 5 * 100
 * 注意：此评分仅基于可量化信号，不作为录用决策依据。
 */

/**
 * 从回答数据推导各维度评分（0-100）
 */
export function computeDimensionScores(session: InterviewSession): Record<string, number> {
  const dimensionAnswers: Record<string, AnswerRecord[]> = {};
  for (const answer of session.answers) {
    const dim = answer.dimension;
    if (!dimensionAnswers[dim]) dimensionAnswers[dim] = [];
    dimensionAnswers[dim].push(answer);
  }

  const scores: Record<string, number> = {};
  for (const [dim, answers] of Object.entries(dimensionAnswers)) {
    let totalScore = 0;
    for (const a of answers) {
      totalScore += computeAnswerScore(a);
    }
    scores[dim] = Math.round((totalScore / answers.length / 5) * 100);
  }
  return scores;
}

/**
 * 计算单条回答的评分（0-5）
 */
export function computeAnswerScore(answer: AnswerRecord): number {
  let score = 3.0; // 基础分 3/5

  // 回答长度权重：+0.8 / +0.5 / -0.5
  if (answer.wordCount >= 100) score += 0.8;
  else if (answer.wordCount >= 50) score += 0.5;
  else if (answer.wordCount < 15) score -= 0.5;

  // 填充词权重：-0.4 / -0.2
  if (answer.fillerWordCount >= 5) score -= 0.4;
  else if (answer.fillerWordCount >= 3) score -= 0.2;

  // 语速权重：+0.3（合理范围）/ -0.2（极端值）；参考范围仅适用中文口语
  if (answer.speechRateWpm != null) {
    if (answer.speechRateWpm >= 120 && answer.speechRateWpm <= 160) score += 0.3;
    else if (answer.speechRateWpm < 80 || answer.speechRateWpm > 200) score -= 0.2;
  }

  // 音量权重：+0.2（合理范围）
  if (answer.audioRmsDb != null) {
    if (answer.audioRmsDb >= -35 && answer.audioRmsDb <= -10) score += 0.2;
  }

  // 语调变化权重：+0.2（合理范围）
  if (answer.audioF0StdSemitones != null) {
    if (answer.audioF0StdSemitones >= 1.5 && answer.audioF0StdSemitones <= 4.0) score += 0.2;
  }

  return Math.max(1, Math.min(5, score));
}

/**
 * 生成评语摘要
 */
export function generateRatingSummary(session: InterviewSession, scores: Record<string, number>): string {
  const answeredCount = session.answers.length;
  const totalCount = session.questions.length;
  const topDim = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  const weakDim = Object.entries(scores).sort(([, a], [, b]) => a - b)[0];

  const parts: string[] = [];
  parts.push(`候选人共回答 ${answeredCount}/${totalCount} 题。`);
  if (topDim) {
    parts.push(`${topDim[0]}表现较突出（${topDim[1]}%）。`);
  }
  if (weakDim && weakDim[1] < 60) {
    parts.push(`${weakDim[0]}评分偏低（${weakDim[1]}%），建议重点复核。`);
  }

  const speech = session.speechSummary;
  if (speech && speech.chunkCount > 0) {
    if (speech.rmsDbMean != null && speech.rmsDbMean < -35) {
      parts.push("音频响度偏低，建议确认录音环境。");
    }
    if (speech.speechRateSps > 0) {
      const wpm = speech.speechRateSps * 60;
      if (wpm < 120) parts.push("语速偏慢，建议关注回答流畅度。");
      else if (wpm > 160) parts.push("语速偏快，建议关注表达清晰度。");
    }
  }

  parts.push("以上分析仅作为观察信号，建议面试官综合判断。");
  return parts.join("");
}

/**
 * 语音指标评价等级
 */
export function classifySpeechLevel(value: number, low: number, high: number): "偏低" | "合理" | "偏高" {
  if (value < low) return "偏低";
  if (value > high) return "偏高";
  return "合理";
}

/**
 * 语音指标进度条百分比（映射到 0-100）
 */
export function speechPercent(value: number, min: number, max: number): number {
  return Math.round(Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)));
}
