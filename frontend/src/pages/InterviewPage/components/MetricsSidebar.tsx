import { memo } from "react";
import { Button, Tag } from "antd";
import { EyeOutlined, UserOutlined, SoundOutlined } from "@ant-design/icons";

import type { InterviewSession, InterviewQuestion } from "@/interviewFlow";
import { buildReportFilename, downloadMarkdownReport } from "@/reportDownload";
import type { VideoAnalysisHandle } from "../hooks/useVideoAnalysis";
import type { SpeechRecognitionHandle } from "../hooks/useSpeechRecognition";

type MetricRef = { min: number; max: number; unit: string };
const DBFS_TO_SPL_OFFSET = 94;

const REF_RANGES = {
  eyeContactRatio: { min: 0.6, max: 0.7, unit: "%" },
  blinkRate: { min: 15, max: 20, unit: "次/分钟" },
  nodRate: { min: 3, max: 5, unit: "次/分钟" },
  speechRateWpm: { min: 120, max: 160, unit: "字/分钟" },
  volumeDb: { min: 60, max: 75, unit: "dB SPL" },
  f0StdSemitones: { min: 1.5, max: 4.0, unit: "st" },
} as const satisfies Record<string, MetricRef>;

type Level = "偏低" | "合理" | "偏高";
const LEVEL_COLOR: Record<Level, string> = { 偏低: "blue", 合理: "green", 偏高: "orange" };
const LEVEL_BAR_CLASS: Record<Level, string> = { 偏低: "low", 合理: "normal", 偏高: "high" };

function classifyMetric(value: number, ref: MetricRef): Level {
  if (value < ref.min) return "偏低";
  if (value > ref.max) return "偏高";
  return "合理";
}

interface MetricsSidebarProps {
  session: InterviewSession;
  video: VideoAnalysisHandle;
  speech: SpeechRecognitionHandle;
  currentQuestion: InterviewQuestion | null;
  questionProgress: string;
  report: string;
}

