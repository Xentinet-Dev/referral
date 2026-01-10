# Rewardful Setup & Troubleshooting

## Current Error

```
[Rewardful] Request failed: POST https://api.getrewardful.com/referrals/track
=> (404): Referred visits must have either a valid referral ID or an affiliate link token (or both)
```

## Issue Explanation

The error occurs because `?via=test123` is not a valid Rewardful affiliate ID. Rewardful requires:
- A **valid referral ID** (generated when someone creates a referral link in Rewardful)
- OR an **affiliate link token** (from Rewardful's affiliate link format)

## Solutions

### Option 1: Use a Real Rewardful Affiliate Link (Recommended)

1. **Get a real affiliate link from Rewardful:**
   - Log into https://app.rewardful.com
   - Go to "Affiliate Links" or "Referral Links"
   - Create a new affiliate link
   - Copy the link (format: `https://yoursite.com/?via=ABC123`)

2. **Test with the real link:**
   ```
   https://your-project.vercel.app/?via=YOUR_REAL_AFFILIATE_ID
   ```

### Option 2: Test Without Referral Parameter

Rewardful will still work for tracking conversions even if there's no referral parameter. The error is just a warning that the visit isn't attributed to a specific affiliate.

**To test conversion tracking:**
- Visit without `?via=` parameter
- Complete a conversion (when Stripe integration is ready)
- Rewardful will track the conversion (just won't attribute to a specific affiliate)

### Option 3: Suppress Error (Not Recommended)

The error is informational - Rewardful will still function for conversion tracking. You can ignore it for now if you're just testing the cookie setup.

## Phantom Warning (Non-Critical)

The Phantom wallet warning:
```
Phantom was registered as a Standard Wallet. The Wallet Adapter for Phantom can be removed from your app.
```

This is just a deprecation notice. Phantom now registers automatically, so the explicit adapter isn't needed. You can ignore this or remove the Phantom adapter from `walletContext.tsx` later.

## Next Steps

1. **For testing cookie capture:**
   - Visit without `?via=` parameter
   - Check if `rewardful_referral` cookie exists (it might not if there's no valid referral)
   - This is OK - Rewardful will still track conversions

2. **For production:**
   - Use real Rewardful affiliate links
   - Each affiliate gets a unique `?via=XXXXX` parameter
   - Rewardful will automatically track and attribute conversions

## Verification

To verify Rewardful is working:

1. **Check script loading:**
   - DevTools → Network tab
   - Look for `rw.js` request (should be 200 OK)

2. **Check for errors:**
   - Console should only show the 404 error (which is expected without valid affiliate ID)
   - No other script errors

3. **Test conversion tracking:**
   - Once Stripe is integrated, complete a test conversion
   - Check Rewardful dashboard for conversion tracking

## Important Notes

- The 404 error is **expected** when using `?via=test123` (invalid affiliate ID)
- Rewardful will still function for conversion tracking
- For production, use real affiliate links from Rewardful dashboard
- The cookie might not appear without a valid referral - this is normal
