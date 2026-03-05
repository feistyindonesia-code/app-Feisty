-- ============================================================================
-- SEED DATA: Admin User, Organization, and Outlet
-- ============================================================================

-- Create organization (if not exists)
INSERT INTO organizations (id, name, slug, is_active)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Feisty Indonesia', 'feisty-indonesia', true)
ON CONFLICT (slug) DO NOTHING;

-- Create outlet
INSERT INTO outlets (id, organization_id, name, slug, address, latitude, longitude, phone, is_active, is_open, tax_rate, delivery_fee)
VALUES 
  (
    '22222222-2222-2222-2222-222222222222', 
    '11111111-1111-1111-1111-111111111111',
    'Feisty Central',
    'feisty-central',
    'Jakarta, Indonesia',
    -6.200000,
    106.800000,
    '6287787655880',
    true,
    true,
    10.00,
    5000
  )
ON CONFLICT DO NOTHING;

-- Note: Password is managed through Supabase Auth
-- To create the user with email feistyindonesia@gmail.com and password 22011999:
-- Go to Supabase Dashboard -> Authentication -> Users -> Create User
-- Or use the Supabase CLI:
-- supabase auth sign-up --email feistyindonesia@gmail.com --password 22011999

-- Create user account record (will be linked after auth user is created)
-- The actual auth user needs to be created in Supabase Auth first
INSERT INTO user_accounts (id, email, full_name, role, organization_id, is_active, is_verified)
VALUES 
  (
    '33333333-3333-3333-3333-333333333333',
    'feistyindonesia@gmail.com',
    'Admin Feisty',
    'super_admin',
    '11111111-1111-1111-1111-111111111111',
    true,
    true
  )
ON CONFLICT (email) DO NOTHING;

-- Assign admin to outlet (optional)
INSERT INTO outlet_users (user_id, outlet_id, role, can_edit_menu, can_view_reports, can_manage_orders, is_active)
VALUES 
  (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    'outlet_admin',
    true,
    true,
    true,
    true
  )
ON CONFLICT DO NOTHING;

-- Create bot settings
INSERT INTO bot_settings (organization_id, outlet_id, is_enabled, auto_reply, greeting_message)
VALUES 
  (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    true,
    true,
    'Halo! Selamat datang di Feisty. Ada yang bisa kami bantu?'
  )
ON CONFLICT DO NOTHING;

-- Insert sample product categories
INSERT INTO product_categories (id, organization_id, name, slug, sort_order, is_active)
VALUES 
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Makanan Utama', 'makanan-utama', 1, true),
  ('44444444-4444-4444-4444-444444444445', '11111111-1111-1111-1111-111111111111', 'Minuman', 'minuman', 2, true),
  ('44444444-4444-4444-4444-444444444446', '11111111-1111-1111-1111-111111111111', 'Dessert', 'dessert', 3, true)
ON CONFLICT DO NOTHING;

-- Insert sample products
INSERT INTO products (id, organization_id, category_id, name, description, price, emoji, is_global, is_available)
VALUES 
  -- Makanan Utama
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Burger Spesial', 'Burger dengan daging sapi premium', 45000, '🍔', true, true),
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Nasi Goreng', 'Nasi goreng khas Feisty', 35000, '🍚', true, true),
  ('55555555-5555-5555-5555-555555555553', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Sate Ayam', 'Sate ayam dengan bumbu kacang', 40000, '🍗', true, true),
  -- Minuman
  ('55555555-5555-5555-5555-555555555554', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444445', 'Iced Coffee', 'Kopi dingin segar', 25000, '☕', true, true),
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444445', 'Smoothie Mangga', 'Smoothie mangga segar', 28000, '🥤', true, true),
  -- Dessert
  ('55555555-5555-5555-5555-555555555556', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444446', 'Tiramisu', 'Dessert Italia klasik', 32000, '🍰', true, true),
  ('55555555-5555-5555-5555-555555555557', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444446', 'Es Cendol', 'Minuman tradisional', 15000, '🧊', true, true)
ON CONFLICT DO NOTHING;

-- Create bundles
INSERT INTO bundles (id, organization_id, name, description, price, is_active)
VALUES 
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111', 'Feisty Combo', 'Burger + Minuman', 55000, true),
  ('66666666-6666-6666-6666-666666666662', '11111111-1111-1111-1111-111111111111', 'Family Bundle', 'Paket untuk keluarga', 150000, true)
ON CONFLICT DO NOTHING;

-- Add bundle items
INSERT INTO bundle_items (bundle_id, product_id, quantity)
VALUES 
  ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555551', 1),
  ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555554', 1),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555551', 2),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555552', 2),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555555', 2)
ON CONFLICT DO NOTHING;

-- IMPORTANT: Create the auth user via Supabase Dashboard or CLI
-- Run this in Supabase SQL Editor to create the auth user:
/*
-- First, create the auth user (this will trigger the auth.users table)
-- The password will be set through the invitation flow or Supabase Dashboard

-- Or use this to link an existing auth user:
-- UPDATE user_accounts 
-- SET id = auth.users.id 
-- WHERE email = 'feistyindonesia@gmail.com';
*/

-- Grant permissions
GRANT ALL ON organizations TO service_role;
GRANT ALL ON outlets TO service_role;
GRANT ALL ON user_accounts TO service_role;
GRANT ALL ON products TO service_role;
GRANT ALL ON product_categories TO service_role;
GRANT ALL ON bundles TO service_role;
GRANT ALL ON bundle_items TO service_role;
GRANT ALL ON bot_settings TO service_role;
GRANT ALL ON outlet_users TO service_role;
