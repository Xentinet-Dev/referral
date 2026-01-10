# How to Check if Backend is Running

## Quick Check

### Method 1: Check Port
```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -eq 3000}
```
If you see output, backend is running. If empty, backend is NOT running.

### Method 2: Test Health Endpoint
```powershell
Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing
```
If you get a response, backend is running. If error, backend is NOT running.

### Method 3: Check Browser
Open: http://localhost:3000/health
Should see: `{"status":"ok","timestamp":"..."}`

## Starting Backend

**In a terminal:**
```bash
cd server
npm start
```

**You should see:**
```
============================================================
[SERVER] Starting backend server
============================================================
[SERVER] Running on http://localhost:3000
[SERVER] Health check: http://localhost:3000/health
[SERVER] Environment: { ... }
============================================================
```

## Viewing Backend Logs

**All logs appear in the terminal where you ran `npm start`**

When you click "Verify Wallet" in the frontend, you should see logs like:
```
[2024-01-10T...] POST /api/verify-wallet { ip: '...', userAgent: '...' }
[VERIFY-WALLET] Request received { wallet: '7xA3...', ... }
[WALLET-CONNECTED] { wallet: '7xA3...', status: 'unauthenticated' }
[WALLET-AUTH-REQUEST] { wallet: '7xA3...', nonce: '4fa8...', ... }
[SIGNATURE-VERIFY] Starting verification { ... }
[SIGNATURE-VERIFY] Verification result { isValid: true, ... }
[WALLET-AUTH-VERIFIED] { wallet: '7xA3...', signature_valid: true, ... }
[SESSION-ACTIVE] { wallet: '7xA3...', privileges: 'affiliate_access' }
[VERIFY-WALLET] Success { wallet: '7xA3...', duration: '45ms' }
```

## Troubleshooting

### No Logs Appearing
1. **Check backend is running**: Use Method 1 or 2 above
2. **Check you're looking at the right terminal**: Logs appear in the terminal where you ran `npm start`
3. **Check frontend is calling backend**: Open browser DevTools → Network tab → Look for requests to `localhost:3000`

### Backend Won't Start
1. Check `server/.env` exists
2. Check `server/node_modules` exists (run `npm install` in `server/`)
3. Check for error messages in terminal

### Requests Not Reaching Backend
1. Check CORS is enabled (it is in the code)
2. Check frontend is using correct backend URL
3. Check browser console for errors
4. Check Network tab in DevTools for failed requests
