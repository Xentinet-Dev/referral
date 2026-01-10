# Phase 6 & 7 Setup Guide

## PHASE 6: Stripe Test Conversion Setup

### Step 1: Install Dependencies

```bash
cd server
npm install
```

This installs:
- `stripe` - Stripe SDK
- `express` - Web server
- `cors` - CORS middleware
- `dotenv` - Environment variables

### Step 2: Get Stripe Test Key

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Secret key** (starts with `sk_test_...`)
3. **Important:** Use TEST mode key, not live mode

### Step 3: Create `.env` File

In the `server/` directory, create `.env`:

```env
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
PORT=3000
```

### Step 4: Start Backend Server

```bash
cd server
npm start
```

You should see:
```
Server running on http://localhost:3000
Health check: http://localhost:3000/health
Stripe key: Set ✓
```

### Step 5: Test Conversion Trigger

#### Option A: Using curl

```bash
curl -X POST http://localhost:3000/api/trigger-conversion \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "YOUR_WALLET_ADDRESS",
    "amount_usd": 2.0,
    "conversion_type": "buy_verified"
  }'
```

#### Option B: Using browser console (on your deployed site)

```javascript
fetch('http://localhost:3000/api/trigger-conversion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: 'YOUR_WALLET_ADDRESS',
    amount_usd: 2.0,
    conversion_type: 'buy_verified'
  })
})
.then(r => r.json())
.then(console.log);
```

**Note:** For production, replace `localhost:3000` with your backend URL.

### Step 6: Verify in Rewardful Dashboard

1. Go to https://app.rewardful.com
2. Check your dashboard
3. You should see:
   - **+1 conversion**
   - **Affiliate credited** (if you visited with a valid `?via=` link)

### Expected Results

✅ **Stripe Dashboard:**
- Test payment created
- Payment intent ID returned

✅ **Rewardful Dashboard:**
- Conversion recorded
- Affiliate credited (if referral link was used)

## PHASE 7: End-to-End Test

### Test Scenario

1. **Wallet A** (Referrer)
   - Visit: `https://your-site.vercel.app/`
   - Connect wallet
   - Copy referral link: `https://your-site.vercel.app/?ref=WALLET_A_ADDRESS`

2. **Wallet B** (Referred User)
   - Open incognito/private window
   - Visit: `https://your-site.vercel.app/?ref=WALLET_A_ADDRESS`
   - Connect wallet (Wallet B)
   - Backend automatically records: Wallet B → Wallet A attribution

3. **Simulate Buy Verification**
   - Backend calls `verifyBuy(walletB)`
   - Returns `verified: true, usd_value: 2.5`
   - `verifyBuy()` automatically calls `triggerConversion()`

4. **Verify Conversion**
   - Check Stripe dashboard: Payment created
   - Check Rewardful dashboard: Wallet A referrals = +1

### Manual Test Script

If you want to manually trigger the conversion:

```bash
# From Wallet B's session (after connecting wallet)
curl -X POST http://localhost:3000/api/trigger-conversion \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "WALLET_B_ADDRESS",
    "amount_usd": 2.5,
    "conversion_type": "buy_verified"
  }'
```

### Expected Flow

```
Wallet B connects
  ↓
Backend records: Wallet B → Wallet A (via ?ref= parameter)
  ↓
Backend verifies buy (≥ $2)
  ↓
verifyBuy() returns verified: true
  ↓
Automatic: triggerConversion() called
  ↓
Stripe payment created (test mode)
  ↓
Rewardful tracks conversion via cookie
  ↓
Rewardful dashboard: Wallet A +1 referral ✓
```

## Troubleshooting

### Stripe Key Not Working

- Verify key starts with `sk_test_` (not `sk_live_`)
- Check key is correct in `.env` file
- Restart server after changing `.env`

### Conversion Not Appearing in Rewardful

- Ensure you visited with a valid `?via=` link (or `?ref=` for your system)
- Check browser console for errors
- Verify `rewardful_referral` cookie exists
- Wait a few minutes (Rewardful may have delay)

### Server Won't Start

- Check `STRIPE_SECRET_KEY` is set in `.env`
- Verify `npm install` completed successfully
- Check port 3000 is not already in use

## Next Steps After Phase 7

Once end-to-end test passes:

✅ **Phase 6 Complete** - Stripe conversion working
✅ **Phase 7 Complete** - Full loop validated
→ **Phase 8** - Replace `verifyBuy()` with real Solana RPC scanning

## Important Notes

- **Test mode only** - No real charges
- **Rewardful tracking** - Automatic via cookie
- **Server must run** - Backend required for Stripe
- **CORS enabled** - Frontend can call backend API
