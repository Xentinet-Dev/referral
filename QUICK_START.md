# Quick Start: Phase 6 & 7

## 10-Minute Setup

### 1. Backend Setup (5 minutes)

```bash
cd server
npm install

# Create .env file
cat > .env << EOF
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
PORT=3000
EOF

# Get your Stripe test key from:
# https://dashboard.stripe.com/test/apikeys
# Then edit .env and paste your key

# Start server
npm start
```

### 2. Test Conversion (2 minutes)

Open a new terminal and run:

```bash
curl -X POST http://localhost:3000/api/trigger-conversion \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "TEST_WALLET_ADDRESS",
    "amount_usd": 2.0,
    "conversion_type": "buy_verified"
  }'
```

### 3. Verify Results (3 minutes)

✅ **Check Stripe Dashboard:**
- Go to https://dashboard.stripe.com/test/payments
- You should see a test payment

✅ **Check Rewardful Dashboard:**
- Go to https://app.rewardful.com
- You should see +1 conversion

## Phase 7: Full Loop Test

1. **Wallet A** visits site, copies referral link
2. **Wallet B** visits via Wallet A's link, connects wallet
3. **Backend** records attribution
4. **Trigger conversion** (manually or via `verifyBuy()`)
5. **Verify** Rewardful shows Wallet A +1 referral

## Troubleshooting

- **Server won't start**: Check `.env` file exists and has `STRIPE_SECRET_KEY`
- **Conversion not appearing**: Wait 2-3 minutes, check Rewardful dashboard
- **CORS errors**: Backend has CORS enabled, check server is running

## Next Steps

Once Phase 6 & 7 pass:
→ Phase 8: Replace `verifyBuy()` with real Solana RPC scanning
