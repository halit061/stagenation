/*
  # Remove unused indexes
  
  1. Changes
    - Drop indexes that are not being used by queries
    - Improves write performance and reduces storage overhead
  
  2. Note
    - These indexes can be recreated if they become needed in the future
    - Monitoring should continue to track index usage
*/

-- Events table
DROP INDEX IF EXISTS idx_events_brand;

-- Tickets table
DROP INDEX IF EXISTS idx_tickets_brand;
DROP INDEX IF EXISTS idx_tickets_secure_token;
DROP INDEX IF EXISTS idx_tickets_ticket_type_id;

-- User roles table
DROP INDEX IF EXISTS idx_user_roles_brand;
DROP INDEX IF EXISTS idx_user_roles_event_id;

-- Staff invites table
DROP INDEX IF EXISTS idx_staff_invites_email;
DROP INDEX IF EXISTS idx_staff_invites_token;
DROP INDEX IF EXISTS idx_staff_invites_status;
DROP INDEX IF EXISTS idx_staff_invites_brand;
DROP INDEX IF EXISTS idx_staff_invites_event_id;

-- Sections and tables
DROP INDEX IF EXISTS idx_sections_event_id;
DROP INDEX IF EXISTS idx_tables_section_id;
DROP INDEX IF EXISTS idx_tables_event_id;
DROP INDEX IF EXISTS idx_tables_status;

-- Brands table
DROP INDEX IF EXISTS idx_brands_slug;

-- Holds table
DROP INDEX IF EXISTS idx_holds_table_id;
DROP INDEX IF EXISTS idx_holds_session_id;
DROP INDEX IF EXISTS idx_holds_expires_at;

-- Audit logs table
DROP INDEX IF EXISTS idx_audit_logs_user_id;

-- Promo codes table
DROP INDEX IF EXISTS idx_promo_codes_event_id;

-- Scanners table
DROP INDEX IF EXISTS idx_scanners_user_id;

-- Table reservations
DROP INDEX IF EXISTS idx_table_reservations_table_type_id;

-- Webhook logs
DROP INDEX IF EXISTS idx_webhook_logs_order_id;
DROP INDEX IF EXISTS idx_webhook_logs_table_booking_id;

-- Table bookings
DROP INDEX IF EXISTS idx_table_bookings_order_id;
DROP INDEX IF EXISTS idx_table_bookings_payment_id;

-- Mailing list
DROP INDEX IF EXISTS idx_mailing_list_email;
DROP INDEX IF EXISTS idx_mailing_list_source;

-- Venues
DROP INDEX IF EXISTS idx_venues_city;

-- Scanner users
DROP INDEX IF EXISTS idx_scanner_users_user_id;
DROP INDEX IF EXISTS idx_scanner_users_email;
DROP INDEX IF EXISTS idx_scanner_users_device_id;
DROP INDEX IF EXISTS idx_scanner_users_is_active;

-- Scanner sessions
DROP INDEX IF EXISTS idx_scanner_sessions_scanner_user_id;
DROP INDEX IF EXISTS idx_scanner_sessions_event_id;
DROP INDEX IF EXISTS idx_scanner_sessions_session_token;
DROP INDEX IF EXISTS idx_scanner_sessions_is_active;

-- Scan logs
DROP INDEX IF EXISTS idx_scan_logs_ticket_id;
DROP INDEX IF EXISTS idx_scan_logs_scanner_user_id;
DROP INDEX IF EXISTS idx_scan_logs_scanner_session_id;
DROP INDEX IF EXISTS idx_scan_logs_event_id;
DROP INDEX IF EXISTS idx_scan_logs_scanned_at;
DROP INDEX IF EXISTS idx_scan_logs_scan_result;