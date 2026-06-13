-- Store question counts for fast session-list summaries.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS total_questions INTEGER NOT NULL DEFAULT 0;

UPDATE interview_sessions
SET total_questions = COALESCE(jsonb_array_length(questions), 0)
WHERE questions IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_created_at
    ON interview_sessions(user_id, created_at DESC);
