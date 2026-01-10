# Countdown Window - Referral & Qualification Flow

A single-page React application implementing a countdown-based token referral and qualification flow for Solana.

## Features

- Fixed UTC countdown timer
- Solana wallet connection (Phantom compatible)
- Referral attribution via URL parameters
- Token qualification verification (≥ $2 USD)
- Buy verification for referred users
- Referral progress tracking with bonus eligibility

## Tech Stack

- React + TypeScript
- Tailwind CSS
- Solana Wallet Adapter
- @solana/web3.js
- @solana/spl-token

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Configuration

### Constants (in `src/App.tsx`)

- `COUNTDOWN_END_UTC`: Fixed UTC end timestamp for countdown
- `TOKEN_MINT`: SPL token mint address
- `TOKEN_PRICE_USD`: Token price in USD (for qualification calculation)
- `QUALIFICATION_THRESHOLD_USD`: Minimum USD value required (default: $2)
- `BONUS_THRESHOLD`: Number of qualified buyers needed for bonus (default: 3)

### Mock Backend Functions

All backend functions are currently mocked in `src/mockBackend.ts`. Replace these with actual API calls when integrating with a real backend:

- `recordAttribution()`: Record referral attribution
- `getAttribution()`: Get referral attribution for a wallet
- `getReferrals()`: Get all referrals for a referrer wallet
- `verifyBuy()`: Verify buy transaction for referred users
- `getBuyVerification()`: Get buy verification status

## Logic Rules

- Referral attribution happens once (immutable)
- Buy verification happens once (permanently true once verified)
- Snapshot qualification is independent of referrals
- Referral bonus logic is separate from snapshot eligibility
- No polling faster than every 10 seconds
- All irreversible states are locked in memory/state

## URL Parameters

- `?ref=<wallet_address>`: Sets the referrer wallet address (stored in sessionStorage)

## Notes

- The application uses mock data for token balances and buy verification
- Replace mock functions with actual Solana RPC calls and backend integration
- Self-referrals are automatically rejected
- First referral wins (attribution cannot be overwritten)
