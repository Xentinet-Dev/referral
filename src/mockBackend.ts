/**
 * MOCK BACKEND IMPLEMENTATION
 * 
 * Validation-Gated Referral System
 * 
 * Rules:
 * - All functions are deterministic (no random behavior)
 * - Data persists in memory during session
 * - Replace with actual HTTP API calls in production
 */

import type {
  ValidationResult,
  AffiliateLinkResponse,
  AttributeReferralRequest,
  AttributeReferralResponse,
  IncrementReferralCountFunction,
  AllocationMultiplierResponse,
  ReferrerData,
  ReferralMapping,
  ValidateHoldingsFunction,
  IssueAffiliateLinkFunction,
  AttributeReferralFunction,
  ValidateReferredWalletFunction,
  CalculateAllocationMultiplierFunction,
  GetReferrerDataFunction,
  GetReferralsFunction,
} from './backendContract';

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

interface ReferrerRecord {
  wallet_address: string;
  affiliate_id: string | null;
  validated: boolean;
  validated_at: number | null;
  usd_value: number; // Locked at validation time
  successful_referrals_count: number;
}

interface ReferralMappingRecord {
  affiliate_id: string;
  referrer_wallet: string;
  referred_wallet: string;
  referred_validated: boolean;
  validated_at: number | null;
  attributed_at: number;
}

const referrerStore = new Map<string, ReferrerRecord>();
const referralMappingStore = new Map<string, ReferralMappingRecord>(); // Key: referred_wallet
const affiliateIdStore = new Map<string, string>(); // affiliate_id → wallet_address

// Constants
const VALIDATION_THRESHOLD_USD = 2.0;
const BASE_MULTIPLIER = 2;
const MAX_BONUS_MULTIPLIER = 3;
const BONUS_PER_REFERRAL = 1;

// ============================================================================
// HELPER: Generate unique affiliate ID
// ============================================================================

function generateAffiliateId(): string {
  // Generate a short, unique ID (8 characters)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Ensure uniqueness
  while (affiliateIdStore.has(id)) {
    id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  
  return id;
}

// ============================================================================
// HOLDINGS VALIDATION
// ============================================================================

/**
 * Validate that a wallet holds ≥ $2 USD worth of the countdown token.
 * 
 * Rules:
 * - Checks SPL token balance
 * - USD value ≥ $2 (calculated at acquisition time)
 * - Balance must be acquired via purchase, not transfer or airdrop
 * - Validation result is locked permanently (write-once)
 */
export const validateHoldings: ValidateHoldingsFunction = async (wallet: string): Promise<ValidationResult> => {
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check if already validated
  const existing = referrerStore.get(wallet);
  if (existing?.validated) {
    return {
      validated: true,
      usd_value: existing.usd_value,
      validated_at: existing.validated_at || null,
    };
  }

  // ========================================================================
  // PRODUCTION IMPLEMENTATION STUB
  // ========================================================================
  // In production, this would:
  // 1. Query Solana RPC for SPL token balance
  // 2. Get token account for the wallet
  // 3. Check transaction history to verify purchase (not transfer/airdrop)
  // 4. Calculate USD value at time of purchase (price oracle)
  // 5. If usd_value >= 2.0, mark as validated
  // 6. Lock validation result permanently
  // ========================================================================

  // MOCK: Deterministic validation (for testing)
  // Uses wallet address hash to create consistent results
  const walletHash = wallet.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mockValidated = (walletHash % 10) >= 3; // 70% validated
  const mockUsdValue = mockValidated ? 2.5 : 1.0;

  if (mockValidated && mockUsdValue >= VALIDATION_THRESHOLD_USD) {
    const validatedAt = Date.now();
    referrerStore.set(wallet, {
      wallet_address: wallet,
      affiliate_id: null, // Will be issued separately
      validated: true,
      validated_at: validatedAt,
      usd_value: mockUsdValue, // Locked at validation time
      successful_referrals_count: 0,
    });

    return {
      validated: true,
      usd_value: mockUsdValue,
      validated_at: validatedAt,
    };
  }

  return {
    validated: false,
    usd_value: mockUsdValue,
    validated_at: null,
    error: `Holdings must be ≥ $${VALIDATION_THRESHOLD_USD} USD`,
  };
};

// ============================================================================
// AFFILIATE LINK ISSUANCE
// ============================================================================

/**
 * Issue a unique affiliate link to a validated wallet.
 * 
 * Rules:
 * - Wallet must be validated first
 * - One wallet = one affiliate ID (immutable)
 * - Affiliate ID never changes
 * - If already issued, returns existing affiliate_id
 */
export const issueAffiliateLink: IssueAffiliateLinkFunction = async (wallet: string): Promise<AffiliateLinkResponse> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  // Check if wallet is validated
  const referrer = referrerStore.get(wallet);
  if (!referrer || !referrer.validated) {
    return {
      success: false,
      affiliate_id: null,
      referral_link: null,
      error: 'Wallet must be validated first (holdings ≥ $2 USD)',
    };
  }

  // If affiliate ID already exists, return it
  if (referrer.affiliate_id) {
    const referralLink = `${window.location.origin}${window.location.pathname}?via=${referrer.affiliate_id}`;
    return {
      success: true,
      affiliate_id: referrer.affiliate_id,
      referral_link: referralLink,
    };
  }

  // Generate new affiliate ID
  const affiliateId = generateAffiliateId();
  affiliateIdStore.set(affiliateId, wallet);

  // Update referrer record
  referrer.affiliate_id = affiliateId;
  referrerStore.set(wallet, referrer);

  const referralLink = `${window.location.origin}${window.location.pathname}?via=${affiliateId}`;

  return {
    success: true,
    affiliate_id: affiliateId,
    referral_link: referralLink,
  };
};

