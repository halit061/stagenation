/*
  # Add DELETE policy for orders table

  Allows admins to delete comped orders (guest tickets) when all tickets are removed.
*/

CREATE POLICY "Admins can delete comped orders"
  ON orders
  FOR DELETE
  TO authenticated
  USING (
    status = 'comped'
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin', 'superadmin', 'organizer')
    )
  );