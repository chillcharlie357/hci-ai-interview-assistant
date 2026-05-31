ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS egress_id TEXT;
