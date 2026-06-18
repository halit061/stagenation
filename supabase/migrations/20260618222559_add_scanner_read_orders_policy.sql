/*
  # Add scanner read access to orders

  Scanner users need to read order status and payer_name to:
  - Filter only paid tickets during download
  - Display ticket holder names in the scanner app

  This is READ-ONLY, scoped to events the scanner user has access to.
  Existing policies (admin view all, user view own, session view own) remain unchanged.
*/

CREATE POLICY "Scanner users can read event orders"
  ON orders
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
        OR user_roles.event_id = orders.event_id
      )
    )
  );
