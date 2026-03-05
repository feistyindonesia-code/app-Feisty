-- Smart Logic Bot - Conversation State Management

-- Create conversation_state table
CREATE TABLE IF NOT EXISTS conversation_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES whatsapp_customers(id) ON DELETE CASCADE,
  state VARCHAR(50) DEFAULT 'new_customer',
  last_intent VARCHAR(100),
  last_message TEXT,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_state_customer_id ON conversation_state(customer_id);

-- Enable RLS
ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "conversation_state_owner" ON conversation_state;
CREATE POLICY "conversation_state_owner" ON conversation_state
  FOR ALL USING (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_conversation_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_conversation_state_updated_at ON conversation_state;
CREATE TRIGGER update_conversation_state_updated_at BEFORE UPDATE ON conversation_state
  FOR EACH ROW EXECUTE FUNCTION update_conversation_state_updated_at();

-- Add language column to whatsapp_customers if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_customers' AND column_name = 'language'
  ) THEN
    ALTER TABLE whatsapp_customers ADD COLUMN language VARCHAR(10) DEFAULT 'id';
  END IF;
END $$;
