# Backend Server Setup

This directory contains server-side code for Stripe integration and Rewardful conversion tracking.

## Installation

```bash
cd server
npm install
```

## Environment Variables

Create a `.env` file:

```env
STRIPE_SECRET_KEY=sk_test_...
PORT=3000
```

Get your Stripe test key from: https://dashboard.stripe.com/test/apikeys

## Usage

The `stripeConversion.ts` file provides:

- `triggerStripeConversion()` - Creates Stripe payment intent for Rewardful tracking
- `createCheckoutSession()` - Alternative: Creates Stripe Checkout session

## Integration

In your backend API, import and use:

```typescript
import { triggerStripeConversion } from './stripeConversion.js';

// When buy verification succeeds:
if (verified && usdValue >= 2.0) {
  await triggerStripeConversion(
    wallet,
    usdValue,
    'buy_verified'
  );
}
```

## Important Notes

- **Server-side only**: Never expose Stripe secret keys to frontend
- **Test mode**: Uses Stripe test mode (no real charges)
- **Rewardful**: Automatically tracks via cookie (no additional setup needed)
