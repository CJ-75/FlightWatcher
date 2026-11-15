-- Media Storage (Supabase) for parcours covers / step photos.
-- Apply manually in Supabase SQL editor (never supabase db push).
--
-- Creates public bucket `media` + RLS:
--   - public read
--   - authenticated users insert/update/delete under their uid folder
-- Backend uploads use SERVICE_ROLE (bypasses RLS).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  8388608,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read
DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- Authenticated upload into own folder segments:
--   parcours/covers/{uid}/...
--   parcours/steps/{uid}/...
--   uploads/{uid}/...
DROP POLICY IF EXISTS "media_auth_insert" ON storage.objects;
CREATE POLICY "media_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "media_auth_update" ON storage.objects;
CREATE POLICY "media_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "media_auth_delete" ON storage.objects;
CREATE POLICY "media_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

INSERT INTO schema_migrations (id)
VALUES ('apply_media_storage_migration.sql')
ON CONFLICT (id) DO NOTHING;
