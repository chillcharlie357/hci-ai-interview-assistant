import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useTracks } from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";

import {
  createInterviewSessionFromPrep,
  fetchReport,
  getSession,
  requestLiveKitToken,
  submitAnswer,
  submitPrepFollowup,
  submitResume
} from "./apiClient";
import {
  buildAvatarPrompt,
  generateMarkdownReport,
  type InterviewSession,
  type PrepSession,
  type ReportVisibility
} from "./interviewFlow";
import {
  buildConversationCaptions,
  describeDigitalInterviewerState,
  shouldAutoSpeakQuestion,
  type DigitalInterviewerState
} from "./digitalInterviewer";
import { createSpeechTranscriber } from "./speechRecognition";
import { useVideoObservation, type VideoObservationStatus } from "./useVideoObservation";
import "./styles.css";

function App() {
  const path = window.location.pathname;
  const match = path.match(/^\/interview\/([^/]+)/);
  if (match) {
    return <CandidateInterviewPage sessionId={decodeURIComponent(match[1])} />;
  }
  return <RecruiterPage />;
}

function RecruiterPage() {
  const [candidateName, setCandidateName] = useState("候选人");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [prep, setPrep] = useState<PrepSession | null>(null);
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [reportVisibility, setReportVisibility] = useState<ReportVisibility>("recruiter_only");
  const [useLlmQuestions, setUseLlmQuestions] = useState(true);
  const [enableVideoObservation, setEnableVideoObservation] = useState(true);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function uploadResume() {
    if (!resumeFile) {
      setError("请先选择简历文件。");
      return;
    }
    setBusy(true);
    setError("");
    setReport("");
    try {
      const dataBase64 = await fileToBase64(resumeFile);
      setPrep(
        await submitResume({
          candidateName,
          fileName: resumeFile.name,
          contentType: resumeFile.type || "application/octet-stream",
          dataBase64
        })
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "简历上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitFollowup() {
    if (!prep || !followupAnswer.trim()) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      setPrep(await submitPrepFollowup(prep.id, followupAnswer));
      setFollowupAnswer("");
    } catch (followupError) {
      setError(followupError instanceof Error ? followupError.message : "提交职位信息失败");
    } finally {
      setBusy(false);
    }
  }

  async function createInterview() {
    if (!prep) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await createInterviewSessionFromPrep(prep.id, {
        reportVisibility,
        useLlmQuestions,
        enableVideoObservation
      });
      setSession(created);
      setReport("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建面试失败");
    } finally {
      setBusy(false);
    }
  }

  async function loadRecruiterReport() {
    if (!session) {
      return;
    }
    setError("");
    try {
      const result = await fetchReport(session.id, "recruiter");
      setReport(result.report);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "获取报告失败");
    }
  }

  const interviewUrl = session ? `${window.location.origin}/interview/${session.id}` : "";

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">招聘端</p>
          <h1>AI 辅助面试配置</h1>
        </div>
        {session ? <a className="link-button" href={interviewUrl}>打开面试端</a> : null}
      </header>

      <section className="workflow-grid">
        <div className="panel">
          <p className="eyebrow">1. 上传简历</p>
          <label>
            候选人
            <input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} />
          </label>
          <label>
            简历文件
            <input
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
              onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" onClick={uploadResume} disabled={busy}>
            上传并解析
          </button>
          {prep ? <pre className="preview-box">{prep.resumeMarkdownPreview}</pre> : null}
        </div>

        <div className="panel">
          <p className="eyebrow">2. 补齐职位要求</p>
          {(prep?.followupQuestions ?? []).map((question, index) => (
            <p className="question-prompt" key={`${question}-${index}`}>{question}</p>
          ))}
          {prep?.readySummary ? (
            <div className="summary-box">
              <strong>{prep.readySummary.role}</strong>
              <p>{prep.readySummary.jobDescription}</p>
              <p>{prep.readySummary.interviewGoal}</p>
            </div>
          ) : null}
          <label>
            招聘方回答
            <textarea
              value={followupAnswer}
              rows={6}
              placeholder="补充岗位职责、必须能力、希望重点追问的经历..."
              onChange={(event) => setFollowupAnswer(event.target.value)}
            />
          </label>
          <button type="button" onClick={submitFollowup} disabled={!prep || busy}>
            提交职位信息
          </button>
          {prep ? <p className="status-line">LLM 状态：{prep.llmStatus}</p> : null}
        </div>

        <div className="panel">
          <p className="eyebrow">3. 面试配置</p>
          <label>
            报告可见性
            <select value={reportVisibility} onChange={(event) => setReportVisibility(event.target.value as ReportVisibility)}>
              <option value="recruiter_only">仅招聘端可见</option>
              <option value="shared_with_candidate">招聘端和候选人都可见</option>
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={useLlmQuestions} onChange={(event) => setUseLlmQuestions(event.target.checked)} />
            使用 LLM 生成面试问题
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={enableVideoObservation}
              onChange={(event) => setEnableVideoObservation(event.target.checked)}
            />
            允许面试端摄像头观察信号
          </label>
          <button type="button" onClick={createInterview} disabled={!prep || busy}>
            生成问题和面试链接
          </button>
          {session ? (
            <div className="summary-box">
              <strong>{session.role}</strong>
              <p>Room：{session.meetingRoom}</p>
              <p>报告权限：{session.reportVisibility === "recruiter_only" ? "仅招聘端" : "双方可见"}</p>
              <input readOnly value={interviewUrl} />
            </div>
          ) : null}
        </div>
      </section>

      {session ? (
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">面试题与报告</p>
              <h2>{session.questions.length} 道问题</h2>
            </div>
            <button type="button" onClick={loadRecruiterReport}>查看招聘端报告</button>
          </div>
          <ol className="question-list">
            {session.questions.map((question, index) => (
              <li key={question.id}>
                <span>{index + 1}</span>
                <strong>{question.dimension}</strong>
                <p>{question.prompt}</p>
              </li>
            ))}
          </ol>
          {report ? <pre>{report}</pre> : null}
        </section>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
    </main>
  );
}

