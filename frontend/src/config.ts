export const DEFAULT_FILLER_WORDS: string[] = [];

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
}

export function getFillerWords(): string[] {
  const configured = import.meta.env.VITE_INTERVIEW_FILLER_WORDS;
  if (!configured) {
    return DEFAULT_FILLER_WORDS;
  }
  const values = configured.split(",").map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? values : DEFAULT_FILLER_WORDS;
}
