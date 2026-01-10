 # How to Start Servers

## Prerequisites

1. **Backend Environment Setup**
   - Navigate to `server/` directory
   - Ensure `server/.env` exists with:
     ```env
     REWARDFUL_SECRET=2124a8e1fa134b02f1005e2e655bcf58
     FRONTEND_URL=https://referral-blue.vercel.app
     PORT=3000
     ```

2. **Frontend Environment (Optional)**
   - If backend is not on `http://localhost:3000`, create `.env` in project root:
     ```env
     VITE_BACKEND_URL=http://localhost:3000
     ```

## Starting the Servers

### Option 1: Two Separate Terminals (Recommended)

**Terminal 1 - Backend Server:**
```bash
cd server
npm install  # Only needed first time or after dependency changes
npm start
```

**Terminal 2 - Frontend Dev Server:**
```bash
# From project root
npm install  # Only needed first time or after dependency changes
npm run dev
```

### Option 2: Single Terminal with Background Process

**Windows PowerShell:**
```powershell
# Start backend in background
cd server
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start"

# Start frontend in new window
cd ..
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
```

## What You Should See

### Backend Server (Port 3000)
```
============================================================
[SERVER] Starting backend server
============================================================
[SERVER] Running on http://localhost:3000
[SERVER] Health check: http://localhost:3000/health
[SERVER] Environment: { ... }
============================================================
```

### Frontend Dev Server (Port 5173)
```
  VITE v5.4.21  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

## Verifying Servers Are Running

### Check Backend
```bash
# In browser or terminal
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Check Frontend
- Open browser to: `http://localhost:5173`
- Should see the countdown page

## Stopping Servers

### Option 1: Keyboard Interrupt
- Press `Ctrl+C` in each terminal running a server

### Option 2: Kill by Port (Windows PowerShell)
```powershell
# Stop backend (port 3000)
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Stop frontend (port 5173)
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Option 3: Kill All Node Processes (Use with caution)
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Troubleshooting

### Port Already in Use
If you see "port already in use" error:
1. Check what's using the port:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
   ```
2. Stop the process using that port
3. Try starting the server again

### Backend Not Starting
- Check `server/.env` exists and has `REWARDFUL_SECRET`
- Check `server/node_modules` exists (run `npm install` in `server/`)
- Check logs for specific error messages

### Frontend Not Starting
- Check `node_modules` exists (run `npm install` in project root)
- Check for TypeScript errors: `npm run build`
- Check logs for specific error messages

### Frontend Can't Connect to Backend
- Verify backend is running on port 3000
- Check `VITE_BACKEND_URL` in `.env` (if using custom backend URL)
- Check browser console for CORS errors
- Verify backend logs show incoming requests

## Quick Start Commands

**Start both servers (two terminals):**
```bash
# Terminal 1
cd server && npm start

# Terminal 2 (new terminal)
npm run dev
```

**Stop all servers:**
```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -eq 3000 -or $_.LocalPort -eq 5173} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Production vs Development

- **Development**: Use `npm run dev` for frontend (hot reload)
- **Production**: Use `npm run build` then serve `dist/` folder
- **Backend**: Always use `npm start` (same for dev and production)