function CandidateInterviewPage({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [durationSec, setDurationSec] = useState(90);
  const [report, setReport] = useState("");
  const [liveKit, setLiveKit] = useState<{ url: string; token: string; room: string } | null>(null);
  const [meetingError, setMeetingError] = useState("");
  const [speechStatus, setSpeechStatus] = useState("未开始");
  const [interviewerState, setInterviewerState] = useState<DigitalInterviewerState>("preparing");
  const [answerStartedAt, setAnswerStartedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const transcriberRef = useRef<ReturnType<typeof createSpeechTranscriber> | null>(null);
  const lastAutoSpokenQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    void loadSession();
  }, [sessionId]);

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

  async function loadSession() {
    setError("");
    try {
      const loaded = await getSession(sessionId);
      setSession(loaded);
      try {
        setLiveKit(await requestLiveKitToken(sessionId, { participantName: loaded.candidateName, participantRole: "candidate" }));
        setMeetingError("");
      } catch (tokenError) {
        setMeetingError(tokenError instanceof Error ? tokenError.message : "会议服务未配置");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载面试失败");
    }
  }

  function speakQuestion(mode: "auto" | "replay" = "replay") {
    if (!session?.currentQuestion) {
      setInterviewerState("finished");
      return;
    }
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setInterviewerState("unsupported");
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
    if (!session?.currentQuestion || answerStartedAt !== null) {
      return;
    }
    const transcriber = createSpeechTranscriber(
      window,
      (text) => setAnswerText((current) => (current ? `${current}${text}` : text)),
      (message) => {
        setSpeechStatus(formatSpeechStatus(message));
      }
    );
    transcriberRef.current = transcriber;
    transcriber.start();
    setSpeechStatus(transcriber.supported ? "识别中" : "不支持");
    setAnswerStartedAt(Date.now());
  }

  function stopCandidateSpeech() {
    transcriberRef.current?.stop();
    setSpeechStatus("已停止");
  }

  async function finishCandidateAnswer() {
    if (!session?.currentQuestion) {
      return;
    }
    stopCandidateSpeech();
    setError("");
    try {
      const measuredDuration = answerStartedAt ? Math.max(1, Math.round((Date.now() - answerStartedAt) / 1000)) : durationSec;
      const result = await submitAnswer(session.id, { text: answerText, durationSec: measuredDuration });
      setSession(result.session);
      setAnswerText("");
      setAnswerStartedAt(null);
      setDurationSec(90);
      setSpeechStatus("未开始");
      try {
        const visibleReport = await fetchReport(session.id, "candidate");
        setReport(visibleReport.report);
      } catch {
        setReport("招聘端尚未开放候选人查看面试分析报告。");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交回答失败");
    }
  }

  const localReport = useMemo(() => (session ? generateMarkdownReport(session) : ""), [session]);
  const captions = useMemo(() => (session ? buildConversationCaptions(session, answerText) : []), [session, answerText]);
  const isAnswering = answerStartedAt !== null;

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">面试端</p>
          <h1>{session?.candidateName ?? "候选人"} · 视频面试</h1>
        </div>
        <a className="link-button" href="/recruiter">返回招聘端</a>
      </header>

      <section className="meeting-layout">
        <div className="panel meeting-panel">
          <div className="meeting-stage">
            <DigitalInterviewerTile
              candidateName={session?.candidateName ?? "候选人"}
              currentStep={session ? Math.min(session.currentIndex + 1, session.questions.length) : 0}
              totalSteps={session?.questions.length ?? 0}
              state={interviewerState}
            />
            <div className="candidate-meeting-tile">
              {liveKit ? (
                <LiveKitRoom token={liveKit.token} serverUrl={liveKit.url} connect audio video>
                  <CandidateLiveKitConference
                    sessionId={session?.id ?? ""}
                    enableVideoObservation={session?.enableVideoObservation ?? false}
                  />
                </LiveKitRoom>
              ) : (
                <div className="meeting-placeholder">
                  <strong>会议服务未配置</strong>
                  <p>{meetingError || "请在 .env 中配置 LiveKit 后再进入真实视频会议。"}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="panel subtitle-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">实时字幕</p>
              <h2>{session ? `${Math.min(session.currentIndex + 1, session.questions.length)}/${session.questions.length}` : "加载中"}</h2>
            </div>
            <span className="status-pill">{isAnswering ? "候选人回答中" : interviewerState === "speaking" ? "数字人提问中" : "等待回答"}</span>
          </div>
          <div className="caption-stream" aria-live="polite">
            {captions.map((caption) => (
              <div className={`caption-row ${caption.speaker}`} key={caption.id}>
                <strong>{caption.label}</strong>
                <p>{caption.text}</p>
              </div>
            ))}
          </div>
          <label className="caption-input">
            候选人字幕
            <textarea
              value={answerText}
              rows={5}
              placeholder={isAnswering ? "语音识别会实时写入这里，也可以手动修正..." : "等待数字人提问结束后开始回答..."}
              onChange={(event) => setAnswerText(event.target.value)}
            />
          </label>
          <div className="actions">
            {!isAnswering ? (
              <button type="button" onClick={startCandidateAnswer} disabled={!session?.currentQuestion || interviewerState === "speaking"}>
                开始回答
              </button>
            ) : (
              <button type="button" onClick={finishCandidateAnswer} disabled={!session?.currentQuestion}>
                结束回答
              </button>
            )}
            <span>{speechStatus}</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">候选人可见报告</p>
        <pre>{report || (session?.reportVisibility === "shared_with_candidate" ? localReport : "报告默认仅招聘端可见。")}</pre>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
    </main>
  );
}

function formatSpeechStatus(message: string) {
  if (message === "no-speech") {
    return "未检测到语音，可手动修正";
  }
  if (message === "not-allowed") {
    return "麦克风未授权，可手动输入";
  }
  if (message === "network") {
    return "语音服务不可用，可手动输入";
  }
  return message || "识别失败，可手动修正";
}

function DigitalInterviewerTile({
  candidateName,
  currentStep,
  totalSteps,
  state
}: {
  candidateName: string;
  currentStep: number;
  totalSteps: number;
  state: DigitalInterviewerState;
}) {
  const description = describeDigitalInterviewerState(state, Math.max(currentStep, 0), Math.max(totalSteps, 0));
  return (
    <div className={`digital-interviewer-tile ${description.isAnimated ? "speaking" : ""}`}>
      <div className="digital-avatar" aria-hidden="true">
        <div className="avatar-orbit" />
        <div className="avatar-core">AI</div>
      </div>
      <div className="digital-name-row">
        <strong>AI 面试官</strong>
        <span>{description.label}</span>
      </div>
      <p>{candidateName}，我会按题目顺序主持本轮面试。</p>
      <div className="voice-bars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <small>{description.detail}</small>
    </div>
  );
}

function CandidateLiveKitConference({
  sessionId,
  enableVideoObservation
}: {
  sessionId: string;
  enableVideoObservation: boolean;
}) {
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false
  });

  // 取本地候选人自己的 camera track 用于抽帧分析
  const localCameraRef = cameraTracks.find(
    (trackRef) => trackRef.participant?.isLocal && trackRef.publication?.track
  );
  const [hiddenVideoEl, setHiddenVideoEl] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!hiddenVideoEl) {
      return;
    }
    const track = localCameraRef?.publication?.track;
    if (!track) {
      return;
    }
    track.attach(hiddenVideoEl);
    // 属性强制保证 drawImage 能从 video 正常读取
    hiddenVideoEl.muted = true;
    hiddenVideoEl.playsInline = true;
    hiddenVideoEl.autoplay = true;
    void hiddenVideoEl.play().catch(() => {
      /* 自动播放在未交互时可能被阻止，忽略即可，下一次 tick 会重试 drawImage */
    });
    return () => {
      try {
        track.detach(hiddenVideoEl);
      } catch {
        /* track 断开时可能已 detach，忽略 */
      }
    };
  }, [hiddenVideoEl, localCameraRef?.publication?.track]);

  const observation = useVideoObservation({
    sessionId,
    enabled: enableVideoObservation && Boolean(sessionId) && Boolean(localCameraRef),
    videoEl: hiddenVideoEl
  });

  return (
    <div className="candidate-livekit-room">
      <div className="candidate-video-grid">
        <GridLayout tracks={cameraTracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      {enableVideoObservation ? (
        <div className="observation-badge" aria-live="polite">
          <span className={`observation-dot ${observation.status}`} />
          <span className="observation-text">
            摄像头观察：{describeObservationStatus(observation.status)}
            {observation.frameCount > 0 ? ` · 帧 ${observation.frameCount}` : ""}
            {observation.eventCount > 0 ? ` · 事件 ${observation.eventCount}` : ""}
            {observation.keyframeCount > 0 ? ` · 关键帧 ${observation.keyframeCount}` : ""}
            {observation.lastEventType ? ` · 最近：${observation.lastEventType}` : ""}
          </span>
        </div>
      ) : null}
      {/* 抽帧用隐藏 <video>，不展示给用户；画面本身已在上方 ParticipantTile 显示 */}
      <video
        ref={setHiddenVideoEl}
        style={{ display: "none" }}
        muted
        playsInline
        autoPlay
      />
      <ControlBar
        controls={{
          microphone: true,
          camera: true,
          screenShare: false,
          chat: false,
          settings: false,
          leave: true
        }}
      />
      <RoomAudioRenderer />
    </div>
  );
}

function describeObservationStatus(status: VideoObservationStatus): string {
  switch (status) {
    case "running":
      return "本地分析中（不录像）";
    case "idle":
      return "准备中";
    case "no_track":
      return "未检测到摄像头";
    case "disabled":
      return "已关闭";
    case "error":
      return "分析异常";
    default:
      return status;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
