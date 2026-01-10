# Vercel Deployment Guide

## ✅ Step 1: Build Verification (COMPLETE)

Build succeeded! `dist/` folder created with:
- `index.html`
- `assets/` folder with bundled JS/CSS
- `moon.png` (background image)

## Step 2: Initialize Git & Push to GitHub

### 2.1 Initialize Git Repository

```bash
cd C:\Projects\referral
git init
git add .
git commit -m "Initial deploy - Referral countdown with Rewardful integration"
```

### 2.2 Push to GitHub

**Repository:** https://github.com/Xentinet-Dev/referral.git

```bash
git branch -M main
git remote add origin https://github.com/Xentinet-Dev/referral.git
git push -u origin main
```

**Note:** The repository already exists at https://github.com/Xentinet-Dev/referral (currently empty).

## Step 3: Deploy with Vercel

### 3.1 Sign Up / Sign In

1. Go to https://vercel.com
2. Click "Sign Up" or "Log In"
3. **Sign in with GitHub** (required for Git integration)

### 3.2 Create New Project

1. Click **"Add New..."** → **"Project"**
2. Import your GitHub repository:
   - Find `referral-countdown` (or your repo name)
   - Click **"Import"**

### 3.3 Configure Build Settings

Vercel should auto-detect Vite, but verify:

- **Framework Preset**: `Vite` (should be auto-selected)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install` (default)

### 3.4 Deploy

1. Click **"Deploy"**
2. Wait 30-60 seconds
3. You'll get a live URL like: `https://referral-countdown.vercel.app`

## Step 4: Verify Rewardful Cookie (CRITICAL)

### 4.1 Test Cookie Capture

1. Visit your Vercel URL with `?via=` parameter:
   ```
   https://your-project.vercel.app/?via=test123
   ```

2. Open DevTools:
   - Press `F12` or right-click → "Inspect"
   - Go to **"Application"** tab (Chrome) or **"Storage"** tab (Firefox)
   - Click **"Cookies"** in left sidebar
   - Select your domain

3. Look for cookie:
   - Name: `rewardful_referral`
   - Value: Should contain referral data

### 4.2 Verification Results

✅ **If cookie exists:**
- Rewardful attribution is working!
- Proceed to Stripe testing (Phase 6)

❌ **If cookie does NOT exist:**
- **STOP HERE** - Do not continue
- Check:
  - Is Rewardful script loaded? (Network tab → look for `rw.js`)
  - Is script ID correct? (`data-rewardful='a97c5f'`)
  - Try hard refresh (Ctrl+Shift+R)
  - Check browser console for errors

## Step 5: Add Custom Domain (Optional)

### 5.1 Add Domain in Vercel

1. Go to your project in Vercel
2. Click **"Settings"** → **"Domains"**
3. Enter your domain: `yourdomain.com`
4. Click **"Add"**

### 5.2 Configure DNS

Vercel will show DNS instructions:
- Usually a single **CNAME** record
- Point to: `cname.vercel-dns.com`

### 5.3 Wait for DNS Propagation

- Usually 5-30 minutes
- Check with: https://dnschecker.org

### 5.4 Re-test Cookie

Once DNS propagates:
```
https://yourdomain.com/?via=test123
```

Re-check the `rewardful_referral` cookie.

## Troubleshooting

### Build Fails on Vercel

- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify `npm run build` works locally

### Cookie Not Appearing

- **Must use HTTPS** (Vercel provides this automatically)
- **Cannot test on localhost** (cookies won't work)
- Check browser console for script errors
- Verify Rewardful script is in `<head>` (not in React component)

### Script Not Loading

- Check Network tab for `rw.js` request
- Verify script URL: `https://r.wdfl.co/rw.js`
- Check for CORS or CSP errors in console

## Next Steps After Cookie Verification

Once `rewardful_referral` cookie is confirmed:

1. ✅ Phase 5 complete - Rewardful attribution working
2. → Proceed to Phase 6: Stripe test conversion setup
3. → Then Phase 7: End-to-end test

## Quick Reference

**Your Vercel URL will be:**
```
https://your-project-name.vercel.app
```

**Test URL:**
```
https://your-project-name.vercel.app/?via=test123
```

**Check cookie:**
- DevTools → Application → Cookies → `rewardful_referral`
