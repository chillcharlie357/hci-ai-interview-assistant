import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Spin } from "antd";
import { VideoCameraOutlined } from "@ant-design/icons";

import { buildAvatarPrompt } from "@/interviewFlow";
import { buildConversationCaptions, shouldAutoSpeakQuestion, type DigitalInterviewerState } from "@/digitalInterviewer";

import { useVideoAnalysis } from "./hooks/useVideoAnalysis";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useLiveKit } from "./hooks/useLiveKit";
import { useInterviewSession } from "./hooks/useInterviewSession";
import { useVideoRecorder } from "./hooks/useVideoRecorder";

import { InterviewerTile } from "./components/InterviewerTile";
import { CandidateVideo } from "./components/CandidateVideo";
import { CaptionBar } from "./components/CaptionBar";
import { AnswerPanel } from "./components/AnswerPanel";
import { MetricsSidebar } from "./components/MetricsSidebar";

import "./InterviewPage.css";

export function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [interimTranscriptDisplay, setInterimTranscriptDisplay] = useState("");

  const speech = useSpeechRecognition(
    sessionId,
    (interim) => setInterimTranscriptDisplay(interim),
    (finalText) => setAnswerTextFromAsr(finalText)
  );

  const sessionHandle = useInterviewSession(sessionId, speech.chunkUploadFailCount);
  const { session, loading, report, answerText, setAnswerText, answerStartedAt, startAnswer, finishAnswer, finishingAnswer, updateSession, appendAnswerText } = sessionHandle;

  const recorder = useVideoRecorder();
  const video = useVideoAnalysis(sessionId, session, updateSession, recorder.recordingStartTimeRef);
  const liveKit = useLiveKit(sessionId, session);

  const [interviewerState, setInterviewerState] = useState<DigitalInterviewerState>("preparing");
  const lastAutoSpokenQuestionIdRef = useRef<string | null>(null);
  const danmakuScrollRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<import("antd/es/input/TextArea").TextAreaRef | null>(null);

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

  // 清理
  useEffect(() => {
    return () => {
      void speech.stopMediaStream();
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
    // 第一次回答时启动录制
    if (!recorder.isRecording) {
      recorder.startRecording(video.analysisStreamRef.current, video.analysisCanvasRef.current);
    }
  }

  async function handleFinishCandidateAnswer() {
    await speech.stopMediaStream();
    const isLastQuestion = session?.currentQuestion && session.currentIndex >= session.questions.length - 1;
    // 最后一题：先完成录制上传，再提交答案（避免上传未完成即跳转报告页）
    if (isLastQuestion && sessionId && recorder.isRecording) {
      try {
        await recorder.stopAndUpload(sessionId);
      } catch {
        // 上传失败已在 recorder.uploadError 中处理
      }
    }
    await finishAnswer();
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
          finishingAnswer={finishingAnswer}
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
    </div>
  );
}

export default InterviewPage;
