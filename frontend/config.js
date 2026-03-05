// ============================================
// CONFIGURATION - Supabase Settings
// ============================================

// ⚠️ IMPORTANT: Replace these values with your Supabase project credentials!
// 
// How to get these values:
// 1. Go to https://supabase.com/dashboard
// 2. Select your project
// 3. Go to Project Settings (gear icon) -> API
// 4. Copy "Project URL" to SUPABASE_URL below
// 5. Copy "anon public" key to SUPABASE_ANON_KEY below

const SUPABASE_URL = "https://cvjpgicqruzolwtpiksa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2anBnaWNxcnV6b2x3dHBpa3NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMzk5ODgsImV4cCI6MjA4NzkxNTk4OH0.sfWuGHiSSN422Smqy6mgRxuq-3FdPns0lWFsE_zqgwM";

// ============================================
// Derived URLs (no need to change)
// ============================================
const AUTH_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/auth`;
const REST_URL = `${SUPABASE_URL}/rest/v1`;

// For testing - check if configured
if (SUPABASE_URL === "https://your-project.supabase.co") {
  console.warn("⚠️ Please configure your SUPABASE_URL and SUPABASE_ANON_KEY in frontend/config.js");
}
