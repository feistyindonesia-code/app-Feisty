-- Referral System Schema

CREATE TABLE IF NOT EXISTS referral_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  referrer_reward DECIMAL(12, 2) NOT NULL,
  referee_reward DECIMAL(12, 2) NOT NULL,
  max_referrals INT,
  max_redemptions INT,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_campaigns_organization_id ON referral_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_referral_campaigns_active ON referral_campaigns(is_active);

-- Referral Codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES referral_campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  redeemed_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_campaign_id ON referral_codes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_referrer_id ON referral_codes(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(is_active);

-- Referral Redemptions
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES referral_campaigns(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  referrer_reward_amount DECIMAL(12, 2),
  referee_reward_amount DECIMAL(12, 2),
  referrer_rewarded BOOLEAN DEFAULT false,
  referee_rewarded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_code_id ON referral_redemptions(code_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer_id ON referral_redemptions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referee_id ON referral_redemptions(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_order_id ON referral_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_created_at ON referral_redemptions(created_at);

-- Referral Rewards (Credits)
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  redemption_id UUID REFERENCES referral_redemptions(id) ON DELETE SET NULL,
  reward_type VARCHAR(50),
  amount DECIMAL(12, 2) NOT NULL,
  balance DECIMAL(12, 2) NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_id ON referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_organization_id ON referral_rewards(organization_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_created_at ON referral_rewards(created_at);

-- Enable RLS
ALTER TABLE referral_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "referral_campaigns_view" ON referral_campaigns;
CREATE POLICY "referral_campaigns_view" ON referral_campaigns
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "referral_codes_view" ON referral_codes;
CREATE POLICY "referral_codes_view" ON referral_codes
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
    OR referrer_id = auth.uid()
  );

DROP POLICY IF EXISTS "referral_redemptions_view" ON referral_redemptions;
CREATE POLICY "referral_redemptions_view" ON referral_redemptions
  FOR SELECT USING (
    referrer_id = auth.uid()
    OR referee_id = auth.uid()
    OR campaign_id IN (
      SELECT id FROM referral_campaigns 
      WHERE organization_id IN (
        SELECT organization_id FROM user_accounts WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "referral_rewards_view" ON referral_rewards;
CREATE POLICY "referral_rewards_view" ON referral_rewards
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM user_accounts WHERE id = auth.uid()
    )
  );

-- Functions
CREATE OR REPLACE FUNCTION validate_referral_code(
  p_code VARCHAR,
  p_organization_id UUID
)
RETURNS TABLE(
  code_id UUID,
  campaign_id UUID,
  is_valid BOOLEAN,
  error_message VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rc.id,
    rc.campaign_id,
    CASE 
      WHEN rc.id IS NULL THEN false
      WHEN NOT rc.is_active THEN false
      WHEN rc.expires_at < NOW() THEN false
      WHEN rc2.max_referrals IS NOT NULL AND rc.redeemed_count >= rc2.max_referrals THEN false
      ELSE true
    END as valid,
    CASE 
      WHEN rc.id IS NULL THEN 'Code not found'
      WHEN NOT rc.is_active THEN 'Code is inactive'
      WHEN rc.expires_at < NOW() THEN 'Code has expired'
      WHEN rc2.max_referrals IS NOT NULL AND rc.redeemed_count >= rc2.max_referrals THEN 'Max redemptions reached'
      ELSE NULL
    END as error
  FROM referral_codes rc
  LEFT JOIN referral_campaigns rc2 ON rc.campaign_id = rc2.id
  WHERE rc.code = p_code AND rc.organization_id = p_organization_id;
END;
$$ LANGUAGE 'plpgsql';

-- Calculate user referral rewards balance
CREATE OR REPLACE FUNCTION get_user_referral_balance(
  p_user_id UUID
)
RETURNS DECIMAL AS $$
DECLARE
  v_balance DECIMAL;
BEGIN
  SELECT COALESCE(SUM(balance), 0)
  INTO v_balance
  FROM referral_rewards
  WHERE user_id = p_user_id AND is_used = false AND expires_at > NOW();
  
  RETURN v_balance;
END;
$$ LANGUAGE 'plpgsql';

-- Triggers
CREATE OR REPLACE TRIGGER update_referral_campaigns_updated_at BEFORE UPDATE ON referral_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_referral_codes_updated_at BEFORE UPDATE ON referral_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_referral_redemptions_updated_at BEFORE UPDATE ON referral_redemptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_referral_rewards_updated_at BEFORE UPDATE ON referral_rewards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
