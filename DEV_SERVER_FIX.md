# Dev Server Fix: tweetnacl 504 Error

## Issue
Vite dev server shows: `Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)`

## Solution

### Option 1: Clear Vite Cache (Recommended)

**Windows PowerShell:**
```powershell
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue
npm run dev
```

**Mac/Linux:**
```bash
rm -rf node_modules/.vite
npm run dev
```

### Option 2: Restart Dev Server

1. Stop the dev server (Ctrl+C)
2. Wait 5 seconds
3. Start again: `npm run dev`

### Option 3: Full Clean

```powershell
# Remove cache and reinstall
Remove-Item -Recurse -Force node_modules\.vite
npm run dev
```

## Why This Happens

Vite pre-bundles dependencies for faster dev server startup. When dependencies change (like adding `tweetnacl`), the cache can become stale, causing 504 errors.

## Note

The **MutationObserver error** from `solanaActionsContentScript.js` is from the Solana wallet extension and is harmless - it doesn't affect functionality.

## Production Build

Production builds are unaffected - this only affects the dev server. The build command (`npm run build`) works correctly.
