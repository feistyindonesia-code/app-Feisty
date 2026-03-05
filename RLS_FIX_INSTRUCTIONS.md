# Cara Menjalankan Migration RLS Fix

## Opsi 1: Via Supabase Dashboard (，推荐)

1. Buka https://supabase.com/dashboard
2. Pilih project Anda
3. Klik **SQL Editor** di menu kiri
4. Copy dan paste kode di bawah ini:

```sql
-- ============================================
-- RLS Fix untuk Admin Dashboard
-- ============================================

-- Nonaktifkan RLS pada tabel utama
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlets DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- Aktifkan kembali dengan policy terbuka
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama dan buat policy baru (allow all)
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
```

5. Klik **Run**

## Opsi 2: Via Supabase CLI

```bash
npx supabase db push
```

## Opsi 3: Buat GitHub Actions (Otomatis)

Tambahkan di workflow deployment Anda untuk auto-run migration.

---

**Setelah migration dijalankan:**
- ✅ Semua fitur CRUD di admin dashboard akan berfungsi
- ✅ Tambah/Edit/Hapus produk
- ✅ Tambah/Edit/Hapus kategori
- ✅ Tambah/Edit/Hapus outlet
- ✅ Tambah/Edit/Hapus user
- ✅ Simpan pengaturan bot
