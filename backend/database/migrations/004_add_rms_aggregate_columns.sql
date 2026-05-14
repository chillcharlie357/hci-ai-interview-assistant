-- 补充 speech_aggregates 表缺少的 RMS 聚合列
-- 002 迁移中遗漏了 rms_weighted_db_sum 和 rms_weight_count，
-- 导致重启后从数据库恢复的 SpeechAggregateState 丢失音量数据

ALTER TABLE speech_aggregates
    ADD COLUMN IF NOT EXISTS rms_weighted_db_sum FLOAT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rms_weight_count FLOAT DEFAULT 0;
