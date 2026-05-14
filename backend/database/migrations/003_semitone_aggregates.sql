-- 为 speech_aggregates 表新增半音标准差聚合字段
-- 在 Supabase SQL Editor 中执行此脚本

ALTER TABLE speech_aggregates
    ADD COLUMN IF NOT EXISTS semitone_weight_sum FLOAT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS semitone_weighted_mean_sum FLOAT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS semitone_weighted_second_moment_sum FLOAT DEFAULT 0;
