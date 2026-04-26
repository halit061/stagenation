/*
  # Fix event-images storage RLS policies

  ## Problem
  Admin users (super_admin/admin) couldn't upload event posters. The storage
  policies used `EXISTS (SELECT 1 FROM user_roles WHERE ...)` directly which is
  evaluated with the storage role context and RLS applied to `user_roles`,
  resulting in `new row violates row-level security policy` errors at upload time.

  ## Fix
  Replace the inline EXISTS subquery with the existing SECURITY DEFINER helper
  `public.is_admin_or_super()` which bypasses RLS on `user_roles` reliably,
  matching the pattern used elsewhere in the codebase.

  ## Changes
  - Recreate INSERT/UPDATE/DELETE policies on storage.objects for the
    `event-images` bucket to call `public.is_admin_or_super()`.
  - No data changes. Buckets and other policies untouched.
*/

DROP POLICY IF EXISTS "Admins can upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update event images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete event images" ON storage.objects;

CREATE POLICY "Admins can upload event images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND public.is_admin_or_super()
  );

CREATE POLICY "Admins can update event images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'event-images'
    AND public.is_admin_or_super()
  )
  WITH CHECK (
    bucket_id = 'event-images'
    AND public.is_admin_or_super()
  );

CREATE POLICY "Admins can delete event images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'event-images'
    AND public.is_admin_or_super()
  );
