# Rewardful .env Configuration - CORRECTED

## Your Current Configuration

Based on the Rewardful dashboard screenshot, your `.env` should be:

```env
# Rewardful API Secret (for backend API authentication)
REWARDFUL_SECRET=2124a8e1fa134b02f1005e2e655bcf58

# Frontend URL
FRONTEND_URL=https://referral-blue.vercel.app
```

## Important Distinctions

### Rewardful API Key (`a97c5f`)
- **Purpose**: Frontend script identification
- **Location**: Used in `index.html` as `data-rewardful='a97c5f'`
- **NOT used**: For backend API calls

### Rewardful API Secret (`2124a8e1fa134b02f1005e2e655bcf58`)
- **Purpose**: Backend API authentication
- **Location**: Used in `server/.env` as `REWARDFUL_SECRET`
- **Used for**: Creating affiliates via API

## Corrected .env Format

```env
# Rewardful API Secret (REQUIRED for backend API calls)
REWARDFUL_SECRET=2124a8e1fa134b02f1005e2e655bcf58

# Frontend URL (no trailing slash needed)
FRONTEND_URL=https://referral-blue.vercel.app

# Optional: Backend port
PORT=3000
```

## What to Remove

**Remove this line** (if present):
```env
REWARDFUL_API_KEY=a97c5f  # ❌ This is for frontend only, not backend API
```

The API Key (`a97c5f`) is already correctly used in `index.html` - you don't need it in `.env`.

## How It Works

1. **Frontend**: Uses API Key (`a97c5f`) in script tag
2. **Backend**: Uses API Secret (`2124a8e1fa134b02f1005e2e655bcf58`) for API authentication
3. **API Calls**: Backend sends `Authorization: Bearer {REWARDFUL_SECRET}`

## Verification

After updating `.env`, restart your backend server and check logs:
```
Rewardful secret: Set ✓
```

If you see "Missing ✗", the `REWARDFUL_SECRET` is not set correctly.
