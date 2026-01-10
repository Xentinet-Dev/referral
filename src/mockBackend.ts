/**
 * MOCK BACKEND IMPLEMENTATION
 * 
 * This file implements the backend contract (backendContract.ts) using in-memory storage.
 * 
 * Rules:
 * - All functions are deterministic (no random behavior)
 * - Data persists in memory during session
 * - Replace with actual HTTP API calls in production
 */

import type {
  AttributionRequest,
  AttributionResponse,
  AttributionData,
  BuyVerificationRequest,
  BuyVerificationResponse,
  ReferralProgress,
  LockQualificationRequest,
  LockQualificationResponse,
  TriggerConversionRequest,
  TriggerConversionResponse,
} from './backendContract';

// Re-export types for backward compatibility
export type {
  AttributionRequest,
  AttributionResponse,
  BuyVerificationRequest,
  BuyVerificationResponse,
};

// ============================================================================
// IN-MEMORY STORAGE (Deterministic)
// ============================================================================

interface AttributionRecord {
  referrer: string;
  timestamp: number;
  signed_message: string;
  rewardful_affiliate_id: string | null;
}

interface BuyVerificationRecord {
  verified: boolean;
  verified_at: number;
  usd_value: number; // Locked at time of verification
  transaction_signature: string | null;
}

interface WalletAffiliateMapping {
  wallet: string;
  rewardful_affiliate_id: string;
  mapped_at: number;
}

interface QualificationLock {
  wallet: string;
  qualified: boolean;
  usd_value: number;
  locked_at: number;
}

const attributionStore = new Map<string, AttributionRecord>();
const buyVerificationStore = new Map<string, BuyVerificationRecord>();
const affiliateMappingStore = new Map<string, WalletAffiliateMapping>();
const qualificationLockStore = new Map<string, QualificationLock>();

// ============================================================================
// HELPER: Get Rewardful affiliate ID from cookie
// ============================================================================

/**
 * In production, this would read from the rewardful_referral cookie.
 * For mock, we simulate by checking if ?via= parameter was passed.
 */
function getRewardfulAffiliateId(): string | null {
  // In real implementation, read from document.cookie
  // const cookies = document.cookie.split(';');
  // const rewardfulCookie = cookies.find(c => c.trim().startsWith('rewardful_referral='));
  // return rewardfulCookie ? rewardfulCookie.split('=')[1] : null;
  
  // Mock: check URL parameter (for testing)
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('via') || null;
}

// ============================================================================
// ATTRIBUTION FUNCTIONS
// ============================================================================

/**
 * Record referral attribution
 * 
 * Rules:
 * - First referral wins (immutable)
 * - Self-referrals are rejected
 * - Attribution cannot be overwritten
 * - If rewardful_affiliate_id provided, maps wallet → affiliate_id (first wins, immutable)
 */
export async function recordAttribution(
  request: AttributionRequest
): Promise<AttributionResponse> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check for self-referral
  if (request.referred_wallet === request.referrer_wallet) {
    return {
      success: false,
      message: 'Self-referrals are not allowed',
      is_self_referral: true,
    };
  }

  // Check if already attributed
  if (attributionStore.has(request.referred_wallet)) {
    const existing = attributionStore.get(request.referred_wallet)!;
    return {
      success: false,
      message: 'Attribution already recorded',
      already_attributed: true,
      rewardful_affiliate_id: existing.rewardful_affiliate_id || undefined,
    };
  }

  // Get Rewardful affiliate ID (from cookie or request parameter)
  const rewardfulAffiliateId = request.rewardful_affiliate_id || getRewardfulAffiliateId();

  // Map wallet → affiliate_id (first wins, immutable)
  if (rewardfulAffiliateId) {
    // Check if wallet already has an affiliate mapping
    if (!affiliateMappingStore.has(request.referred_wallet)) {
      affiliateMappingStore.set(request.referred_wallet, {
        wallet: request.referred_wallet,
        rewardful_affiliate_id: rewardfulAffiliateId,
        mapped_at: Date.now(),
      });
    }
  }

  // Record attribution (first referral wins)
  attributionStore.set(request.referred_wallet, {
    referrer: request.referrer_wallet,
    timestamp: Date.now(),
    signed_message: request.signed_message,
    rewardful_affiliate_id: rewardfulAffiliateId,
  });

  return {
    success: true,
    message: 'Attribution recorded successfully',
    rewardful_affiliate_id: rewardfulAffiliateId || undefined,
  };
}

/**
 * Get referral attribution
 */
