# 🚀 Feisty App Setup Guide

## Quick Start

### 1. Configure Supabase Credentials

**IMPORTANT:** Edit `frontend/config.js` and replace placeholder values:

```javascript
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";
```

**How to get these values:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Project Settings** (gear icon) → **API**
4. Copy **Project URL** to `SUPABASE_URL`
5. Copy **anon public** key to `SUPABASE_ANON_KEY`

### 2. Database Migrations

Migrations are automatically pushed via GitHub Actions. If there's an error:
1. Check GitHub Actions logs: https://github.com/feistyindonesia-code/app-Feisty/actions

### 3. Create Admin User

Since password can't be seeded, create user manually in Supabase:

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Create user**
3. Enter:
   - Email: `feistyindonesia@gmail.com`
   - Password: `22011999`
   - Confirm email: ✅ (checked)

4. The seed data in migration will link this user with `super_admin` role

### 4. Access the App

| App | URL | Login |
|-----|-----|-------|
| **Admin Dashboard** | `/admin/` | feistyindonesia@gmail.com / 22011999 |
| **POS (Outlet)** | `/outlet/` | Outlet user credentials |
| **Web Order** | `/order/` | Customer ordering |
| **Landing Page** | `/` | Public |

## Pages Structure

```
/                           → Landing page (index.html)
/admin/                     → Admin dashboard (admin/index.html)
/outlet/                    → POS Outlet (outlet/index.html)
/order/                     → Web Order (order/index.html)
/pos/                       → POS Standalone (pos/index.html)
```

## Troubleshooting

### Error: `net::ERR_NAME_NOT_RESOLVED`
This means `SUPABASE_URL` is still set to placeholder value.

**Fix:** Edit `frontend/config.js` with your real Supabase project URL.

### Error: Login Failed
1. Make sure you created the user in Supabase Authentication
2. Check that the user exists in `user_accounts` table
3. Check browser console (F12) for detailed error messages

### Need to update multiple pages?

The configuration is centralized in `frontend/config.js`. All pages load this file to get `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

If you have issues with path, make sure each HTML file loads the config:
```html
<script src="../frontend/config.js"></script>
```
