/*
  # Add anonymous read access to ticket_type_sections

  1. Problem
    - Public visitors (anon role) cannot read ticket_type_sections
    - This breaks the seat picker page which needs to fetch section-to-ticket-type links
    - Only authenticated users had SELECT access previously

  2. Changes
    - Add anon SELECT policy on ticket_type_sections
    - This allows the public seat picker to filter sections by ticket type

  3. Security
    - Read-only access for anon users
    - No write access granted
    - Data is non-sensitive (just links between ticket types and sections)
*/

CREATE POLICY "Anon can read ticket_type_sections"
  ON ticket_type_sections
  FOR SELECT
  TO anon
  USING (true);
