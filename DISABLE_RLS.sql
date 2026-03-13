-- ===============================================
-- SQL UNTUK NONAKTIFKAN RLS (DISABLE RLS)
-- Jalankan di Supabase Dashboard > SQL Editor
-- ===============================================

-- Nonaktifkan RLS untuk tabel utama
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlets DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;

-- Nonaktifkan RLS untuk tabel lain (jika ada)
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_hours DISABLE ROW LEVEL SECURITY;

-- Verifikasi - cek status RLS
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
AND rowsecurity = true;
