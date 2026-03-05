-- ============================================================================
-- MIGRATION: Disable RLS for Admin Dashboard Access
-- This allows the admin dashboard to manage data without authentication
-- ============================================================================

-- Disable RLS on key tables for admin dashboard
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlets DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- Re-enable with open policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Create open policies (allow all access for anon key)
DROP POLICY IF EXISTS "products_all" ON products;
CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "categories_all" ON product_categories;
CREATE POLICY "categories_all" ON product_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "outlets_all" ON outlets;
CREATE POLICY "outlets_all" ON outlets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users_all" ON user_accounts;
CREATE POLICY "users_all" ON user_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "orders_all" ON orders;
CREATE POLICY "orders_all" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_all" ON order_items;
CREATE POLICY "order_items_all" ON order_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bot_settings_all" ON bot_settings;
CREATE POLICY "bot_settings_all" ON bot_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "organizations_all" ON organizations;
CREATE POLICY "organizations_all" ON organizations FOR ALL USING (true) WITH CHECK (true);
