import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App } from "antd";

import { fetchReport, getSession, submitAnswer, type FollowupResponse } from "@/apiClient";
import type { InterviewSession } from "@/interviewFlow";
import { useAppStore } from "@/store";

export type InterviewSessionHandle = {
  session: InterviewSession | null;
  loading: boolean;
  report: string;
  answerText: string;
  setAnswerText: (text: string) => void;
  answerStartedAt: number | null;
  startAnswer: () => void;
  finishAnswer: (opts?: { videoTimestampSec?: number }) => Promise<void>;
  finishingAnswer: boolean;
  updateSession: (updated: InterviewSession) => void;
  appendAnswerText: (text: string) => void;
  /** 最近一次 finishAnswer 触发的追问描述，未追问时 asked=false */
  lastFollowup: FollowupResponse | null;
};

export function useInterviewSession(
  sessionId: string | undefined,
  chunkUploadFailCount: number
): InterviewSessionHandle {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const globalSession = useAppStore((state) => state.interviewSession);
  const setGlobalSession = useAppStore((state) => state.setInterviewSession);

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [answerStartedAt, setAnswerStartedAt] = useState<number | null>(null);
  const [finishingAnswer, setFinishingAnswer] = useState(false);
  const [lastFollowup, setLastFollowup] = useState<FollowupResponse | null>(null);

  const updateSession = useCallback((updated: InterviewSession) => {
    setSession((current) => (current && current.id === updated.id ? updated : current));
  }, []);

  // 加载会话
  useEffect(() => {
    if (!sessionId) return;
    if (session?.id === sessionId) {
      setLoading(false);
      return;
    }
    if (globalSession && globalSession.id === sessionId) {
      setSession(globalSession);
      setLoading(false);
      return;
    }
    void loadSession();
  }, [sessionId, session?.id, globalSession?.id]);

  // 同步 session 到全局状态
  useEffect(() => {
    if (session && session !== globalSession) {
      setGlobalSession(session);
    }
  }, [session, globalSession, setGlobalSession]);

  async function loadSession() {
    if (!sessionId) return;
    setLoading(true);
    try {
      setSession(await getSession(sessionId));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载面试失败");
    } finally {
      setLoading(false);
    }
  }

  const startAnswer = useCallback(() => {
    if (!session?.currentQuestion || answerStartedAt !== null) return;
    setAnswerStartedAt(Date.now());
  }, [session?.currentQuestion, answerStartedAt]);

  const finishAnswer = useCallback(async (opts?: { videoTimestampSec?: number }) => {
    if (!session?.currentQuestion || finishingAnswer) return;
    setFinishingAnswer(true);

    try {
      const measuredDuration = answerStartedAt ? Math.max(1, Math.round((Date.now() - answerStartedAt) / 1000)) : 90;
      const result = await submitAnswer(session.id, { text: answerText, durationSec: measuredDuration, videoTimestampSec: opts?.videoTimestampSec });
      setSession(result.session);
      setAnswerText("");
      setAnswerStartedAt(null);
      setLastFollowup(result.followup);
      setFinishingAnswer(false);

      // 触发追问时不跳转，等候选人回答完追问后再判断
      if (!result.followup.asked && !result.session.currentQuestion) {
        if (chunkUploadFailCount > 0) {
          message.warning(`有 ${chunkUploadFailCount} 个语音片段上传失败，报告中的语音分析可能不完整`);
        }
        message.success("所有问题已回答完毕，即将跳转到面试报告");
        setTimeout(() => navigate(`/report/${session.id}`), 1500);
      }

      // 报告异步获取，不阻塞面试流程
      fetchReport(session.id).then((r) => setReport(r.report)).catch(() => {});
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交回答失败");
      setFinishingAnswer(false);
    }
  }, [session, finishingAnswer, answerStartedAt, answerText, chunkUploadFailCount, navigate, message]);

  const appendAnswerText = useCallback((text: string) => {
    setAnswerText((current) => (current ? `${current}${text}` : text));
  }, []);

  return {
    session,
    loading,
    report,
    answerText,
    setAnswerText,
    answerStartedAt,
    startAnswer,
    finishAnswer,
    finishingAnswer,
    updateSession,
    appendAnswerText,
    lastFollowup,
  };
}
