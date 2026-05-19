# 报告页改版 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造报告页：纯单栏布局 + 视频回放卡片 + 答案视频时间戳跳转 + 关键帧截图修复 + PDF 排版修复

**Architecture:** 纯单栏竖排布局，VideoPlaybackCard 独立组件置于顶部，QATimeline 每条答案加跳转按钮。AnswerRecord 新增 `video_timestamp_sec` 字段贯穿前后端。useVideoAnalysis 新增 `captureKeyframe` 主动截图方法。

**Tech Stack:** React + TypeScript + Ant Design + Python 3.12 标准库 HTTP + html2canvas/jsPDF

---

### Task 1: Backend — AnswerRecord 新增 video_timestamp_sec

**Files:**
- Modify: `backend/interview/session.py:25-41,177-283`
- Modify: `backend/interview/api.py:310-360`
- Test: `backend/tests/test_api.py` (existing test class)

- [ ] **Step 1: 修改 AnswerRecord dataclass**

在 `backend/interview/session.py` 的 `AnswerRecord` 类（约第 25-41 行）中新增字段：

```python
@dataclass(frozen=True)
class AnswerRecord:
    question_id: str
    dimension: str
    prompt: str
    text: str
    duration_sec: int
    word_count: int
    filler_word_count: int
    recorded_at: str
    speech_rate_wpm: float | None = None
    audio_rms_db: float | None = None
    audio_f0_std_hz: float | None = None
    audio_f0_std_semitones: float | None = None
    is_followup: bool = False
    followup_round: int = 0
    followup_prompt: str = ""
    video_timestamp_sec: float | None = None   # <-- 新增
```

- [ ] **Step 2: 修改 record_answer 函数签名**

在 `backend/interview/session.py` 的 `record_answer` 函数（约第 177 行）新增参数：

```python
def record_answer(
    session: InterviewSession,
    text: str = "",
    duration_sec: int = 0,
    filler_word_count: int | None = None,
    audio_rms_db: float | None = None,
    audio_f0_std_hz: float | None = None,
    audio_f0_std_semitones: float | None = None,
    followup_decision: "FollowupDecision | None" = None,
    video_timestamp_sec: float | None = None,   # <-- 新增
) -> InterviewSession:
```

然后在构造 `AnswerRecord` 的地方（约第 208 行）传入 `video_timestamp_sec=video_timestamp_sec`：

```python
answer = AnswerRecord(
    question_id=q.id,
    dimension=q.dimension,
    prompt=q.prompt,
    text=cleaned_text,
    duration_sec=duration_sec,
    word_count=word_count,
    filler_word_count=fw,
    recorded_at=timestamp,
    speech_rate_wpm=speech_rate_wpm,
    audio_rms_db=audio_rms_db,
    audio_f0_std_hz=audio_f0_std_hz,
    audio_f0_std_semitones=audio_f0_std_semitones,
    is_followup=followup_info.is_followup,
    followup_round=followup_info.round,
    followup_prompt=followup_info.prompt,
    video_timestamp_sec=video_timestamp_sec,   # <-- 新增
)
```

- [ ] **Step 3: 修改 store.record_answer 传递 video_timestamp_sec**

在 `backend/interview/api.py` 的 `SessionStore.record_answer` 方法（约第 310 行），从 `payload` 提取 `video_timestamp_sec` 并传递给 `record_answer()`：

```python
def record_answer(
    self, session_id: str, payload: dict[str, Any], user_id: str = ""
) -> InterviewSession | None:
    session = self.sessions.get(session_id)
    if session is None:
        return None

    text = payload.get("text", "")
    video_timestamp_sec = payload.get("video_timestamp_sec")   # <-- 新增

    fw = analyze_answer_text(text).filler_word_count
    # ... 中间代码不变 ...

    updated = session_mod.record_answer(
        session,
        text=text,
        duration_sec=int(payload.get("duration_sec", 0)),
        filler_word_count=fw,
        audio_rms_db=audio_rms,
        audio_f0_std_hz=audio_f0_std_hz,
        audio_f0_std_semitones=audio_f0_std_semitones,
        followup_decision=followup,
        video_timestamp_sec=(
            float(video_timestamp_sec) if video_timestamp_sec is not None else None
        ),   # <-- 新增
    )
    # ... 后续代码不变 ...
```

- [ ] **Step 4: 运行现有测试确认不破坏**

```bash
uv run python -m unittest discover -s backend/tests
```
预期：全部通过，无回归

- [ ] **Step 5: 在 test_api.py 中新增答案带 video_timestamp_sec 的测试**

