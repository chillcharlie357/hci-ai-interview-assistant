/**
 * 面试端页面
 * 参考 ai_11 设计
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Tag, Input, Spin, App } from "antd";
import {
  VideoCameraOutlined,
  RobotOutlined,
  UserOutlined,
  StopOutlined,
  ForwardOutlined,
  EyeOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { LiveKitRoom, ControlBar, GridLayout, ParticipantTile, RoomAudioRenderer, useTracks } from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";

import {
  getSession,
  requestLiveKitToken,
  submitAnswer,
  submitSpeechChunk,
  fetchReport,
  type SpeechChunkResponse,
} from "../../apiClient";
import type { InterviewSession } from "../../interviewFlow";
import { generateMarkdownReport, buildAvatarPrompt } from "../../interviewFlow";
import { buildConversationCaptions, describeDigitalInterviewerState, shouldAutoSpeakQuestion, type DigitalInterviewerState } from "../../digitalInterviewer";
import { createSpeechTranscriber } from "../../speechRecognition";
import { startPcmRecorder, type PcmRecorderHandle } from "../../pcmRecorder";
import { buildReportFilename, downloadMarkdownReport } from "../../reportDownload";
import { useAppStore } from "../../store";

const { TextArea } = Input;

export function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { message } = App.useApp();
  const globalSession = useAppStore((state) => state.interviewSession);
  const setGlobalSession = useAppStore((state) => state.setInterviewSession);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [report, setReport] = useState("");
  const [liveKit, setLiveKit] = useState<{ url: string; token: string; room: string } | null>(null);
  const [meetingError, setMeetingError] = useState("");
  const [interviewerState, setInterviewerState] = useState<DigitalInterviewerState>("preparing");
  const [answerStartedAt, setAnswerStartedAt] = useState<number | null>(null);
  const [finishingAnswer, setFinishingAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [audioChunkStatus, setAudioChunkStatus] = useState("未启动");
  const [cumulativeMetrics, setCumulativeMetrics] = useState<SpeechChunkResponse["cumulative"] | null>(null);

  // 模拟指标数据
  const [focusScore, setFocusScore] = useState(92);
  const [confidenceScore, setConfidenceScore] = useState(85);

  const transcriberRef = useRef<ReturnType<typeof createSpeechTranscriber> | null>(null);
  const pcmRecorderRef = useRef<PcmRecorderHandle | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastAutoSpokenQuestionIdRef = useRef<string | null>(null);

  // 加载会话
  useEffect(() => {
    if (!sessionId) return;
    if (globalSession && globalSession.id === sessionId) {
      setSession(globalSession);
      setLoading(false);
      return;
    }
    void loadSession();
  }, [sessionId, globalSession]);

  // 同步 session 到全局状态
  useEffect(() => {
    if (session) {
      setGlobalSession(session);
    }
  }, [session, setGlobalSession]);

  // 自动播放问题
  useEffect(() => {
    if (!session) {
      setInterviewerState("preparing");
      return;
    }
    if (!session.currentQuestion) {
      setInterviewerState("finished");
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
  }, [session?.currentQuestion?.id]);

  // 清理
  useEffect(() => {
    return () => {
      transcriberRef.current?.stop();
      void pcmRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function loadSession() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const loaded = await getSession(sessionId);
      setSession(loaded);
      try {
        setLiveKit(await requestLiveKitToken(sessionId, {
          participantName: loaded.candidateName,
          participantRole: "candidate",
        }));
        setMeetingError("");
      } catch (error) {
        setMeetingError(error instanceof Error ? error.message : "会议服务未配置");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载面试失败");
    } finally {
      setLoading(false);
    }
  }

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
      startCandidateAnswer();
    };
    utterance.onerror = () => setInterviewerState(mode === "auto" ? "unsupported" : "listening");
    setInterviewerState("speaking");
    window.speechSynthesis.speak(utterance);
  }

  function startCandidateAnswer() {
    if (!session?.currentQuestion || answerStartedAt !== null) return;
    setCumulativeMetrics(null);

    const transcriber = createSpeechTranscriber(
      window as Parameters<typeof createSpeechTranscriber>[0],
      (text) => setAnswerText((current) => (current ? `${current}${text}` : text)),
      () => {},
      () => {}
    );
    transcriberRef.current = transcriber;
    transcriber.start();
    void startAudioChunkUpload();
    setAnswerStartedAt(Date.now());
  }

  async function startAudioChunkUpload() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAudioChunkStatus("当前浏览器不支持麦克风采集");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = await startPcmRecorder(stream, (wavBlob) => {
        enqueueSpeechChunkUpload(wavBlob);
      });
      pcmRecorderRef.current = recorder;
      setAudioChunkStatus("采集中");
    } catch (error) {
      setAudioChunkStatus(error instanceof Error ? error.message : "音频上传未启动");
    }
  }

  function enqueueSpeechChunkUpload(blob: Blob) {
    chunkUploadQueueRef.current = chunkUploadQueueRef.current.then(async () => {
      try {
        const audioBase64 = await blobToBase64(blob);
        const analyzed = await submitSpeechChunk(sessionId!, { audioBase64, targetSampleRate: 16000 });
        setCumulativeMetrics(analyzed.cumulative);
        // 更新模拟指标
        setFocusScore(prev => Math.min(100, Math.max(70, prev + (Math.random() * 10 - 5))));
        setConfidenceScore(prev => Math.min(100, Math.max(60, prev + (Math.random() * 8 - 4))));
      } catch {
        // 忽略单个分片上传错误
      }
    });
  }

  async function finishCandidateAnswer() {
    if (!session?.currentQuestion || finishingAnswer) return;
    setFinishingAnswer(true);

    transcriberRef.current?.stop();
    const recorder = pcmRecorderRef.current;
    if (recorder) {
      await recorder.stop();
      pcmRecorderRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    try {
      const measuredDuration = answerStartedAt ? Math.max(1, Math.round((Date.now() - answerStartedAt) / 1000)) : 90;
      const result = await submitAnswer(session.id, { text: answerText, durationSec: measuredDuration });
      setSession(result.session);
      setAnswerText("");
      setAnswerStartedAt(null);

      try {
        const visibleReport = await fetchReport(session.id, "candidate");
        setReport(visibleReport.report);
      } catch {
        setReport("招聘端尚未开放候选人查看面试分析报告。");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交回答失败");
    } finally {
      setFinishingAnswer(false);
    }
  }

  const captions = useMemo(() => (session ? buildConversationCaptions(session, answerText) : []), [session, answerText]);
  const isAnswering = answerStartedAt !== null;
  const currentQuestion = session?.currentQuestion;
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
      {/* 左侧：视频会议区 (60%) */}
      <section className="interview-left">
        {/* 头部 */}
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

        {/* 视频区域 */}
        <div className="video-grid">
          {/* 数字人瓦片 */}
          <DigitalInterviewerTile
            candidateName={session.candidateName}
            currentStep={Math.min(session.currentIndex + 1, session.questions.length)}
            totalSteps={session.questions.length}
            state={interviewerState}
          />

          {/* 候选人视频 */}
          <div className="candidate-video-tile">
            {liveKit ? (
              <LiveKitRoom token={liveKit.token} serverUrl={liveKit.url} connect audio video>
                <CandidateLiveKitConference />
              </LiveKitRoom>
            ) : (
              <div className="video-placeholder">
                <UserOutlined />
                <p>{meetingError || "会议服务未配置"}</p>
              </div>
            )}
          </div>
        </div>

        {/* 弹幕字幕区 - 半透明深色背景 */}
        <div className="danmaku-captions">
          <div className="danmaku-scroll">
            {captions.map((caption) => (
              <div key={caption.id} className={`caption-row ${caption.speaker}`}>
                <div className="caption-avatar">
                  {caption.speaker === "ai" ? <RobotOutlined /> : <UserOutlined />}
                </div>
                <div className="caption-bubble">
                  <strong>{caption.label}</strong>
                  <p>{caption.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 输入区 */}
          <div className="caption-input">
            <TextArea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder={isAnswering ? "语音识别会实时写入这里..." : "等待提问结束后开始回答..."}
              autoSize={{ minRows: 2, maxRows: 3 }}
            />
          </div>

          {/* 底部操作按钮 */}
          <div className="caption-actions">
            {!isAnswering ? (
              <Button type="primary" size="large" onClick={startCandidateAnswer} disabled={!currentQuestion || interviewerState === "speaking"}>
                开始回答
              </Button>
            ) : (
              <>
                <Button
                  size="large"
                  danger
                  onClick={finishCandidateAnswer}
                  loading={finishingAnswer}
                  icon={<StopOutlined />}
                >
                  结束回答
                </Button>
                <Button
                  type="primary"
                  size="large"
                  onClick={finishCandidateAnswer}
                  icon={<ForwardOutlined />}
                >
                  进入下一题
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 右侧：题目与指标 (40%) */}
      <section className="interview-right">
        {/* 题目面板 */}
        <div className="question-panel">
          <div className="question-header">
            <Tag color="orange">核心考察项: {currentQuestion?.dimension || "已完成"}</Tag>
            <span className="question-progress">{questionProgress}</span>
          </div>
          {currentQuestion && (
            <>
              <h2 className="question-title">{currentQuestion.prompt}</h2>
              {currentQuestion.evidenceHints.length > 0 && (
                <div className="evidence-section">
                  <p className="evidence-label">AI 预设采分点:</p>
                  <div className="evidence-tags">
                    {currentQuestion.evidenceHints.map((h, i) => (
                      <span key={i} className="evidence-tag">
                        <span className="evidence-check">✓</span>
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {currentQuestion.followUps.length > 0 && (
                <div className="followup-section">
                  <p className="followup-label">AI 动态追问建议 (点击采纳):</p>
                  {currentQuestion.followUps.map((f, i) => (
                    <button key={i} className="followup-btn">
                      <span className="followup-icon">+</span>
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 实时状态分析面板 */}
        <div className="metrics-panel">
          <h3 className="metrics-title">
            <EyeOutlined /> 实时状态分析
          </h3>

          {/* 视线专注度 */}
          <div className="metric-item">
            <div className="metric-header">
              <span><EyeOutlined /> 视线专注度</span>
              <span className="metric-value-primary">{focusScore}%</span>
            </div>
            <div className="metric-bar">
              <div className="metric-bar-fill primary" style={{ width: `${focusScore}%` }} />
            </div>
          </div>

          {/* 面部微表情 */}
          <div className="metric-item">
            <div className="metric-header">
              <span><UserOutlined /> 面部微表情 (自信度)</span>
              <span className="metric-value-tertiary">{confidenceScore}%</span>
            </div>
            <div className="metric-bar">
              <div className="metric-bar-fill tertiary" style={{ width: `${confidenceScore}%` }} />
            </div>
          </div>

          {/* 语速与情绪平稳度 */}
          <div className="metric-item">
            <div className="metric-header">
              <span><SoundOutlined /> 语速与情绪平稳度</span>
              <span>正常</span>
            </div>
            <div className="waveform">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{ height: `${20 + Math.random() * 80}%` }}
                />
              ))}
            </div>
          </div>

          {/* 语音分析数据 */}
          {cumulativeMetrics && (
            <div className="metric-item">
              <div className="metric-header">
                <span>语音分析</span>
                <span>{audioChunkStatus}</span>
              </div>
              <div className="metric-grid">
                <div className="metric-card">
                  <span className="metric-card-label">语速</span>
                  <strong className="metric-card-value">
                    {cumulativeMetrics.speech_rate_sps?.toFixed(2) || "--"} 次/秒
                  </strong>
                </div>
                <div className="metric-card">
                  <span className="metric-card-label">已分析时长</span>
                  <strong className="metric-card-value">
                    {cumulativeMetrics.analyzed_duration_sec?.toFixed(1) || "--"} 秒
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 报告预览 */}
        {report && (
          <div className="report-panel">
            <h3>面试报告</h3>
            <pre className="report-preview">{report}</pre>
            {session.reportVisibility === "shared_with_candidate" && (
              <Button
                block
                onClick={() => {
                  downloadMarkdownReport(buildReportFilename(session.candidateName, session.id), report);
                }}
              >
                下载报告
              </Button>
            )}
          </div>
        )}
      </section>

      <style>{`
        .interview-page {
          display: flex;
          min-height: 100vh;
          background: #f7f9fb;
        }

        .interview-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: var(--space-md);
        }

        .interview-left {
          width: 60%;
          display: flex;
          flex-direction: column;
          padding: var(--space-lg);
          gap: var(--space-md);
        }

        .interview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-sm) var(--space-lg);
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(8px);
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.5);
        }

        .interview-header-left {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          color: #00629d;
        }

        .interview-header-left h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .interview-header-rec {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          background: rgba(255, 218, 214, 0.5);
          color: #ba1a1a;
          padding: var(--space-xs) var(--space-md);
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 600;
        }

        .rec-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ba1a1a;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(186, 26, 26, 0.6); }
          50% { opacity: 0.6; box-shadow: 0 0 12px rgba(186, 26, 26, 0.8); }
        }

        .video-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-sm);
          flex: 1;
          min-height: 300px;
        }

        .candidate-video-tile {
          background: white;
          border-radius: var(--radius-2xl);
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
        }

        .video-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-text-tertiary);
          gap: var(--space-sm);
        }

        .video-placeholder .anticon {
          font-size: 48px;
        }

        /* 弹幕字幕区 - 半透明深色背景 */
        .danmaku-captions {
          background: rgba(45, 49, 51, 0.85);
          backdrop-filter: blur(24px);
          border-radius: var(--radius-2xl);
          padding: var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(190, 199, 212, 0.1);
          min-height: 200px;
        }

        .danmaku-scroll {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          max-height: 150px;
        }

        .caption-row {
          display: flex;
          gap: var(--space-sm);
          animation: captionFadeIn 0.3s ease;
        }

        .caption-row.candidate {
          flex-direction: row-reverse;
        }

        .caption-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #cfe5ff;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #003948;
          flex-shrink: 0;
        }

        .caption-row.candidate .caption-avatar {
          background: #e0e3e5;
          color: #3f4852;
        }

        .caption-bubble {
          background: rgba(255, 255, 255, 0.9);
          padding: var(--space-xs) var(--space-sm);
          border-radius: var(--radius);
          max-width: 80%;
        }

        .caption-bubble strong {
          font-size: 12px;
          color: #6f7883;
        }

        .caption-bubble p {
          margin: 4px 0 0;
          color: #191c1e;
        }

        .caption-input .ant-input {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
          color: white;
          border-radius: var(--radius-lg);
        }

        .caption-input .ant-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .caption-actions {
          display: flex;
          gap: var(--space-sm);
          justify-content: flex-end;
        }

        /* 右侧面板 */
        .interview-right {
          width: 40%;
          background: rgba(242, 244, 246, 0.5);
          backdrop-filter: blur(12px);
          border-left: 1px solid rgba(190, 199, 212, 0.2);
          padding: var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          overflow-y: auto;
        }

        /* 题目面板 */
        .question-panel {
          background: white;
          border-radius: var(--radius-2xl);
          padding: var(--space-lg);
          box-shadow: 0 8px 30px rgba(0, 71, 255, 0.03);
          border: 1px solid white;
        }

        .question-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-sm);
        }

        .question-progress {
          color: #6f7883;
          font-size: 14px;
        }

        .question-title {
          font-size: 20px;
          font-weight: 700;
          margin: var(--space-sm) 0;
          line-height: 1.4;
          color: #191c1e;
        }

        .evidence-section {
          margin-top: var(--space-md);
        }

        .evidence-label {
          font-size: 12px;
          color: #6f7883;
          margin-bottom: var(--space-sm);
        }

        .evidence-tags {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-xs);
        }

        .evidence-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #f7f9fb;
          border: 1px solid rgba(190, 199, 212, 0.3);
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 13px;
          color: #191c1e;
        }

        .evidence-check {
          color: #52c41a;
        }

        .followup-section {
          margin-top: var(--space-md);
          padding-top: var(--space-md);
          border-top: 1px solid rgba(190, 199, 212, 0.2);
        }

        .followup-label {
          font-size: 12px;
          color: #6f7883;
          margin-bottom: var(--space-sm);
        }

        .followup-btn {
          width: 100%;
          text-align: left;
          padding: var(--space-sm);
          background: #f7f9fb;
          border: 1px solid rgba(190, 199, 212, 0.3);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-xs);
          cursor: pointer;
          transition: all 0.2s;
          font-size: 14px;
          color: #191c1e;
        }

        .followup-btn:hover {
          background: rgba(207, 229, 255, 0.3);
          border-color: rgba(0, 163, 255, 0.5);
          color: #00629d;
        }

        .followup-icon {
          color: #00629d;
          margin-right: var(--space-xs);
        }

        /* 实时状态分析面板 */
        .metrics-panel {
          background: white;
          border-radius: var(--radius-2xl);
          padding: var(--space-lg);
          box-shadow: 0 8px 30px rgba(0, 71, 255, 0.03);
          border: 1px solid white;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        .metrics-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          color: #00629d;
        }

        .metric-item {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #6f7883;
        }

        .metric-value-primary {
          font-size: 18px;
          font-weight: 700;
          color: #00629d;
        }

        .metric-value-tertiary {
          font-size: 18px;
          font-weight: 700;
          color: #00677f;
        }

        .metric-bar {
          height: 8px;
          background: #e6e8ea;
          border-radius: 9999px;
          overflow: hidden;
        }

        .metric-bar-fill {
          height: 100%;
          border-radius: 9999px;
          transition: width 1s ease-out;
        }

        .metric-bar-fill.primary {
          background: #00a3ff;
          box-shadow: 0 0 12px rgba(0, 163, 255, 0.6);
        }

        .metric-bar-fill.tertiary {
          background: #00677f;
          box-shadow: 0 0 12px rgba(0, 103, 127, 0.6);
        }

        .waveform {
          height: 48px;
          display: flex;
          align-items: flex-end;
          gap: 4px;
          background: #f7f9fb;
          border-radius: var(--radius-lg);
          padding: var(--space-xs);
          border: 1px solid rgba(190, 199, 212, 0.2);
        }

        .waveform-bar {
          width: 8px;
          background: rgba(0, 163, 255, 0.6);
          border-radius: 9999px;
          transition: height 0.3s ease;
        }

        .waveform-bar:nth-child(odd) {
          background: rgba(0, 163, 255, 0.4);
        }

        .waveform-bar:nth-child(3n) {
          background: #00629d;
          box-shadow: 0 0 8px rgba(0, 163, 255, 0.5);
        }

        .metric-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-sm);
          margin-top: var(--space-xs);
        }

        .metric-card {
          text-align: center;
          padding: var(--space-sm);
          background: #f7f9fb;
          border-radius: var(--radius);
        }

        .metric-card-label {
          display: block;
          font-size: 12px;
          color: #6f7883;
        }

        .metric-card-value {
          display: block;
          font-size: 16px;
          color: #191c1e;
        }

        .report-panel {
          background: white;
          border-radius: var(--radius-2xl);
          padding: var(--space-lg);
          box-shadow: 0 8px 30px rgba(0, 71, 255, 0.03);
        }

        .report-panel h3 {
          margin-bottom: var(--space-md);
        }

        .report-preview {
          max-height: 150px;
          overflow: auto;
          font-size: 12px;
          white-space: pre-wrap;
          background: #f7f9fb;
          padding: var(--space-sm);
          border-radius: var(--radius);
        }

        @media (max-width: 1200px) {
          .interview-page {
            flex-direction: column;
          }

          .interview-left, .interview-right {
            width: 100%;
          }

          .interview-right {
            border-left: none;
            border-top: 1px solid rgba(190, 199, 212, 0.2);
          }
        }

        @keyframes captionFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// 数字人面试官瓦片
function DigitalInterviewerTile({
  candidateName,
  currentStep,
  totalSteps,
  state,
}: {
  candidateName: string;
  currentStep: number;
  totalSteps: number;
  state: DigitalInterviewerState;
}) {
  const description = describeDigitalInterviewerState(state, Math.max(currentStep, 0), Math.max(totalSteps, 0));

  return (
    <div className={`digital-interviewer-tile ${description.isAnimated ? "speaking" : ""}`}>
      <div className="digital-avatar">
        <div className="avatar-orbit" />
        <div className="avatar-core">AI</div>
      </div>
      <div className="digital-name-row">
        <strong>AI 面试官</strong>
        <span className="status-tag">{description.label}</span>
      </div>
      <p>{candidateName}，我会按题目顺序主持本轮面试。</p>
      <div className="voice-bars">
        <span /><span /><span /><span />
      </div>
      <small>{description.detail}</small>

      <style>{`
        .digital-interviewer-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-xl);
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: var(--radius-2xl);
          text-align: center;
          color: white;
          box-shadow: 0 0 30px rgba(0, 163, 255, 0.15);
          border: 2px solid rgba(0, 163, 255, 0.2);
        }

        .digital-avatar {
          position: relative;
          width: 120px;
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-orbit {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(from 20deg, #00629d, #52c41a, #0ea5e9, #00629d);
          opacity: 0.8;
        }

        .digital-interviewer-tile.speaking .avatar-orbit {
          animation: avatarPulse 1.4s ease-in-out infinite;
        }

        .avatar-core {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          font-weight: 900;
          color: #00629d;
          position: relative;
        }

        .digital-name-row {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-top: var(--space-md);
        }

        .digital-name-row strong {
          font-size: 16px;
        }

        .status-tag {
          background: rgba(207, 229, 255, 0.3);
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
        }

        .digital-interviewer-tile p {
          color: rgba(255, 255, 255, 0.7);
          margin: var(--space-sm) 0;
          max-width: 260px;
          font-size: 13px;
        }

        .voice-bars {
          display: flex;
          gap: 4px;
          height: 24px;
          align-items: center;
        }

        .voice-bars span {
          width: 5px;
          height: 8px;
          background: #00a3ff;
          border-radius: 9999px;
          opacity: 0.3;
        }

        .digital-interviewer-tile.speaking .voice-bars span {
          opacity: 1;
          animation: voiceBounce 0.8s ease-in-out infinite;
        }

        .digital-interviewer-tile.speaking .voice-bars span:nth-child(2) { animation-delay: 0.12s; }
        .digital-interviewer-tile.speaking .voice-bars span:nth-child(3) { animation-delay: 0.24s; }
        .digital-interviewer-tile.speaking .voice-bars span:nth-child(4) { animation-delay: 0.36s; }

        .digital-interviewer-tile small {
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
        }

        @keyframes avatarPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
        }

        @keyframes voiceBounce {
          0%, 100% { height: 8px; }
          50% { height: 20px; }
        }
      `}</style>
    </div>
  );
}

// LiveKit 会议组件
function CandidateLiveKitConference() {
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });

  return (
    <div className="candidate-livekit-room">
      <div className="candidate-video-grid">
        <GridLayout tracks={cameraTracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <ControlBar
        controls={{
          microphone: true,
          camera: true,
          screenShare: false,
          chat: false,
          settings: false,
          leave: true,
        }}
      />
      <RoomAudioRenderer />
      <style>{`
        .candidate-livekit-room {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #f7f9fb;
        }

        .candidate-video-grid {
          flex: 1;
          min-height: 200px;
        }
      `}</style>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取音频分片失败"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.readAsDataURL(blob);
  });
}

export default InterviewPage;
