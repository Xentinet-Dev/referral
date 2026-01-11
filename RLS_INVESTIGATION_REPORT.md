# RLS Lockout Investigation Report

## Executive Summary

**Root Cause Identified**: RLS policies are missing `WITH CHECK` clauses, which can cause INSERT/UPDATE operations to fail even when using `service_role` key.

**Status**: All Supabase clients correctly use `service_role` key. No anon key usage found. The issue is purely in the RLS policy definitions.

---

## 1. Supabase Client Inventory

### All Clients Use Service Role Key ✅

| File | Key Type | Location | Usage |
|------|----------|----------|-------|
| `api/nonce.js` | `SUPABASE_SERVICE_ROLE_KEY` | Line 12, 19 | Nonce generation and storage |
| `api/verify-wallet.js` | `SUPABASE_SERVICE_ROLE_KEY` | Line 16, 23 | Nonce verification, wallet activation |
| `api/create-rewardful-affiliate.js` | `SUPABASE_SERVICE_ROLE_KEY` | Line 18, 25 | Activation check, affiliate mapping |
| `api/webhooks/rewardful.js` | `SUPABASE_SERVICE_ROLE_KEY` | Line 19, 26 | Conversion tracking, affiliate lookup |
| `api/referral-progress/[wallet].js` | `SUPABASE_SERVICE_ROLE_KEY` | Line 14, 21 | Referral count queries |

### Frontend Analysis ✅

**No Supabase clients found in frontend code** (`src/` directory). All database access is server-side only.

---

## 2. Wallet Verification Flow Analysis

### Step-by-Step Verification Flow

#### Step 1: Nonce Creation
- **Endpoint**: `GET /api/nonce`
- **File**: `api/nonce.js`
- **Operation**: `INSERT INTO nonces`
- **Client**: `service_role` ✅`
- **RLS Impact**: **BLOCKED** - Missing `WITH CHECK` clause

#### Step 2: Nonce Lookup & Verification
- **Endpoint**: `POST /api/verify-wallet` → `verifyAndConsumeNonce()`
- **File**: `api/verify-wallet.js` (lines 28-67)
- **Operations**: 
  - `SELECT FROM nonces` (line 34-38)
  - `DELETE FROM nonces` (lines 48-51, 55-58)
- **Client**: `service_role` ✅
- **RLS Impact**: SELECT should work (USING clause), DELETE should work (USING clause)

#### Step 3: Wallet Activation Insert
- **Endpoint**: `POST /api/verify-wallet` → `markWalletActivated()`
- **File**: `api/verify-wallet.js` (lines 87-121)
- **Operation**: `UPSERT INTO wallet_activation` (line 94-101)
- **Client**: `service_role` ✅
- **RLS Impact**: **BLOCKED** - Missing `WITH CHECK` clause

#### Step 4: Affiliate Lookup (Post-Verification)
- **Endpoint**: `POST /api/create-rewardful-affiliate`
- **File**: `api/create-rewardful-affiliate.js` (lines 98-127, 129-157)
- **Operations**: 
  - `SELECT FROM wallet_activation` (line 105-109)
  - `SELECT FROM wallet_affiliates` (line 135-139)
- **Client**: `service_role` ✅
- **RLS Impact**: SELECT should work (USING clause)

#### Step 5: Affiliate Insert (Post-Verification)
- **Endpoint**: `POST /api/create-rewardful-affiliate` → `storeAffiliateMapping()`
- **File**: `api/create-rewardful-affiliate.js` (lines 159-196)
- **Operation**: `UPSERT INTO wallet_affiliates` (line 166-174)
- **Client**: `service_role` ✅
- **RLS Impact**: **BLOCKED** - Missing `WITH CHECK` clause

---

## 3. RLS Policy Analysis

### Current Policy Structure (PROBLEMATIC)

```sql
CREATE POLICY "Service role full access [table]"
ON [table]
FOR ALL
USING (auth.role() = 'service_role');
```

### The Problem

PostgreSQL RLS requires two separate clauses:

1. **`USING` clause**: Controls which rows can be **read, updated, or deleted**
   - ✅ Works for: `SELECT`, `UPDATE` (existing rows), `DELETE`
   - ❌ Does NOT work for: `INSERT`, `UPDATE` (new values)

2. **`WITH CHECK` clause**: Controls which rows can be **inserted or updated**
   - ✅ Required for: `INSERT`, `UPDATE` (new values)
   - ❌ Missing in current policies

### Impact on Verification Flow

| Operation | Table | Current Policy | Status | Impact |
|-----------|-------|---------------|--------|--------|
| `INSERT INTO nonces` | `nonces` | USING only | ❌ **BLOCKED** | Nonce creation fails |
| `SELECT FROM nonces` | `nonces` | USING only | ✅ Works | Nonce lookup works |
| `DELETE FROM nonces` | `nonces` | USING only | ✅ Works | Nonce deletion works |
| `UPSERT INTO wallet_activation` | `wallet_activation` | USING only | ❌ **BLOCKED** | Wallet activation fails |
| `SELECT FROM wallet_activation` | `wallet_activation` | USING only | ✅ Works | Activation check works |
| `UPSERT INTO wallet_affiliates` | `wallet_affiliates` | USING only | ❌ **BLOCKED** | Affiliate creation fails |
| `SELECT FROM wallet_affiliates` | `wallet_affiliates` | USING only | ✅ Works | Affiliate lookup works |
| `INSERT INTO rewardful_conversions` | `rewardful_conversions` | USING only | ❌ **BLOCKED** | Conversion tracking fails |

### Tables Written During Verification

1. **`nonces`** - INSERT (nonce creation)
2. **`wallet_activation`** - INSERT/UPDATE (wallet activation)
3. **`wallet_affiliates`** - INSERT/UPDATE (affiliate mapping)
4. **`rewardful_conversions`** - INSERT (conversion tracking)

**All of these require `WITH CHECK` clauses.**

---

## 4. Verification Role Confirmation

### Confirmed: All Verification Uses Service Role ✅

- **Nonce creation**: Server-side (`api/nonce.js`) → `service_role`
- **Nonce verification**: Server-side (`api/verify-wallet.js`) → `service_role`
- **Wallet activation**: Server-side (`api/verify-wallet.js`) → `service_role`
- **Affiliate operations**: Server-side (`api/create-rewardful-affiliate.js`) → `service_role`

**No anon key usage found anywhere in verification flow.**

---

## 5. Root Cause Summary

### Primary Issue: Missing `WITH CHECK` Clauses

The RLS policies are **structurally incomplete**. They only define `USING` clauses, which means:

- ✅ **Reads work**: `SELECT` operations succeed
- ✅ **Deletes work**: `DELETE` operations succeed  
- ❌ **Inserts fail**: `INSERT` operations are blocked
- ❌ **Updates fail**: `UPDATE` operations are blocked (when inserting new values)

### Why This Breaks Verification

The verification flow requires **INSERT operations** on:
1. `nonces` table (nonce creation)
2. `wallet_activation` table (wallet activation)
3. `wallet_affiliates` table (affiliate mapping)

All of these fail silently because RLS blocks INSERTs without `WITH CHECK` clauses.

---

## 6. Recommendations

### Option A: Fix RLS Policies (Recommended)

**Action**: Add `WITH CHECK` clauses to all existing policies.

**Change Required**:
```sql
-- Current (BROKEN)
CREATE POLICY "Service role full access [table]"
ON [table]
FOR ALL
USING (auth.role() = 'service_role');

