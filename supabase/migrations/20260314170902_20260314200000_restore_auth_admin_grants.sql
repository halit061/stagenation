/*
  # Restore supabase_auth_admin grants on auth schema tables

  ## Problem
  The supabase_auth_admin role has lost all privileges on auth schema tables.
  Only the postgres role has grants. GoTrue cannot access auth tables causing login to fail.

  ## Fix
  Grant full privileges back to supabase_auth_admin on all auth schema tables.

  ## Safety
  Non-destructive grant operation only. No data or structure changed.
*/

GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO supabase_auth_admin;
