/*
  # Fix SECURITY DEFINER functions missing search_path

  1. Problem
    - Four SECURITY DEFINER functions in the public schema have no explicit search_path set
    - This causes PostgREST schema cache introspection to fail with "Database error querying schema"
    - The affected functions: is_super_admin(uuid), has_role(uuid,...), get_accessible_event_ids(uuid), bulk_create_tickets(...)

  2. Fix
    - Add SET search_path = public to each of the 4 functions
    - Send NOTIFY pgrst to reload the schema cache

  3. Important Notes
    - Function bodies are NOT changed, only the search_path configuration is added
    - This is a safe, non-destructive change
    - No tables, columns, or data are modified
*/

ALTER FUNCTION public.is_super_admin(check_user_id uuid)
  SET search_path = public;

ALTER FUNCTION public.has_role(check_user_id uuid, check_role text, check_brand text, check_event_id uuid)
  SET search_path = public;

ALTER FUNCTION public.get_accessible_event_ids(check_user_id uuid)
  SET search_path = public;

ALTER FUNCTION public.bulk_create_tickets(p_event_id uuid, p_ticket_type_id uuid, p_quantity integer, p_prefix text, p_status text)
  SET search_path = public;

NOTIFY pgrst, 'reload schema';
