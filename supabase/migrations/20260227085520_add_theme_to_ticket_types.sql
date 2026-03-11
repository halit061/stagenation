/*
  # Add Theme JSONB Column to ticket_types

  1. Modified Tables
    - `ticket_types`
      - `theme` (jsonb, nullable) - Custom visual theme for ticket type
        Fields: header_bg, header_text, card_bg, card_border, badge_text, badge_bg, badge_text_color

  2. Purpose
    - Allows per-ticket-type visual styling in emails and ticket views
    - Preset themes: Regular (blue), Golden (gold), VIP (black/gold)
    - Null/missing theme = current default blue design (no behavior change)

  3. Notes
    - Additive change only, no existing data affected
    - Existing ticket types remain unchanged (null theme = blue default)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'theme'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN theme jsonb DEFAULT NULL;
  END IF;
END $$;
