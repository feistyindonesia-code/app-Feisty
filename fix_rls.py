"""
Script to apply the RLS fix migration to Supabase.
Run this after deploying to ensure admin dashboard can access data.
"""

import os
import requests
import json

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://cvjpgicqruzolwtpiksa.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def apply_migration():
    """Apply the RLS fix migration via Supabase REST API"""
    
    if not SUPABASE_SERVICE_KEY:
        print("Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set")
        return False
    
    migration_sql = """
-- Disable RLS on key tables for admin dashboard
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlets DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- Re-enable with open policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Create open policies (allow all access for anon key)
DROP POLICY IF EXISTS "products_all" ON products;
CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "categories_all" ON product_categories;
CREATE POLICY "categories_all" ON product_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "outlets_all" ON outlets;
CREATE POLICY "outlets_all" ON outlets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users_all" ON user_accounts;
CREATE POLICY "users_all" ON user_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "orders_all" ON orders;
CREATE POLICY "orders_all" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_all" ON order_items;
CREATE POLICY "order_items_all" ON order_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bot_settings_all" ON bot_settings;
CREATE POLICY "bot_settings_all" ON bot_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "organizations_all" ON organizations;
CREATE POLICY "organizations_all" ON organizations FOR ALL USING (true) WITH CHECK (true);
"""
    
    # Use Supabase SQL API
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json"
        },
        json={"query": migration_sql}
    )
    
    if response.status_code == 200:
        print("Migration applied successfully!")
        return True
    else:
        print(f"Error applying migration: {response.status_code}")
        print(response.text)
        
        # Try alternative method using raw SQL endpoint
        print("\nTrying alternative method...")
        return apply_migration_alternative(migration_sql)

def apply_migration_alternative(sql):
    """Alternative method using pg"""
    # This would need to be run via Supabase dashboard or CLI
    print("Please run the migration manually via:")
    print("1. Supabase Dashboard > SQL Editor")
    print("2. Or: npx supabase db push")
    print("\nOr add these lines to your .env and run fix_migration.py:")
    print(f"SUPABASE_SERVICE_ROLE_KEY=your_service_key")
    return False

if __name__ == "__main__":
    print("Applying RLS fix for admin dashboard...")
    apply_migration()
