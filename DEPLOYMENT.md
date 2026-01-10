# Deployment Guide

## PHASE 5: Deploy to Staging & Test Rewardful

### Step 1: Build for Production

```bash
npm run build
```

This creates a `dist/` folder with production-ready files.

### Step 2: Deploy to Staging

Deploy the `dist/` folder to any static hosting service:

**Options:**
- **Vercel**: `vercel --prod` (or connect GitHub repo)
- **Netlify**: Drag & drop `dist/` folder or connect repo
- **Cloudflare Pages**: Connect repo or upload `dist/`
- **GitHub Pages**: Push to `gh-pages` branch
- **AWS S3 + CloudFront**: Upload to S3 bucket

**Important:** Deploy to a public HTTPS URL (not localhost). Rewardful cookies require a real domain.

### Step 3: Test Rewardful Cookie Capture

1. Visit your staging URL with `?via=` parameter:
   ```
   https://staging.yoursite.com/?via=test123
   ```

2. Open DevTools → Application → Cookies

3. Verify `rewardful_referral` cookie exists

4. If cookie exists → Rewardful attribution is working ✓

5. If cookie does NOT exist → Check:
   - Is the Rewardful script loaded? (Check Network tab)
   - Is the domain correct? (Rewardful may block localhost)
   - Is the script ID correct? (`data-rewardful='a97c5f'`)

### Step 4: Verify Cookie Persistence

- Cookie should persist across page reloads
- Cookie should be readable by backend (if needed)
- Cookie domain should match your staging domain

## PHASE 6: Stripe Integration Setup

### Prerequisites

1. **Stripe Account**: Sign up at https://stripe.com
2. **Test Mode API Keys**: Get from https://dashboard.stripe.com/test/apikeys
3. **Backend Server**: You need a server to run Stripe code (cannot run in browser)

### Environment Variables

Create a `.env` file on your backend server:

```env
STRIPE_SECRET_KEY=sk_test_...
REWARDFUL_AFFILIATE_ID=a97c5f
```

### Backend API Endpoint

Create a backend endpoint that calls `triggerStripeConversion()`:

```typescript
// Example: Express.js endpoint
app.post('/api/trigger-conversion', async (req, res) => {
  const { wallet, amount_usd, conversion_type } = req.body;
  
  const result = await triggerStripeConversion(
    wallet,
    amount_usd,
    conversion_type
  );
  
  res.json(result);
});
```

### Wire to Buy Verification

In your backend's `verifyBuy()` function:

```typescript
async function verifyBuy(wallet: string) {
  // ... verification logic ...
  
  if (verified && usdValue >= 2.0) {
    // Mark as verified
    await markBuyVerified(wallet, usdValue);
    
    // Trigger Stripe conversion for Rewardful
    await triggerStripeConversion(
      wallet,
      usdValue,
      'buy_verified'
    );
    
    return { verified: true, usd_value: usdValue };
  }
}
```

## PHASE 7: End-to-End Test

### Test Scenario

1. **Wallet A** visits site (no referral)
   - URL: `https://staging.yoursite.com/`
   - Connect wallet

2. **Wallet A** copies referral link
   - Link: `https://staging.yoursite.com/?ref=<WalletA_Address>`

3. **Wallet B** visits via Wallet A's link
   - URL: `https://staging.yoursite.com/?ref=<WalletA_Address>`
   - Connect wallet
   - Backend records: Wallet B → Wallet A attribution

4. **Backend simulates buy ≥ $2**
   - Call `verifyBuy()` (or use mock)
   - Returns `verified: true`

5. **Backend triggers Stripe test conversion**
   - Call `triggerStripeConversion(walletB, 2.0, 'buy_verified')`
   - Stripe creates test payment
   - Rewardful reads cookie and credits Wallet A

6. **Verify in Rewardful Dashboard**
   - Wallet A referral count = 1
   - Conversion recorded

### Expected Results

- ✅ Wallet B attribution recorded
- ✅ Buy verification succeeds
- ✅ Stripe payment created (test mode)
- ✅ Rewardful dashboard shows +1 referral for Wallet A

## Troubleshooting

### Rewardful Cookie Not Appearing

- Check browser console for errors
- Verify script is loaded (Network tab)
- Check if domain is blocked (try different domain)
- Ensure HTTPS (required for cookies)

### Stripe Conversion Not Tracking

- Verify Stripe test mode is enabled
- Check backend logs for errors
- Ensure Rewardful cookie is present when conversion fires
- Verify customer creation succeeded

### Buy Verification Not Triggering Conversion

- Check backend logs
- Verify `verifyBuy()` returns `verified: true`
- Ensure `triggerStripeConversion()` is called after verification
- Check error handling in conversion function
