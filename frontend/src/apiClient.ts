import type {
  AnswerRecord,
  DraftInput,
  InterviewEvent,
  InterviewQuestion,
  InterviewSession,
  KeyframeRecord,
  PrepSession,
  ReadySummary,
  SpeechSummary,
  VideoMetrics,
  VideoSignalEvent,
  VideoSummary
} from "./interviewFlow";
import { getApiBaseUrl } from "./config";
import { useAuthStore } from "./auth/authStore";
import { createLogger } from "./logger";

const log = createLogger("api");

type Fetcher = typeof fetch;

type ClientOptions = {
  baseUrl?: string;
  fetcher?: Fetcher;
};

type ApiQuestion = {
  id: string;
  dimension: string;
  prompt: string;
  follow_ups: string[];
  evidence_hints: string[];
};

type ApiAnswer = {
  question_id: string;
  dimension: string;
  prompt: string;
  text: string;
  duration_sec: number;
  word_count: number;
  filler_word_count: number;
  recorded_at: string;
  speech_rate_wpm?: number | null;
  audio_rms_db?: number | null;
  audio_f0_std_hz?: number | null;
};

type ApiEvent = {
  type: string;
  timestamp: string;
  message: string;
  question_id?: string | null;
};

type ApiVideoMetrics = {
  face_present?: boolean | null;
  brightness?: number | null;
  blur?: number | null;
  motion?: number | null;
  gaze_proxy?: number | null;
  head_pose_proxy?: number | null;
  blink_proxy?: number | null;
  blink_count?: number | null;
  blink_rate_per_minute?: number | null;
  eye_contact_ratio?: number | null;
  gaze_deviation_deg?: number | null;
  eye_aspect_ratio?: number | null;
  nod_proxy?: number | null;
  nod_count?: number | null;
  nod_rate_per_minute?: number | null;
  hand_activity?: number | null;
  body_activity?: number | null;
};

type ApiVideoEvent = {
  timestamp: number;
  event_type: string;
  confidence: number;
  metrics: ApiVideoMetrics;
  keyframe_index?: number | null;
};

type ApiKeyframe = {
  timestamp: number;
  reason: string;
  data_url?: string;
  video_timestamp_sec?: number | null;
};

type ApiVideoSummary = {
  event_count: number;
  keyframe_count: number;
  event_types: string[];
};

type ApiSpeechSummary = {
  chunk_count: number;
  analyzed_duration_sec: number;
  voiced_duration_sec: number;
  speech_rate_sps: number;
  rms_db_mean: number | null;
  f0_mean_hz: number | null;
  f0_std_hz: number | null;
  f0_std_semitones: number | null;
  f0_min_hz: number | null;
  f0_max_hz: number | null;
  f0_range_hz: number | null;
};

type ApiSession = {
  id: string;
  user_id?: string;
  candidate_name: string;
  role: string;
  questions: ApiQuestion[];
  current_index: number;
  current_question: ApiQuestion | null;
  answers: ApiAnswer[];
  events: ApiEvent[];
  llm_status?: string;
  video_events?: ApiVideoEvent[];
  keyframes?: ApiKeyframe[];
  video_summary?: ApiVideoSummary;
  speech_summary?: ApiSpeechSummary;
  meeting_room?: string;
  enable_video_observation?: boolean;
  video_path?: string | null;
  video_duration_sec?: number | null;
  video_upload_failed?: boolean;
};

type ApiSessionWithReport = ApiSession & {
  report: string;
};

type ApiSessionSummary = {
  id: string;
  candidate_name: string;
  role: string;
  created_at: string;
  current_index: number;
  llm_status: string;
  total_questions: number;
};

type ApiReadySummary = {
  role: string;
  job_description: string;
  interview_goal: string;
  focus_areas: string[];
};

type ApiPrepSession = {
  prep_session_id: string;
  candidate_name: string;
  resume_markdown_preview: string;
  followup_questions: string[];
  ready: boolean;
  ready_summary: ApiReadySummary | null;
  llm_status: string;
};

export type LiveKitToken = {
  url: string;
  token: string;
  room: string;
};

