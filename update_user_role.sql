-- Update existing user role
-- Run this in Supabase SQL Editor to set user role

-- First, let's check what users exist
SELECT id, email, full_name, role, is_active FROM user_accounts;

-- Update the role for your user (replace with your user's email)
UPDATE user_accounts 
SET role = 'super_admin', is_active = true
WHERE email = 'admin@feisty.id';

-- Or if you want to set a specific user's role
-- UPDATE user_accounts 
-- SET role = 'admin', is_active = true
-- WHERE email = 'your-email@example.com';

-- Verify the update
SELECT id, email, full_name, role, is_active FROM user_accounts;
