import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Spin, Drawer, Divider, Tag, Typography } from "antd";
import { VideoCameraOutlined } from "@ant-design/icons";

import { shouldIgnoreAsrTranscript } from "@/asrTranscriptGuard";
import { requestAnswerHelp, type AnswerHelpResult } from "@/answerHelp";
import { buildAvatarPrompt } from "@/interviewFlow";
import { createLogger } from "@/logger";
import {
  buildConversationCaptions,
  shouldAutoSpeakQuestion,
  shouldHandleSpeechEvent,
  shouldStartPendingSpeech,
  type DigitalInterviewerState
} from "@/digitalInterviewer";

import { useVideoAnalysis } from "./hooks/useVideoAnalysis";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useInterviewSession } from "./hooks/useInterviewSession";
import { useVideoRecorder } from "./hooks/useVideoRecorder";

import { InterviewerTile } from "./components/InterviewerTile";
import { CandidateVideo } from "./components/CandidateVideo";
import { CaptionBar } from "./components/CaptionBar";
import { AnswerPanel } from "./components/AnswerPanel";
import { MetricsSidebar } from "./components/MetricsSidebar";

import "./InterviewPage.css";

const log = createLogger("interview-asr");

declare global {
  interface Window {
    __hciInterviewSpeechId?: number;
  }
}

const SPEECH_CANCEL_SETTLE_MS = 180;
const SPEECH_CANCEL_RETRY_LIMIT = 5;

