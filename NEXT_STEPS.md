# Next Steps: Vercel Deployment

## ✅ Completed

- [x] Build successful
- [x] Git repository initialized
- [x] Code committed
- [x] Pushed to GitHub: https://github.com/Xentinet-Dev/referral.git

## 🚀 Deploy to Vercel (Do This Now)

### Step 1: Sign In to Vercel

1. Go to https://vercel.com
2. Click **"Sign Up"** or **"Log In"**
3. **Sign in with GitHub** (required for Git integration)

### Step 2: Import Repository

1. Click **"Add New..."** → **"Project"**
2. You'll see your GitHub repositories
3. Find **"referral"** (under Xentinet-Dev)
4. Click **"Import"**

### Step 3: Configure Build Settings

Vercel should auto-detect Vite, but verify these settings:

- **Framework Preset**: `Vite` ✓ (should be auto-selected)
- **Build Command**: `npm run build` ✓
- **Output Directory**: `dist` ✓
- **Install Command**: `npm install` ✓ (default)

**No changes needed** - just verify and proceed.

### Step 4: Deploy

1. Click **"Deploy"** button
2. Wait 30-60 seconds
3. You'll get a live URL like: `https://referral-xxxxx.vercel.app`

## 🔍 Step 5: Verify Rewardful Cookie (CRITICAL)

### Test URL

Visit your Vercel URL with the `?via=` parameter:
```
https://your-project.vercel.app/?via=test123
```

### Check Cookie

1. Open **DevTools** (F12)
2. Go to **"Application"** tab (Chrome) or **"Storage"** tab (Firefox)
3. Click **"Cookies"** in left sidebar
4. Select your domain
5. Look for: **`rewardful_referral`**

### Results

✅ **If cookie exists:**
- Rewardful attribution is working!
- **Proceed to Phase 6** (Stripe backend setup)

❌ **If cookie does NOT exist:**
- **STOP HERE** - Do not continue
- Check:
  - Network tab → Is `rw.js` loading?
  - Console tab → Any errors?
  - Hard refresh (Ctrl+Shift+R)
  - Verify script ID: `data-rewardful='a97c5f'`

## 📋 After Cookie Verification

Once `rewardful_referral` cookie is confirmed:

1. ✅ **Phase 5 Complete** - Rewardful attribution working
2. → **Phase 6**: Set up Stripe backend server
3. → **Phase 7**: Run end-to-end test

## 🔗 Quick Links

- **GitHub Repo**: https://github.com/Xentinet-Dev/referral
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Rewardful Dashboard**: https://app.rewardful.com (check after cookie test)

## 📝 Notes

- Your Vercel URL will be unique (e.g., `referral-abc123.vercel.app`)
- HTTPS is automatic (required for cookies)
- Build happens automatically on every push to `main` branch
