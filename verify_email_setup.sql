-- Email Implementation Verification Script
-- Run this to verify all database components are in place

\echo '=== Checking email_logs table ==='
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'email_logs'
    ) THEN '✓ email_logs table exists'
    ELSE '✗ email_logs table MISSING'
  END as status;

\echo ''
\echo '=== Checking email_logs columns ==='
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'email_logs'
ORDER BY ordinal_position;

\echo ''
\echo '=== Checking orders email tracking fields ==='
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('email_sent', 'email_sent_at', 'email_error')
ORDER BY column_name;

\echo ''
\echo '=== Checking email_logs indexes ==='
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'email_logs'
ORDER BY indexname;

\echo ''
\echo '=== Checking email_logs RLS policies ==='
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'email_logs'
ORDER BY policyname;

\echo ''
\echo '=== Recent email activity ==='
SELECT
  el.status,
  el.recipient_email,
  el.error_message,
  el.created_at,
  o.order_number,
  o.status as order_status
FROM email_logs el
JOIN orders o ON o.id = el.order_id
ORDER BY el.created_at DESC
LIMIT 10;

\echo ''
\echo '=== Email delivery statistics (last 7 days) ==='
SELECT
  el.status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM email_logs el
WHERE el.created_at > NOW() - INTERVAL '7 days'
GROUP BY el.status
ORDER BY count DESC;

\echo ''
\echo '=== Orders awaiting email (paid but not sent) ==='
SELECT
  order_number,
  payer_email,
  status,
  paid_at,
  email_sent,
  email_error,
  created_at
FROM orders
WHERE status = 'paid'
AND (email_sent IS NULL OR email_sent = false)
ORDER BY created_at DESC
LIMIT 5;

\echo ''
\echo '=== Recent failed emails ==='
SELECT
  o.order_number,
  o.payer_email,
  el.error_message,
  el.created_at
FROM email_logs el
JOIN orders o ON o.id = el.order_id
WHERE el.status = 'failed'
ORDER BY el.created_at DESC
LIMIT 5;

\echo ''
\echo '=== Orders with email errors ==='
SELECT
  order_number,
  payer_email,
  email_error,
  created_at
FROM orders
WHERE email_error IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

\echo ''
\echo '=== Verification Complete ==='
\echo 'Check that:'
\echo '1. email_logs table exists with correct columns'
\echo '2. orders has email_sent, email_sent_at, email_error columns'
\echo '3. RLS policies are in place'
\echo '4. Recent activity shows expected behavior'
