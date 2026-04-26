/*
  # Add SELECT policy for event-images bucket

  ## Problem
  Admins still couldn't reliably upload posters. The supabase-js storage
  client can perform a SELECT on `storage.objects` after an upsert. A
  previous security-hardening migration dropped the public SELECT policy
  on the `event-images` bucket, leaving authenticated admins with no
  RLS path to read rows back. Public viewing continues to work via the
  public bucket endpoint (bucket.public = true), which does not go
  through `storage.objects` row policies.

  ## Fix
  Recreate a SELECT policy restricted to admin/super_admin users so the
  storage SDK can read its own rows after upserts.

  No data is modified; only a new RLS policy is added.
*/

DROP POLICY IF EXISTS "Admins can read event images" ON storage.objects;

CREATE POLICY "Admins can read event images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'event-images'
    AND public.is_admin_or_super()
  );
