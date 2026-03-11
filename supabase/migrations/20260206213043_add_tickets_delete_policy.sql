/*
  # Add DELETE policy for tickets table

  Allows admins/superadmins to delete tickets (for guest ticket management).
*/

CREATE POLICY "Admins can delete tickets"
  ON tickets
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin', 'superadmin', 'organizer')
    )
  );