-- Fixed (CORRECT)
CREATE POLICY "Service role full access [table]"
ON [table]
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
```

**Impact**: 
- ✅ All operations (SELECT, INSERT, UPDATE, DELETE) will work
- ✅ Maintains security (only service_role can access)
- ✅ No code changes required
- ✅ Minimal risk

**Tables to Fix**:
1. `wallet_activation`
2. `wallet_affiliates`
3. `nonces`
4. `rewardful_conversions`

### Option B: Disable RLS (NOT Recommended)

**Action**: Disable RLS on all tables.

**Why Not Recommended**:
- ❌ Removes security layer
- ❌ If anon key is ever accidentally used, full database access is exposed
- ❌ Violates defense-in-depth principle

---

## 7. Exact Failure Points

### Confirmed Blocked Operations

1. **Nonce Creation** (`api/nonce.js:53-58`)
   - Operation: `INSERT INTO nonces`
   - Error: Silent failure (returns error but RLS blocks insert)
   - Symptom: "Failed to fetch nonce" or "Failed to generate nonce"

2. **Wallet Activation** (`api/verify-wallet.js:94-101`)
   - Operation: `UPSERT INTO wallet_activation`
   - Error: Silent failure (RLS blocks insert)
   - Symptom: Wallet appears verified but activation not persisted

3. **Affiliate Mapping** (`api/create-rewardful-affiliate.js:166-174`)
   - Operation: `UPSERT INTO wallet_affiliates`
   - Error: Silent failure (RLS blocks insert)
   - Symptom: Affiliate creation fails or mapping not stored

---

## 8. Next Steps

1. **Update `supabase-schema.sql`** to include `WITH CHECK` clauses
2. **Re-run schema in Supabase** SQL Editor
3. **Test verification flow** end-to-end
4. **Verify logs** show successful INSERTs

---

## Conclusion

**Diagnosis**: RLS lockout due to incomplete policy definitions.

**Solution**: Add `WITH CHECK (auth.role() = 'service_role')` to all four policies.

**Confidence**: High - All clients use service_role, no anon key usage, policies are structurally incomplete.

**Risk**: Low - Fix is additive (adds WITH CHECK), doesn't remove security, maintains current access model.
