/*
  # Add email_error column to table_guests

  1. Changes
    - Adds `email_error` (text) column to store failed email error messages
    - This enables tracking why an email failed and allows for resend functionality

  2. Purpose
    - When sending a guest table confirmation fails, store the error
    - UI can then show which emails failed and allow resending
*/

ALTER TABLE table_guests 
ADD COLUMN IF NOT EXISTS email_error text;

COMMENT ON COLUMN table_guests.email_error IS 'Error message when email sending fails - null if successful or not attempted';