export async function getAttribution(
  wallet: string
): Promise<AttributionData> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const attribution = attributionStore.get(wallet);
  if (!attribution) {
    return { referrer: null, timestamp: null, rewardful_affiliate_id: null };
  }

  return {
    referrer: attribution.referrer,
    timestamp: attribution.timestamp,
    rewardful_affiliate_id: attribution.rewardful_affiliate_id,
  };
}

/**
 * Get all referrals for a wallet
 */
export async function getReferrals(
  referrer_wallet: string
): Promise<string[]> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const referrals: string[] = [];
  for (const [referred, data] of attributionStore.entries()) {
    if (data.referrer === referrer_wallet) {
      referrals.push(referred);
    }
  }
  return referrals;
}

/**
 * Get comprehensive referral progress
 */
export async function getReferralProgress(
  wallet: string
): Promise<ReferralProgress> {
  await new Promise(resolve => setTimeout(resolve, 200));

  const referrals = await getReferrals(wallet);
  let qualifiedBuyers = 0;

  for (const referredWallet of referrals) {
    const verification = await getBuyVerification(referredWallet);
    if (verification.verified) {
      qualifiedBuyers++;
    }
  }

  const BONUS_THRESHOLD = 3;
  return {
    total_referrals: referrals.length,
    qualified_buyers: qualifiedBuyers,
    bonus_eligible: qualifiedBuyers >= BONUS_THRESHOLD,
    referrals,
  };
}

// ============================================================================
// BUY VERIFICATION FUNCTIONS
// ============================================================================

/**
 * Verify buy transaction
 * 
 * Rules:
 * - Scans Solana transactions for SOL outflow + SPL token inflow
 * - Must be in same transaction
 * - Must occur within window_start and window_end
 * - USD value calculated at time of purchase (uses price oracle)
 * - Must be ≥ $2 USD
 * - Once verified → permanently true (write-once)
 * - Result is cached and never re-evaluated
 * 
 * CURRENT IMPLEMENTATION: Deterministic stub
 * In production, replace with actual Solana RPC transaction scanning.
 */
export async function verifyBuy(
  request: BuyVerificationRequest
): Promise<BuyVerificationResponse> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check if already verified (permanently true once verified)
  const existing = buyVerificationStore.get(request.wallet);
  if (existing?.verified) {
    return {
      verified: true,
      usd_value: existing.usd_value,
      transaction_signature: existing.transaction_signature || undefined,
      verified_at: existing.verified_at,
    };
  }

  // ========================================================================
  // PRODUCTION IMPLEMENTATION STUB
  // ========================================================================
  // In production, this would:
  // 1. Query Solana RPC: connection.getSignaturesForAddress(walletPubkey, { limit: 100 })
  // 2. Filter transactions within window_start and window_end
  // 3. For each transaction:
  //    a. Get transaction details: connection.getTransaction(signature)
  //    b. Check for SPL token transfer to wallet (token account balance increase)
  //    c. Check for SOL balance decrease (preBalances vs postBalances)
  //    d. Verify both in same transaction
  // 4. Calculate USD value at time of transaction:
  //    - Get token amount from transaction
  //    - Query price oracle for token price at transaction timestamp
  //    - usd_value = token_amount * price_usd
  // 5. If usd_value >= 2.0, mark as verified
  // 6. Cache result permanently
  // ========================================================================

  // MOCK: Deterministic verification (for testing)
  // Uses wallet address hash to create consistent results
  const walletHash = request.wallet.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mockVerified = (walletHash % 10) >= 3; // 70% verified
  const mockUsdValue = mockVerified ? 2.5 : 1.0;

  if (mockVerified && mockUsdValue >= 2.0) {
    const verifiedAt = Date.now();
    buyVerificationStore.set(request.wallet, {
      verified: true,
      verified_at: verifiedAt,
      usd_value: mockUsdValue, // Locked at time of verification
      transaction_signature: `mock_tx_${request.wallet.slice(0, 8)}_${verifiedAt}`,
    });

    // ========================================================================
    // AUTOMATIC CONVERSION TRIGGER
    // ========================================================================
    // When buy is verified, automatically trigger Stripe conversion for Rewardful
    // This happens server-side - frontend does nothing
    // In production, this would call your backend API endpoint
    // ========================================================================
    try {
      // In production, this would be an HTTP call to your backend:
      // await fetch('/api/trigger-conversion', {
      //   method: 'POST',
      //   body: JSON.stringify({
      //     wallet: request.wallet,
      //     amount_usd: mockUsdValue,
      //     conversion_type: 'buy_verified',
      //   }),
      // });
      
      // For now, we call the mock function directly
      // In production backend, this would call the real Stripe API
      await triggerConversion({
        wallet: request.wallet,
        amount_usd: mockUsdValue,
        conversion_type: 'buy_verified',
      });
    } catch (error) {
      // Log error but don't fail verification
      console.error('Conversion trigger error (non-fatal):', error);
    }

    return {
      verified: true,
      usd_value: mockUsdValue,
      transaction_signature: `mock_tx_${request.wallet.slice(0, 8)}_${verifiedAt}`,
      verified_at: verifiedAt,
    };
  }

  return {
    verified: false,
  };
}

