-- Add bundles, bundle items, area requests, and referral_code on orders

-- Bundles table (public-facing packages/coupons)
CREATE TABLE IF NOT EXISTS bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(12,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bundles_org ON bundles(organization_id);

-- Bundle items link bundles to products (internal use only)
CREATE TABLE IF NOT EXISTS bundle_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INT DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_product ON bundle_items(product_id);

-- Area requests for uncovered locations
CREATE TABLE IF NOT EXISTS area_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Allow public selects on bundles (no RLS restrictions)
ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_select_bundles" ON bundles;
CREATE POLICY "public_select_bundles" ON bundles
  FOR SELECT USING (true);

-- Add referral_code column to orders (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE orders ADD COLUMN referral_code VARCHAR(100);
  END IF;
END $$;

-- Utility function: find zone & outlet by coordinates
CREATE OR REPLACE FUNCTION find_zone_by_location(
  p_latitude DECIMAL,
  p_longitude DECIMAL
)
RETURNS TABLE(
  zone_id UUID,
  outlet_id UUID,
  delivery_fee DECIMAL,
  estimated_minutes INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT dz.id, dz.outlet_id, dz.delivery_fee, dz.estimated_minutes
  FROM delivery_zones dz
  WHERE dz.is_active = true
    AND ST_Contains(
      dz.polygon,
      ST_GeomFromText('POINT(' || p_longitude || ' ' || p_latitude || ')', 4326)
    )
  ORDER BY calculate_delivery_distance(dz.outlet_id, p_latitude, p_longitude)
  LIMIT 1;
END;
$$ LANGUAGE 'plpgsql';
