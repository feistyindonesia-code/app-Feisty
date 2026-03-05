// ============================================
// Supabase Configuration
// ============================================

// ⚠️ IMPORTANT: Replace these values with your Supabase project credentials!
// 
// How to get these values:
// 1. Go to https://supabase.com/dashboard
// 2. Select your project  
// 3. Go to Project Settings (gear icon) -> API
// 4. Copy "Project URL" to SUPABASE_URL
// 5. Copy "anon public" key to SUPABASE_ANON_KEY

const SUPABASE_URL = "https://cvjpgicqruzolwtpiksa.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";

// Derived URLs
const AUTH_FUNCTION_URL = SUPABASE_URL + "/functions/v1/auth";
const REST_URL = SUPABASE_URL + "/rest/v1";

// Warning if not configured
if (SUPABASE_URL === "https://your-project.supabase.co") {
  console.warn("⚠️ Please configure your SUPABASE_URL and SUPABASE_ANON_KEY in config.js");
}
