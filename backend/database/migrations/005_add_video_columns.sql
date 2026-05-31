ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS video_path TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_sec FLOAT,
  ADD COLUMN IF NOT EXISTS video_upload_failed BOOLEAN DEFAULT false;
