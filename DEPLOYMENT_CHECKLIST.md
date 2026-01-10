# Deployment Checklist

## ✅ Pre-Deployment Checks (COMPLETE)

- [x] Build successful (`npm run build`)
- [x] `dist/` folder created
- [x] Rewardful script in `<head>` (verified)
- [x] No build errors
- [x] `.gitignore` configured

## 📋 Deployment Steps

### Step 1: Git Setup
- [ ] Initialize git: `git init`
- [ ] Add files: `git add .`
- [ ] Commit: `git commit -m "Initial deploy"`

### Step 2: GitHub
- [ ] Create repository on GitHub.com
- [ ] Add remote: `git remote add origin https://github.com/YOURUSERNAME/repo.git`
- [ ] Push: `git push -u origin main`

### Step 3: Vercel
- [ ] Sign in to Vercel with GitHub
- [ ] Import repository
- [ ] Verify settings:
  - Framework: Vite
  - Build: `npm run build`
  - Output: `dist`
- [ ] Deploy

### Step 4: Verify Rewardful Cookie
- [ ] Visit: `https://your-project.vercel.app/?via=test123`
- [ ] Open DevTools → Application → Cookies
- [ ] Confirm `rewardful_referral` cookie exists

## 🚨 Critical: Do NOT Continue If...

- Cookie does NOT exist after deployment
- Script errors in browser console
- Rewardful script not loading (check Network tab)

## 📝 Files Created

- `VERCEL_DEPLOY.md` - Full deployment guide
- `deploy-commands.md` - Quick command reference
- `DEPLOYMENT_CHECKLIST.md` - This checklist

## Next Steps After Cookie Verification

Once `rewardful_referral` cookie is confirmed:
1. ✅ Phase 5 complete
2. → Phase 6: Set up Stripe backend
3. → Phase 7: End-to-end test