export type SpeechChunkMetrics = {
  status: string;
  backend: string;
  duration_sec: number;
  voiced_duration_sec: number;
  speech_rate_sps: number;
  rms_db_mean: number | null;
  f0_mean_hz: number | null;
  f0_std_hz: number | null;
  f0_std_semitones: number | null;
  f0_min_hz: number | null;
  f0_max_hz: number | null;
  warnings: string[];
};

export type SpeechCumulativeMetrics = {
  chunk_count: number;
  analyzed_duration_sec: number;
  voiced_duration_sec: number;
  speech_rate_sps: number;
  rms_db_mean: number | null;
  f0_mean_hz: number | null;
  f0_std_hz: number | null;
  f0_std_semitones: number | null;
  f0_min_hz: number | null;
  f0_max_hz: number | null;
  f0_range_hz: number | null;
};

export type SpeechChunkResponse = {
  chunk: SpeechChunkMetrics;
  cumulative: SpeechCumulativeMetrics;
};

export async function createSession(draft: DraftInput, options: ClientOptions = {}): Promise<InterviewSession> {
  const payload = {
    candidate_name: draft.candidateName,
    resume: draft.resume,
    job_description: draft.jobDescription,
    interview_goal: draft.interviewGoal,
    use_llm_questions: Boolean(draft.useLlmQuestions)
  };
  const response = await request<ApiSession>("/api/sessions", payload, 201, options);
  return mapSession(response);
}

export async function getSession(sessionId: string, options: ClientOptions = {}): Promise<InterviewSession> {
  const response = await getRequest<ApiSession>(`/api/sessions/${sessionId}`, 200, options);
  return mapSession(response);
}

export async function submitResume(
  resume: { candidateName: string; fileName: string; contentType: string; dataBase64: string },
  options: ClientOptions = {}
): Promise<PrepSession> {
  const response = await request<ApiPrepSession>(
    "/api/prep-sessions/resume",
    {
      candidate_name: resume.candidateName,
      file_name: resume.fileName,
      content_type: resume.contentType,
      data_base64: resume.dataBase64
    },
    201,
    options
  );
  return mapPrepSession(response);
}

export async function submitPrepFollowup(prepSessionId: string, answer: string, options: ClientOptions = {}): Promise<PrepSession> {
  const response = await request<ApiPrepSession>(
    `/api/prep-sessions/${prepSessionId}/followups`,
    { answer },
    200,
    options
  );
  return mapPrepSession(response);
}

export async function createInterviewSessionFromPrep(
  prepSessionId: string,
  config: { useLlmQuestions?: boolean; enableVideoObservation?: boolean },
  options: ClientOptions = {}
): Promise<InterviewSession> {
  const response = await request<ApiSession>(
    `/api/prep-sessions/${prepSessionId}/interview-session`,
    {
      use_llm_questions: Boolean(config.useLlmQuestions),
      enable_video_observation: config.enableVideoObservation ?? true
    },
    201,
    options
  );
  return mapSession(response);
}

export async function submitAnswer(
  sessionId: string,
  answer: { text: string; durationSec: number },
  options: ClientOptions = {}
): Promise<{ session: InterviewSession; report: string }> {
  const response = await request<ApiSessionWithReport>(
    `/api/sessions/${sessionId}/answers`,
    {
      text: answer.text,
      duration_sec: answer.durationSec
    },
    200,
    options
  );
  return {
    session: mapSession(response),
    report: response.report
  };
}

export async function submitVideoEvent(
  sessionId: string,
  event: {
    timestamp: number;
    eventType: string;
    confidence: number;
    metrics: VideoMetrics;
    keyframe?: { reason: string; dataUrl?: string; videoTimestampSec?: number | null };
  },
  options: ClientOptions = {}
): Promise<InterviewSession> {
  const response = await request<ApiSession>(
    `/api/sessions/${sessionId}/video-events`,
    {
      timestamp: event.timestamp,
      event_type: event.eventType,
      confidence: event.confidence,
      metrics: toApiVideoMetrics(event.metrics),
      keyframe: event.keyframe
        ? { reason: event.keyframe.reason, data_url: event.keyframe.dataUrl, video_timestamp_sec: event.keyframe.videoTimestampSec }
        : undefined
    },
    200,
    options
  );
  return mapSession(response);
}

