/**
 * BACKEND CONTRACT INTERFACE
 * 
 * Validation-Gated Referral System
 * 
 * Core Rules:
 * - Referral links are earned, not automatic
 * - Users must validate holdings (≥ $2) before getting a link
 * - One wallet = one affiliate ID (immutable)
 * - Allocation multiplier: 2× base + up to 3× bonus (1× per referral, max 3×)
 */

// ============================================================================
// HOLDINGS VALIDATION
// ============================================================================

export interface ValidationRequest {
  wallet: string;
  message: string;
  signature: string; // Base64 encoded signature
  timestamp: number;
  nonce: string;
}

export interface ValidationResult {
  validated: boolean;
  usd_value: number; // USD value at time of validation (locked)
  validated_at: number | null;
  error?: string;
}

/**
 * POST /api/validate-holdings
 * 
 * Validates that a wallet holds ≥ $2 USD worth of the countdown token.
 * 
 * Rules:
 * - REQUIRES SIGNATURE - User must sign message to authorize validation
 * - Backend verifies signature before proceeding
 * - Checks SPL token balance for the countdown token
 * - USD value ≥ $2 (calculated at acquisition time)
 * - Balance must be acquired via purchase, not transfer or airdrop
 * - Validation result is locked permanently (write-once)
 * - If < $2 → validation fails
 * - If ≥ $2 → validation succeeds
 * - Rejects reused nonces and old timestamps
 */
export type ValidateHoldingsFunction = (
  request: ValidationRequest
) => Promise<ValidationResult>;

// ============================================================================
// AFFILIATE LINK ISSUANCE
// ============================================================================

export interface AffiliateLinkResponse {
  success: boolean;
  affiliate_id: string | null;
  referral_link: string | null;
  error?: string;
}

export interface IssueAffiliateLinkRequest {
  wallet: string;
  message: string;
  signature: string; // Base64 encoded signature
  timestamp: number;
  nonce: string;
}

/**
 * POST /api/issue-affiliate-link
 * 
 * Issues a unique affiliate link to a validated wallet.
 * 
 * Rules:
 * - REQUIRES SIGNATURE - User must sign message to authorize link issuance
 * - Backend verifies signature before proceeding
 * - Wallet must be validated first (validateHoldings must return validated: true)
 * - One wallet = one affiliate ID (immutable)
 * - Affiliate ID never changes
 * - No regeneration
 * - No manual override
 * - If already issued, returns existing affiliate_id
 * - Rejects reused nonces and old timestamps
 */
export type IssueAffiliateLinkFunction = (
  request: IssueAffiliateLinkRequest
) => Promise<AffiliateLinkResponse>;

// ============================================================================
// REFERRAL ATTRIBUTION
// ============================================================================

export interface AttributeReferralRequest {
  referred_wallet: string;
  affiliate_id: string; // From ?via= parameter
  message: string;
  signature: string; // Base64 encoded signature
  timestamp: number;
  nonce: string;
}

export interface AttributeReferralResponse {
  success: boolean;
  message: string;
  is_self_referral?: boolean;
  already_attributed?: boolean;
}

/**
 * POST /api/attribute-referral
 * 
 * Attributes a referral to an affiliate when a new user visits via link.
 * 
 * Rules:
 * - REQUIRES SIGNATURE - User must sign message to authorize attribution
 * - Backend verifies signature before proceeding
 * - URL contains ?via=<affiliate_id>
 * - Rewardful captures visit
 * - First affiliate wins (immutable)
 * - Attribution is immutable
 * - Self-referrals are rejected
 * - Rejects reused nonces and old timestamps
 */
export type AttributeReferralFunction = (
  request: AttributeReferralRequest
) => Promise<AttributeReferralResponse>;

// ============================================================================
// REFEREE VALIDATION
// ============================================================================

/**
 * POST /api/validate-referred-wallet
 * 
 * Validates that a referred wallet has acquired ≥ $2 USD worth of token.
 * 
 * Rules:
 * - Referred wallet must connect
 * - Must acquire ≥ $2 USD worth of token
 * - Must pass on-chain validation
 * - Transfers and airdrops do not qualify
 * - Once validated → permanently true (write-once)
 */
export type ValidateReferredWalletFunction = (
  wallet: string
) => Promise<ValidationResult>;

/**
 * POST /api/increment-referral-count
 * 
 * Increments successful_referrals_count for a referrer.
 * 
 * Rules:
 * - Called when a referred wallet is validated
 * - Increments referrer's successful_referrals_count
 * - Only counts validated referees
 * - Immutable (cannot decrease)
 */
export type IncrementReferralCountFunction = (
  referrer_wallet: string
) => Promise<{ success: boolean; new_count: number }>;

// ============================================================================
// ALLOCATION MULTIPLIER
// ============================================================================

export interface AllocationMultiplierResponse {
  base_multiplier: number; // Always 2×
  bonus_multiplier: number; // 0-3× (1× per successful referral)
  total_multiplier: number; // base + bonus (max 3×)
  successful_referrals: number;
  max_bonus_reached: boolean;
}

/**
 * GET /api/allocation-multiplier/:wallet
 * 
 * Calculates allocation multiplier for a wallet.
 * 
 * Rules:
 * - Base allocation: 2× (all validated holders)
 * - Referral bonus: +1× per successful referee
 * - Maximum bonus: 3× (caps at 3 successful referrals)
 * - Extra referrals beyond 3 do nothing
 * - Multiplier is locked at snapshot time
 */
export type CalculateAllocationMultiplierFunction = (
  wallet: string
) => Promise<AllocationMultiplierResponse>;

// ============================================================================
// REFERRER DATA
// ============================================================================

export interface ReferrerData {
  wallet_address: string;
  affiliate_id: string | null;
  validated: boolean;
  validated_at: number | null;
  successful_referrals_count: number;
  allocation_multiplier: AllocationMultiplierResponse | null;
}

/**
 * GET /api/referrer/:wallet
 * 
 * Returns complete referrer data for a wallet.
 */
export type GetReferrerDataFunction = (
  wallet: string
) => Promise<ReferrerData>;

// ============================================================================
// REFERRAL MAPPING
// ============================================================================

export interface ReferralMapping {
  affiliate_id: string;
  referrer_wallet: string;
  referred_wallet: string;
  referred_validated: boolean;
  validated_at: number | null;
}

/**
 * GET /api/referrals/:wallet
 * 
 * Returns all referrals for a referrer wallet.
 */
export type GetReferralsFunction = (
  referrer_wallet: string
) => Promise<ReferralMapping[]>;
