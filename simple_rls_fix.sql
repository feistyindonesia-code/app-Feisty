-- RLS Fix - Jalankan di Supabase SQL Editor (Tanpa # komentar)

-- PRODUCTS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_read" ON products;
CREATE POLICY "products_read" ON products FOR SELECT USING (true);
DROP POLICY IF EXISTS "products_write" ON products;
CREATE POLICY "products_write" ON products FOR ALL USING (true);

-- CATEGORIES
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_read" ON product_categories;
CREATE POLICY "categories_read" ON product_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "categories_write" ON product_categories;
CREATE POLICY "categories_write" ON product_categories FOR ALL USING (true);

-- OUTLETS
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "outlets_read" ON outlets;
CREATE POLICY "outlets_read" ON outlets FOR SELECT USING (true);
DROP POLICY IF EXISTS "outlets_write" ON outlets;
CREATE POLICY "outlets_write" ON outlets FOR ALL USING (true);

-- USERS
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read" ON user_accounts;
CREATE POLICY "users_read" ON user_accounts FOR SELECT USING (true);
DROP POLICY IF EXISTS "users_write" ON user_accounts;
CREATE POLICY "users_write" ON user_accounts FOR ALL USING (true);

-- ORDERS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_read" ON orders;
CREATE POLICY "orders_read" ON orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "orders_write" ON orders;
CREATE POLICY "orders_write" ON orders FOR ALL USING (true);

-- ORDER ITEMS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_read" ON order_items;
CREATE POLICY "order_items_read" ON order_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "order_items_write" ON order_items;
CREATE POLICY "order_items_write" ON order_items FOR ALL USING (true);