export function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const sessionRef = useRef<ReturnType<typeof useInterviewSession>["session"]>(null);
  const answerTextRef = useRef("");
  const asrStartedAtMsRef = useRef<number | null>(null);

  const speech = useSpeechRecognition(
    sessionId,
    () => {},
    (finalText) => setAnswerTextFromAsr(finalText),
    (event) => shouldAcceptAsrTranscript(event.text, event.phase),
  );

  const sessionHandle = useInterviewSession(sessionId, speech.chunkUploadFailCount);
  const { session, loading, report, answerText, setAnswerText, answerStartedAt, startAnswer, finishAnswer, finishingAnswer, updateSession, appendAnswerText, lastFollowup } = sessionHandle;

  const recorder = useVideoRecorder();
  const video = useVideoAnalysis(sessionId, session, updateSession, recorder.recordingStartTimeRef, recorder.accumulatedDurationRef);

  const [interviewerState, setInterviewerState] = useState<DigitalInterviewerState>("preparing");
  const [interviewerReaction, setInterviewerReaction] = useState<{ type: "nod" | "shake"; key: number } | null>(null);
  const lastAutoSpokenQuestionIdRef = useRef<string | null>(null);
  const danmakuScrollRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<import("antd/es/input/TextArea").TextAreaRef | null>(null);
  const latestQuestionIdRef = useRef<string | null>(null);
  const questionStartSecRef = useRef<number | null>(null);
  const answerStartSecRef = useRef<number | null>(null);
  const voicesPreloadedRef = useRef(false);
  const activeSpeechIdRef = useRef(0);
  const pendingVoiceSpeechIdRef = useRef<number | null>(null);
  const speechStartTimerRef = useRef<number | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [helpResult, setHelpResult] = useState<AnswerHelpResult | null>(null);
  const [helpError, setHelpError] = useState("");

  function setAnswerTextFromAsr(text: string) {
    appendAnswerText(text);
  }

  function shouldAcceptAsrTranscript(text: string, phase: "interim" | "final") {
    const currentSession = sessionRef.current;
    const prompts = currentSession ? collectInterviewerPrompts(currentSession) : [];
    const ignore = shouldIgnoreAsrTranscript({
      transcript: text,
      prompts,
      answerText: answerTextRef.current,
      asrStartedAtMs: asrStartedAtMsRef.current,
      nowMs: performance.now(),
    });
    if (ignore) {
      log.info("ignored likely interviewer ASR %s", phase, {
        text,
        answerEmpty: answerTextRef.current.trim().length === 0,
      });
    }
    return !ignore;
  }

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    answerTextRef.current = answerText;
  }, [answerText]);

  useEffect(() => {
    function loadVoices() {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) voicesPreloadedRef.current = true;
    }
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // 自动播放问题 / 面试完成自动跳转
  useEffect(() => {
    if (!session) {
      setInterviewerState("preparing");
      return;
    }
    if (!session.currentQuestion) {
      setInterviewerState("finished");
      if (session.answers.length > 0) {
        setTimeout(() => navigate(`/report/${session.id}`), 1500);
      }
      return;
    }
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setInterviewerState("unsupported");
      return;
    }
    // 复合 key：主问 ID + 追问文本，让追问触发独立朗读
    const speakKey = `${session.currentQuestion.id}::${session.currentFollowup ?? ""}`;
    if (shouldAutoSpeakQuestion(speakKey, lastAutoSpokenQuestionIdRef.current, true)) {
      lastAutoSpokenQuestionIdRef.current = speakKey;
      speakQuestion("auto");
    }
  }, [session?.currentQuestion?.id, session?.currentFollowup, session?.answers?.length, session?.id, navigate]);

  // 问题切换后自动聚焦输入框
  useEffect(() => {
    if (interviewerState === "listening" && answerInputRef.current) {
      answerInputRef.current.focus();
    }
  }, [interviewerState]);

  useEffect(() => {
    latestQuestionIdRef.current = session?.currentQuestion?.id ?? null;
    setHelpResult(null);
    setHelpError("");
    setHelpVisible(false);
  }, [session?.currentQuestion?.id]);

  // 清理
  useEffect(() => {
    speechSynthesis.getVoices();
    const onVoicesChanged = () => speechSynthesis.getVoices();
    speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    return () => {
      const speechId = (window.__hciInterviewSpeechId ?? 0) + 1;
      window.__hciInterviewSpeechId = speechId;
      activeSpeechIdRef.current = speechId;
      pendingVoiceSpeechIdRef.current = null;
      if (speechStartTimerRef.current !== null) {
        window.clearTimeout(speechStartTimerRef.current);
        speechStartTimerRef.current = null;
      }
      window.speechSynthesis.cancel();
      void speech.stopMediaStream();
      speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
    };
  }, []);

  // 视频上传失败提示
  useEffect(() => {
    if (recorder.uploadError) {
      message.warning(`视频上传失败：${recorder.uploadError}，面试记录仍已保存`);
    }
  }, [recorder.uploadError, message]);

  function speakQuestion(mode: "auto" | "replay" = "replay") {
    if (!session?.currentQuestion) {
      setInterviewerState("finished");
      return;
    }
    const speechId = (window.__hciInterviewSpeechId ?? 0) + 1;
    window.__hciInterviewSpeechId = speechId;
    activeSpeechIdRef.current = speechId;
    pendingVoiceSpeechIdRef.current = null;
    if (speechStartTimerRef.current !== null) {
      window.clearTimeout(speechStartTimerRef.current);
      speechStartTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(buildAvatarPrompt(session));
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    const isActiveSpeech = () => (
      shouldHandleSpeechEvent(speechId, activeSpeechIdRef.current)
        && shouldHandleSpeechEvent(speechId, window.__hciInterviewSpeechId ?? 0)
    );
    const assignPreferredVoice = () => {
      const voices = speechSynthesis.getVoices();
      const maleVoice = voices.find(
        (v) => v.lang.startsWith("zh-CN") && (v.name.includes("Yunyang") || v.name.toLowerCase().includes("male")),
      ) ?? voices.find((v) => v.lang.startsWith("zh-CN"));
      if (maleVoice) utterance.voice = maleVoice;
      return voices.length;
    };
    const speakActiveUtterance = (attempt = 0) => {
      if (!isActiveSpeech()) return;
      const voiceCount = assignPreferredVoice();
      if (voiceCount === 0 && !voicesPreloadedRef.current) {
        pendingVoiceSpeechIdRef.current = speechId;
        const handleVoicesChanged = () => {
          voicesPreloadedRef.current = true;
          if (!shouldStartPendingSpeech(speechId, activeSpeechIdRef.current, pendingVoiceSpeechIdRef.current)) return;
          if (!isActiveSpeech()) return;
          pendingVoiceSpeechIdRef.current = null;
          scheduleActiveSpeech(0);
        };
        speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged, { once: true });
        return;
      }
      if ((window.speechSynthesis.speaking || window.speechSynthesis.pending) && attempt < SPEECH_CANCEL_RETRY_LIMIT) {
        window.speechSynthesis.cancel();
        scheduleActiveSpeech(attempt + 1);
        return;
      }
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        setInterviewerState(mode === "auto" ? "unsupported" : "listening");
        return;
      }
      pendingVoiceSpeechIdRef.current = null;
      window.speechSynthesis.speak(utterance);
    };
    const scheduleActiveSpeech = (attempt = 0) => {
      if (speechStartTimerRef.current !== null) {
        window.clearTimeout(speechStartTimerRef.current);
      }
      speechStartTimerRef.current = window.setTimeout(() => {
        speechStartTimerRef.current = null;
        speakActiveUtterance(attempt);
      }, SPEECH_CANCEL_SETTLE_MS);
    };
    utterance.onstart = () => {
      if (isActiveSpeech()) {
        setInterviewerState("speaking");
      }
    };
    utterance.onend = () => {
      if (!isActiveSpeech()) return;
      setInterviewerState("listening");
      handleStartCandidateAnswer();
    };
    utterance.onerror = () => {
      if (isActiveSpeech()) {
        setInterviewerState(mode === "auto" ? "unsupported" : "listening");
      }
    };
    setInterviewerState("speaking");

    // 记录提问开始时的视频时间戳
    questionStartSecRef.current = recorder.accumulatedDurationRef.current
      + (recorder.recordingStartTimeRef.current
        ? (performance.now() - recorder.recordingStartTimeRef.current) / 1000
        : 0);

    scheduleActiveSpeech();
  }

  async function handleStartCandidateAnswer() {
    if (!session?.currentQuestion || answerStartedAt !== null) return;
    startAnswer();
    asrStartedAtMsRef.current = performance.now();
    await speech.startMediaStreamAndAsr(session.asrContextTerms ?? []);
    // 第一次回答时启动录制
    if (!recorder.isRecording && session?.id) {
      await recorder.startRecording(session.id, video.analysisStreamRef.current, video.analysisCanvasRef.current, speech.micStreamRef.current);
    }
    // 记录答题开始时的视频时间戳（用于回放跳转）
    answerStartSecRef.current = recorder.accumulatedDurationRef.current
      + (recorder.recordingStartTimeRef.current
        ? (performance.now() - recorder.recordingStartTimeRef.current) / 1000
        : 0);
    video.captureKeyframe("answer_start");
  }

  async function handleFinishCandidateAnswer() {
    video.captureKeyframe("answer_end");
    await speech.stopMediaStream();
    asrStartedAtMsRef.current = null;

    // 计算当前答案的视频时间戳偏移（必须在 stopAndUpload 之前计算）
    const videoTimestampSec = recorder.accumulatedDurationRef.current
      + (recorder.recordingStartTimeRef.current
        ? (performance.now() - recorder.recordingStartTimeRef.current) / 1000
        : 0);

    const isLastQuestion = session?.currentQuestion && session.currentIndex >= session.questions.length - 1;
    // 最后一题：先完成录制上传，再提交答案
    if (isLastQuestion && sessionId && recorder.isRecording) {
      try {
        await recorder.stopAndUpload(sessionId);
      } catch {
        // 上传失败已在 recorder.uploadError 中处理
      }
    }
    await finishAnswer({ videoTimestampSec: answerStartSecRef.current ?? undefined, questionStartSec: questionStartSecRef.current ?? undefined });
    answerStartSecRef.current = null;
    questionStartSecRef.current = null;

    const len = (answerText || "").trim().length;
    const type: "nod" | "shake" = (len > 0 && len < 10) || len > 200 ? "shake" : "nod";
    setInterviewerReaction((prev) => ({ type, key: (prev?.key ?? 0) + 1 }));
  }

  async function handleRequestHelp() {
    if (!session?.currentQuestion || helpLoading) {
      return;
    }
    const requestedQuestionId = session.currentQuestion.id;
    setHelpLoading(true);
    setHelpError("");
    try {
      const result = await requestAnswerHelp(session, answerText);
      if (latestQuestionIdRef.current !== requestedQuestionId) {
        return;
      }
      setHelpResult(result);
      setHelpVisible(true);
    } catch (error) {
      if (latestQuestionIdRef.current !== requestedQuestionId) {
        return;
      }
      const message = error instanceof Error ? error.message : "生成参考答案失败";
      setHelpError(message);
      setHelpVisible(true);
    } finally {
      setHelpLoading(false);
    }
  }

  const captions = useMemo(() => (session ? buildConversationCaptions(session, answerText) : []), [session, answerText]);

  useEffect(() => {
    if (danmakuScrollRef.current) {
      danmakuScrollRef.current.scrollTop = danmakuScrollRef.current.scrollHeight;
    }
  }, [captions]);

  const isAnswering = answerStartedAt !== null;
  const currentQuestion = session?.currentQuestion ?? null;
  const questionProgress = session ? `${Math.min(session.currentIndex + 1, session.questions.length)}/${session.questions.length}` : "";

  if (loading) {
    return (
      <div className="interview-loading">
        <Spin size="large" />
        <p>加载面试中...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="interview-loading">
        <p>面试不存在或已过期</p>
      </div>
    );
  }

  return (
    <div className="interview-page">
      <section className="interview-left">
        <div className="interview-header">
          <div className="interview-header-left">
            <VideoCameraOutlined />
            <h1>{session.role}</h1>
          </div>
          <div className="interview-header-rec">
            <span className="rec-dot" />
            REC {questionProgress}
          </div>
        </div>

        <div className="video-grid">
          <InterviewerTile
            state={interviewerState}
            reaction={interviewerReaction}
          />
          <CandidateVideo
            cameraStream={video.analysisStreamRef.current}
            cameraEnabled={video.cameraEnabled}
          />
        </div>

        <CaptionBar captions={captions} scrollRef={danmakuScrollRef} />

        <AnswerPanel
          isAnswering={isAnswering}
          answerText={answerText}
          onAnswerTextChange={setAnswerText}
          interimTranscript={speech.interimTranscript}
          asrProvider={speech.asrProvider}
          currentQuestion={currentQuestion}
          interviewerState={interviewerState}
          onStartAnswer={handleStartCandidateAnswer}
          onFinishAnswer={handleFinishCandidateAnswer}
          onRequestHelp={handleRequestHelp}
          finishingAnswer={finishingAnswer}
          helpLoading={helpLoading}
          answerInputRef={answerInputRef}
          currentFollowup={session.currentFollowup ?? null}
          followupRound={lastFollowup?.asked ? lastFollowup.round : 0}
        />
      </section>

      <MetricsSidebar
        session={session}
        video={video}
        speech={speech}
        currentQuestion={currentQuestion}
        questionProgress={questionProgress}
      />

      <Drawer
        title="求助参考答案"
        open={helpVisible}
        onClose={() => setHelpVisible(false)}
        size="large"
        destroyOnClose={false}
      >
        {helpError ? (
          <div className="help-drawer-empty">
            <Typography.Paragraph type="danger">{helpError}</Typography.Paragraph>
            <Typography.Paragraph type="secondary">当前请求失败，已保留本地降级逻辑。</Typography.Paragraph>
          </div>
        ) : helpResult ? (
          <div className="help-drawer-content">
            <Tag color={helpResult.mode === "llm" ? "green" : "orange"}>
              {helpResult.mode === "llm" ? "后端生成" : "本地降级"}
            </Tag>
            <Typography.Title level={5}>{helpResult.questionPrompt}</Typography.Title>
            <Typography.Paragraph type="secondary">{helpResult.summary}</Typography.Paragraph>

            <Divider />

            <section className="help-section">
              <Typography.Title level={5}>参考答案</Typography.Title>
              <Typography.Paragraph className="help-reference-answer">
                {helpResult.referenceAnswer}
              </Typography.Paragraph>
            </section>

            <section className="help-section">
              <Typography.Title level={5}>回答提纲</Typography.Title>
              <ol className="help-outline-list">
                {helpResult.outline.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>

            <section className="help-section">
              <Typography.Title level={5}>关键点</Typography.Title>
              <ul className="help-point-list">
                {helpResult.keyPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="help-section">
              <Typography.Title level={5}>注意事项</Typography.Title>
              <ul className="help-point-list">
                {helpResult.cautions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <Typography.Paragraph type="secondary">还没有生成参考答案。</Typography.Paragraph>
        )}
      </Drawer>
    </div>
  );
}

function collectInterviewerPrompts(session: NonNullable<ReturnType<typeof useInterviewSession>["session"]>): string[] {
  const prompts = [
    buildAvatarPrompt(session),
    session.currentFollowup,
    session.currentQuestion?.prompt,
    ...session.questions.flatMap((question) => [
      question.prompt,
      ...question.followUps,
      ...question.evidenceHints,
    ]),
    ...session.answers.flatMap((answer) => [
      answer.prompt,
      answer.followupPrompt,
    ]),
  ];
  return prompts.filter((prompt): prompt is string => Boolean(prompt?.trim()));
}

export default InterviewPage;
