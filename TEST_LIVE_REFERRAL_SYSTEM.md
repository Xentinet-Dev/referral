# Testing the Live Referral System - Step-by-Step Guide

## Prerequisites

- ✅ Vercel deployment is live: `https://referral-blue.vercel.app`
- ✅ `REWARDFUL_SECRET` environment variable is set in Vercel
- ✅ Rewardful webhook is configured: `https://referral-blue.vercel.app/api/webhooks/rewardful`
- ✅ Frontend is deployed and accessible

## Full End-to-End Test Flow

### Step 1: Create Referrer (Wallet A)

1. **Open your deployed app**:
   ```
   https://referral-blue.vercel.app
   ```

2. **Connect Wallet A**:
   - Click "Connect Wallet"
   - Select your Solana wallet (Phantom, Solflare, etc.)
   - **Important**: Wallet must have ≥ $2 worth of tokens

3. **Verify Wallet**:
   - Click "Verify Wallet"
   - Sign the message in your wallet
   - Wait for activation confirmation

4. **Validate Holdings**:
   - Click "Validate Holdings + Obtain Referral Link"
   - Sign the message
   - Backend verifies you have ≥ $2 in tokens
   - Status should show "Validated"

5. **Get Referral Link**:
   - Click "Get Referral Link"
   - Sign the message
   - Backend creates Rewardful affiliate (if first time)
   - Copy the referral link (e.g., `https://referral-blue.vercel.app/?via=aff_9xYkP3`)

### Step 2: Test Referral (Wallet B)

1. **Open referral link in incognito/private window**:
   ```
   https://referral-blue.vercel.app/?via=aff_9xYkP3
   ```
   (Use the actual affiliate ID from Step 1)

2. **Connect Wallet B**:
   - Click "Connect Wallet"
   - Use a **different** wallet address
   - Verify and activate the wallet

3. **Validate Holdings**:
   - Click "Validate Holdings"
   - Sign the message
   - Backend should attribute the referral to Wallet A

### Step 3: Trigger Conversion (Stripe Test)

**Option A: Real Stripe Conversion (Recommended)**

1. **Complete a purchase**:
   - If you have Stripe checkout integrated, complete a test purchase
   - Use Stripe test card: `4242 4242 4242 4242`
   - This triggers Rewardful conversion automatically

2. **Check Rewardful Dashboard**:
   - Go to: https://app.rewardful.com/referrals
   - You should see the conversion appear

3. **Check Vercel Logs**:
   - Go to: Vercel Dashboard → Your Project → Logs
   - Look for: `[REFERRAL-COMPLETED]` log entry
   - Should show: `successful_referrals: 1/3`, `allocation_multiplier: 3x`

**Option B: Manual Stripe Conversion (If Stripe is integrated)**

1. **Trigger conversion via backend**:
   ```powershell
   # If you have a test endpoint
   Invoke-WebRequest -Uri https://referral-blue.vercel.app/api/trigger-conversion -Method POST -ContentType "application/json" -Body '{"wallet":"WALLET_B_ADDRESS"}' -UseBasicParsing
   ```

### Step 4: Verify Results

1. **Check Referral Count**:
   - Go back to Wallet A's view
   - Refresh the page
   - Check "Allocation Multiplier" section
   - Should show: `Successful referrals: 1 / 3`
   - Should show: `Total: 3x` (2x base + 1x bonus)

2. **Check Vercel Logs**:
   - Look for these log entries:
     ```
     [REWARDFUL-WEBHOOK-RECEIVED] { event: 'referral.converted', ... }
     [REFERRAL-COMPLETED] { wallet: '...', successful_referrals: '1/3', allocation_multiplier: '3x' }
     ```

3. **Check Rewardful Dashboard**:
   - Go to: https://app.rewardful.com/referrals
   - Should show the conversion
   - Should show the affiliate ID

## Quick Test Checklist

- [ ] Wallet A connects and activates
- [ ] Wallet A validates holdings (≥ $2)
- [ ] Wallet A gets referral link with real Rewardful affiliate ID
- [ ] Wallet B visits via referral link
- [ ] Wallet B connects and activates
- [ ] Wallet B validates holdings
- [ ] Conversion is triggered (Stripe purchase or manual)
- [ ] Rewardful sends webhook to Vercel
- [ ] Vercel logs show `[REFERRAL-COMPLETED]`
- [ ] Wallet A's referral count increments to 1
- [ ] Wallet A's multiplier shows 3x

## Troubleshooting

### Issue: "Affiliate ID not found in mapping"

**Cause**: The affiliate was created but the webhook can't find it.

**Solution**:
1. Check if `REWARDFUL_SECRET` is set correctly in Vercel
2. Verify the affiliate exists in Rewardful dashboard
3. Check Vercel logs for API query errors

### Issue: Webhook not received

**Cause**: Rewardful hasn't sent the webhook yet.

**Solution**:
1. Check Rewardful dashboard → Webhooks → "Last request"
2. Verify webhook URL is correct
3. Check if conversion actually happened in Rewardful

### Issue: Referral count not updating

**Cause**: In-memory storage resets between serverless invocations.

**Solution**:
- This is expected with current MVP implementation
- In production, implement database storage
- For testing, check logs to confirm webhook was processed

### Issue: "Invalid signature" errors

**Cause**: Wallet signature verification failed.

**Solution**:
1. Ensure you're signing the exact message shown
2. Check backend logs for signature verification errors
3. Try disconnecting and reconnecting wallet

## Testing Multiple Referrals

To test the 3-referral limit:

1. **Create 3 different wallets** (B, C, D)
2. **Each visits via Wallet A's referral link**
3. **Each completes a conversion**
4. **Verify**:
   - First 3 referrals increment count: 1, 2, 3
   - 4th referral should be ignored (max reached)
   - Multiplier stays at 3x (capped)

## Expected Logs

### Successful Referral Conversion

```
[REWARDFUL-WEBHOOK-RECEIVED] {
  event: 'referral.converted',
  affiliate_id: 'aff_9xYkP3',
  referral_id: 'ref_abc123',
  converted_at: '2024-01-10T...'
}

[REFERRAL-COMPLETED] {
  wallet: '7xA3...',
  successful_referrals: '1/3',
  allocation_multiplier: '3x'
}
```

### Duplicate Referral (Idempotency)

```
[REFERRAL-IGNORED-DUPLICATE] {
  referralId: 'ref_abc123',
  affiliateId: 'aff_9xYkP3',
  reason: 'Already processed'
}
```

### Max Referrals Reached

```
[REFERRAL-LIMIT-REACHED] {
  wallet: '7xA3...',
  currentCount: 3,
  max: 3
}
```

## Next Steps After Testing

1. **Verify all 3 referrals work** (test the cap)
2. **Check idempotency** (send same webhook twice)
3. **Monitor production logs** for real conversions
4. **Implement database storage** (before full production)

## Notes

- **In-memory storage limitation**: Current implementation uses in-memory Maps that reset between serverless invocations. This is fine for testing, but you'll need database storage for production.
- **Webhook timing**: Rewardful may take a few seconds to send the webhook after a conversion.
- **Test vs. Live**: Use Stripe test mode for testing. Switch to live mode only when ready for production.
