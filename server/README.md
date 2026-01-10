# Backend Server Setup

This directory contains server-side code for Stripe integration and Rewardful conversion tracking.

## Quick Start

```bash
cd server
npm install

# Create .env file with your Stripe test key
echo "STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE" > .env
echo "PORT=3000" >> .env

# Start server
npm start
```

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

The server provides:

- `POST /api/trigger-conversion` - Triggers Stripe conversion for Rewardful
- `GET /health` - Health check endpoint

### API Endpoint

```bash
POST /api/trigger-conversion
Content-Type: application/json

{
  "wallet": "WALLET_ADDRESS",
  "amount_usd": 2.0,
  "conversion_type": "buy_verified"
}
```

## Integration

The `stripeConversion.js` file provides:

- `triggerStripeConversion()` - Creates Stripe payment intent for Rewardful tracking

## Testing

See `PHASE_6_7_SETUP.md` for detailed testing instructions.

## Important Notes

- **Server-side only**: Never expose Stripe secret keys to frontend
- **Test mode**: Uses Stripe test mode (no real charges)
- **Rewardful**: Automatically tracks via cookie (no additional setup needed)
- **CORS enabled**: Frontend can call backend API