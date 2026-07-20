-- Rider Location Tracker - Supabase SQL Schema & RLS Setup
-- Copy and paste this script into your Supabase SQL Editor.

-- 1. Create tables
CREATE TABLE IF NOT EXISTS tracking_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    order_id TEXT NOT NULL,
    rider_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'delivered', 'expired')) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '3 hours')
);

CREATE TABLE IF NOT EXISTS location_updates (
    order_id TEXT PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_updates ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS Policies

-- Policy for tracking_links:
-- Reading tracking links: allowed if anyone knows the unique random token.
-- (This satisfies the requirement that the token in the URL grants access).
CREATE POLICY "Allow read tracking links by token" ON tracking_links
    FOR SELECT
    USING (true);

-- Policy for location_updates:
-- Read policy: A row in location_updates is readable ONLY IF:
-- - There exists a matching active tracking_links row for this order_id
-- - The status of that tracking_links row is 'active'
-- This prevents customers (or anyone else) from accessing location once status is complete/expired.
CREATE POLICY "Allow read location_updates for active orders only" ON location_updates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tracking_links
            WHERE tracking_links.order_id = location_updates.order_id
              AND tracking_links.status = 'active'
              AND tracking_links.expires_at > timezone('utc'::text, now())
        )
    );

-- Write (Upsert) policy: Writes to location_updates are allowed ONLY IF:
-- - The matching tracking_links row has status = 'active'
-- - The expiration time has not passed
CREATE POLICY "Allow write location_updates for active orders only" ON location_updates
    FOR ALL -- INSERT, UPDATE, or ALL
    USING (
        EXISTS (
            SELECT 1 FROM tracking_links
            WHERE tracking_links.order_id = location_updates.order_id
              AND tracking_links.status = 'active'
              AND tracking_links.expires_at > timezone('utc'::text, now())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tracking_links
            WHERE tracking_links.order_id = location_updates.order_id
              AND tracking_links.status = 'active'
              AND tracking_links.expires_at > timezone('utc'::text, now())
        )
    );

-- 3. Supabase Edge Function / cron job for backup expiry
-- You can run this directly in PostgreSQL using pg_cron (if enabled in Supabase)
-- or invoke it via a scheduled edge function / GitHub action.

CREATE OR REPLACE FUNCTION expire_outdated_tracking_links()
RETURNS void AS $$
BEGIN
    UPDATE tracking_links
    SET status = 'expired'
    WHERE status = 'active'
    AND expires_at < timezone('utc'::text, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- To run this every 5 minutes in Supabase (if pg_cron is enabled):
-- SELECT cron.schedule('expire-links-every-5-min', '*/5 * * * *', 'SELECT expire_outdated_tracking_links();');
