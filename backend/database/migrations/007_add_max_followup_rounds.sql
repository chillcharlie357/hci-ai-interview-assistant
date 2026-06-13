-- Persist per-session follow-up limit selected by the recruiter.
ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS max_followup_rounds SMALLINT;

UPDATE interview_sessions
SET max_followup_rounds = LEAST(3, GREATEST(0, COALESCE(max_followup_rounds, 0)))::smallint;

ALTER TABLE interview_sessions
  ALTER COLUMN max_followup_rounds TYPE SMALLINT
  USING LEAST(3, GREATEST(0, COALESCE(max_followup_rounds, 0)))::smallint,
  ALTER COLUMN max_followup_rounds SET DEFAULT 0,
  ALTER COLUMN max_followup_rounds SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'interview_sessions_max_followup_rounds_range'
  ) THEN
    ALTER TABLE interview_sessions
      ADD CONSTRAINT interview_sessions_max_followup_rounds_range
      CHECK (max_followup_rounds >= 0 AND max_followup_rounds <= 3)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE interview_sessions
  VALIDATE CONSTRAINT interview_sessions_max_followup_rounds_range;