```python
def test_answer_with_video_timestamp_sec(self):
    """提交答案时带 video_timestamp_sec，返回的 session 应保留该字段"""
    store = SessionStore()
    session = create_interview_session(
        candidate_name="test",
        user_id="test-user-id",
    )
    store.sessions[session.id] = session

    updated = store.record_answer(
        session.id,
        {
            "text": "测试回答",
            "duration_sec": 30,
            "video_timestamp_sec": 42.5,
        },
        "test-user-id",
    )
    self.assertIsNotNone(updated)
    answer = updated.answers[-1]
    self.assertEqual(answer.video_timestamp_sec, 42.5)
```

- [ ] **Step 6: 运行测试确认通过**

```bash
uv run python -m unittest backend.tests.test_api -v
```
预期：新测试 + 全部旧测试通过

- [ ] **Step 7: Commit**

```bash
git add backend/interview/session.py backend/interview/api.py backend/tests/test_api.py
git commit -m "feat: add video_timestamp_sec field to AnswerRecord"
```

---

### Task 2: Frontend — 数据链路打通 videoTimestampSec

**Files:**
- Modify: `frontend/src/interviewFlow.ts:42-58` (AnswerRecord 类型)
- Modify: `frontend/src/apiClient.ts:296-322` (submitAnswer)
- Modify: `frontend/src/pages/InterviewPage/index.tsx:128-150` (handleFinishCandidateAnswer)
- Test: `frontend/src/apiClient.test.ts` (若存在) + `frontend/src/interviewFlow.test.ts` (若存在)

- [ ] **Step 1: AnswerRecord 类型加字段**

在 `frontend/src/interviewFlow.ts` 第 42-58 行的 `AnswerRecord` type 中新增：

```typescript
export type AnswerRecord = {
  questionId: string;
  dimension: string;
  prompt: string;
  text: string;
  durationSec: number;
  wordCount: number;
  fillerWordCount: number;
  recordedAt: string;
  speechRateWpm?: number | null;
  audioRmsDb?: number | null;
  audioF0StdHz?: number | null;
  audioF0StdSemitones?: number | null;
  isFollowup?: boolean;
  followupRound?: number;
  followupPrompt?: string;
  videoTimestampSec?: number | null;   // <-- 新增
};
```

- [ ] **Step 2: submitAnswer 函数加参数**

修改 `frontend/src/apiClient.ts` 第 296-322 行的 `submitAnswer` 函数：

```typescript
export async function submitAnswer(
  sessionId: string,
  answer: {
    text: string;
    durationSec: number;
    videoTimestampSec?: number;   // <-- 新增
  },
  options: ClientOptions = {}
): Promise<{ session: InterviewSession; report: string; followup: FollowupResponse }> {
  const response = await request<ApiSessionWithReport>(
    `/api/sessions/${sessionId}/answers`,
    {
      text: answer.text,
      duration_sec: answer.durationSec,
      video_timestamp_sec: answer.videoTimestampSec,   // <-- 新增
    },
    200,
    options
  );
  // ... 其余不变
}
```

- [ ] **Step 3: InterviewPage handleFinishCandidateAnswer 计算视频偏移量**

修改 `frontend/src/pages/InterviewPage/index.tsx` 第 138-150 行的 `handleFinishCandidateAnswer`：

```typescript
async function handleFinishCandidateAnswer() {
  await speech.stopMediaStream();

  // 计算当前答案的视频时间戳偏移
  const videoTimestampSec = recorder.accumulatedDurationRef.current
    + (recorder.recordingStartTimeRef.current
      ? (performance.now() - recorder.recordingStartTimeRef.current) / 1000
      : 0);

  const isLastQuestion = session?.currentQuestion && session.currentIndex >= session.questions.length - 1;
  if (isLastQuestion && sessionId && recorder.isRecording) {
    try {
      await recorder.stopAndUpload(sessionId);
    } catch {
      // 上传失败已在 recorder.uploadError 中处理
    }
  }
  await finishAnswer({ videoTimestampSec });
}
```

同时修改 `useInterviewSession` hook 中 `finishAnswer` 的签名以接受 `{ videoTimestampSec }` 并传递给 `submitAnswer`。

- [ ] **Step 4: 运行前端测试**

```bash
cd frontend && pnpm test
```
预期：全部通过，无回归

- [ ] **Step 5: Commit**

```bash
git add frontend/src/interviewFlow.ts frontend/src/apiClient.ts frontend/src/pages/InterviewPage/index.tsx frontend/src/pages/InterviewPage/hooks/useInterviewSession.ts
git commit -m "feat: capture videoTimestampSec on answer submission"
```

