/**
 * BACKEND CONTRACT INTERFACE
 * 
 * This file defines the formal contract for backend API endpoints.
 * The mockBackend.ts implements this contract with in-memory storage.
 * 
 * In production, replace mockBackend.ts calls with actual HTTP requests to these endpoints.
 */

// ============================================================================
// ATTRIBUTION ENDPOINTS
// ============================================================================

export interface AttributionRequest {
  referred_wallet: string;
  referrer_wallet: string;
  signed_message: string;
  rewardful_affiliate_id?: string; // Optional: captured from Rewardful cookie
}

export interface AttributionResponse {
  success: boolean;
  message: string;
  is_self_referral?: boolean;
  already_attributed?: boolean;
  rewardful_affiliate_id?: string; // Returned if mapped
}

/**
 * POST /api/attribution
 * 
 * Records referral attribution.
 * 
 * Rules:
 * - First referral wins (immutable)
 * - Self-referrals are rejected
 * - Attribution cannot be overwritten
 * - If rewardful_affiliate_id provided, maps wallet → affiliate_id (first wins, immutable)
 */
export type AttributeReferralFunction = (
  request: AttributionRequest
) => Promise<AttributionResponse>;

/**
 * GET /api/attribution/:wallet
 * 
 * Returns attribution data for a wallet.
 */
export interface AttributionData {
  referrer: string | null;
  timestamp: number | null;
  rewardful_affiliate_id: string | null;
}

export type GetAttributionFunction = (
  wallet: string
) => Promise<AttributionData>;

// ============================================================================
// BUY VERIFICATION ENDPOINTS
// ============================================================================

export interface BuyVerificationRequest {
  wallet: string;
  token_mint: string;
  window_start: number;
  window_end: number;
}

export interface BuyVerificationResponse {
  verified: boolean;
  usd_value?: number; // USD value at time of purchase (locked once verified)
  transaction_signature?: string;
  verified_at?: number; // Timestamp when verification occurred
}

/**
 * POST /api/verify-buy
 * 
 * Verifies if a wallet has made a qualifying purchase.
 * 
 * Rules:
 * - Scans Solana transactions for SOL outflow + SPL token inflow
 * - Must be in same transaction
 * - Must occur within window_start and window_end
 * - USD value calculated at time of purchase (uses price oracle)
 * - Must be ≥ $2 USD
 * - Once verified → permanently true (write-once)
 * - Result is cached and never re-evaluated
 */
export type VerifyBuyFunction = (
  request: BuyVerificationRequest
) => Promise<BuyVerificationResponse>;

/**
 * GET /api/buy-verification/:wallet
 * 
 * Returns buy verification status for a wallet.
 * Returns cached result if already verified.
 */
export type GetBuyVerificationFunction = (
  wallet: string
) => Promise<BuyVerificationResponse>;

// ============================================================================
// REFERRAL PROGRESS ENDPOINTS
// ============================================================================

/**
 * GET /api/referrals/:wallet
 * 
 * Returns all wallets that were referred by the given wallet.
 */
export type GetReferralsFunction = (
  referrer_wallet: string
) => Promise<string[]>;

/**
 * GET /api/referral-progress/:wallet
 * 
 * Returns comprehensive referral progress for a wallet.
 */
export interface ReferralProgress {
  total_referrals: number;
  qualified_buyers: number;
  bonus_eligible: boolean; // true if qualified_buyers >= threshold
  referrals: string[]; // List of referred wallet addresses
}

export type GetReferralProgressFunction = (
  wallet: string
) => Promise<ReferralProgress>;

// ============================================================================
// QUALIFICATION LOCK ENDPOINT
// ============================================================================

/**
 * POST /api/lock-qualification
 * 
 * Locks qualification status for a wallet (snapshot).
 * 
 * Rules:
 * - Can only be called once per wallet
 * - Locks current qualification state
 * - Used for final snapshot at countdown end
 */
export interface LockQualificationRequest {
  wallet: string;
}

export interface LockQualificationResponse {
  success: boolean;
  qualified: boolean;
  usd_value: number;
  locked_at: number;
}

export type LockQualificationFunction = (
  request: LockQualificationRequest
) => Promise<LockQualificationResponse>;

// ============================================================================
// REWARDFUL AFFILIATE MAPPING
// ============================================================================

/**
 * Internal storage structure for wallet → affiliate_id mapping
 * 
 * Rules:
 * - First affiliate ID wins (immutable)
 * - Wallet → affiliate_id is one-to-one
 * - Never overwritten once set
 */
export interface WalletAffiliateMapping {
  wallet: string;
  rewardful_affiliate_id: string;
  mapped_at: number;
}

/**
 * GET /api/affiliate-mapping/:wallet
 * 
 * Returns Rewardful affiliate ID for a wallet (if mapped).
 */
export type GetAffiliateMappingFunction = (
  wallet: string
) => Promise<{ rewardful_affiliate_id: string | null }>;

// ============================================================================
// STRIPE CONVERSION TRIGGER
// ============================================================================

/**
 * POST /api/trigger-conversion
 * 
 * Triggers a Stripe payment event for Rewardful attribution.
 * 
 * Rules:
 * - Creates $0 or $2 test-mode Stripe payment
 * - Associates with wallet/customer
 * - Rewardful cookie/session automatically attached
 * - Used when buy verified OR referral bonus condition met
 */
export interface TriggerConversionRequest {
  wallet: string;
  amount_usd: number; // 0 for free conversion, 2 for actual purchase
  conversion_type: 'buy_verified' | 'referral_bonus';
}

export interface TriggerConversionResponse {
  success: boolean;
  stripe_payment_id?: string;
  rewardful_conversion_id?: string;
}

export type TriggerConversionFunction = (
  request: TriggerConversionRequest
) => Promise<TriggerConversionResponse>;
