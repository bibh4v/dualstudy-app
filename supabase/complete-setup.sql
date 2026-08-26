-- ============================================================================
-- COMPLETE SUPABASE SETUP FOR DUAL-TRACK PLANNER
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE (extends auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. PLANNER STATE (user settings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS planner_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    day_end TEXT DEFAULT '22:00',
    nea_fixed INTEGER DEFAULT 120,
    nea_start TEXT DEFAULT '20:00',
    focus_min INTEGER DEFAULT 0,
    focus_date TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. SCHEDULE SLOTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('msc','nea','focus','break')),
    start_time TEXT NOT NULL,
    duration INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slots_user ON slots(user_id);
CREATE INDEX IF NOT EXISTS idx_slots_user_start ON slots(user_id, start_time);

-- ============================================================================
-- 4. MSC SUBJECTS + SUBTOPICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS msc_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pct INTEGER DEFAULT 0,
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS msc_subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES msc_subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_msc_subjects_user ON msc_subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_msc_subtopics_subject ON msc_subtopics(subject_id);

-- ============================================================================
-- 5. NEA TECHNICAL + SUBTOPICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS nea_tech (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pct INTEGER DEFAULT 0,
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nea_tech_subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES nea_tech(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nea_tech_user ON nea_tech(user_id);
CREATE INDEX IF NOT EXISTS idx_nea_tech_subtopics_topic ON nea_tech_subtopics(topic_id);

-- ============================================================================
-- 6. NEA NON-TECHNICAL + SUBTOPICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS nea_nontech (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pct INTEGER DEFAULT 0,
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nea_nontech_subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES nea_nontech(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nea_nontech_user ON nea_nontech(user_id);
CREATE INDEX IF NOT EXISTS idx_nea_nontech_subtopics_topic ON nea_nontech_subtopics(topic_id);

-- ============================================================================
-- 7. NOTES WITH ATTACHMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    cat TEXT NOT NULL CHECK (cat IN ('tech','nontech','news')),
    body TEXT DEFAULT '',
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    date TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_id, created_at DESC);

-- ============================================================================
-- 8. TASKS + SUBTOPICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    track TEXT NOT NULL CHECK (track IN ('msc','nea','news')),
    dead TEXT NOT NULL,
    "window" TEXT DEFAULT '',
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo','progress','done')),
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_task_subtopics_task ON task_subtopics(task_id);

-- ============================================================================
-- 9. GOALS
-- ============================================================================
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    track TEXT NOT NULL CHECK (track IN ('msc','nea','both')),
    pct INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE msc_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE msc_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE nea_tech ENABLE ROW LEVEL SECURITY;
ALTER TABLE nea_tech_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE nea_nontech ENABLE ROW LEVEL SECURITY;
ALTER TABLE nea_nontech_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- PLANNER_STATE
DROP POLICY IF EXISTS "Users can manage own planner_state" ON planner_state;
CREATE POLICY "Users can manage own planner_state" ON planner_state
    FOR ALL USING (auth.uid() = user_id);

-- SLOTS
DROP POLICY IF EXISTS "Users can manage own slots" ON slots;
CREATE POLICY "Users can manage own slots" ON slots
    FOR ALL USING (auth.uid() = user_id);

-- MSC_SUBJECTS
DROP POLICY IF EXISTS "Users can manage own msc_subjects" ON msc_subjects;
CREATE POLICY "Users can manage own msc_subjects" ON msc_subjects
    FOR ALL USING (auth.uid() = user_id);

-- MSC_SUBTOPICS
DROP POLICY IF EXISTS "Users can manage own msc_subtopics" ON msc_subtopics;
CREATE POLICY "Users can manage own msc_subtopics" ON msc_subtopics
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM msc_subjects s
            WHERE s.id = msc_subtopics.subject_id
            AND s.user_id = auth.uid()
        )
    );

-- NEA_TECH
DROP POLICY IF EXISTS "Users can manage own nea_tech" ON nea_tech;
CREATE POLICY "Users can manage own nea_tech" ON nea_tech
    FOR ALL USING (auth.uid() = user_id);

-- NEA_TECH_SUBTOPICS
DROP POLICY IF EXISTS "Users can manage own nea_tech_subtopics" ON nea_tech_subtopics;
CREATE POLICY "Users can manage own nea_tech_subtopics" ON nea_tech_subtopics
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM nea_tech t
            WHERE t.id = nea_tech_subtopics.topic_id
            AND t.user_id = auth.uid()
        )
    );

-- NEA_NONTECH
DROP POLICY IF EXISTS "Users can manage own nea_nontech" ON nea_nontech;
CREATE POLICY "Users can manage own nea_nontech" ON nea_nontech
    FOR ALL USING (auth.uid() = user_id);

-- NEA_NONTECH_SUBTOPICS
DROP POLICY IF EXISTS "Users can manage own nea_nontech_subtopics" ON nea_nontech_subtopics;
CREATE POLICY "Users can manage own nea_nontech_subtopics" ON nea_nontech_subtopics
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM nea_nontech t
            WHERE t.id = nea_nontech_subtopics.topic_id
            AND t.user_id = auth.uid()
        )
    );

-- NOTES
DROP POLICY IF EXISTS "Users can manage own notes" ON notes;
CREATE POLICY "Users can manage own notes" ON notes
    FOR ALL USING (auth.uid() = user_id);

-- TASKS
DROP POLICY IF EXISTS "Users can manage own tasks" ON tasks;
CREATE POLICY "Users can manage own tasks" ON tasks
    FOR ALL USING (auth.uid() = user_id);

-- TASK_SUBTOPICS
DROP POLICY IF EXISTS "Users can manage own task_subtopics" ON task_subtopics;
CREATE POLICY "Users can manage own task_subtopics" ON task_subtopics
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.id = task_subtopics.task_id
            AND t.user_id = auth.uid()
        )
    );

-- GOALS
DROP POLICY IF EXISTS "Users can manage own goals" ON goals;
CREATE POLICY "Users can manage own goals" ON goals
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 11. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_planner_state_updated_at ON planner_state;
CREATE TRIGGER update_planner_state_updated_at
    BEFORE UPDATE ON planner_state
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 12. STORAGE BUCKET: note-attachments
-- ============================================================================
-- Note: Bucket creation via SQL requires service_role key.
-- Run this ONLY if you have service_role access, otherwise create via Dashboard.
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--     'note-attachments',
--     'note-attachments',
--     true,
--     10485760,
--     ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/jpg']
-- )
-- ON CONFLICT (id) DO UPDATE SET
--     public = EXCLUDED.public,
--     file_size_limit = EXCLUDED.file_size_limit,
--     allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 13. STORAGE RLS POLICIES FOR note-attachments
-- ============================================================================
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Upload: user_id/filename
DROP POLICY IF EXISTS "Users can upload own attachments" ON storage.objects;
CREATE POLICY "Users can upload own attachments" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- View
DROP POLICY IF EXISTS "Users can view own attachments" ON storage.objects;
CREATE POLICY "Users can view own attachments" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Update
DROP POLICY IF EXISTS "Users can update own attachments" ON storage.objects;
CREATE POLICY "Users can update own attachments" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Delete
DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;
CREATE POLICY "Users can delete own attachments" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check all tables created
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Check RLS enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check policies
-- SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Check storage bucket
-- SELECT * FROM storage.buckets WHERE id = 'note-attachments';

-- Check storage policies
-- SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';