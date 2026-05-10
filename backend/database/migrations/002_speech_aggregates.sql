-- 语音聚合状态表
-- 在 Supabase SQL Editor 中执行此脚本

CREATE TABLE IF NOT EXISTS speech_aggregates (
    session_id TEXT PRIMARY KEY REFERENCES interview_sessions(id) ON DELETE CASCADE,
    chunk_count INTEGER DEFAULT 0,
    analyzed_duration_sec FLOAT DEFAULT 0,
    voiced_duration_sec FLOAT DEFAULT 0,
    speech_run_equivalent FLOAT DEFAULT 0,
    pitch_weight_sum FLOAT DEFAULT 0,
    pitch_weighted_mean_sum FLOAT DEFAULT 0,
    pitch_weighted_second_moment_sum FLOAT DEFAULT 0,
    f0_min_hz FLOAT,
    f0_max_hz FLOAT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE speech_aggregates ENABLE ROW LEVEL SECURITY;

-- RLS 策略：通过 interview_sessions 关联 user_id
CREATE POLICY "Users can view own speech aggregates"
    ON speech_aggregates FOR SELECT
    USING (session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own speech aggregates"
    ON speech_aggregates FOR INSERT
    WITH CHECK (session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update own speech aggregates"
    ON speech_aggregates FOR UPDATE
    USING (session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete own speech aggregates"
    ON speech_aggregates FOR DELETE
    USING (session_id IN (
        SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    ));

-- 自动更新 updated_at 触发器
DROP TRIGGER IF EXISTS update_speech_aggregates_updated_at ON speech_aggregates;
CREATE TRIGGER update_speech_aggregates_updated_at
    BEFORE UPDATE ON speech_aggregates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
