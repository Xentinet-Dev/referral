# Rewardful API Setup Guide

## Overview

This system now creates Rewardful affiliates programmatically via API. Each validated wallet gets a real Rewardful affiliate ID, ensuring proper attribution and conversion tracking.

## Step 1: Get Rewardful API Key

1. Log into https://app.rewardful.com
2. Go to **Settings** → **API**
3. Copy your **API Key** (format: `sk_live_...` or `sk_test_...`)

## Step 2: Configure Backend Environment

Create or update `server/.env`:

```env
# Rewardful API Key (REQUIRED)
REWARDFUL_API_KEY=sk_live_YOUR_KEY_HERE

# Frontend URL (for generating referral links)
FRONTEND_URL=https://yourdomain.com

# Optional: Backend port
PORT=3000

# Optional: Stripe (for conversions)
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
```

## Step 3: Start Backend Server

```bash
cd server
npm install
npm start
```

Verify the server shows:
```
Rewardful key: Set ✓
```

## Step 4: Configure Frontend (Optional)

If your backend is not on `http://localhost:3000`, create `.env` in the project root:

```env
VITE_BACKEND_URL=https://your-backend-url.com
```

## How It Works

### Flow

1. **User validates holdings** (≥ $2 USD)
   - Frontend: User signs message
   - Backend: Verifies signature and holdings

2. **User requests referral link**
   - Frontend: User clicks "Get Referral Link" and signs
   - Frontend: Calls `issueAffiliateLink()` in `mockBackend.ts`
   - `mockBackend.ts`: Calls backend `/api/create-rewardful-affiliate`
   - Backend: Creates affiliate in Rewardful via API
   - Backend: Returns Rewardful affiliate ID (e.g., `aff_9xYkP3`)
   - Frontend: Displays referral link: `https://yourdomain.com/?via=aff_9xYkP3`

3. **Referral attribution**
   - New user visits: `https://yourdomain.com/?via=aff_9xYkP3`
   - Rewardful script sets `rewardful_referral` cookie
   - Your backend validates the affiliate ID
   - Conversion tracking works automatically

### Key Points

- **One wallet = one Rewardful affiliate ID** (immutable)
- **Affiliate created only once** (cached after first creation)
- **Real Rewardful IDs** (not local random strings)
- **No 404 errors** (Rewardful recognizes the affiliate ID)

## API Endpoint

### POST /api/create-rewardful-affiliate

**Request:**
```json
{
  "wallet": "SoL4nAWaLLeT..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "affiliateId": "aff_9xYkP3",
  "referralLink": "https://yourdomain.com/?via=aff_9xYkP3"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "REWARDFUL_API_KEY not configured"
}
```

## Testing

1. **Start backend server:**
   ```bash
   cd server
   npm start
   ```

2. **Verify health check:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Test affiliate creation:**
   ```bash
   curl -X POST http://localhost:3000/api/create-rewardful-affiliate \
     -H "Content-Type: application/json" \
     -d '{"wallet": "SoL4nAWaLLeT..."}'
   ```

4. **Verify in Rewardful dashboard:**
   - Go to https://app.rewardful.com
   - Check **Affiliates** section
   - New affiliate should appear with wallet in metadata

## Troubleshooting

### Error: "REWARDFUL_API_KEY not configured"
- Check `server/.env` exists
- Verify `REWARDFUL_API_KEY` is set
- Restart backend server after adding key

### Error: "Rewardful API error: 401"
- API key is invalid or expired
- Get a new key from Rewardful dashboard
- Ensure key starts with `sk_live_` or `sk_test_`

### Error: "Rewardful API error: 400"
- Check API key has permission to create affiliates
- Verify Rewardful account is active
- Check request format matches Rewardful API spec

### Affiliate not appearing in dashboard
- Wait 1-2 minutes (Rewardful may have delay)
- Check Rewardful dashboard → Affiliates
- Verify API call succeeded (check backend logs)

## Production Deployment

### Environment Variables

Set these in your hosting platform (Vercel, Railway, etc.):

- `REWARDFUL_API_KEY` - Your Rewardful API key
- `FRONTEND_URL` - Your production frontend URL
- `PORT` - Backend port (usually auto-set by platform)

### Security

- ✅ API key is server-side only
- ✅ Never exposed to frontend
- ✅ Never committed to git (`.env` in `.gitignore`)
- ✅ CORS enabled for frontend communication

## What Changed

### Before
- Local random affiliate IDs (not recognized by Rewardful)
- 404 errors on visit tracking
- No proper attribution

### After
- Real Rewardful affiliate IDs
- Proper visit tracking
- Automatic conversion attribution
- Dashboard visibility

## Next Steps

1. ✅ Get Rewardful API key
2. ✅ Configure `server/.env`
3. ✅ Start backend server
4. ✅ Test affiliate creation
5. ✅ Verify in Rewardful dashboard
6. ✅ Deploy to production

Your referral system is now fully integrated with Rewardful! 🎉
