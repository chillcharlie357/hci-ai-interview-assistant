-- 删除报告可见性字段，报告默认所有人可见
ALTER TABLE interview_sessions DROP COLUMN IF EXISTS report_visibility;
