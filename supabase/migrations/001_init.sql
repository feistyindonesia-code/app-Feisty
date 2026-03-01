-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  ELSE
    RAISE NOTICE 'Extension pg_trgm not available on this server, skipping pg_trgm creation.';
  END IF;
END
$$;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'outlet_manager', 'operator', 'customer');
CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'on_delivery',
  'delivered',
  'cancelled',
  'refunded'
);
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'e_wallet', 'bank_transfer');

-- ============================================================================
-- ORGANIZATIONS & OUTLETS
-- ============================================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  logo_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  phone VARCHAR(20),
  whatsapp_device_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_outlets_organization_id ON outlets(organization_id);
CREATE INDEX idx_outlets_active ON outlets(is_active);
CREATE INDEX idx_outlets_coordinates ON outlets(latitude, longitude);

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE user_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  full_name VARCHAR(255),
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'customer',
  outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_accounts_email ON user_accounts(email);
CREATE INDEX idx_user_accounts_phone ON user_accounts(phone);
CREATE INDEX idx_user_accounts_outlet_id ON user_accounts(outlet_id);
CREATE INDEX idx_user_accounts_role ON user_accounts(role);

-- ============================================================================
-- PRODUCTS & CATEGORIES
-- ============================================================================

CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(100),
  price DECIMAL(12, 2) NOT NULL,
  cost_price DECIMAL(12, 2),
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_products_organization_id ON products(organization_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_outlet_id ON products(outlet_id);
CREATE INDEX idx_products_available ON products(is_available);

-- ============================================================================
-- ORDERS
-- ============================================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(255),
  delivery_address TEXT NOT NULL,
  delivery_latitude DECIMAL(10, 8),
  delivery_longitude DECIMAL(11, 8),
  delivery_instructions TEXT,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(12, 2) DEFAULT 0,
  tax DECIMAL(12, 2) DEFAULT 0,
  delivery_fee DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  status order_status DEFAULT 'pending',
  notes TEXT,
  source VARCHAR(50),
  promised_delivery_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_organization_id ON orders(organization_id);
CREATE INDEX idx_orders_outlet_id ON orders(outlet_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- ============================================================================
-- ORDER ITEMS
-- ============================================================================

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  product_name VARCHAR(255) NOT NULL,
  product_price DECIMAL(12, 2) NOT NULL,
  quantity INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  status payment_status DEFAULT 'pending',
  method payment_method,
  reference_id VARCHAR(255),
  transaction_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_organization_id ON payments(organization_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(1000),
  action VARCHAR(50) NOT NULL,
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Organizations: Only admin can view
CREATE POLICY "organizations_admin_view" ON organizations
  FOR SELECT USING (
    auth.uid()::text IN (
      SELECT user_accounts.id::text FROM user_accounts 
      WHERE user_accounts.role = 'admin'
    )
  );

-- Outlets: Users can view their own organization's outlets
CREATE POLICY "outlets_view" ON outlets
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

-- User Accounts: Users can view their own organization
CREATE POLICY "user_accounts_view" ON user_accounts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR id = auth.uid()
  );

-- Orders: Users can view their own organization's orders
CREATE POLICY "orders_view" ON orders
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR customer_id = auth.uid()
  );

-- Customers can only see their own orders
CREATE POLICY "orders_customer_view" ON orders
  FOR SELECT USING (
    (SELECT role FROM user_accounts WHERE id = auth.uid()) = 'customer'
    AND customer_id = auth.uid()
  );

-- Order Items: Follow order visibility
CREATE POLICY "order_items_view" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE 
        organization_id IN (
          SELECT organization_id FROM user_accounts WHERE id = auth.uid()
        )
      OR customer_id = auth.uid()
    )
  );

-- Products: Operators can see their outlet's products
CREATE POLICY "products_view" ON products
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

-- Payments: Users can view their organization's payments
CREATE POLICY "payments_view" ON payments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for organizations
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for outlets
CREATE TRIGGER update_outlets_updated_at BEFORE UPDATE ON outlets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_accounts
CREATE TRIGGER update_user_accounts_updated_at BEFORE UPDATE ON user_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for products
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for orders
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for payments
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'ORD-' || TO_CHAR(NEW.created_at, 'YYYYMMDD') || '-' || LPAD(NEXTVAL('order_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE SEQUENCE order_number_seq START 1000;

CREATE TRIGGER auto_generate_order_number BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();
