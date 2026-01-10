# Quick Deploy Commands

Copy and paste these commands in order:

## 1. Initialize Git (if not already done)

```bash
cd C:\Projects\referral
git init
git add .
git commit -m "Initial deploy - Referral countdown with Rewardful integration"
```

## 2. Push to GitHub

**Repository URL:** https://github.com/Xentinet-Dev/referral.git

```bash
git branch -M main
git remote add origin https://github.com/Xentinet-Dev/referral.git
git push -u origin main
```

**Note:** The repository already exists at https://github.com/Xentinet-Dev/referral (currently empty).

## 4. Deploy on Vercel

**Do this manually:**
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New..." → "Project"
4. Select your `referral-countdown` repository
5. Click "Import"
6. Verify settings:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
7. Click "Deploy"
8. Wait for deployment (30-60 seconds)

## 5. Test Rewardful Cookie

Visit: `https://your-project.vercel.app/?via=test123`

Open DevTools → Application → Cookies → Look for `rewardful_referral`

**If cookie exists → Success! Proceed to Phase 6.**
**If cookie does NOT exist → Stop and fix script loading.**