/**
 * Get buy verification status
 */
export async function getBuyVerification(
  wallet: string
): Promise<BuyVerificationResponse> {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const verification = buyVerificationStore.get(wallet);
  if (!verification) {
    return { verified: false };
  }

  return {
    verified: verification.verified,
    usd_value: verification.usd_value,
    transaction_signature: verification.transaction_signature || undefined,
    verified_at: verification.verified_at,
  };
}

// ============================================================================
// QUALIFICATION LOCK FUNCTION
// ============================================================================

/**
 * Lock qualification status for a wallet (snapshot)
 * 
 * Rules:
 * - Can only be called once per wallet
 * - Locks current qualification state
 * - Used for final snapshot at countdown end
 */
export async function lockQualification(
  request: LockQualificationRequest
): Promise<LockQualificationResponse> {
  await new Promise(resolve => setTimeout(resolve, 300));

  // Check if already locked
  if (qualificationLockStore.has(request.wallet)) {
    const existing = qualificationLockStore.get(request.wallet)!;
    return {
      success: false,
      qualified: existing.qualified,
      usd_value: existing.usd_value,
      locked_at: existing.locked_at,
    };
  }

  // Get current qualification status
  const verification = await getBuyVerification(request.wallet);
  const QUALIFICATION_THRESHOLD_USD = 2.0;
  const qualified = verification.verified && (verification.usd_value || 0) >= QUALIFICATION_THRESHOLD_USD;

  const lockedAt = Date.now();
  qualificationLockStore.set(request.wallet, {
    wallet: request.wallet,
    qualified,
    usd_value: verification.usd_value || 0,
    locked_at: lockedAt,
  });

  return {
    success: true,
    qualified,
    usd_value: verification.usd_value || 0,
    locked_at: lockedAt,
  };
}

// ============================================================================
// STRIPE CONVERSION TRIGGER
// ============================================================================

/**
 * Trigger Stripe payment event for Rewardful attribution
 * 
 * Rules:
 * - Creates $0 or $2 test-mode Stripe payment
 * - Associates with wallet/customer
 * - Rewardful cookie/session automatically attached
 * - Used when buy verified OR referral bonus condition met
 * 
 * CURRENT IMPLEMENTATION: Stub
 * In production, integrate with Stripe API.
 */
export async function triggerConversion(
  request: TriggerConversionRequest
): Promise<TriggerConversionResponse> {
  await new Promise(resolve => setTimeout(resolve, 500));

  // ========================================================================
  // PRODUCTION IMPLEMENTATION STUB
  // ========================================================================
  // In production, this would:
  // 1. Get or create Stripe customer for wallet
  // 2. Create Stripe payment intent:
  //    - amount: request.amount_usd * 100 (cents)
  //    - currency: 'usd'
  //    - customer: stripe_customer_id
  //    - payment_method_types: ['card']
  //    - metadata: { wallet, conversion_type }
  // 3. Rewardful will automatically track conversion via cookie/session
  // 4. Return payment intent ID
  // ========================================================================

  // Mock: Return success
  const mockPaymentId = `pi_mock_${request.wallet.slice(0, 8)}_${Date.now()}`;
  const mockConversionId = `conv_${request.wallet.slice(0, 8)}_${Date.now()}`;

  return {
    success: true,
    stripe_payment_id: mockPaymentId,
    rewardful_conversion_id: mockConversionId,
  };
}

// ============================================================================
// AFFILIATE MAPPING FUNCTION
// ============================================================================

/**
 * Get Rewardful affiliate ID for a wallet
 */
export async function getAffiliateMapping(
  wallet: string
): Promise<{ rewardful_affiliate_id: string | null }> {
  await new Promise(resolve => setTimeout(resolve, 200));

  const mapping = affiliateMappingStore.get(wallet);
  return {
    rewardful_affiliate_id: mapping?.rewardful_affiliate_id || null,
  };
}