// ============================================================================
// REFERRAL ATTRIBUTION
// ============================================================================

/**
 * Attribute a referral when a new user visits via link.
 * 
 * Rules:
 * - First affiliate wins (immutable)
 * - Attribution is immutable
 * - Self-referrals are rejected
 */
export const attributeReferral: AttributeReferralFunction = async (
  request: AttributeReferralRequest
): Promise<AttributeReferralResponse> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  // Get referrer wallet from affiliate ID
  const referrerWallet = affiliateIdStore.get(request.affiliate_id);
  if (!referrerWallet) {
    return {
      success: false,
      message: 'Invalid affiliate ID',
    };
  }

  // Check for self-referral
  if (request.referred_wallet === referrerWallet) {
    return {
      success: false,
      message: 'Self-referrals are not allowed',
      is_self_referral: true,
    };
  }

  // Check if already attributed
  if (referralMappingStore.has(request.referred_wallet)) {
    const existing = referralMappingStore.get(request.referred_wallet)!;
    if (existing.affiliate_id === request.affiliate_id) {
      return {
        success: true,
        message: 'Referral already attributed',
        already_attributed: true,
      };
    } else {
      return {
        success: false,
        message: 'Wallet already attributed to different affiliate',
        already_attributed: true,
      };
    }
  }

  // Record attribution
  referralMappingStore.set(request.referred_wallet, {
    affiliate_id: request.affiliate_id,
    referrer_wallet: referrerWallet,
    referred_wallet: request.referred_wallet,
    referred_validated: false,
    validated_at: null,
    attributed_at: Date.now(),
  });

  return {
    success: true,
    message: 'Referral attributed successfully',
  };
};

// ============================================================================
// REFEREE VALIDATION
// ============================================================================

/**
 * Validate that a referred wallet has acquired ≥ $2 USD worth of token.
 * 
 * Rules:
 * - Must acquire ≥ $2 USD worth of token
 * - Must pass on-chain validation
 * - Transfers and airdrops do not qualify
 * - Once validated → permanently true (write-once)
 */
export const validateReferredWallet: ValidateReferredWalletFunction = async (
  wallet: string
): Promise<ValidationResult> => {
  // Check if wallet has a referral mapping
  const mapping = referralMappingStore.get(wallet);
  if (!mapping) {
    return {
      validated: false,
      usd_value: 0,
      validated_at: null,
      error: 'Wallet is not a referred user',
    };
  }

  // Check if already validated
  if (mapping.referred_validated) {
    return {
      validated: true,
      usd_value: 2.5, // Mock value
      validated_at: mapping.validated_at || null,
    };
  }

  // Validate holdings (same logic as validateHoldings)
  const validation = await validateHoldings(wallet);
  
  if (validation.validated) {
    // Update mapping
    mapping.referred_validated = true;
    mapping.validated_at = validation.validated_at || Date.now();
    referralMappingStore.set(wallet, mapping);

    // Increment referrer's successful referrals count
    await incrementReferralCount(mapping.referrer_wallet);
  }

  return validation;
};

