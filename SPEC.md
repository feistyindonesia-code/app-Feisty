# FEISTY SYSTEM ARCHITECTURE

## 1. Web Admin Pusat (admin/)

**URL:** `/admin/`

**Fitur:**
- **Manajemen Menu**
  - Tambah/Edit/Hapus produk
  - Kategori produk
  - Bundle/Paket
  - Harga & ketersediaan
  
- **Manajemen User**
  - Admin Pusat (super admin)
  - Admin Outlet (setiap outlet)
  - Kasir (setiap outlet)
  
- **Manajemen Outlet**
  - Tambah/Edit/Hapus outlet
  - Pengaturan outlet (nama, alamat, koordinat, WhatsApp)
  - Aktif/Nonaktif outlet
  
- **Manajemen Customer**
  - Daftar customer
  - Riwayat order
  - Referral management
  
- **Bot Control**
  - On/Off WhatsApp bot
  - Auto-reply settings
  - AI response configuration

- **Laporan & Analytics**
  - Penjualan keseluruhan
  - Per outlet
  - Customer analytics

---

## 2. Web Outlet (outlet/)

**URL:** `/outlet/`

**Role-based Access:**

### Admin Outlet
- Setting POS outlet (nama, jam buka, pajak)
- Kelola produk outlet (on/off produk dari menu pusat)
- Kelola user kasir outlet
- Laporan penjualan outlet
- Pengaturan notifikasi

### Kasir
- POS untuk penjualan (tambah produk, hitung total, pembayaran)
- Riwayat transaksi
- Print receipt

---

## 3. Web Order (order/)

**URL:** `/order/`

**Flow:**
1. Customer masuk → minta lokasi (latitude/longitude)
2. Sistem cari outlet terdekat yang aktif
3. Tampilkan menu dari outlet tersebut
4. Customer pilih produk → keranjang
5. Checkout → masuk ke outlet terdekat

**Fitur:**
- Geolocation untuk dapat lokasi terdekat
- Tampilkan outlet terdekat
- Menu sesuai outlet aktif
- Order masuk ke outlet yang sesuai
- Konfirmasi via WhatsApp

---

## 4. Landing Page (/)

**URL:** `/`

**Fitur:**
- Promo/Hero section
- Link ke Web Order
- Link ke Admin (untuk internal)
- Link ke Outlet Login

---

## DATABASE SCHEMA (Role & Outlet)

```sql
-- User dengan role dan outlet
CREATE TABLE user_accounts (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  full_name VARCHAR(255),
  role VARCHAR(50), -- 'super_admin', 'outlet_admin', 'kasir'
  outlet_id UUID REFERENCES outlets(id), -- NULL untuk super_admin
  organization_id UUID REFERENCES organizations(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP
);

-- Produk dengan outlet assignment
CREATE TABLE products (
  id UUID PRIMARY KEY,
  organization_id UUID,
  category_id UUID,
  outlet_id UUID REFERENCES outlets(id), -- NULL = menu pusat
  name VARCHAR(255),
  price DECIMAL,
  is_available BOOLEAN DEFAULT true,
  is_global BOOLEAN DEFAULT true, -- true = tampil di semua outlet
  created_at TIMESTAMP
);

-- Orders dengan outlet assignment
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  organization_id UUID,
  outlet_id UUID REFERENCES outlets(id),
  order_number VARCHAR(50),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),
  delivery_address TEXT,
  delivery_latitude DECIMAL,
  delivery_longitude DECIMAL,
  total DECIMAL,
  status VARCHAR(50),
  source VARCHAR(50), -- 'weborder', 'pos', 'whatsapp'
  created_at TIMESTAMP
);
```

---

## EDGE FUNCTIONS NEEDED

1. **auth** - Login/Register dengan role & outlet
2. **admin-products** - CRUD produk (admin pusat)
3. **outlet-products** - Kelola produk per outlet
4. **outlet-users** - Kelola kasir per outlet
5. **weborder** - Ordering dengan lokasi terdekat
6. **pos-order** - Kasir POS order
7. **find-nearest-outlet** - Cari outlet terdekat

---

## FOLDER STRUCTURE

```
/
├── index.html          # Landing Page
├── admin/             # Web Admin Pusat
│   └── index.html
├── outlet/            # Web Outlet (Login + Dashboard)
│   └── index.html
├── order/             # Web Order (Customer)
│   └── index.html
└── supabase/
    └── functions/
        ├── auth/
        ├── admin-products/
        ├── outlet-products/
        ├── weborder/
        └── pos/
```
