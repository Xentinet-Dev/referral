# Supabase Postgres Integration

## Overview

All in-memory storage has been replaced with Supabase Postgres for persistent, production-ready data storage.

## Database Schema

Run `supabase-schema.sql` in your Supabase SQL Editor to create the required tables:

1. **wallet_activation** - Stores activated wallets (signature-verified)
2. **wallet_affiliates** - Maps wallet addresses to Rewardful affiliate IDs
3. **rewardful_conversions** - Tracks processed conversions (idempotency + referral counts)

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**CRITICAL**: Use `SUPABASE_SERVICE_ROLE_KEY` (not the anon key) - this bypasses RLS for API routes.

## Setup Steps

1. **Create Supabase Project**:
   - Go to https://supabase.com
   - Create new project
   - Copy Project URL and Service Role Key

2. **Run Schema**:
   - Go to SQL Editor in Supabase dashboard
   - Copy contents of `supabase-schema.sql`
   - Run the SQL script

3. **Set Environment Variables in Vercel**:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add `SUPABASE_URL`
   - Add `SUPABASE_SERVICE_ROLE_KEY` (mark as sensitive)
   - Redeploy

4. **Install Dependencies**:
   The `@supabase/supabase-js` package will be installed automatically by Vercel during build.

## What Changed

### Before (In-Memory)
- `activatedWallets` Set - reset on server restart
- `walletAffiliateMap` Map - reset on server restart
- `processedReferralIds` Set - reset on server restart
- `walletReferralCounts` Map - reset on server restart

### After (Supabase)
- `wallet_activation` table - persistent
- `wallet_affiliates` table - persistent
- `rewardful_conversions` table - persistent (idempotency + counts)

## API Routes Updated

1. **`api/verify-wallet.js`**:
   - Stores activation in `wallet_activation` table
   - Checks activation from Supabase

2. **`api/create-rewardful-affiliate.js`**:
   - Checks activation from `wallet_activation` table
   - Stores affiliate mapping in `wallet_affiliates` table
   - Retrieves existing mappings from Supabase

3. **`api/webhooks/rewardful.js`**:
   - Checks idempotency in `rewardful_conversions` table
   - Gets affiliate mappings from `wallet_affiliates` table
   - Stores conversions and counts in `rewardful_conversions` table

4. **`api/referral-progress/[wallet].js`**:
   - Reads referral counts from `rewardful_conversions` table

## Data Flow

### Wallet Activation
1. User signs message → `api/verify-wallet`
2. Signature verified → Insert into `wallet_activation` table
3. Wallet marked as activated

### Affiliate Creation
1. User requests affiliate link → `api/create-rewardful-affiliate`
2. Check `wallet_activation` table for activation
3. Check `wallet_affiliates` table for existing affiliate
4. Create in Rewardful if missing
5. Store mapping in `wallet_affiliates` table

### Referral Conversion
1. Rewardful sends webhook → `api/webhooks/rewardful`
2. Check `rewardful_conversions` table for idempotency
3. Get wallet from `wallet_affiliates` table
4. Count existing conversions for wallet
5. Store new conversion in `rewardful_conversions` table
6. Count incremented (max 3 enforced)

### Referral Progress
1. Frontend requests progress → `api/referral-progress/[wallet]`
2. Count conversions from `rewardful_conversions` table
3. Calculate multiplier
4. Return to frontend

## Security

- **Service Role Key**: Only used in serverless API routes (never exposed to frontend)
- **Row Level Security**: Enabled on all tables (service role bypasses RLS)
- **No Frontend Access**: Frontend never directly queries Supabase

## Testing

After setup, test the flow:

1. Activate wallet → Check `wallet_activation` table
2. Create affiliate → Check `wallet_affiliates` table
3. Process webhook → Check `rewardful_conversions` table
4. Query progress → Verify counts are correct

## Troubleshooting

### "Failed to fetch nonce" or "Supabase not configured"
1. **Check Environment Variables in Vercel**:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Verify `SUPABASE_URL` is set (format: `https://xxxxx.supabase.co`)
   - Verify `SUPABASE_SERVICE_ROLE_KEY` is set (long string starting with `eyJ...`)
   - **Important**: Must use Service Role Key (not anon key)
   - After adding/updating, **redeploy** the project

2. **Verify Supabase Tables Exist**:
   - Go to Supabase Dashboard → SQL Editor
   - Run: `SELECT * FROM nonces LIMIT 1;`
   - If error "relation nonces does not exist", run `supabase-schema.sql` again
   - Check all 4 tables exist: `nonces`, `wallet_activation`, `wallet_affiliates`, `rewardful_conversions`

3. **Check RLS Policies**:
   - Go to Supabase Dashboard → Authentication → Policies
   - Verify policies exist for `nonces` table: "Service role full access nonces"
   - If missing, run `supabase-schema.sql` again (it now includes DROP IF EXISTS for idempotency)

4. **Test Nonce Endpoint Directly**:
   - In browser console or terminal: `curl https://your-app.vercel.app/api/nonce`
   - Check Vercel function logs for `[NONCE]` entries
   - Look for specific error messages (missing config, table not found, permission denied)

### "Missing Supabase configuration"
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel
- Redeploy after adding environment variables

### "Error querying from Supabase"
- Verify tables exist (run `supabase-schema.sql`)
- Check service role key is correct
- Check RLS policies allow service role access

### "Referral count not updating"
- Check `rewardful_conversions` table has entries
- Verify webhook is being processed
- Check logs for Supabase errors
