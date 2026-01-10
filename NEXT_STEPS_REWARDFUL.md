# Next Steps: Rewardful Integration

## ✅ What's Complete

1. ✅ Rewardful affiliate creation API integration
2. ✅ Backend endpoint: `POST /api/create-rewardful-affiliate`
3. ✅ Frontend updated to use Rewardful API
4. ✅ Code uses `REWARDFUL_SECRET` for authentication
5. ✅ Environment variable configuration documented

## 🎯 Immediate Next Steps

### Step 1: Configure Backend Environment

Update `server/.env`:

```env
REWARDFUL_SECRET=2124a8e1fa134b02f1005e2e655bcf58
FRONTEND_URL=https://referral-blue.vercel.app
PORT=3000
```

**Important**: Make sure `.env` is in `server/` directory, not project root.

### Step 2: Start Backend Server

```bash
cd server
npm install  # If you haven't already
npm start
```

**Expected output:**
```
Server running on http://localhost:3000
Health check: http://localhost:3000/health
Rewardful secret: Set ✓
```

If you see "Rewardful secret: Missing ✗", check your `.env` file.

### Step 3: Test Backend Endpoint

Open a new terminal and test:

```bash
curl -X POST http://localhost:3000/api/create-rewardful-affiliate \
  -H "Content-Type: application/json" \
  -d '{"wallet":"SoL4nAWaLLeT123456789"}'
```

**Expected response:**
```json
{
  "success": true,
  "affiliateId": "aff_9xYkP3",
  "referralLink": "https://referral-blue.vercel.app/?via=aff_9xYkP3"
}
```

**If you get an error:**
- Check `REWARDFUL_SECRET` is correct
- Verify backend server is running
- Check backend logs for detailed error

### Step 4: Test Frontend Integration

1. **Start frontend dev server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Configure frontend to use backend** (if backend is not on localhost:3000):
   - Create `.env` in project root:
     ```env
     VITE_BACKEND_URL=http://localhost:3000
     ```
   - Restart dev server

3. **Test the flow:**
   - Connect wallet
   - Click "Validate Holdings" → Sign message
   - Click "Get Referral Link" → Sign message
   - Should see referral link with real Rewardful affiliate ID

### Step 5: Verify in Rewardful Dashboard

1. Go to https://app.rewardful.com
2. Navigate to **Affiliates** section
3. Look for new affiliate with wallet address in metadata
4. Verify affiliate ID matches what you received

## 🚀 Deployment Steps

### Backend Deployment

**Option 1: Deploy to Railway/Render/Fly.io**

1. Connect your GitHub repo
2. Set environment variables:
   - `REWARDFUL_SECRET=2124a8e1fa134b02f1005e2e655bcf58`
   - `FRONTEND_URL=https://referral-blue.vercel.app`
   - `PORT=3000` (usually auto-set)
3. Deploy from `server/` directory

**Option 2: Deploy to Vercel (Serverless Functions)**

1. Create `api/` directory in project root
2. Move server endpoints to Vercel serverless functions
3. Set environment variables in Vercel dashboard

### Frontend Deployment

Your frontend is already on Vercel (`referral-blue.vercel.app`).

**Update frontend environment:**
1. Go to Vercel dashboard → Your project → Settings → Environment Variables
2. Add: `VITE_BACKEND_URL=https://your-backend-url.com`
3. Redeploy frontend

## 🧪 End-to-End Testing

### Test Scenario

1. **Wallet A (Referrer):**
   - Visit site
   - Connect wallet
   - Validate holdings (sign message)
   - Get referral link (sign message)
   - Copy referral link: `https://referral-blue.vercel.app/?via=aff_XXXXX`

2. **Wallet B (Referred User):**
   - Visit via Wallet A's link (incognito)
   - Connect wallet
   - Authorize referral attribution (sign message)
   - Validate holdings (sign message)

3. **Verify:**
   - Check Rewardful dashboard: Wallet A should show +1 referral
   - Check backend: Referral mapping should exist
   - Check frontend: Wallet A's allocation multiplier should update

## 🔍 Troubleshooting

### Backend Issues

**Error: "REWARDFUL_SECRET not configured"**
- Check `server/.env` exists
- Verify `REWARDFUL_SECRET` is set
- Restart backend server

**Error: "Rewardful API error: 401"**
- API Secret is incorrect
- Get new secret from Rewardful dashboard
- Verify secret hasn't been reset

**Error: "Rewardful API error: 400"**
- Check API Secret has permission to create affiliates
- Verify Rewardful account is active
- Check request format

### Frontend Issues

**Error: "Failed to create Rewardful affiliate"**
- Backend server not running
- Backend URL incorrect
- Check browser console for detailed error
- Check backend logs

**Referral link not appearing**
- Check browser console for errors
- Verify backend endpoint is accessible
- Check network tab for API calls

## 📋 Checklist

- [ ] Backend `.env` configured with `REWARDFUL_SECRET`
- [ ] Backend server running and shows "Rewardful secret: Set ✓"
- [ ] Backend endpoint test successful
- [ ] Frontend can call backend (check network tab)
- [ ] User can validate holdings
- [ ] User can get referral link with real Rewardful ID
- [ ] Rewardful affiliate appears in dashboard
- [ ] Referral attribution works end-to-end
- [ ] Backend deployed to production
- [ ] Frontend environment variable set for production backend URL

## 🎉 Success Criteria

You're done when:
1. ✅ Backend creates Rewardful affiliates successfully
2. ✅ Frontend displays real Rewardful affiliate IDs
3. ✅ Referral links work (no 404 errors)
4. ✅ Rewardful dashboard shows affiliates
5. ✅ End-to-end referral flow works

## 📚 Additional Resources

- **Rewardful API Docs**: https://developer.rewardful.com
- **Backend Setup**: See `server/README.md`
- **API Setup Guide**: See `REWARDFUL_API_SETUP.md`
- **Environment Fix**: See `REWARDFUL_ENV_FIX.md`

## 🆘 Need Help?

If you encounter issues:
1. Check backend logs for detailed errors
2. Verify environment variables are set correctly
3. Test backend endpoint directly with curl
4. Check Rewardful dashboard for affiliate creation
5. Review browser console for frontend errors
