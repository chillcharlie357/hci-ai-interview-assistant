import type {
  AnswerRecord,
  DraftInput,
  InterviewEvent,
  InterviewQuestion,
  InterviewSession,
  KeyframeRecord,
  VideoMetrics,
  VideoSignalEvent,
  VideoSummary
} from "./interviewFlow";
import { getApiBaseUrl } from "./config";

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
  nod_proxy?: number | null;
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
  data_url: string;
};

type ApiVideoSummary = {
  event_count: number;
  keyframe_count: number;
  event_types: string[];
};

type ApiSession = {
  id: string;
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
};

type ApiSessionWithReport = ApiSession & {
  report: string;
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
    keyframe?: { reason: string; dataUrl: string };
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
      keyframe: event.keyframe ? { reason: event.keyframe.reason, data_url: event.keyframe.dataUrl } : undefined
    },
    200,
    options
  );
  return mapSession(response);
}

async function request<T>(path: string, payload: unknown, expectedStatus: number, options: ClientOptions): Promise<T> {
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response.status !== expectedStatus) {
    throw new Error(`API request failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

function mapSession(session: ApiSession): InterviewSession {
  const questions = session.questions.map(mapQuestion);
  return {
    id: session.id,
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
    videoSummary: mapVideoSummary(session.video_summary)
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
    recordedAt: answer.recorded_at
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
    dataUrl: keyframe.data_url
  };
}

function mapVideoSummary(summary?: ApiVideoSummary): VideoSummary {
  return {
    eventCount: summary?.event_count ?? 0,
    keyframeCount: summary?.keyframe_count ?? 0,
    eventTypes: summary?.event_types ?? []
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
    nodProxy: metrics.nod_proxy,
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
    nod_proxy: metrics.nodProxy,
    hand_activity: metrics.handActivity,
    body_activity: metrics.bodyActivity
  };
}