export async function requestLiveKitToken(
  sessionId: string,
  participant: { participantName: string; participantRole: "candidate" | "recruiter" },
  options: ClientOptions = {}
): Promise<LiveKitToken> {
  return await request<LiveKitToken>(
    `/api/sessions/${sessionId}/livekit-token`,
    {
      participant_name: participant.participantName,
      participant_role: participant.participantRole
    },
    200,
    options
  );
}

export async function submitSpeechChunk(
  sessionId: string,
  payload: { audioBase64: string; targetSampleRate?: number },
  options: ClientOptions = {}
): Promise<SpeechChunkResponse> {
  return await request<SpeechChunkResponse>(
    `/api/sessions/${sessionId}/speech-chunks`,
    {
      audio_base64: payload.audioBase64,
      target_sample_rate: payload.targetSampleRate
    },
    200,
    options
  );
}

export async function fetchReport(
  sessionId: string,
  options: ClientOptions = {}
): Promise<{ report: string; llmStatus: string }> {
  const response = await getRequest<{ report: string; llm_status: string }>(
    `/api/sessions/${sessionId}/report`,
    200,
    options
  );
  return { report: response.report, llmStatus: response.llm_status };
}

/** 快速创建 mock 面试，用于调试 */
export async function listSessions(options: ClientOptions = {}): Promise<{ sessions: ApiSessionSummary[] }> {
  return await getRequest<{ sessions: ApiSessionSummary[] }>("/api/sessions", 200, options);
}

export async function deleteSession(sessionId: string, options: ClientOptions = {}): Promise<void> {
  await deleteRequest(`/api/sessions/${sessionId}`, 200, options);
}

