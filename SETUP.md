# Setup Instructions

## OneDrive Sync Issue

Your project is in OneDrive (`C:\Users\Benna\OneDrive\Desktop\referral`), which causes file locking issues during `npm install` because OneDrive tries to sync `node_modules`.

### Solution Options:

**Option 1: Exclude node_modules from OneDrive (Recommended)**
1. Right-click the `referral` folder in File Explorer
2. Select "OneDrive" → "Free up space" (or "Always keep on this device" if available)
3. Or configure OneDrive to exclude `node_modules`:
   - Open OneDrive settings
   - Go to "Sync and backup" → "Advanced settings"
   - Add `node_modules` to exclusion list

**Option 2: Move project outside OneDrive**
Move the project to a location not synced by OneDrive, such as:
- `C:\Projects\referral`
- `C:\Dev\referral`

## Installation Steps

1. **Clean up existing installation** (if needed):
```powershell
# Remove node_modules if it exists
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
```

2. **Install dependencies**:
```powershell
npm install
```

3. **If you encounter the yarn error**:
The `@stellar/stellar-sdk` package requires yarn. You can either:
- Install yarn: `npm install -g yarn`
- Or ignore the error (it's a dependency of a dependency and may not affect functionality)

## Mobile Support

This web application uses desktop wallet adapters (Phantom, Solflare). For mobile support:
- **Mobile web**: The current setup works - users can connect via mobile browser wallets
- **React Native app**: Would require a separate mobile app with React Native wallet adapters

The current implementation supports mobile browsers through the web wallet adapters.
