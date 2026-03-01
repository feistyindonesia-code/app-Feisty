-- Delivery Coverage Areas using PostGIS Polygons

-- Create delivery zones table
CREATE TABLE delivery_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  polygon GEOMETRY(POLYGON, 4326) NOT NULL,
  delivery_fee DECIMAL(12, 2) NOT NULL,
  estimated_minutes INT DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create spatial index for faster queries
CREATE INDEX idx_delivery_zones_polygon ON delivery_zones USING GIST (polygon);
CREATE INDEX idx_delivery_zones_outlet_id ON delivery_zones(outlet_id);

-- Enable RLS
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view delivery zones for their organization
CREATE POLICY "delivery_zones_view" ON delivery_zones
  FOR SELECT USING (
    outlet_id IN (
      SELECT outlets.id FROM outlets 
      JOIN user_accounts ON outlets.organization_id = user_accounts.organization_id
      WHERE user_accounts.id = auth.uid()
    )
  );

-- Function to check if delivery address is within coverage
CREATE OR REPLACE FUNCTION check_delivery_coverage(
  p_outlet_id UUID,
  p_latitude DECIMAL,
  p_longitude DECIMAL
)
RETURNS TABLE(
  zone_id UUID,
  zone_name VARCHAR,
  delivery_fee DECIMAL,
  estimated_minutes INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dz.id,
    dz.name,
    dz.delivery_fee,
    dz.estimated_minutes
  FROM delivery_zones dz
  WHERE 
    dz.outlet_id = p_outlet_id
    AND dz.is_active = true
    AND ST_Contains(
      dz.polygon,
      ST_GeomFromText('POINT(' || p_longitude || ' ' || p_latitude || ')', 4326)
    )
  LIMIT 1;
END;
$$ LANGUAGE 'plpgsql';

-- Function to calculate distance from outlet to delivery point
CREATE OR REPLACE FUNCTION calculate_delivery_distance(
  p_outlet_id UUID,
  p_latitude DECIMAL,
  p_longitude DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  outlet_point GEOMETRY;
  distance_meters DECIMAL;
BEGIN
  SELECT ST_GeomFromText('POINT(' || longitude || ' ' || latitude || ')', 4326)
  INTO outlet_point
  FROM outlets
  WHERE id = p_outlet_id;
  
  IF outlet_point IS NULL THEN
    RETURN NULL;
  END IF;
  
  distance_meters := ST_Distance(
    outlet_point,
    ST_GeomFromText('POINT(' || p_longitude || ' ' || p_latitude || ')', 4326)::geography
  );
  
  RETURN distance_meters / 1000; -- Convert to km
END;
$$ LANGUAGE 'plpgsql';

-- Update trigger for delivery zones
CREATE TRIGGER update_delivery_zones_updated_at BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
