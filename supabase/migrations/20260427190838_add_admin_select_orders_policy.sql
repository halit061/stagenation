/*
  # Admins can view all orders

  ## Probleem
  De `orders` tabel heeft enkel SELECT-policies voor:
    - sessie-eigenaars (via x-session-id header)
    - eigenaar via JWT email
  Hierdoor zien admins/super_admins de orders van andere klanten niet
  in het orderbeheer-scherm.

  ## Wijziging
  1. Security
    - Voegt een EXTRA SELECT-policy "Admins can view all orders" toe op `orders`
    - Toegestaan voor authenticated users met rol `super_admin` of `admin`
      en `is_active = true` in `user_roles`
  
  ## Belangrijke nota's
  1. Bestaande policies blijven volledig ongewijzigd (geen DROP, geen ALTER)
  2. Postgres OR-combineert meerdere SELECT-policies, dus bestaande
     zichtbaarheid voor klanten verandert niet — admins zien alleen meer
  3. Geen wijziging aan data, geen wijziging aan andere tabellen
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'Admins can view all orders'
  ) THEN
    CREATE POLICY "Admins can view all orders"
      ON orders
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = (SELECT auth.uid())
            AND user_roles.role IN ('super_admin', 'admin')
            AND user_roles.is_active = true
        )
      );
  END IF;
END $$;
