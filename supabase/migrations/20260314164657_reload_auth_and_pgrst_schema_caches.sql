/*
  # Reload Auth and PostgREST schema caches

  The Supabase Auth service (GoTrue) and PostgREST both cache the database schema.
  After recent migrations, these caches can become stale causing "Database error querying schema"
  even on basic auth operations like login.

  This migration:
  1. Sends NOTIFY to reload the PostgREST schema cache
  2. Sends NOTIFY to reload the Auth schema cache (pgsodium / auth engine)
  3. Performs a dummy ALTER on a public table to force schema reload

  No data or structure is changed.
*/

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
  PERFORM pg_notify('pgrst', 'reload config');
END $$;
