-- ============================================================================
-- MIGRATION: Role-Based Access Control & Outlet Settings
-- Purpose:完善 user roles, product global flag, outlet settings, bot config
-- ============================================================================

-- 1. UPDATE USER ROLE ENUM (add new roles)
DO $$
BEGIN
  -- Drop existing policies that depend on user_role
  DROP POLICY IF EXISTS "organizations_admin_view" ON organizations;
  DROP POLICY IF EXISTS "products_view" ON products;
  DROP POLICY IF EXISTS "orders_view" ON orders;
  DROP POLICY IF EXISTS "orders_customer_view" ON orders;
  DROP POLICY IF EXISTS "order_items_view" ON order_items;
  DROP POLICY IF EXISTS "payments_view" ON payments;
  
  -- Alter the type to add new roles
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'outlet_admin';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'kasir';
EXCEPTION
  WHEN duplicate_object THEN
    -- Type already modified, continue
    NULL;
END
$$;

-- 2. ADD IS_GLOBAL TO PRODUCTS (products available in all outlets)
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

-- 4. ADD CUSTOMER PHONE TO ORDERS (for non-account customers)
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

-- 6. CREATE OUTLET USERS TABLE (multiple users per outlet)
CREATE TABLE IF NOT EXISTS outlet_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'kasir', -- 'outlet_admin', 'kasir'
  can_edit_menu BOOLEAN DEFAULT false,
  can_view_reports BOOLEAN DEFAULT false,
  can_manage_orders BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_outlet_users_user ON outlet_users(user_id);
CREATE INDEX IF NOT EXISTS idx_outlet_users_outlet ON outlet_users(outlet_id);

-- 7. ADD ORDER SOURCE ENUM VALUES
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'weborder';

-- 8. ADD ZONE DELIVERY SETTINGS
-- First check if delivery_zones table exists, add columns if missing
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_zones') THEN
    -- Create table if it doesn't exist
    CREATE TABLE delivery_zones (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      polygon GEOMETRY(POLYGON, 4326),
      delivery_fee DECIMAL(12,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  ELSE
    -- Table exists, add columns if they don't exist
    ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE;
    ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS name VARCHAR(100);
    ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS polygon GEOMETRY(POLYGON, 4326);
    ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(12,2) DEFAULT 0;
    ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  END IF;
END
$;

CREATE INDEX IF NOT EXISTS idx_delivery_zones_org ON delivery_zones(organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_outlet ON delivery_zones(outlet_id);
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_delivery_zones_geom') THEN
    CREATE INDEX idx_delivery_zones_geom ON delivery_zones USING GIST(polygon);
  END IF;
END
$;

-- 9. CREATE OUTLET HOURS TABLE
CREATE TABLE IF NOT EXISTS outlet_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL, -- 0=Sunday, 1=Monday, etc.
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  UNIQUE(outlet_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_outlet_hours_outlet ON outlet_hours(outlet_id);

-- ============================================================================
-- RLS POLICIES (Updated for new roles)
-- ============================================================================

ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_hours ENABLE ROW LEVEL SECURITY;

-- Bot Settings: Admin can view/edit their org, outlet admin can view/edit their outlet
DROP POLICY IF EXISTS "bot_settings_access" ON bot_settings;
CREATE POLICY "bot_settings_access" ON bot_settings
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR outlet_id IN (
      SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid()
    )
  );

-- Outlet Users: Users can view their assigned outlets
DROP POLICY IF EXISTS "outlet_users_access" ON outlet_users;
CREATE POLICY "outlet_users_access" ON outlet_users
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_accounts 
      WHERE user_accounts.id = auth.uid() 
      AND user_accounts.role IN ('super_admin', 'admin', 'outlet_admin')
    )
  );

-- Delivery Zones: Same as outlets
DROP POLICY IF EXISTS "delivery_zones_access" ON delivery_zones;
CREATE POLICY "delivery_zones_access" ON delivery_zones
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

-- Outlet Hours: Same as outlets
DROP POLICY IF EXISTS "outlet_hours_access" ON outlet_hours;
CREATE POLICY "outlet_hours_access" ON outlet_hours
  FOR ALL USING (
    outlet_id IN (
      SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_accounts 
      WHERE user_accounts.id = auth.uid() 
      AND user_accounts.role IN ('super_admin', 'admin')
    )
  );

-- Updated Products Policy (now checks is_global)
DROP POLICY IF EXISTS "products_view" ON products;
CREATE POLICY "products_view" ON products
  FOR SELECT USING (
    is_global = true
    OR organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR outlet_id IN (
      SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid()
    )
  );

-- Updated Orders Policy
DROP POLICY IF EXISTS "orders_view" ON orders;
CREATE POLICY "orders_view" ON orders
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR outlet_id IN (
      SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid()
    )
    OR customer_id = auth.uid()
  );

-- Updated Outlets Policy
DROP POLICY IF EXISTS "outlets_view" ON outlets;
CREATE POLICY "outlets_view" ON outlets
  FOR SELECT USING (
    is_active = true
    OR organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR id IN (
      SELECT outlet_id FROM outlet_users WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to find nearest outlet
CREATE OR REPLACE FUNCTION find_nearest_outlet(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  outlet_id UUID,
  outlet_name VARCHAR,
  distance NUMERIC,
  delivery_fee DECIMAL,
  is_open BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    (
      6371 * acos(
        cos(radians(p_latitude)) * cos(radians(o.latitude)) * 
        cos(radians(o.longitude) - radians(p_longitude)) + 
        sin(radians(p_latitude)) * sin(radians(o.latitude))
      )
    )::NUMERIC(10,2) AS distance,
    COALESCE(o.delivery_fee, 0),
    o.is_open
  FROM outlets o
  WHERE o.is_active = true
    AND o.is_open = true
    AND (p_organization_id IS NULL OR o.organization_id = p_organization_id)
  ORDER BY distance ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's role in outlet
CREATE OR REPLACE FUNCTION get_user_outlet_role(p_user_id UUID, p_outlet_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  v_role VARCHAR;
BEGIN
  SELECT role INTO v_role 
  FROM outlet_users 
  WHERE user_id = p_user_id AND outlet_id = p_outlet_id AND is_active = true;
  
  IF v_role IS NULL THEN
    -- Check if user is super_admin or admin
    SELECT role INTO v_role 
    FROM user_accounts 
    WHERE id = p_user_id AND role IN ('super_admin', 'admin', 'outlet_admin');
  END IF;
  
  RETURN v_role;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can access outlet
CREATE OR REPLACE FUNCTION can_access_outlet(p_user_id UUID, p_outlet_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_org_id UUID;
  v_role VARCHAR;
BEGIN
  -- Get user role
  SELECT role, organization_id INTO v_role, v_org_id
  FROM user_accounts WHERE id = p_user_id;
  
  -- Super admin and admin can access all
  IF v_role IN ('super_admin', 'admin') THEN
    RETURN true;
  END IF;
  
  -- Check if user is assigned to this outlet
  PERFORM 1 FROM outlet_users 
  WHERE user_id = p_user_id AND outlet_id = p_outlet_id AND is_active = true;
  
  IF FOUND THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (Optional - for testing)
-- ============================================================================

-- Insert sample bot settings for existing organizations
-- This will be done after org is created
