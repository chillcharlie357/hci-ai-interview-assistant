import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Spin, Drawer, Divider, Tag, Typography } from "antd";
import { VideoCameraOutlined } from "@ant-design/icons";

import { requestAnswerHelp, type AnswerHelpResult } from "@/answerHelp";
import { buildAvatarPrompt } from "@/interviewFlow";
import { buildConversationCaptions, shouldAutoSpeakQuestion, type DigitalInterviewerState } from "@/digitalInterviewer";

import { useVideoAnalysis } from "./hooks/useVideoAnalysis";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useLiveKit } from "./hooks/useLiveKit";
import { useInterviewSession } from "./hooks/useInterviewSession";

import { InterviewerTile } from "./components/InterviewerTile";
import { CandidateVideo } from "./components/CandidateVideo";
import { CaptionBar } from "./components/CaptionBar";
import { AnswerPanel } from "./components/AnswerPanel";
import { MetricsSidebar } from "./components/MetricsSidebar";

import "./InterviewPage.css";

export function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [interimTranscriptDisplay, setInterimTranscriptDisplay] = useState("");

  const speech = useSpeechRecognition(
    sessionId,
    (interim) => setInterimTranscriptDisplay(interim),
    (finalText) => setAnswerTextFromAsr(finalText)
  );

  const sessionHandle = useInterviewSession(sessionId, speech.chunkUploadFailCount);
  const { session, loading, report, answerText, setAnswerText, answerStartedAt, startAnswer, finishAnswer, finishingAnswer, updateSession, appendAnswerText } = sessionHandle;

  const video = useVideoAnalysis(sessionId, session, updateSession);
  const liveKit = useLiveKit(sessionId, session);

  const [interviewerState, setInterviewerState] = useState<DigitalInterviewerState>("preparing");
  const lastAutoSpokenQuestionIdRef = useRef<string | null>(null);
  const danmakuScrollRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<import("antd/es/input/TextArea").TextAreaRef | null>(null);
  const latestQuestionIdRef = useRef<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [helpResult, setHelpResult] = useState<AnswerHelpResult | null>(null);
  const [helpError, setHelpError] = useState("");

  function setAnswerTextFromAsr(text: string) {
    appendAnswerText(text);
  }

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
    if (shouldAutoSpeakQuestion(session.currentQuestion.id, lastAutoSpokenQuestionIdRef.current, true)) {
      lastAutoSpokenQuestionIdRef.current = session.currentQuestion.id;
      speakQuestion("auto");
    }
  }, [session?.currentQuestion?.id, session?.answers?.length, session?.id, navigate]);

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
    return () => {
      void speech.stopMediaStream();
    };
  }, []);

  function speakQuestion(mode: "auto" | "replay" = "replay") {
    if (!session?.currentQuestion) {
      setInterviewerState("finished");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(buildAvatarPrompt(session));
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    utterance.onstart = () => setInterviewerState("speaking");
    utterance.onend = () => {
      setInterviewerState("listening");
      handleStartCandidateAnswer();
    };
    utterance.onerror = () => setInterviewerState(mode === "auto" ? "unsupported" : "listening");
    setInterviewerState("speaking");
    window.speechSynthesis.speak(utterance);
  }

  async function handleStartCandidateAnswer() {
    if (!session?.currentQuestion || answerStartedAt !== null) return;
    startAnswer();
    await speech.startMediaStreamAndAsr();
  }

  async function handleFinishCandidateAnswer() {
    await speech.stopMediaStream();
    await finishAnswer();
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
            candidateName={session.candidateName}
            currentStep={Math.min(session.currentIndex + 1, session.questions.length)}
            totalSteps={session.questions.length}
            state={interviewerState}
          />
          <CandidateVideo liveKit={liveKit.liveKit} meetingError={liveKit.meetingError} />
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
        />
      </section>

      <MetricsSidebar
        session={session}
        video={video}
        speech={speech}
        currentQuestion={currentQuestion}
        questionProgress={questionProgress}
        report={report}
      />

      <Drawer
        title="求助参考答案"
        open={helpVisible}
        onClose={() => setHelpVisible(false)}
        width={560}
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

export default InterviewPage;