---

### Task 3: useVideoAnalysis 新增 captureKeyframe 方法

**Files:**
- Modify: `frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts:20-29,93-169`

- [ ] **Step 1: 在 VideoAnalysisHandle 类型中新增方法**

修改第 20-29 行：

```typescript
export type VideoAnalysisHandle = {
  analysisVideoRef: React.RefObject<HTMLVideoElement | null>;
  analysisCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  analysisStreamRef: React.RefObject<MediaStream | null>;
  faceMetricsSnapshot: FaceAnalysisMetrics | null;
  videoObservationStatus: string;
  currentFacePresent: boolean;
  cameraEnabled: boolean;
  setCameraEnabled: (enabled: boolean) => void;
  captureKeyframe: (reason: string) => void;   // <-- 新增
};
```

- [ ] **Step 2: 实现 captureKeyframe 方法**

在 `useVideoAnalysis` hook 内部（约第 67 行，`stopVideoObservation` 之后）新增：

```typescript
const captureKeyframe = useCallback(
  (reason: string) => {
    const canvas = analysisCanvasRef.current;
    if (!canvas || !session) return;

    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const videoTimestampSec = recordingStartTimeRef.current
        ? accumulatedDurationRef.current +
          (performance.now() - recordingStartTimeRef.current) / 1000
        : null;

      void submitVideoEvent(session.id, {
        timestamp: performance.now() / 1000,
        eventType: reason,
        confidence: 0.9,
        metrics: metricsRef.current ?? {},
        keyframe: {
          reason,
          dataUrl,
          videoTimestampSec,
        },
      }).then((updated) => {
        onSessionUpdate(updated);
      }).catch(() => {
        // 单次截图失败不阻塞流程
      });
    } catch {
      // canvas.toDataURL 失败静默降级
    }
  },
  [session, onSessionUpdate, recordingStartTimeRef, accumulatedDurationRef, analysisCanvasRef]
);
```

- [ ] **Step 3: 在 useVideoAnalysis 的 return 中导出**

在第 252-261 行的 return 对象中加入 `captureKeyframe`。

- [ ] **Step 4: 在 InterviewPage 中调用 captureKeyframe**

修改 `frontend/src/pages/InterviewPage/index.tsx`：

`handleStartCandidateAnswer`（第 128-136 行）末尾加入：
```typescript
video.captureKeyframe("answer_start");
```

`handleFinishCandidateAnswer`（第 138-150 行）开头加入：
```typescript
video.captureKeyframe("answer_end");
```

- [ ] **Step 5: 运行测试 + Commit**

```bash
cd frontend && pnpm test
git add frontend/src/pages/InterviewPage/hooks/useVideoAnalysis.ts frontend/src/pages/InterviewPage/index.tsx
git commit -m "feat: add captureKeyframe method for answer start/end screenshots"
```

---

### Task 4: KeyframesGallery Bug 修复

**Files:**
- Modify: `frontend/src/pages/ReportPage/components/KeyframesGallery.tsx`

- [ ] **Step 1: 修复图片显示逻辑**

修改 `KeyframesGallery.tsx` 第 90-96 行的图片显示逻辑：

```typescript
// 修复前（Bug）：
{kf.dataUrl && kf.videoTimestampSec == null ? (
  <img ... />
) : kf.videoTimestampSec != null ? (
  <PlayCircleOutlined />
) : (
  <UserOutlined />
)}

// 修复后：
{kf.dataUrl ? (
  <img src={kf.dataUrl} alt={kf.reason} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
) : kf.videoTimestampSec != null ? (
  <PlayCircleOutlined />
) : (
  <UserOutlined />
)}
```

- [ ] **Step 2: 解耦视频播放器**

移除第 54 行的 `hasRealKeyframes` 条件。视频播放器入口改为始终显示（只要有 session 即可），不再依赖关键帧数量。改用新的 prop `hasVideo: boolean` 控制：

```typescript
// Props 扩展
interface KeyframesGalleryProps {
  keyframes: KeyframeRecord[];
  sessionId: string;
  hasVideo: boolean;   // <-- 新增，由父组件传入
}

// 视频入口改为：
{!videoUrl && !videoLoading && hasVideo && (
  <div className="video-player-placeholder" onClick={() => loadVideo()} ...>
    <PlayCircleOutlined ... />
    <span>点击加载面试视频回放</span>
  </div>
)}
```

- [ ] **Step 3: 运行前端测试**

