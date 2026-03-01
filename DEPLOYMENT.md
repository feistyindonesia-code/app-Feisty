# FEISTY V2 - SISTEM DEPLOYMENT

## 🚀 PANDUAN SETUP PRODUCTION

### STEP 1: GitHub Setup
```bash
# Buat repository baru di GitHub "feisty-app"
git init
git remote add origin https://github.com/YOUR_USERNAME/feisty-app.git
git add .
git commit -m "Initial feisty v2 setup"
git push -u origin main
```

### STEP 2: GitHub Secrets Configuration
Copy ke GitHub Repository Settings → Secrets and variables → Actions

```
SUPABASE_PROJECT_REF=your-project-id
SUPABASE_DB_PASSWORD=your-secure-password
SUPABASE_ACCESS_TOKEN=sbp_xxxxx (dari https://supabase.com/dashboard/account/tokens)
SLACK_WEBHOOK=https://hooks.slack.com/xxx (optional)
```

### STEP 3: Supabase Project Setup
1. Buat project baru di supabase.com
2. Catat: Project ID, Database Password, Service Role Key
3. Enable Real-time untuk publikasi

### STEP 4: WhatsApp Setup
1. Register di https://www.whacenter.com
2. Dapatkan API key & device configuration
3. Set webhook URL ke: `https://your-project.supabase.co/functions/v1/whatsapp-webhook`

### STEP 5: GitHub Pages Setup
1. Settings → Pages → Source: Deploy from branch
2. Branch: `main` → folder: `frontend`
3. Custom domain (optional)

### STEP 6: First Deployment
```bash
# Push ke main untuk trigger deployment otomatis
git push origin main

# Monitor progress: GitHub → Actions
```

## 🔑 Environment Variables untuk Produksi

### Supabase Cloud
```bash
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJxxxx" # Jangan bagikan!
SUPABASE_ANON_KEY="eyJxxxx"
```

### WhatsApp Integration
```bash
WHATSAPP_WEBHOOK_TOKEN="verify-token-dari-whacenter"
WHATSAPP_WEBHOOK_SECRET="secret-dari-whacenter"  
WHACENTER_API_KEY="api-key-dari-whacenter"
```

### AI/ML
```bash
OPENAI_API_KEY="sk-xxxxxx"
```

## 📋 Database Migration Workflow

```bash
# 1. Local development
supabase start
supabase db push

# 2. Testing
supabase functions serve

# 3. Production deployment (via GitHub Actions)
git push origin main
```

Migrations otomatis dijalankan saat push via GitHub Actions!

## 🧪 Testing Edge Functions Locally

```bash
# Terminal 1: Start Supabase
supabase start

# Terminal 2: Test function
curl -X POST \
  http://localhost:54321/functions/v1/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer Your_Service_Role_Key" \
  -d '{
    "outlet_id": "outlet-uuid",
    "customer_name": "John",
    "customer_phone": "6281234567890",
    "delivery_address": "Jl. Test",
    "items": [{"product_id": "prod-id", "quantity": 1}],
    "payment_method": "card"
  }'
```

## 📊 Monitoring & Status

### GitHub Actions
- URL: https://github.com/YOUR_USERNAME/feisty-app/actions
- Tampilkan deployment status

### Supabase Dashboard
- URL: https://supabase.com/dashboard
- Monitor database, functions, real-time

### GitHub Pages
- URL: https://YOUR_USERNAME.github.io/feisty-app
- Frontend live site

## 🆘 Troubleshooting

### Database Migration Failed
```bash
# Cek status
supabase db push --dry-run

# Reset local database
supabase db reset
```

### Edge Function Error
```bash
# Serve locally untuk debug
supabase functions serve

# Check logs di Supabase dashboard
```

### GitHub Actions Failed
1. Cek logs: Repository → Actions → Latest run
2. Verify secrets di Settings
3. Validate .env configuration

## ✅ Pre-Launch Checklist

- [ ] GitHub repository created
- [ ] All secrets configured
- [ ] Supabase project created
- [ ] Database migrations tested locally
- [ ] Edge Functions tested
- [ ] Frontend HTML files verified
- [ ] WhatsApp webhook configured
- [ ] GitHub Pages enabled
- [ ] First deployment successful
- [ ] Frontend accessible via GitHub Pages
- [ ] API endpoints responding
- [ ] Database queries working
- [ ] WhatsApp integration active
- [ ] Slack notifications working

## 📞 Quick Support

**Database Issues**:
```bash
supabase db pull        # Get latest schema
supabase db reset       # Reset to initial state
```

**Function Issues**:
```bash
supabase functions list
supabase functions logs <function-name>
```

**Frontend Issues**:
Check browser console for errors
GitHub Pages build logs: Settings → Pages

---

🎉 **READY TO LAUNCH FEISTY V2 PRODUCTION!**
