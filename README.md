# Feisty V2 - Production Ready Architecture

> 🔗 **Frontend live:** [https://feistyindonesia-code.github.io/feisty-app/](https://feistyindonesia-code.github.io/feisty-app/)
> 
> *(no `/frontend` suffix – the site is published from the root of the `gh‑pages` branch)*
> 
> *Repo root shows this README; open the URL above to view the user-facing website.*

## 🔥 Project Overview

Feisty V2 adalah sistem digital terintegrasi enterprise-grade untuk brand F&B multi-outlet. Dibangun dengan teknologi terkini: Supabase, TypeScript, Edge Functions (Deno), WhatsApp API, dan AI Brain.

**Status**: ✅ Production Ready

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACES                      │
├──────────────────┬──────────────────┬──────────────────┤
│  Web Order       │   POS System     │  Mobile (WA)     │
│  (Static HTML)   │   (Static HTML)  │  (WhatsApp)      │
└──────────────────┴──────────────────┴──────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               GITHUB PAGES (Frontend)                   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│         EDGE FUNCTIONS LAYER (Deno)                     │
├──────────────────┬──────────────────┬──────────────────┤
│  • whatsapp-wh   │  • create-order  │  • ai-dispatcher │
│  • update-status │  • create-payment│  • notify-outlet │
└──────────────────┴──────────────────┴──────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│      SUPABASE BACKEND (PostgreSQL + RLS)                │
├────────────────────────────────────────────────────────┤
│ • Organizations • Outlets • Users • Products            │
│ • Orders • Payments • WhatsApp Devices • Referrals      │
│ • Delivery Zones (PostGIS) • Audit Logs                 │
└────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│        EXTERNAL INTEGRATIONS                            │
├──────────────────┬──────────────────┬──────────────────┤
│  WhatsApp API    │   OpenAI         │   GitHub Actions │
│  (Whacenter)     │   (AI Brain)     │   (CI/CD)        │
└──────────────────┴──────────────────┴──────────────────┘
```

## 🏗️ Project Structure

```
feisty-app/
│
├── index.html                    # Landing page (root; edited directly)
├── frontend/                       # Static assets (GitHub Pages)
│   ├── weborder.html              # Web ordering interface
│   ├── pos.html                   # Point of Sales interface
│   └── assets/                    # Images, CSS, JS
│
├── supabase/                      # Supabase configuration & functions
│   ├── config.json                # Supabase local config
│   ├── migrations/                # Database versioning
│   │   ├── 001_init.sql           # Core schema
│   │   ├── 002_polygon.sql        # Delivery zones with GIS
│   │   ├── 003_whatsapp.sql       # WhatsApp integration
│   │   └── 004_referral.sql       # Referral system
│   │
│   └── functions/                 # Deno edge functions
│       ├── shared/utils.ts        # Shared utilities
│       ├── whatsapp-webhook/      # Webhook handler
│       ├── ai-dispatcher/         # AI intent classification
│       ├── create-order/          # Order creation API
│       ├── update-order-status/   # Order status updates
│       ├── create-payment/        # Payment processing
│       └── notify-outlet/         # Outlet notifications
│
├── .github/
│   └── workflows/
│       └── deploy.yml             # GitHub Actions CI/CD
│
├── package.json                   # Project metadata
├── .gitignore                     # Git ignore rules
├── .env.example                   # Environment variables template
└── README.md                      # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Supabase Account
- GitHub Account (untuk deployment)
- WhatsApp Business Account + Whacenter
- OpenAI API Key

> **Landing page** is now located at the repository root (`index.html`).  
> Other static pages remain under `frontend/`; the CI pipeline copies the root
> file into `frontend/` automatically.

### 1. Setup Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/feisty-app.git
cd feisty-app

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local dengan credentials Anda
```

### 2. Configure Supabase

```bash
# Login ke Supabase CLI
supabase login

# Link ke project
supabase link --project-ref YOUR_PROJECT_ID

# Setup local development
supabase start

# Run migrations
supabase db push
```

### 3. Deploy Edge Functions

```bash
# Local testing
supabase functions serve

# Deploy ke production
supabase functions deploy --project-ref YOUR_PROJECT_ID
```

### 4. Deploy Frontend

> **Note:** the landing page lives at the repository root (`index.html`).
> A copy of this file is automatically placed into `frontend/` during the
> GitHub Actions deployment step so that the existing workflow continues to
> publish `frontend/` unchanged.



```bash
# Frontend akan automatically di-deploy ke GitHub Pages
# saat push ke branch main via GitHub Actions
git add .
git commit -m "Initial setup"
git push origin main
```

## 📦 Database Schema

### Core Tables

#### Organizations
```sql
- id (UUID)
- name, slug
- logo_url, description
- is_active, timestamps
```

#### Outlets
```sql
- id (UUID)
- organization_id (FK)
- name, address
- latitude, longitude (Coordinates)
- whatsapp_device_id
- timestamps
```

#### Users
```sql
- id (UUID)
- email, phone
- full_name, role (admin, outlet_manager, operator, customer)
- organization_id, outlet_id
- is_verified, timestamps
```

#### Products
```sql
- id (UUID)
- organization_id, category_id (FK)
- outlet_id (FK)
- name, sku, price, cost_price
- image_url, is_available
- timestamps
```

#### Orders
```sql
- id (UUID)
- organization_id, outlet_id (FK)
- customer_id, customer_name, customer_phone
- delivery_address, delivery_latitude, delivery_longitude
- subtotal, discount, tax, delivery_fee, total
- status (pending, confirmed, preparing, ready, on_delivery, delivered, cancelled, refunded)
- promised_delivery_at, completed_at, timestamps
```

#### Payments
```sql
- id (UUID)
- order_id (FK)
- amount, status, method, reference_id, transaction_id
- timestamps
```

#### Delivery Zones (PostGIS)
```sql
- id (UUID)
- outlet_id (FK)
- polygon (GEOMETRY POLYGON)
- delivery_fee, estimated_minutes
- is_active, timestamps
```

#### WhatsApp Devices
```sql
- id (UUID)
- organization_id, outlet_id (FK)
- device_id, phone_number
- access_token
- is_central, is_active
- timestamps
```

#### Referral System
```sql
- referral_campaigns
- referral_codes
- referral_redemptions
- referral_rewards
```

## ⚡ Edge Functions

### 1. whatsapp-webhook
**Purpose**: Handle incoming WhatsApp messages
**Method**: POST
**Auth**: Webhook signature validation
**Body**:
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [...]
      }
    }]
  }]
}
```

### 2. ai-dispatcher
**Purpose**: Classify user intent & route to appropriate handler
**Method**: POST
**Auth**: Bearer token
**Body**:
```json
{
  "message": "Berapa harga burger?",
  "phone_number": "6281234567890",
  "device_id": "device-uuid",
  "organization_id": "org-uuid"
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "response": "Harga burger Rp 45.000",
    "intent": "menu_inquiry",
    "confidence": 0.85
  }
}
```

### 3. create-order
**Purpose**: Create new order
**Method**: POST
**Auth**: Bearer token
**Body**:
```json
{
  "outlet_id": "outlet-uuid",
  "customer_name": "John Doe",
  "customer_phone": "6281234567890",
  "delivery_address": "Jl. Sudirman No.1",
  "delivery_latitude": -6.1751,
  "delivery_longitude": 106.8249,
  "items": [{
    "product_id": "prod-uuid",
    "quantity": 2,
    "notes": "Not spicy"
  }],
  "payment_method": "card"
}
```

### 4. update-order-status
**Purpose**: Update order status
**Method**: PATCH
**Auth**: Bearer token
**Body**:
```json
{
  "order_id": "order-uuid",
  "status": "preparing",
  "notes": "Starting preparation"
}
```

### 5. create-payment
**Purpose**: Process payment & confirm order
**Method**: POST
**Auth**: Bearer token
**Body**:
```json
{
  "order_id": "order-uuid",
  "amount": 150000,
  "method": "card",
  "reference_id": "ref-123456"
}
```

### 6. notify-outlet
**Purpose**: Send WhatsApp notification to outlet
**Method**: POST
**Auth**: Bearer token
**Body**:
```json
{
  "order_id": "order-uuid",
  "notification_type": "new_order" // new_order | status_update | payment_received
}
```

## 🔐 Security & RLS

### Row Level Security Policies

1. **Organizations**: Hanya admin yang bisa akses
2. **Outlets**: User bisa lihat outlet di organization mereka
3. **Orders**: User bisa lihat order organization mereka, customer bisa lihat order mereka saja
4. **Products**: Public untuk kategori aktif
5. **Payments**: User bisa lihat payment di organization mereka

### Best Practices

✅ **DO**:
- Gunakan SERVICE_ROLE_KEY untuk backend operations
- Validate semua input di Edge Function
- Hash passwords, encrypt sensitive data
- Log semua transactions untuk audit
- Implement rate limiting

❌ **DON'T**:
- Jangan hardcode secrets di code
- Jangan pakai anon key untuk write operations
- Jangan langsung copy-paste SQL di dashboard
- Jangan skip webhook signature validation
- Jangan send order confirmation dari WhatsApp (redirect ke web only)

## 🚢 Deployment

### GitHub Actions Workflow

Setiap push ke `main` branch akan:

1. ✅ Install dependencies
2. ✅ Run database migrations
3. ✅ Deploy Edge Functions
4. ✅ Deploy static frontend ke GitHub Pages
5. ✅ Send Slack notification (jika configured)

### Required GitHub Secrets

```
SUPABASE_ACCESS_TOKEN      # From Supabase dashboard
SUPABASE_PROJECT_REF       # your-project-id
SUPABASE_DB_PASSWORD       # Database password
SLACK_WEBHOOK              # For notifications (optional)
```

### Manual Deployment

```bash
# Database migrations
supabase db push --project-ref YOUR_PROJECT_ID

# Edge Functions
supabase functions deploy --project-ref YOUR_PROJECT_ID

# Frontend (via GitHub Pages automatically on main push)

The primary entry point (`index.html`) has been moved to the project root.  
When you edit the landing page, modify the root file; the CI workflow will
mirror it into `frontend/` before publishing.
git push origin main
```

## 📱 WhatsApp Integration

### Setup Whacenter

1. Register device di Whacenter
2. Get device_id & access_token
3. Save di whatsapp_devices table

```sql
INSERT INTO whatsapp_devices (
  organization_id, outlet_id, device_id, phone_number, 
  access_token, is_central, is_active
) VALUES (
  'org-uuid', 'outlet-uuid', 'device-123', '6281234567890',
  'token-xyz', false, true
);
```

### Webhook Setup

Set webhook URL di Whacenter:
```
https://your-project.supabase.co/functions/v1/whatsapp-webhook
```

Verify token: Use WHATSAPP_WEBHOOK_TOKEN dari .env

## 🧠 AI Brain

### Intent Classification

AI Dispatcher menggunakan OpenAI API untuk classify user intent:

- `menu_inquiry` - Pertanyaan tentang menu/produk
- `order_status` - Tracking pesanan
- `create_order` - Mau pesan (redirect ke web)
- `complaint` - Keluhan/support
- `unknown` - Intent tidak terdeteksi

### Structured Tool Calling

```typescript
const tools = [
  {
    name: "get_menu",
    description: "Retrieve menu for outlet",
    parameters: { outlet_id: string }
  },
  {
    name: "get_order_status",
    description: "Get order status",
    parameters: { order_id: string }
  },
  // More tools...
];
```

## 📊 Monitoring & Logging

### Audit Logs Table

Semua perubahan data dicatat di `audit_logs`:
- User, entity type, action
- Changes (JSON diff)
- IP address, user agent
- Timestamp

### Structured Logging

```typescript
console.log({
  level: "info",
  action: "order_created",
  order_id: "...",
  timestamp: new Date().toISOString()
});
```

## 🔧 Configuration

### Environment Variables

```bash
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx

# WhatsApp
WHATSAPP_WEBHOOK_TOKEN=verify-token
WHATSAPP_WEBHOOK_SECRET=secret-key
WHACENTER_API_KEY=api-key

# AI
OPENAI_API_KEY=sk-xxxx

# Others
LOG_LEVEL=info
NODE_ENV=production
```

## 📚 API Documentation

### Base URLs

- **Local**: `http://localhost:54321/functions/v1`
- **Production**: `https://your-project.supabase.co/functions/v1`

### Authentication

Header:
```
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
```

### Response Format

Success (200-201):
```json
{
  "success": true,
  "data": { ... }
}
```

Error (4xx-5xx):
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## 🧪 Testing

### Local Testing

```bash
# Start local Supabase
supabase start

# Test functions
curl -X POST http://localhost:54321/functions/v1/create-order \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Integration Tests

```bash
npm test
```

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push: `git push origin feature/amazing-feature`
4. Create Pull Request

## 📝 Changelog

### v1.0.0 (Initial Release)
- ✅ Core database schema
- ✅ Multi-outlet support
- ✅ Order management system
- ✅ WhatsApp integration
- ✅ AI dispatcher
- ✅ Delivery zones (PostGIS)
- ✅ Referral system
- ✅ GitHub Actions CI/CD
- ✅ Edge Functions
- ✅ Static frontend

## 📞 Support

Untuk pertanyaan atau issues:
1. Buka GitHub Issue
2. Contact: support@feisty.app
3. WhatsApp: +62-xxx-xxx-xxx

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- Supabase team
- OpenAI
- Whacenter
- GitHub Actions
- Deno team

---

**Last Updated**: March 1, 2026
**Status**: Production Ready ✅
**Version**: 1.0.0
