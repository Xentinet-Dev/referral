# Verify Your .env Configuration

## ✅ File Location

You did it correctly! The file should be:
- **Location**: `server/.env` (a file named `.env` inside the `server` folder)
- **This is correct**: You created `.env` in the server folder ✓

## Required Contents

Your `server/.env` file should contain:

```env
REWARDFUL_SECRET=2124a8e1fa134b02f1005e2e655bcf58
FRONTEND_URL=https://referral-blue.vercel.app
PORT=3000
```

## How to Verify

### Option 1: Check File Exists
```bash
cd server
dir .env
```
Should show: `.env`

### Option 2: Start Server and Check Logs
```bash
cd server
npm start
```

**Look for this line:**
```
Rewardful secret: Set ✓
```

If you see `Rewardful secret: Missing ✗`, then:
- Check `.env` file exists in `server/` folder
- Check `REWARDFUL_SECRET` is spelled correctly
- Check there are no extra spaces
- Restart the server after making changes

### Option 3: Test Backend Endpoint
```bash
curl -X POST http://localhost:3000/api/create-rewardful-affiliate \
  -H "Content-Type: application/json" \
  -d "{\"wallet\":\"TestWallet123\"}"
```

If it works, you'll get a response with an affiliate ID.

## Common Issues

### Issue: "REWARDFUL_SECRET not configured"
**Fix:**
- Make sure file is named exactly `.env` (not `env` or `.env.txt`)
- Make sure file is in `server/` folder (not project root)
- Check `REWARDFUL_SECRET=` line has no spaces around `=`
- Restart server after changes

### Issue: File not found
**Fix:**
- Create file: `server/.env`
- Make sure it's in the `server` folder, not project root
- Use a text editor that can create files starting with `.` (VS Code works)

## Quick Checklist

- [ ] File exists: `server/.env`
- [ ] Contains: `REWARDFUL_SECRET=2124a8e1fa134b02f1005e2e655bcf58`
- [ ] Contains: `FRONTEND_URL=https://referral-blue.vercel.app`
- [ ] Server shows: `Rewardful secret: Set ✓`

If all checked, you're good to go! ✅
