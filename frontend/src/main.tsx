import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { createSession, submitAnswer, submitVideoEvent } from "./apiClient";
import {
  buildAvatarPrompt,
  createDraft,
  generateMarkdownReport,
  type DraftInput,
  type InterviewSession
} from "./interviewFlow";
import { buildVideoMetrics, classifyVideoEvent, type VideoMetrics as AnalyzerVideoMetrics } from "./videoAnalyzer";
import "./styles.css";

function App() {
  const [draft, setDraft] = useState<DraftInput>(createDraft());
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [durationSec, setDurationSec] = useState(90);
  const [apiReport, setApiReport] = useState("");
  const [error, setError] = useState("");
  const [cameraStatus, setCameraStatus] = useState("未开启");
  const [currentMetrics, setCurrentMetrics] = useState<AnalyzerVideoMetrics | null>(null);
  const [lastVideoEvent, setLastVideoEvent] = useState("暂无");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<InterviewSession | null>(null);
  const intervalRef = useRef<number | null>(null);
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const analysisStartRef = useRef<number>(0);
  const analyzingRef = useRef(false);
  const report = useMemo(() => apiReport || (session ? generateMarkdownReport(session) : ""), [apiReport, session]);

  const avatarPrompt = session ? buildAvatarPrompt(session) : "填写材料后开始生成面试问题。";

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function updateDraft(field: keyof DraftInput, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateDraftFlag(field: keyof Pick<DraftInput, "useLlmQuestions">, value: boolean) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function startInterview() {
    setError("");
    setApiReport("");
    try {
      setSession(await createSession(draft));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "创建面试失败");
    }
    setAnswerText("");
  }

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持摄像头授权。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      previousPixelsRef.current = null;
      analysisStartRef.current = performance.now();
      setCameraStatus("分析中");
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      intervalRef.current = window.setInterval(() => {
        void analyzeFrame();
      }, 1500);
    } catch (cameraError) {
      setCameraStatus("授权失败");
      setError(cameraError instanceof Error ? cameraError.message : "摄像头启动失败");
    }
  }

  function stopCamera() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStatus("已停止");
  }

  async function analyzeFrame() {
    if (analyzingRef.current || !videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) {
      return;
    }

    analyzingRef.current = true;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      analyzingRef.current = false;
      return;
    }
    canvas.width = 160;
    canvas.height = 120;
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = new Uint8ClampedArray(imageData.data);
    const metrics = buildVideoMetrics(pixels, previousPixelsRef.current);
    const classification = classifyVideoEvent(metrics);
    const timestamp = Math.max(0, (performance.now() - analysisStartRef.current) / 1000);

    previousPixelsRef.current = pixels;
    setCurrentMetrics(metrics);
    setLastVideoEvent(`${timestamp.toFixed(1)}s ${classification.eventType}`);

    if (classification.eventType !== "steady" && sessionRef.current) {
      try {
        const keyframe = classification.shouldCaptureKeyframe
          ? {
              reason: classification.keyframeReason ?? classification.eventType,
              dataUrl: canvas.toDataURL("image/jpeg", 0.72)
            }
          : undefined;
        const updated = await submitVideoEvent(sessionRef.current.id, {
          timestamp,
          eventType: classification.eventType,
          confidence: classification.confidence,
          metrics,
          keyframe
        });
        setSession(updated);
        setApiReport("");
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : "上传视频观察失败");
      }
    }
    analyzingRef.current = false;
  }

  async function submitCurrentAnswer() {
    if (!session) {
      return;
    }
    setError("");
    try {
      const result = await submitAnswer(session.id, { text: answerText, durationSec });
      setSession(result.session);
      setApiReport(result.report);
      setAnswerText("");
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "记录回答失败");
    }
  }

  function speakQuestion() {
    if (!("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(avatarPrompt);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="app-shell">
      <section className="panel setup-panel">
        <p className="eyebrow">Python + TypeScript MVP</p>
        <h1>HCI AI 辅助面试</h1>
        <label>
          候选人
          <input value={draft.candidateName} onChange={(event) => updateDraft("candidateName", event.target.value)} />
        </label>
        <label>
          简历摘要
          <textarea value={draft.resume} rows={6} onChange={(event) => updateDraft("resume", event.target.value)} />
        </label>
        <label>
          岗位 JD
          <textarea
            value={draft.jobDescription}
            rows={6}
            onChange={(event) => updateDraft("jobDescription", event.target.value)}
          />
        </label>
        <label>
          面试目标
          <textarea
            value={draft.interviewGoal}
            rows={4}
            onChange={(event) => updateDraft("interviewGoal", event.target.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={Boolean(draft.useLlmQuestions)}
            onChange={(event) => updateDraftFlag("useLlmQuestions", event.target.checked)}
          />
          使用 OpenAI-compatible LLM 生成问题
        </label>
        <button type="button" onClick={startInterview}>
          生成问题并开始
        </button>
        {session ? <p className="status-line">LLM 状态：{session.llmStatus}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel interview-panel">
        <div className="avatar-row">
          <div className="avatar-face" aria-hidden="true">
            AI
          </div>
          <div>
            <p className="eyebrow">数字人面试官</p>
            <h2>{avatarPrompt}</h2>
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={speakQuestion} disabled={!session}>
            朗读当前问题
          </button>
          <span>{session ? `${Math.min(session.currentIndex + 1, session.questions.length)}/${session.questions.length}` : "未开始"}</span>
        </div>
        <ol className="question-list">
          {(session?.questions ?? []).map((question, index) => (
            <li key={question.id} className={session?.currentQuestion?.id === question.id ? "active" : ""}>
              <span>{index + 1}</span>
              <strong>{question.dimension}</strong>
              <p>{question.prompt}</p>
            </li>
          ))}
        </ol>
        <div className="answer-box">
          <label>
            候选人回答
            <textarea
              value={answerText}
              rows={7}
              placeholder="输入或粘贴候选人的回答..."
              onChange={(event) => setAnswerText(event.target.value)}
            />
          </label>
          <label>
            回答用时（秒）
            <input
              type="number"
              min={0}
              value={durationSec}
              onChange={(event) => setDurationSec(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={submitCurrentAnswer} disabled={!session?.currentQuestion}>
            记录回答并进入下一题
          </button>
        </div>
        <div className="video-box">
          <div className="video-toolbar">
            <div>
              <p className="eyebrow">实时摄像头观察</p>
              <strong>{cameraStatus}</strong>
            </div>
            <div className="actions compact">
              <button type="button" onClick={startCamera}>
                开启摄像头
              </button>
              <button type="button" className="secondary-button" onClick={stopCamera}>
                停止
              </button>
            </div>
          </div>
          <video ref={videoRef} className="camera-preview" muted playsInline />
          <canvas ref={canvasRef} hidden />
          <div className="metric-grid">
            <Metric label="脸部可见" value={currentMetrics?.facePresent ? "是" : "待检测"} />
            <Metric label="亮度" value={formatMetric(currentMetrics?.brightness)} />
            <Metric label="清晰度" value={formatMetric(currentMetrics?.blur)} />
            <Metric label="运动量" value={formatMetric(currentMetrics?.motion)} />
            <Metric label="视线稳定" value={formatMetric(currentMetrics?.gazeProxy)} />
            <Metric label="头动" value={formatMetric(currentMetrics?.headPoseProxy)} />
            <Metric label="眨眼" value={formatMetric(currentMetrics?.blinkProxy)} />
            <Metric label="手势活跃" value={formatMetric(currentMetrics?.handActivity)} />
          </div>
          <p className="status-line">最近事件：{lastVideoEvent}</p>
        </div>
      </section>

      <section className="panel output-panel">
        <div>
          <p className="eyebrow">事件日志</p>
          <ul className="events">
            {(session?.events ?? []).map((event, index) => (
              <li key={`${event.timestamp}-${index}`}>{event.message}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">关键帧</p>
          <div className="keyframes">
            {(session?.keyframes ?? []).length === 0 ? <p className="muted">暂无关键帧。</p> : null}
            {(session?.keyframes ?? []).map((keyframe, index) => (
              <figure key={`${keyframe.timestamp}-${index}`}>
                <img src={keyframe.dataUrl} alt={`${keyframe.reason} at ${keyframe.timestamp.toFixed(1)}s`} />
                <figcaption>
                  {keyframe.timestamp.toFixed(1)}s · {keyframe.reason}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow">智能纪要</p>
          <pre>{session && session.answers.length > 0 ? report : "完成至少一道回答后，可生成面试纪要。"}</pre>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatMetric(value?: number | null): string {
  return typeof value === "number" ? value.toFixed(2) : "待检测";
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