export async function uploadInterviewVideo(
  sessionId: string,
  videoBlob: Blob,
  options: ClientOptions & { durationSec?: number } = {}
): Promise<{ videoPath: string; videoDurationSec: number }> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const fetcher = options.fetcher ?? fetch;

  const accessToken = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    "Content-Type": "video/webm",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const durationParam = options.durationSec ? `?duration_sec=${Math.round(options.durationSec)}` : "";
  const response = await fetcher(`${baseUrl}/api/sessions/${sessionId}/video${durationParam}`, {
    method: "POST",
    headers,
    body: videoBlob,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = "/login";
    throw new Error("认证已过期，请重新登录");
  }
  if (response.status === 413) {
    throw new Error("视频文件过大，上传失败");
  }
  if (response.status !== 200) {
    throw new Error(`视频上传失败: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as { videoPath: string; videoDurationSec: number };
}

export async function fetchVideoUrl(
  sessionId: string,
  options: ClientOptions = {}
): Promise<string | null> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const fetcher = options.fetcher ?? fetch;

  const accessToken = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetcher(`${baseUrl}/api/sessions/${sessionId}/video`, { method: "GET", headers });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = "/login";
    throw new Error("认证已过期，请重新登录");
  }
  if (response.status === 404) {
    return null;
  }
  if (response.status !== 200) {
    throw new Error(`获取视频 URL 失败: ${response.status}`);
  }

  const data = (await response.json()) as { video_url: string };
  return data.video_url || null;
}

/** 快速创建 mock 面试，用于调试 */
export async function createMockSession(
  config: {
    template?: "frontend" | "backend" | "ai" | "pm";
    candidateName?: string;
    enableVideoObservation?: boolean;
  } = {},
  options: ClientOptions = {}
): Promise<InterviewSession> {
  const response = await request<ApiSession>(
    "/api/mock-session",
    {
      template: config.template ?? "frontend",
      candidate_name: config.candidateName ?? "测试候选人",
      enable_video_observation: config.enableVideoObservation ?? true
    },
    201,
    options
  );
  return mapSession(response);
}

async function request<T>(path: string, payload: unknown, expectedStatus: number, options: ClientOptions): Promise<T> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const fetcher = options.fetcher ?? fetch;

  // 获取认证 token
  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 添加认证头（有 token 时才添加）
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const _startPost = performance.now();
  const response = await fetcher(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const _durPost = Math.round(performance.now() - _startPost);
  log.info(`POST .../${path.split("/").pop()} -> ${response.status} (${_durPost}ms)`);

  // 处理 401 未授权响应
  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = "/login";
    throw new Error("认证已过期，请重新登录");
  }

  if (response.status !== expectedStatus) {
    throw new Error(`API request failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function getRequest<T>(path: string, expectedStatus: number, options: ClientOptions): Promise<T> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const fetcher = options.fetcher ?? fetch;

  // 获取认证 token
  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const _startGet = performance.now();
  const response = await fetcher(`${baseUrl}${path}`, { method: "GET", headers });
  const _durGet = Math.round(performance.now() - _startGet);
  log.info(`GET .../${path.split("/").pop()} -> ${response.status} (${_durGet}ms)`);

  // 处理 401 未授权响应
  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = "/login";
    throw new Error("认证已过期，请重新登录");
  }

  if (response.status !== expectedStatus) {
    throw new Error(`API request failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function deleteRequest<T>(path: string, expectedStatus: number, options: ClientOptions): Promise<T> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const fetcher = options.fetcher ?? fetch;

  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const _startDel = performance.now();
  const response = await fetcher(`${baseUrl}${path}`, { method: "DELETE", headers });
  const _durDel = Math.round(performance.now() - _startDel);
  log.info(`DELETE .../${path.split("/").pop()} -> ${response.status} (${_durDel}ms)`);

  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = "/login";
    throw new Error("认证已过期，请重新登录");
  }

  if (response.status !== expectedStatus) {
    throw new Error(`API request failed with ${response.status}: ${await response.text()}`);
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

function mapSession(session: ApiSession): InterviewSession {
  const questions = session.questions.map(mapQuestion);
  return {
    id: session.id,
    userId: session.user_id,
    candidateName: session.candidate_name,
    role: session.role,
    questions,
    currentIndex: session.current_index,
    currentQuestion: session.current_question ? mapQuestion(session.current_question) : null,
    answers: session.answers.map(mapAnswer),
    events: session.events.map(mapEvent),
    llmStatus: session.llm_status ?? "fallback",
    videoEvents: (session.video_events ?? []).map(mapVideoEvent),
    keyframes: (session.keyframes ?? []).map(mapKeyframe),
    videoSummary: mapVideoSummary(session.video_summary),
    speechSummary: mapSpeechSummary(session.speech_summary),
    meetingRoom: session.meeting_room ?? "",
    enableVideoObservation: session.enable_video_observation ?? true,
    videoPath: session.video_path ?? null,
    videoDurationSec: session.video_duration_sec ?? null,
    videoUploadFailed: session.video_upload_failed ?? false
  };
}

function mapPrepSession(session: ApiPrepSession): PrepSession {
  return {
    id: session.prep_session_id,
    candidateName: session.candidate_name,
    resumeMarkdownPreview: session.resume_markdown_preview,
    followupQuestions: session.followup_questions,
    ready: session.ready,
    readySummary: session.ready_summary ? mapReadySummary(session.ready_summary) : null,
    llmStatus: session.llm_status
  };
}

function mapReadySummary(summary: ApiReadySummary): ReadySummary {
  return {
    role: summary.role,
    jobDescription: summary.job_description,
    interviewGoal: summary.interview_goal,
    focusAreas: summary.focus_areas
  };
}

function mapQuestion(question: ApiQuestion): InterviewQuestion {
  return {
    id: question.id,
    dimension: question.dimension,
    prompt: question.prompt,
    followUps: question.follow_ups,
    evidenceHints: question.evidence_hints
  };
}

function mapAnswer(answer: ApiAnswer): AnswerRecord {
  return {
    questionId: answer.question_id,
    dimension: answer.dimension,
    prompt: answer.prompt,
    text: answer.text,
    durationSec: answer.duration_sec,
    wordCount: answer.word_count,
    fillerWordCount: answer.filler_word_count,
    recordedAt: answer.recorded_at,
    speechRateWpm: answer.speech_rate_wpm,
    audioRmsDb: answer.audio_rms_db,
    audioF0StdHz: answer.audio_f0_std_hz,
    audioF0StdSemitones: answer.audio_f0_std_semitones
  };
}

function mapEvent(event: ApiEvent): InterviewEvent {
  return {
    type: event.type,
    timestamp: event.timestamp,
    message: event.message,
    questionId: event.question_id ?? undefined
  };
}

function mapVideoEvent(event: ApiVideoEvent): VideoSignalEvent {
  return {
    timestamp: event.timestamp,
    eventType: event.event_type,
    confidence: event.confidence,
    metrics: mapVideoMetrics(event.metrics),
    keyframeIndex: event.keyframe_index ?? null
  };
}

function mapKeyframe(keyframe: ApiKeyframe): KeyframeRecord {
  return {
    timestamp: keyframe.timestamp,
    reason: keyframe.reason,
    dataUrl: keyframe.data_url,
    videoTimestampSec: keyframe.video_timestamp_sec ?? null
  };
}

function mapVideoSummary(summary?: ApiVideoSummary): VideoSummary {
  return {
    eventCount: summary?.event_count ?? 0,
    keyframeCount: summary?.keyframe_count ?? 0,
    eventTypes: summary?.event_types ?? []
  };
}

function mapSpeechSummary(summary?: ApiSpeechSummary): SpeechSummary | null {
  if (!summary) return null;
  return {
    chunkCount: summary.chunk_count,
    analyzedDurationSec: summary.analyzed_duration_sec,
    voicedDurationSec: summary.voiced_duration_sec,
    speechRateSps: summary.speech_rate_sps,
    rmsDbMean: summary.rms_db_mean,
    f0MeanHz: summary.f0_mean_hz,
    f0StdHz: summary.f0_std_hz,
    f0StdSemitones: summary.f0_std_semitones,
    f0MinHz: summary.f0_min_hz,
    f0MaxHz: summary.f0_max_hz,
    f0RangeHz: summary.f0_range_hz
  };
}

function mapVideoMetrics(metrics: ApiVideoMetrics): VideoMetrics {
  return {
    facePresent: metrics.face_present,
    brightness: metrics.brightness,
    blur: metrics.blur,
    motion: metrics.motion,
    gazeProxy: metrics.gaze_proxy,
    headPoseProxy: metrics.head_pose_proxy,
    blinkProxy: metrics.blink_proxy,
    blinkCount: metrics.blink_count,
    blinkRatePerMinute: metrics.blink_rate_per_minute,
    eyeContactRatio: metrics.eye_contact_ratio,
    gazeDeviationDeg: metrics.gaze_deviation_deg,
    eyeAspectRatio: metrics.eye_aspect_ratio,
    nodProxy: metrics.nod_proxy,
    nodCount: metrics.nod_count,
    nodRatePerMinute: metrics.nod_rate_per_minute,
    handActivity: metrics.hand_activity,
    bodyActivity: metrics.body_activity
  };
}

function toApiVideoMetrics(metrics: VideoMetrics): ApiVideoMetrics {
  return {
    face_present: metrics.facePresent,
    brightness: metrics.brightness,
    blur: metrics.blur,
    motion: metrics.motion,
    gaze_proxy: metrics.gazeProxy,
    head_pose_proxy: metrics.headPoseProxy,
    blink_proxy: metrics.blinkProxy,
    blink_count: metrics.blinkCount,
    blink_rate_per_minute: metrics.blinkRatePerMinute,
    eye_contact_ratio: metrics.eyeContactRatio,
    gaze_deviation_deg: metrics.gazeDeviationDeg,
    eye_aspect_ratio: metrics.eyeAspectRatio,
    nod_proxy: metrics.nodProxy,
    nod_count: metrics.nodCount,
    nod_rate_per_minute: metrics.nodRatePerMinute,
    hand_activity: metrics.handActivity,
    body_activity: metrics.bodyActivity
  };
}
