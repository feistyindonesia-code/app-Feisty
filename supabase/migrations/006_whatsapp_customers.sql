  -- WhatsApp Customer Tracking for Referral System

-- Table untuk menyimpan data customer dari WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(255),
  referrer_code VARCHAR(50), -- kode referral dari yang undang
  my_referral_code VARCHAR(50) UNIQUE, -- kode referral unik customer ini
  referrer_id UUID REFERENCES whatsapp_customers(id), -- siapa yang undang (induk)
  organization_id UUID REFERENCES organizations(id),
  total_orders INT DEFAULT 0,
  total_referrals INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  first_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_customers_phone ON whatsapp_customers(phone_number);
CREATE INDEX idx_whatsapp_customers_referral_code ON whatsapp_customers(my_referral_code);
CREATE INDEX idx_whatsapp_customers_referrer_id ON whatsapp_customers(referrer_id);

-- Enable RLS
ALTER TABLE whatsapp_customers ENABLE ROW LEVEL SECURITY;

-- RLS Policy - allow service role to manage
CREATE POLICY "whatsapp_customers_service" ON whatsapp_customers
  FOR ALL USING (true);

-- Function untuk generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  v_code VARCHAR(10);
  v_exists BOOLEAN := true;
BEGIN
  -- Generate kode acak dari nama + angka
  WHILE v_exists LOOP
    v_code := UPPER(
      SUBSTRING(COALESCE(NEW.full_name, 'FEISTY') FROM 1 FOR 3) || 
      FLOOR(RANDOM() * 10000)::TEXT ||
      SUBSTRING(FLOOR(RANDOM() * 100)::TEXT FROM 1 FOR 2)
    );
    SELECT COUNT(*) = 0 INTO v_exists 
    FROM whatsapp_customers 
    WHERE my_referral_code = v_code;
  END LOOP;
  
  NEW.my_referral_code := v_code;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger untuk generate referral code
CREATE TRIGGER generate_customer_referral_code 
  BEFORE INSERT ON whatsapp_customers
  FOR EACH ROW
  WHEN (NEW.my_referral_code IS NULL)
  EXECUTE FUNCTION generate_referral_code();

-- Update updated_at trigger
CREATE TRIGGER update_whatsapp_customers_updated_at 
  BEFORE UPDATE ON whatsapp_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function untuk share link WhatsApp dengan referral
CREATE OR REPLACE FUNCTION get_whatsapp_referral_link(
  p_phone_number VARCHAR,
  p_organization_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_customer whatsapp_customers%ROWTYPE;
  v_base_url TEXT := 'https://wa.me/6287787655880';
  v_message TEXT;
BEGIN
  -- Cari customer
  SELECT * INTO v_customer 
  FROM whatsapp_customers 
  WHERE phone_number = p_phone_number 
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  
  IF v_customer.my_referral_code IS NULL THEN
    RETURN v_base_url;
  END IF;
  
  -- Format pesan referral
  v_message := 'Halo! Saya undangan dari Feisty. ' ||
    'Gunakan kode referral saya: ' || v_customer.my_referral_code || 
    ' untuk pesananan pertama kamu! 🎉';
  
  -- Return WhatsApp link dengan pre-filled message
  RETURN v_base_url || '?text=' || URL_ENCODE(v_message);
END;
$$ LANGUAGE 'plpgsql';