```bash
cd frontend && pnpm test
```
预期：无回归

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ReportPage/components/KeyframesGallery.tsx
git commit -m "fix: correct keyframe image display logic and decouple video player from keyframes"
```

---

### Task 5: VideoPlaybackCard 新组件

**Files:**
- Create: `frontend/src/pages/ReportPage/components/VideoPlaybackCard.tsx`

- [ ] **Step 1: 创建 VideoPlaybackCard 组件**

```typescript
import { memo, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { PlayCircleOutlined } from "@ant-design/icons";
import { fetchVideoUrl } from "@/apiClient";

export interface VideoPlaybackCardHandle {
  seekTo: (timestampSec: number) => void;
}

interface VideoPlaybackCardProps {
  sessionId: string;
  videoDurationSec?: number | null;
}

export const VideoPlaybackCard = memo(
  forwardRef<VideoPlaybackCardHandle, VideoPlaybackCardProps>(
    function VideoPlaybackCard({ sessionId, videoDurationSec }, ref) {
      const videoRef = useRef<HTMLVideoElement>(null);
      const [videoUrl, setVideoUrl] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);

      useImperativeHandle(ref, () => ({
        seekTo(timestampSec: number) {
          const video = videoRef.current;
          if (!video || !videoUrl) return;
          video.currentTime = timestampSec;
          video.play().catch(() => {});
        },
      }));

      async function loadVideo() {
        if (videoUrl || loading) return;
        setLoading(true);
        try {
          const url = await fetchVideoUrl(sessionId);
          if (url) setVideoUrl(url);
        } catch {
          // 静默降级
        } finally {
          setLoading(false);
        }
      }

      const durationStr = videoDurationSec
        ? `${Math.floor(videoDurationSec / 60)}:${String(Math.floor(videoDurationSec % 60)).padStart(2, "0")}`
        : null;

      return (
        <div className="glass-card video-playback-card">
          <h3>🎬 面试回放</h3>

          {!videoUrl && !loading && (
            <div
              className="video-playback-placeholder"
              onClick={() => loadVideo()}
              style={{ cursor: "pointer" }}
            >
              <PlayCircleOutlined
                style={{ fontSize: 48, color: "var(--color-primary, #1677ff)" }}
              />
              <p style={{ marginTop: 8, color: "var(--color-text-secondary)" }}>
                点击加载面试视频回放{durationStr ? `（${durationStr}）` : ""}
              </p>
            </div>
          )}

          {loading && (
            <div className="video-playback-placeholder">加载视频中...</div>
          )}

          {videoUrl && (
            <div>
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                style={{ width: "100%", maxHeight: 360, borderRadius: 8 }}
              />
              {durationStr && (
                <p style={{ marginTop: 4, color: "var(--color-text-tertiary)", fontSize: 13 }}>
                  总时长：{durationStr}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }
  )
);
```

- [ ] **Step 2: 在 ReportPage 中集成 VideoPlaybackCard**

修改 `frontend/src/pages/ReportPage/index.tsx`：
- 导入 `VideoPlaybackCard` 和 `VideoPlaybackCardHandle`
- 创建 `videoPlaybackRef = useRef<VideoPlaybackCardHandle>(null)`
- 在 header 下方、评分卡上方放置 `<VideoPlaybackCard ref={videoPlaybackRef} sessionId={sessionId} videoDurationSec={session?.videoDurationSec} />`
- 只在 `session?.videoPath` 存在时渲染

- [ ] **Step 3: 运行测试 + Commit**

```bash
cd frontend && pnpm test && pnpm build
git add frontend/src/pages/ReportPage/components/VideoPlaybackCard.tsx frontend/src/pages/ReportPage/index.tsx
git commit -m "feat: add VideoPlaybackCard component with seekTo API"
```

---

### Task 6: ReportPage 单栏布局改造

**Files:**
- Modify: `frontend/src/pages/ReportPage/index.tsx:134-174`
- Modify: `frontend/src/pages/ReportPage/ReportPage.css:66-71,459-504`

- [ ] **Step 1: 修改 JSX 布局为单栏**

修改 `index.tsx` 第 134-174 行的 JSX，将 `.report-grid` 双栏改为单栏 `.report-body`：

```tsx
<header className="report-header">
  {/* 保持不变 */}
</header>

<div className="report-body">
  <RatingCard avgScore={avgScore} ratingSummary={ratingSummary} />
  <SkillsRadar ... />
  <KeyframesGallery
    keyframes={session.keyframes || []}
    sessionId={session.id}
    hasVideo={!!session.videoPath}
  />
  <QATimeline session={session} />
  <FullReportSection report={report} />
</div>
```

移除 `.report-grid`、`.report-left`、`.report-right` wrapper。

- [ ] **Step 2: 修改 CSS**

修改 `ReportPage.css` 第 66-71 行：

```css
/* 移除 .report-grid */
/* 新增单栏布局 */
.report-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  max-width: 800px;
  margin: 0 auto;
}

.report-body > * {
  width: 100%;
}
```

移除第 459-504 行的响应式断点（单栏不再需要断点切换）。

调整 `.skills-content` 在小屏幕上 radar 和图表的排列：

```css
.skills-content {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
}

.radar-chart {
  flex: 0 0 220px;
}

.skill-bars {
  flex: 1;
  min-width: 200px;
}
```

- [ ] **Step 3: 视频回放卡片样式**

在 `ReportPage.css` 中新增：

```css
.video-playback-card {
  text-align: center;
}

.video-playback-placeholder {
  padding: var(--space-xl);
  text-align: center;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-container);
  transition: background 0.2s;
}

.video-playback-placeholder:hover {
  background: var(--color-bg-elevated);
}
```

- [ ] **Step 4: 运行测试 + Commit**

```bash
cd frontend && pnpm test && pnpm build
git add frontend/src/pages/ReportPage/
git commit -m "refactor: switch report page to single-column layout"
```

---

### Task 7: QATimeline 跳转按钮

**Files:**
- Modify: `frontend/src/pages/ReportPage/components/QATimeline.tsx`
- Modify: `frontend/src/pages/ReportPage/index.tsx`

- [ ] **Step 1: QATimeline 加 onSeekVideo prop**

修改 `QATimeline.tsx`：

```typescript
interface QATimelineProps {
  session: InterviewSession;
  onSeekVideo?: (timestampSec: number) => void;   // <-- 新增
}
```

每条有 `videoTimestampSec` 的答案行（约第 21-44 行的渲染部分）末尾加入跳转按钮：

```tsx
{answer.videoTimestampSec != null && onSeekVideo && (
  <Button
    type="link"
    size="small"
    icon={<PlayCircleOutlined />}
    onClick={(e) => {
      e.stopPropagation();
      onSeekVideo(answer.videoTimestampSec!);
    }}
    style={{ marginLeft: 8 }}
  >
    回放
  </Button>
)}
```

在第 2 行导入 `PlayCircleOutlined`（已有 `StarOutlined` 等导入，补充即可）。
在第 3 行导入 `Button` from `antd`。

- [ ] **Step 2: ReportPage 连接 seekVideo**

在 `index.tsx` 中：
```typescript
const videoPlaybackRef = useRef<VideoPlaybackCardHandle>(null);

// ...

<QATimeline
  session={session}
  onSeekVideo={(ts) => videoPlaybackRef.current?.seekTo(ts)}
/>
```

- [ ] **Step 3: 运行测试 + Commit**

```bash
cd frontend && pnpm test
git add frontend/src/pages/ReportPage/
git commit -m "feat: add video seek buttons to QATimeline"
```

---

### Task 8: PDF 排版修复

**Files:**
- Modify: `frontend/src/pages/ReportPage/ReportPage.css`

- [ ] **Step 1: 添加 page-break CSS**

在 `ReportPage.css` 中新增：

```css
/* PDF 导出分页优化 */
@media print {
  .report-page {
    max-width: 100%;
    padding: 0;
  }

  .report-body > * {
    page-break-inside: avoid;
  }

  .rating-card,
  .skills-card,
  .video-playback-card,
  .keyframes-card,
  .qa-card,
  .full-report-card {
    break-inside: avoid;
  }

  .video-playback-placeholder,
  .download-btn {
    display: none;
  }
}
```

- [ ] **Step 2: 运行测试 + Commit**

```bash
cd frontend && pnpm test && pnpm build
git add frontend/src/pages/ReportPage/ReportPage.css
git commit -m "fix: add page-break rules for PDF export"
```

---

### Task 9: 端到端验证 + 回归测试

**Files:** 无改动，验证全部测试通过

- [ ] **Step 1: 运行全部测试**

```bash
# 后端
uv run python -m unittest discover -s backend/tests

# 前端
cd frontend && pnpm test && pnpm build
```

预期：全部通过，无回归

- [ ] **Step 2: 最终 Commit（如有遗漏文件）**

```bash
git add -A
git status
# 确认无误后
git commit -m "chore: final integration fixes for report page redesign"
```
