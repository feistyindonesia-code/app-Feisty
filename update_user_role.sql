-- ============================================
-- Setup User dengan Role dan Outlet
-- Jalankan di Supabase SQL Editor
-- ============================================

-- 1. Lihat user yang ada
SELECT id, email, full_name, role, outlet_id, is_active 
FROM user_accounts;

-- 2. Lihat outlet yang ada
SELECT id, name, address FROM outlets;

-- 3. Cara A: Update user dengan role DAN outlet_id
-- Ganti 'email-anda@email.com' dengan email user Anda
-- Ganti 'outlet-id-disini' dengan id outlet dari langkah 2
UPDATE user_accounts 
SET 
  role = 'super_admin', 
  is_active = true,
  organization_id = '11111111-1111-1111-1111-111111111111'
WHERE email = 'admin@feisty.id';

-- 4. Cara B: Untuk Kasir/Outlet Admin, perlu outlet_id
-- Contoh: Mengikat user ke outlet tertentu
-- UPDATE user_accounts 
-- SET role = 'kasir', outlet_id = 'outlet-id-disini', is_active = true
-- WHERE email = 'kasir@feisty.id';

-- 5. Verifikasi hasil
SELECT 
  u.id, u.email, u.full_name, u.role, u.outlet_id, u.is_active,
  o.name as outlet_name
FROM user_accounts u
LEFT JOIN outlets o ON u.outlet_id = o.id
ORDER BY u.created_at DESC;
