import type { AnswerRecord, DraftInput, InterviewEvent, InterviewQuestion, InterviewSession } from "./interviewFlow";

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

type ApiSession = {
  id: string;
  candidate_name: string;
  role: string;
  questions: ApiQuestion[];
  current_index: number;
  current_question: ApiQuestion | null;
  answers: ApiAnswer[];
  events: ApiEvent[];
};

type ApiSessionWithReport = ApiSession & {
  report: string;
};

export async function createSession(draft: DraftInput, options: ClientOptions = {}): Promise<InterviewSession> {
  const payload = {
    candidate_name: draft.candidateName,
    resume: draft.resume,
    job_description: draft.jobDescription,
    interview_goal: draft.interviewGoal
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

async function request<T>(path: string, payload: unknown, expectedStatus: number, options: ClientOptions): Promise<T> {
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:8000";
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
    events: session.events.map(mapEvent)
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
