-- 用户认证系统数据库迁移
-- 在 Supabase SQL Editor 中执行此脚本

-- ============================================
-- 1. 用户表（扩展 Supabase auth.users）
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自动创建 profile 的触发器（用户注册时）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除已存在的触发器再创建
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. 面试会话表（包含所有数据的 JSON 存储）
-- ============================================

CREATE TABLE IF NOT EXISTS interview_sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    candidate_name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    current_index INTEGER DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 0,
    questions JSONB DEFAULT '[]',
    answers JSONB DEFAULT '[]',
    events JSONB DEFAULT '[]',
    video_events JSONB DEFAULT '[]',
    keyframes JSONB DEFAULT '[]',
    llm_status VARCHAR(50) DEFAULT 'fallback',
    report_visibility VARCHAR(50) DEFAULT 'recruiter_only',
    meeting_room VARCHAR(255) DEFAULT '',
    enable_video_observation BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. 准备会话表
-- ============================================

CREATE TABLE IF NOT EXISTS prep_sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    candidate_name VARCHAR(255) NOT NULL,
    resume_markdown TEXT,
    followup_questions JSONB DEFAULT '[]',
    turns JSONB DEFAULT '[]',
    ready BOOLEAN DEFAULT false,
    ready_summary JSONB,
    llm_status VARCHAR(50) DEFAULT 'fallback',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. 性能索引
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_at ON interview_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prep_sessions_user_id ON prep_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_prep_sessions_created_at ON prep_sessions(created_at DESC);

-- ============================================
-- 5. Row Level Security (RLS)
-- ============================================

-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_sessions ENABLE ROW LEVEL SECURITY;

-- profiles 表策略
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

-- interview_sessions 表策略
CREATE POLICY "Users can view own sessions"
    ON interview_sessions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can create own sessions"
    ON interview_sessions FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions"
    ON interview_sessions FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete own sessions"
    ON interview_sessions FOR DELETE
    USING (user_id = auth.uid());

-- prep_sessions 表策略
CREATE POLICY "Users can view own prep sessions"
    ON prep_sessions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can create own prep sessions"
    ON prep_sessions FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own prep sessions"
    ON prep_sessions FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete own prep sessions"
    ON prep_sessions FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- 6. 自动更新 updated_at 触发器
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- profiles 表触发器
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- interview_sessions 表触发器
DROP TRIGGER IF EXISTS update_interview_sessions_updated_at ON interview_sessions;
CREATE TRIGGER update_interview_sessions_updated_at
    BEFORE UPDATE ON interview_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- prep_sessions 表触发器
DROP TRIGGER IF EXISTS update_prep_sessions_updated_at ON prep_sessions;
CREATE TRIGGER update_prep_sessions_updated_at
    BEFORE UPDATE ON prep_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
