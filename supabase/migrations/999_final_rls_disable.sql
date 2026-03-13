-- ============================================================================
-- FINAL MIGRATION: Disable RLS for all tables
-- This should be the LAST migration to run
-- ============================================================================

-- Disable RLS on all tables
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlets DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_hours DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_redemptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE bundles DISABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE area_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Make organization_id nullable for easier admin use
ALTER TABLE outlets ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE products ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE product_categories ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN organization_id DROP NOT NULL;
