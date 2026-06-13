-- Persist per-session ASR context terms used to bias realtime transcription.
ALTER TABLE interview_sessions
ADD COLUMN IF NOT EXISTS asr_context_terms JSONB DEFAULT '[]'::jsonb;
