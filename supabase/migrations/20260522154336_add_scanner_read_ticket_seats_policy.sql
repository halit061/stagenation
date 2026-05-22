/*
  # Add scanner read access to ticket_seats

  1. Security Changes
    - Add SELECT policy on `ticket_seats` for users with scanner role
    - Scanner users can only read ticket_seats for events they have access to
    - This allows the mobile scanner app to download tickets for offline scanning

  2. Important Notes
    - This is READ-ONLY access - scanners cannot modify ticket_seats
    - Access is scoped to events the scanner user has been assigned to via user_roles
    - Super admins already have access via existing admin policy
*/

CREATE POLICY "Scanner users can read event ticket seats"
  ON ticket_seats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('scanner', 'admin', 'super_admin')
      AND user_roles.is_active = true
      AND (
        user_roles.role = 'super_admin'
        OR user_roles.event_id = ticket_seats.event_id
      )
    )
  );
