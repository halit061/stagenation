/*
  # Create grant_super_admin RPC function

  1. New RPC Function
    - `grant_super_admin(p_user_id uuid)`
    - SECURITY DEFINER (runs with elevated privileges)
    - Deletes existing user_roles for the user
    - Inserts new super_admin role with is_active=true
    - Only callable by halit@djhalit.com or existing super_admins

  2. Security
    - Function validates caller is authorized
    - Uses SECURITY DEFINER to bypass RLS
    - Prevents unauthorized privilege escalation
*/

CREATE OR REPLACE FUNCTION grant_super_admin(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_email text;
  v_caller_role text;
  v_result json;
BEGIN
  v_caller_id := auth.uid();
  
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_caller_email
  FROM auth.users
  WHERE id = v_caller_id;

  SELECT role INTO v_caller_role
  FROM user_roles
  WHERE user_id = v_caller_id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_caller_email != 'halit@djhalit.com' AND v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only halit@djhalit.com or super_admins can grant super_admin access';
  END IF;

  DELETE FROM user_roles WHERE user_id = p_user_id;

  INSERT INTO user_roles (user_id, role, is_active, created_at, updated_at)
  VALUES (p_user_id, 'super_admin', true, now(), now());

  v_result := json_build_object(
    'success', true,
    'message', 'Super admin access granted',
    'user_id', p_user_id,
    'role', 'super_admin'
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION grant_super_admin IS 'Grants super_admin role to a user. Only callable by halit@djhalit.com or existing super_admins.';
