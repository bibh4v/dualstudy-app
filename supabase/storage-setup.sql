-- ============================================================================
-- Supabase Storage Setup for Dual-Track Planner
-- Run this in Supabase SQL Editor after creating the schema
-- ============================================================================

-- ============================================================================
-- CREATE STORAGE BUCKET: note-attachments
-- ============================================================================
-- Note: Bucket creation via SQL requires service_role key.
-- Preferred: Create via Supabase Dashboard → Storage → New Bucket
--   Name: note-attachments
--   Public: true (for public file access via URL)
--   File size limit: 10MB (10485760 bytes)
--   Allowed MIME types: application/pdf, image/jpeg, image/png, image/webp, image/jpg

-- If creating via SQL (requires service_role):
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--     'note-attachments',
--     'note-attachments',
--     true,
--     10485760,  -- 10MB
--     ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/jpg']
-- )
-- ON CONFLICT (id) DO UPDATE SET
--     public = EXCLUDED.public,
--     file_size_limit = EXCLUDED.file_size_limit,
--     allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- STORAGE RLS POLICIES FOR note-attachments BUCKET
-- ============================================================================

-- Enable RLS on storage.objects (usually enabled by default)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can upload files to their own folder
-- Folder structure: {user_id}/{uuid}{ext}
CREATE POLICY "Users can upload own attachments" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Policy: Users can view/download their own files
CREATE POLICY "Users can view own attachments" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Policy: Users can update their own files (e.g., metadata)
CREATE POLICY "Users can update own attachments" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own attachments" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'note-attachments'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- ============================================================================
-- OPTIONAL: Public read access for sharing (if needed)
-- ============================================================================
-- If you want files to be publicly accessible via URL without auth:
-- CREATE POLICY "Public read access for note-attachments" ON storage.objects
--     FOR SELECT USING (bucket_id = 'note-attachments');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check bucket exists
-- SELECT * FROM storage.buckets WHERE id = 'note-attachments';

-- Check storage policies
-- SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';

-- Test upload path format (should be: user_id/filename.ext)
-- Example: '550e8400-e29b-41d4-a716-446655440000/abc123.pdf'