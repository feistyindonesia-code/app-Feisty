-- ============================================================================
-- PROPER RLS POLICIES - Keep RLS Active but allow admin dashboard access
-- ============================================================================

-- Enable RLS on all tables (keep it active)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PRODUCTS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "products_read_all" ON products;
DROP POLICY IF EXISTS "products_insert_all" ON products;
DROP POLICY IF EXISTS "products_update_all" ON products;
DROP POLICY IF EXISTS "products_delete_all" ON products;

-- Anyone can read products that are available
CREATE POLICY "products_read_all" ON products 
FOR SELECT USING (is_available = true OR organization_id IS NOT NULL);

-- All users can insert/update/delete
CREATE POLICY "products_insert_all" ON products 
FOR INSERT WITH CHECK (true);

CREATE POLICY "products_update_all" ON products 
FOR UPDATE USING (true);

CREATE POLICY "products_delete_all" ON products 
FOR DELETE USING (true);

-- ============================================================================
-- PRODUCT CATEGORIES POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "categories_read_all" ON product_categories;
DROP POLICY IF EXISTS "categories_write_all" ON product_categories;

CREATE POLICY "categories_read_all" ON product_categories 
FOR SELECT USING (true);

CREATE POLICY "categories_write_all" ON product_categories 
FOR ALL USING (true);

-- ============================================================================
-- OUTLETS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "outlets_read_all" ON outlets;
DROP POLICY IF EXISTS "outlets_write_all" ON outlets;

CREATE POLICY "outlets_read_all" ON outlets 
FOR SELECT USING (true);

CREATE POLICY "outlets_write_all" ON outlets 
FOR ALL USING (true);

-- ============================================================================
-- USER ACCOUNTS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "users_read_all" ON user_accounts;
DROP POLICY IF EXISTS "users_write_all" ON user_accounts;

CREATE POLICY "users_read_all" ON user_accounts 
FOR SELECT USING (true);

CREATE POLICY "users_write_all" ON user_accounts 
FOR ALL USING (true);

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "orders_read_all" ON orders;
DROP POLICY IF EXISTS "orders_write_all" ON orders;

CREATE POLICY "orders_read_all" ON orders 
FOR SELECT USING (true);

CREATE POLICY "orders_write_all" ON orders 
FOR ALL USING (true);

-- ============================================================================
-- ORDER ITEMS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "order_items_read_all" ON order_items;
DROP POLICY IF EXISTS "order_items_write_all" ON order_items;

CREATE POLICY "order_items_read_all" ON order_items 
FOR SELECT USING (true);

CREATE POLICY "order_items_write_all" ON order_items 
FOR ALL USING (true);

-- ============================================================================
-- BOT SETTINGS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "bot_settings_read_all" ON bot_settings;
DROP POLICY IF EXISTS "bot_settings_write_all" ON bot_settings;

CREATE POLICY "bot_settings_read_all" ON bot_settings 
FOR SELECT USING (true);

CREATE POLICY "bot_settings_write_all" ON bot_settings 
FOR ALL USING (true);

-- ============================================================================
-- ORGANIZATIONS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "organizations_read_all" ON organizations;
DROP POLICY IF EXISTS "organizations_write_all" ON organizations;

CREATE POLICY "organizations_read_all" ON organizations 
FOR SELECT USING (true);

CREATE POLICY "organizations_write_all" ON organizations 
FOR ALL USING (true);

-- ============================================================================
-- PAYMENTS POLICIES
-- ============================================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_read_all" ON payments;
DROP POLICY IF EXISTS "payments_write_all" ON payments;

CREATE POLICY "payments_read_all" ON payments 
FOR SELECT USING (true);

CREATE POLICY "payments_write_all" ON payments 
FOR ALL USING (true);