export const MetricsSidebar = memo(function MetricsSidebar({
  session,
  video,
  speech,
  currentQuestion,
  questionProgress,
  report,
}: MetricsSidebarProps) {
  const latestStoredMetrics = session.videoEvents.at(-1)?.metrics;
  const currentEyeContactRatio = video.faceMetricsSnapshot?.eyeContactRatio ?? latestStoredMetrics?.eyeContactRatio ?? 0;
  const currentBlinkRate = video.faceMetricsSnapshot?.blinkRatePerMinute ?? latestStoredMetrics?.blinkRatePerMinute ?? 0;
  const currentBlinkCount = video.faceMetricsSnapshot?.blinkCount ?? latestStoredMetrics?.blinkCount ?? 0;
  const currentGazeDeviation = video.faceMetricsSnapshot?.gazeDeviationDeg ?? latestStoredMetrics?.gazeDeviationDeg ?? null;
  const currentEyeAspectRatio = video.faceMetricsSnapshot?.eyeAspectRatio ?? latestStoredMetrics?.eyeAspectRatio ?? null;
  const currentNodRate = video.faceMetricsSnapshot?.nodRatePerMinute ?? latestStoredMetrics?.nodRatePerMinute ?? 0;

  // 语音指标：优先使用 recentMetrics（实时响应），回退到 cumulativeMetrics
  const speechRateRaw = speech.recentMetrics?.speech_rate_sps ?? speech.cumulativeMetrics?.speech_rate_sps ?? null;
  const speechRateWpm = speechRateRaw !== null ? speechRateRaw * 60 : null;
  const volumeDbRaw = speech.recentMetrics?.rms_db_mean ?? speech.cumulativeMetrics?.rms_db_mean ?? null;
  const volumeDbSpl = volumeDbRaw !== null ? volumeDbRaw + DBFS_TO_SPL_OFFSET : null;
  const f0StdSemitones = speech.recentMetrics?.f0_std_semitones ?? speech.cumulativeMetrics?.f0_std_semitones ?? null;

  return (
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
      <div className="metrics-panel" aria-live="polite" aria-label="实时状态分析">
        <h3 className="metrics-title">
          <EyeOutlined /> 实时状态分析
        </h3>

        <div className="metric-item">
          <div className="metric-header">
            <span>面部分析状态</span>
            <span>{video.videoObservationStatus}</span>
          </div>
          <div className="metric-footnote">
            {video.currentFacePresent ? "已检测到人脸并持续分析。" : "等待稳定检测到人脸后再更新眨眼和眼神接触指标。"}
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-header">
            <span><EyeOutlined /> 眼神接触时间占比</span>
            <span className="metric-value-primary">{(currentEyeContactRatio * 100).toFixed(0)}%</span>
          </div>
          <div className="metric-bar">
            <div className="metric-bar-fill primary" style={{ width: `${(currentEyeContactRatio * 100).toFixed(0)}%` }} />
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-header">
            <span><UserOutlined /> 眨眼频率</span>
            <span className="metric-value-tertiary">{currentBlinkRate.toFixed(1)} 次/分钟</span>
          </div>
          <div className="metric-bar">
            <div className="metric-bar-fill tertiary" style={{ width: `${(Math.min(currentBlinkRate, 30) / 30) * 100}%` }} />
          </div>
          <div className="metric-footnote">累计眨眼 {currentBlinkCount} 次，按稳定的睁眼-闭眼-睁眼序列统计。</div>
        </div>

        <div className="metric-item">
          <div className="metric-header">
            <span>视线偏转角</span>
            <span>{currentGazeDeviation === null ? "--" : `${currentGazeDeviation.toFixed(1)}°`}</span>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <span className="metric-card-label">EAR</span>
              <strong className="metric-card-value">{currentEyeAspectRatio === null ? "--" : currentEyeAspectRatio.toFixed(3)}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-card-label">眼神接触判定</span>
              <strong className="metric-card-value">{currentGazeDeviation !== null && currentGazeDeviation <= 10 ? "是" : "否"}</strong>
            </div>
          </div>
          <div className="metric-footnote">
            EAR 是 Eye Aspect Ratio，即眼睛纵横比。数值越低通常表示眼睛更接近闭合；系统会结合个人基线判断眨眼，不直接用单个固定值下结论。
          </div>
          <div className="metric-footnote">
            眼神接触以偏头程度和双眼连线倾斜综合估算，偏差小于 10° 记为眼神接触。
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-header">
            <span><UserOutlined /> 点头频率</span>
            <span className="metric-value-row">
              <span className="metric-value-tertiary">{currentNodRate.toFixed(1)} 次/分钟</span>
              <Tag color={LEVEL_COLOR[classifyMetric(currentNodRate, REF_RANGES.nodRate)]} className="metric-level-tag">
                {classifyMetric(currentNodRate, REF_RANGES.nodRate)}
              </Tag>
            </span>
          </div>
          <div className="metric-bar">
            <div className={`metric-bar-fill ${LEVEL_BAR_CLASS[classifyMetric(currentNodRate, REF_RANGES.nodRate)]}`} style={{ width: `${(Math.min(currentNodRate, 10) / 10) * 100}%` }} />
          </div>
          <div className="metric-footnote">参考范围 {REF_RANGES.nodRate.min}–{REF_RANGES.nodRate.max} 次/分钟</div>
        </div>

        {speech.cumulativeMetrics && (
          <div className="metric-item">
            <div className="metric-header">
              <span><SoundOutlined /> 语音分析</span>
              <span>{speech.audioChunkStatus}</span>
            </div>

            {speechRateWpm !== null && (
              <div className="metric-sub-item">
                <div className="metric-sub-header">
                  <span>语速</span>
                  <span className="metric-value-row">
                    <span className="metric-value-secondary">{speechRateWpm.toFixed(0)} 字/分钟</span>
                    <Tag color={LEVEL_COLOR[classifyMetric(speechRateWpm, REF_RANGES.speechRateWpm)]} className="metric-level-tag">
                      {classifyMetric(speechRateWpm, REF_RANGES.speechRateWpm)}
                    </Tag>
                  </span>
                </div>
                <div className="metric-bar">
                  <div className={`metric-bar-fill ${LEVEL_BAR_CLASS[classifyMetric(speechRateWpm, REF_RANGES.speechRateWpm)]}`} style={{ width: `${(Math.min(speechRateWpm, 240) / 240) * 100}%` }} />
                </div>
                <div className="metric-footnote">参考范围 {REF_RANGES.speechRateWpm.min}–{REF_RANGES.speechRateWpm.max} 字/分钟</div>
              </div>
            )}

            {volumeDbSpl !== null && (
              <div className="metric-sub-item">
                <div className="metric-sub-header">
                  <span>音量</span>
                  <span className="metric-value-row">
                    <span className="metric-value-secondary">{volumeDbSpl.toFixed(1)} dB SPL</span>
                    <Tag color={LEVEL_COLOR[classifyMetric(volumeDbSpl, REF_RANGES.volumeDb)]} className="metric-level-tag">
                      {classifyMetric(volumeDbSpl, REF_RANGES.volumeDb)}
                    </Tag>
                  </span>
                </div>
                <div className="metric-bar">
                  <div className={`metric-bar-fill ${LEVEL_BAR_CLASS[classifyMetric(volumeDbSpl, REF_RANGES.volumeDb)]}`} style={{ width: `${(Math.min(volumeDbSpl, 100) / 100) * 100}%` }} />
                </div>
                <div className="metric-footnote">参考范围 {REF_RANGES.volumeDb.min}–{REF_RANGES.volumeDb.max} dB SPL</div>
              </div>
            )}

            {f0StdSemitones !== null && (
              <div className="metric-sub-item">
                <div className="metric-sub-header">
                  <span>语调变化</span>
                  <span className="metric-value-row">
                    <span className="metric-value-secondary">{f0StdSemitones.toFixed(1)} st</span>
                    <Tag color={LEVEL_COLOR[classifyMetric(f0StdSemitones, REF_RANGES.f0StdSemitones)]} className="metric-level-tag">
                      {classifyMetric(f0StdSemitones, REF_RANGES.f0StdSemitones)}
                    </Tag>
                  </span>
                </div>
                <div className="metric-bar">
                  <div className={`metric-bar-fill ${LEVEL_BAR_CLASS[classifyMetric(f0StdSemitones, REF_RANGES.f0StdSemitones)]}`} style={{ width: `${(Math.min(f0StdSemitones, 8) / 8) * 100}%` }} />
                </div>
                <div className="metric-footnote">半音标准差，参考范围 {REF_RANGES.f0StdSemitones.min}–{REF_RANGES.f0StdSemitones.max} st</div>
              </div>
            )}

            <div className="metric-footnote">已分析 {speech.cumulativeMetrics.analyzed_duration_sec?.toFixed(1) ?? "--"} 秒</div>
          </div>
        )}

        <video ref={video.analysisVideoRef} autoPlay muted playsInline className="analysis-video" aria-hidden="true" />
        <canvas ref={video.analysisCanvasRef} className="analysis-canvas" aria-hidden="true" />
      </div>

      {/* 报告预览 */}
      {report && (
        <div className="report-panel">
          <h3>面试报告</h3>
          <pre className="report-preview">{report}</pre>
          <Button
            block
            onClick={() => {
              downloadMarkdownReport(buildReportFilename(session.candidateName, session.id), report);
            }}
          >
            下载报告
          </Button>
        </div>
      )}
    </section>
  );
});
