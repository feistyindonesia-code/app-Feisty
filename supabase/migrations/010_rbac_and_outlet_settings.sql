-- ============================================================================
-- MIGRATION: Role-Based Access Control & Outlet Settings
-- ============================================================================

-- 1. UPDATE USER ROLE ENUM (add new roles)
-- Note: This uses separate statements for each role to avoid issues
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE 'super_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE 'outlet_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE 'kasir';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2. ADD IS_GLOBAL TO PRODUCTS
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS emoji VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_products_is_global ON products(is_global);

-- 3. ADD OUTLET SETTINGS
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 10.00;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS minimum_order DECIMAL(12,2) DEFAULT 0;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(12,2) DEFAULT 0;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS opening_time TIME;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS closing_time TIME;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. ADD CUSTOMER PHONE TO ORDERS
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL;

-- 5. CREATE BOT SETTINGS TABLE
CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  auto_reply BOOLEAN DEFAULT true,
  ai_enabled BOOLEAN DEFAULT false,
  greeting_message TEXT,
  order_confirmation_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_settings_org ON bot_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_bot_settings_outlet ON bot_settings(outlet_id);

-- 6. CREATE OUTLET USERS TABLE
CREATE TABLE IF NOT EXISTS outlet_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'kasir',
  can_edit_menu BOOLEAN DEFAULT false,
  can_view_reports BOOLEAN DEFAULT false,
  can_manage_orders BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_outlet_users_user ON outlet_users(user_id);
CREATE INDEX IF NOT EXISTS idx_outlet_users_outlet ON outlet_users(outlet_id);

-- 7. ADD ORDER SOURCE
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'weborder';

-- 8. DELIVERY ZONES (handle existing table)
CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  name VARCHAR(100),
  polygon GEOMETRY(POLYGON, 4326),
  delivery_fee DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS polygon GEOMETRY(POLYGON, 4326);
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(12,2) DEFAULT 0;
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_delivery_zones_org ON delivery_zones(organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_outlet ON delivery_zones(outlet_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_geom ON delivery_zones USING GIST(polygon);

-- 9. CREATE OUTLET HOURS TABLE
CREATE TABLE IF NOT EXISTS outlet_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL,
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  UNIQUE(outlet_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_outlet_hours_outlet ON outlet_hours(outlet_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_hours ENABLE ROW LEVEL SECURITY;

-- Bot Settings Policy
DROP POLICY IF EXISTS "bot_settings_access" ON bot_settings;
CREATE POLICY "bot_settings_access" ON bot_settings
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM user_accounts WHERE id = auth.uid())
    OR outlet_id IN (SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid())
  );

-- Outlet Users Policy
DROP POLICY IF EXISTS "outlet_users_access" ON outlet_users;
CREATE POLICY "outlet_users_access" ON outlet_users
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_accounts WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'outlet_admin'))
  );

-- Delivery Zones Policy
DROP POLICY IF EXISTS "delivery_zones_access" ON delivery_zones;
CREATE POLICY "delivery_zones_access" ON delivery_zones
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM user_accounts WHERE id = auth.uid())
  );

-- Outlet Hours Policy
DROP POLICY IF EXISTS "outlet_hours_access" ON outlet_hours;
CREATE POLICY "outlet_hours_access" ON outlet_hours
  FOR ALL USING (
    outlet_id IN (SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_accounts WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

-- Updated Products Policy
DROP POLICY IF EXISTS "products_view" ON products;
CREATE POLICY "products_view" ON products
  FOR SELECT USING (
    is_global = true
    OR organization_id IN (SELECT organization_id FROM user_accounts WHERE id = auth.uid())
    OR outlet_id IN (SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid())
  );

-- Updated Orders Policy
DROP POLICY IF EXISTS "orders_view" ON orders;
CREATE POLICY "orders_view" ON orders
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM user_accounts WHERE id = auth.uid())
    OR outlet_id IN (SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid())
    OR customer_id = auth.uid()
  );

-- Updated Outlets Policy
DROP POLICY IF EXISTS "outlets_view" ON outlets;
CREATE POLICY "outlets_view" ON outlets
  FOR SELECT USING (
    is_active = true
    OR organization_id IN (SELECT organization_id FROM user_accounts WHERE id = auth.uid())
    OR id IN (SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to find nearest outlet
CREATE OR REPLACE FUNCTION find_nearest_outlet(p_latitude DECIMAL, p_longitude DECIMAL, p_organization_id UUID DEFAULT NULL)
RETURNS TABLE (outlet_id UUID, outlet_name VARCHAR, distance NUMERIC, delivery_fee DECIMAL, is_open BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.name,
    (6371 * acos(cos(radians(p_latitude)) * cos(radians(o.latitude)) * cos(radians(o.longitude) - radians(p_longitude)) + sin(radians(p_latitude)) * sin(radians(o.latitude))))::NUMERIC(10,2) AS distance,
    COALESCE(o.delivery_fee, 0), o.is_open
  FROM outlets o
  WHERE o.is_active = true AND o.is_open = true AND (p_organization_id IS NULL OR o.organization_id = p_organization_id)
  ORDER BY distance ASC LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's role in outlet
CREATE OR REPLACE FUNCTION get_user_outlet_role(p_user_id UUID, p_outlet_id UUID)
RETURNS VARCHAR AS $$
DECLARE v_role VARCHAR;
BEGIN
  SELECT role INTO v_role FROM outlet_users WHERE user_id = p_user_id AND outlet_id = p_outlet_id AND is_active = true;
  IF v_role IS NULL THEN
    SELECT role INTO v_role FROM user_accounts WHERE id = p_user_id AND role IN ('super_admin', 'admin', 'outlet_admin');
  END IF;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can access outlet
CREATE OR REPLACE FUNCTION can_access_outlet(p_user_id UUID, p_outlet_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_org_id UUID; v_role VARCHAR;
BEGIN
  SELECT role, organization_id INTO v_role, v_org_id FROM user_accounts WHERE id = p_user_id;
  IF v_role IN ('super_admin', 'admin') THEN RETURN true; END IF;
  PERFORM 1 FROM outlet_users WHERE user_id = p_user_id AND outlet_id = p_outlet_id AND is_active = true;
  IF FOUND THEN RETURN true; END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql;
