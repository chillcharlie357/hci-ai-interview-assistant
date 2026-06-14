export type AsrTranscriptPhase = "interim" | "final";

export type AsrTranscriptGuardInput = {
  transcript: string;
  prompts: string[];
  answerText: string;
  asrStartedAtMs: number | null;
  nowMs: number;
  initialPromptEchoWindowMs?: number;
};

const DEFAULT_INITIAL_PROMPT_ECHO_WINDOW_MS = 8000;
const MIN_ECHO_CHARS = 8;
const MIN_LCS_CHARS = 12;

export function shouldIgnoreAsrTranscript(input: AsrTranscriptGuardInput): boolean {
  const transcript = input.transcript.trim();
  if (!transcript) return true;

  const answerIsEmpty = input.answerText.trim().length === 0;
  const elapsedMs = input.asrStartedAtMs === null
    ? Number.POSITIVE_INFINITY
    : input.nowMs - input.asrStartedAtMs;
  const echoWindowMs = input.initialPromptEchoWindowMs ?? DEFAULT_INITIAL_PROMPT_ECHO_WINDOW_MS;

  if (answerIsEmpty && looksLikeInterviewerPrompt(transcript)) {
    return true;
  }

  if (elapsedMs <= echoWindowMs && isLikelyPromptEcho(transcript, input.prompts)) {
    return true;
  }

  return false;
}

export function looksLikeInterviewerPrompt(text: string): boolean {
  const trimmed = text.trim();
  if (normalizeForPromptCompare(trimmed).length < 10) return false;
  const hasQuestionMarker = /[?？]$/.test(trimmed)
    || /(?:请|请问|如何|怎么|怎样|为什么|是否|能否|如果|描述|说明|介绍)/.test(trimmed);
  const addressesCandidate = /(?:候选人|你|你的|您)/.test(trimmed);
  const asksForAnswer = /(?:请(?:描述|说明|介绍|结合|回答|谈谈)|你(?:会|是|如何|怎么|能|在)|如何|怎么|怎样|为什么|如果.*你|是否|能否)/.test(trimmed);
  return hasQuestionMarker && addressesCandidate && asksForAnswer;
}

export function isLikelyPromptEcho(transcript: string, prompts: string[]): boolean {
  const normalizedTranscript = normalizeForPromptCompare(transcript);
  if (normalizedTranscript.length < MIN_ECHO_CHARS) return false;

  return prompts.some((prompt) => {
    const normalizedPrompt = normalizeForPromptCompare(prompt);
    if (normalizedPrompt.length < MIN_ECHO_CHARS) return false;
    if (
      normalizedPrompt.includes(normalizedTranscript)
      || normalizedTranscript.includes(normalizedPrompt)
    ) {
      return true;
    }

    const lcs = longestCommonSubsequenceLength(normalizedTranscript, normalizedPrompt);
    return lcs >= MIN_LCS_CHARS && lcs / normalizedTranscript.length >= 0.82;
  });
}

export function normalizeForPromptCompare(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s"'`“”‘’()[\]{}<>《》【】.,!?;:，。！？；：、/\\|~·\-_=+*#@$%^&]+/g, "");
}

function longestCommonSubsequenceLength(a: string, b: string): number {
  const previous = new Array<number>(b.length + 1).fill(0);
  const current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }

  return previous[b.length];
}