// ============================================================================
// INCREMENT REFERRAL COUNT
// ============================================================================

export const incrementReferralCount: IncrementReferralCountFunction = async (
  referrer_wallet: string
): Promise<{ success: boolean; new_count: number }> => {
  await new Promise(resolve => setTimeout(resolve, 200));

  const referrer = referrerStore.get(referrer_wallet);
  if (!referrer) {
    return { success: false, new_count: 0 };
  }

  referrer.successful_referrals_count += 1;
  referrerStore.set(referrer_wallet, referrer);

  return {
    success: true,
    new_count: referrer.successful_referrals_count,
  };
};

// ============================================================================
// ALLOCATION MULTIPLIER
// ============================================================================

/**
 * Calculate allocation multiplier for a wallet.
 * 
 * Rules:
 * - Base allocation: 2× (all validated holders)
 * - Referral bonus: +1× per successful referee
 * - Maximum bonus: 3× (caps at 3 successful referrals)
 * - Extra referrals beyond 3 do nothing
 */
export const calculateAllocationMultiplier: CalculateAllocationMultiplierFunction = async (
  wallet: string
): Promise<AllocationMultiplierResponse> => {
  await new Promise(resolve => setTimeout(resolve, 200));

  const referrer = referrerStore.get(wallet);
  if (!referrer || !referrer.validated) {
    return {
      base_multiplier: 0,
      bonus_multiplier: 0,
      total_multiplier: 0,
      successful_referrals: 0,
      max_bonus_reached: false,
    };
  }

  const successfulReferrals = referrer.successful_referrals_count;
  const bonusMultiplier = Math.min(successfulReferrals, MAX_BONUS_MULTIPLIER) * BONUS_PER_REFERRAL;
  const totalMultiplier = BASE_MULTIPLIER + bonusMultiplier;

  return {
    base_multiplier: BASE_MULTIPLIER,
    bonus_multiplier: bonusMultiplier,
    total_multiplier: totalMultiplier,
    successful_referrals: successfulReferrals,
    max_bonus_reached: successfulReferrals >= MAX_BONUS_MULTIPLIER,
  };
};

// ============================================================================
// GET REFERRER DATA
// ============================================================================

export const getReferrerData: GetReferrerDataFunction = async (
  wallet: string
): Promise<ReferrerData> => {
  await new Promise(resolve => setTimeout(resolve, 200));

  const referrer = referrerStore.get(wallet);
  if (!referrer) {
    return {
      wallet_address: wallet,
      affiliate_id: null,
      validated: false,
      validated_at: null,
      successful_referrals_count: 0,
      allocation_multiplier: null,
    };
  }

  const allocationMultiplier = await calculateAllocationMultiplier(wallet);

  return {
    wallet_address: referrer.wallet_address,
    affiliate_id: referrer.affiliate_id,
    validated: referrer.validated,
    validated_at: referrer.validated_at,
    successful_referrals_count: referrer.successful_referrals_count,
    allocation_multiplier: allocationMultiplier,
  };
};

// ============================================================================
// GET REFERRALS
// ============================================================================

export const getReferrals: GetReferralsFunction = async (
  referrer_wallet: string
): Promise<ReferralMapping[]> => {
  await new Promise(resolve => setTimeout(resolve, 200));

  const referrals: ReferralMapping[] = [];
  for (const mapping of referralMappingStore.values()) {
    if (mapping.referrer_wallet === referrer_wallet) {
      referrals.push({
        affiliate_id: mapping.affiliate_id,
        referrer_wallet: mapping.referrer_wallet,
        referred_wallet: mapping.referred_wallet,
        referred_validated: mapping.referred_validated,
        validated_at: mapping.validated_at,
      });
    }
  }

  return referrals;
};
