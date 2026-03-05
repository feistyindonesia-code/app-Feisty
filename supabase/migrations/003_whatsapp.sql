-- WhatsApp Integration Schema

CREATE TABLE IF NOT EXISTS whatsapp_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL UNIQUE,
  device_name VARCHAR(255),
  phone_number VARCHAR(20),
  access_token VARCHAR(500),
  is_central BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_devices_organization_id ON whatsapp_devices(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_devices_outlet_id ON whatsapp_devices(outlet_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_devices_device_id ON whatsapp_devices(device_id);

-- WhatsApp Messages Log
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES whatsapp_devices(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  message_type VARCHAR(50),
  message_text TEXT,
  message_data JSONB,
  direction VARCHAR(20),
  webhook_id VARCHAR(255),
  is_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_device_id ON whatsapp_messages(device_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number ON whatsapp_messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_processed ON whatsapp_messages(is_processed);

-- WhatsApp Conversations
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES whatsapp_devices(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  customer_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  last_message_text TEXT,
  message_count INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(device_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_device_id ON whatsapp_conversations(device_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone_number ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_customer_id ON whatsapp_conversations(customer_id);

-- Webhook signatures for validation
CREATE TABLE IF NOT EXISTS webhook_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  webhook_secret VARCHAR(500) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_signatures_organization_id ON webhook_signatures(organization_id);

-- Enable RLS
ALTER TABLE whatsapp_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_signatures ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "whatsapp_devices_view" ON whatsapp_devices;
CREATE POLICY "whatsapp_devices_view" ON whatsapp_devices
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "whatsapp_messages_view" ON whatsapp_messages;
CREATE POLICY "whatsapp_messages_view" ON whatsapp_messages
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "whatsapp_conversations_view" ON whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_view" ON whatsapp_conversations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR customer_id = auth.uid()
  );

-- Functions
CREATE OR REPLACE FUNCTION get_or_create_whatsapp_conversation(
  p_device_id UUID,
  p_phone_number VARCHAR,
  p_customer_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
  v_organization_id UUID;
BEGIN
  SELECT organization_id INTO v_organization_id FROM whatsapp_devices WHERE id = p_device_id;
  
  INSERT INTO whatsapp_conversations (
    organization_id, device_id, phone_number, customer_id, status
  )
  VALUES (v_organization_id, p_device_id, p_phone_number, p_customer_id, 'active')
  ON CONFLICT (device_id, phone_number) DO UPDATE
  SET customer_id = COALESCE(EXCLUDED.customer_id, whatsapp_conversations.customer_id),
      updated_at = NOW()
  RETURNING whatsapp_conversations.id INTO v_conversation_id;
  
  RETURN v_conversation_id;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for updates
CREATE OR REPLACE TRIGGER update_whatsapp_devices_updated_at BEFORE UPDATE ON whatsapp_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_whatsapp_conversations_updated_at BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
