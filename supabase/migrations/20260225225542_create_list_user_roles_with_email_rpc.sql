/*
  # Create RPC function to list user roles with email

  1. New Functions
    - `list_user_roles_with_email()` - Returns all user roles joined with auth.users email
    - Only accessible by super_admin users
    - Uses SECURITY DEFINER to access auth.users table

  2. Security
    - Function checks caller is super_admin before returning data
    - SECURITY DEFINER runs with elevated privileges but validates caller role first
*/

CREATE OR REPLACE FUNCTION public.list_user_roles_with_email()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  role text,
  brand text,
  event_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_active boolean,
  display_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('super_admin', 'superadmin')
      AND user_roles.is_active = true
  ) THEN
    RAISE EXCEPTION 'Only super admins can list all roles with emails';
  END IF;

  RETURN QUERY
    SELECT
      ur.id,
      ur.user_id,
      ur.role,
      ur.brand,
      ur.event_id,
      ur.created_at,
      ur.updated_at,
      ur.is_active,
      ur.display_name,
      u.email
    FROM user_roles ur
    LEFT JOIN auth.users u ON ur.user_id = u.id
    ORDER BY ur.created_at DESC;
END;
$$;