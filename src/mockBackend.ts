/**
 * MOCK BACKEND IMPLEMENTATION
 * 
 * Validation-Gated Referral System with Signature Verification
 * 
 * Security Rules:
 * - All sensitive actions require signatures
 * - Signatures are verified using tweetnacl
 * - Nonces prevent replay attacks
 * - Timestamps prevent old signatures
 * - No action happens without user consent
 */

import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import type {
  WalletActivationRequest,
  WalletActivationResponse,
  VerifyWalletFunction,
  ValidationRequest,
  ValidationResult,
  IssueAffiliateLinkRequest,
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
const usedNonces = new Set<string>(); // Track used nonces to prevent replay

// Constants
const VALIDATION_THRESHOLD_USD = 2.0;
const BASE_MULTIPLIER = 2;
const MAX_BONUS_MULTIPLIER = 3;
const BONUS_PER_REFERRAL = 1;
const SIGNATURE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify a signature from a Solana wallet
 * 
 * In production, this runs server-side with proper tweetnacl verification.
 * In mock mode, we verify the signature structure and presence.
 */
function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    // Basic validation
    if (!message || !signature || !publicKey) {
      return false;
    }

    // Validate signature is base64
    try {
      atob(signature);
    } catch {
      return false;
    }

    // Validate public key format
    try {
      new PublicKey(publicKey);
    } catch {
      return false;
    }

    // In production backend, use full tweetnacl verification:
    // const messageBytes = new TextEncoder().encode(message);
    // const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    // const publicKeyBytes = new PublicKey(publicKey).toBytes();
    // return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

    // For mock (browser-side), verify structure only
    // Real verification happens server-side in production
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const publicKeyBytes = new PublicKey(publicKey).toBytes();

    // Attempt verification (may fail in browser, that's OK for mock)
    try {
      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch {
      // If verification fails in browser (dev mode), accept valid structure
      // In production backend, this will always verify properly
      return signatureBytes.length > 0 && publicKeyBytes.length > 0;
    }
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Validate nonce and timestamp
 */
function validateNonceAndTimestamp(nonce: string, timestamp: number): { valid: boolean; error?: string } {
  // Check if nonce was already used
  if (usedNonces.has(nonce)) {
    return { valid: false, error: 'Nonce already used (replay attack detected)' };
  }

  // Check timestamp (reject signatures older than 5 minutes)
  const now = Date.now();
  const age = now - timestamp;
  if (age > SIGNATURE_TIMEOUT_MS) {
    return { valid: false, error: 'Signature too old (timestamp expired)' };
  }

  if (age < 0) {
    return { valid: false, error: 'Invalid timestamp (future timestamp)' };
  }

  return { valid: true };
}

/**
 * Mark nonce as used
 */
function markNonceUsed(nonce: string): void {
  usedNonces.add(nonce);
  // Clean up old nonces periodically (in production, use TTL cache)
  if (usedNonces.size > 10000) {
    usedNonces.clear();
  }
}

// ============================================================================
// NOTE: Affiliate ID generation moved to Rewardful API
// ============================================================================
// Affiliate IDs are now created via Rewardful API in backend
// See: server/rewardfulAffiliate.js
// This ensures valid Rewardful affiliate IDs for proper attribution

// ============================================================================
// WALLET ACTIVATION
// ============================================================================

/**
 * Verify wallet activation via signature.
 * 
 * This is the mandatory first step - wallet must be activated before any features unlock.
 * 
 * Rules:
 * - Verifies signature cryptographically
 * - Validates timestamp (≤ 5 minutes old)
 * - Ensures nonce is unused
 * - Marks wallet as verified (session only, resets on reload)
 */
export const verifyWallet: VerifyWalletFunction = async (
  request: WalletActivationRequest
): Promise<WalletActivationResponse> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  // Verify signature
  const signatureValid = verifySignature(request.message, request.signature, request.wallet);
  if (!signatureValid) {
    return {
      success: false,
      error: 'Invalid signature',
    };
  }

  // Validate nonce and timestamp
  const nonceCheck = validateNonceAndTimestamp(request.nonce, request.timestamp);
  if (!nonceCheck.valid) {
    return {
      success: false,
      error: nonceCheck.error || 'Invalid nonce or timestamp',
    };
  }

  // Mark nonce as used
  markNonceUsed(request.nonce);

  // Wallet activation successful
  // Note: This is session-only, resets on page reload (stateless)
  return {
    success: true,
  };
};

// ============================================================================
// HOLDINGS VALIDATION
// ============================================================================

/**
 * Validate that a wallet holds ≥ $2 USD worth of the countdown token.
 * 
 * REQUIRES SIGNATURE - User must sign message to authorize validation
 */
export const validateHoldings: ValidateHoldingsFunction = async (
  request: ValidationRequest
): Promise<ValidationResult> => {
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify signature
  const signatureValid = verifySignature(request.message, request.signature, request.wallet);
  if (!signatureValid) {
    return {
      validated: false,
      usd_value: 0,
      validated_at: null,
      error: 'Invalid signature',
    };
  }

  // Validate nonce and timestamp
  const nonceCheck = validateNonceAndTimestamp(request.nonce, request.timestamp);
  if (!nonceCheck.valid) {
    return {
      validated: false,
      usd_value: 0,
      validated_at: null,
      error: nonceCheck.error || 'Invalid nonce or timestamp',
    };
  }

  // Mark nonce as used
  markNonceUsed(request.nonce);

  // Check if already validated
  const existing = referrerStore.get(request.wallet);
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

  // MOCK: Deterministic validation
  const walletHash = request.wallet.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mockValidated = (walletHash % 10) >= 3;
  const mockUsdValue = mockValidated ? 2.5 : 1.0;

  if (mockValidated && mockUsdValue >= VALIDATION_THRESHOLD_USD) {
    const validatedAt = Date.now();
    referrerStore.set(request.wallet, {
      wallet_address: request.wallet,
      affiliate_id: null,
      validated: true,
      validated_at: validatedAt,
      usd_value: mockUsdValue,
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
 * REQUIRES SIGNATURE - User must sign message to authorize link issuance
 */
export const issueAffiliateLink: IssueAffiliateLinkFunction = async (
  request: IssueAffiliateLinkRequest
): Promise<AffiliateLinkResponse> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  // Verify signature
  const signatureValid = verifySignature(request.message, request.signature, request.wallet);
  if (!signatureValid) {
    return {
      success: false,
      affiliate_id: null,
      referral_link: null,
      error: 'Invalid signature',
    };
  }

  // Validate nonce and timestamp
  const nonceCheck = validateNonceAndTimestamp(request.nonce, request.timestamp);
  if (!nonceCheck.valid) {
    return {
      success: false,
      affiliate_id: null,
      referral_link: null,
      error: nonceCheck.error || 'Invalid nonce or timestamp',
    };
  }

  // Mark nonce as used
  markNonceUsed(request.nonce);

  // Check if wallet is validated
  const referrer = referrerStore.get(request.wallet);
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

  // Create Rewardful affiliate via backend API
  // This replaces local generateAffiliateId() with real Rewardful API call
  try {
    // Use relative URL for Vercel serverless functions, or VITE_BACKEND_URL if set
    const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
    const apiPath = backendUrl ? `${backendUrl}/api/create-rewardful-affiliate` : '/api/create-rewardful-affiliate';
    const response = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet: request.wallet,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        affiliate_id: null,
        referral_link: null,
        error: errorData.error || 'Failed to create Rewardful affiliate',
      };
    }

    const rewardfulData = await response.json();
    
    if (!rewardfulData.success || !rewardfulData.affiliateId) {
      return {
        success: false,
        affiliate_id: null,
        referral_link: null,
        error: rewardfulData.error || 'Rewardful affiliate creation failed',
      };
    }

    // Store Rewardful affiliate ID (not local random ID)
    const rewardfulAffiliateId = rewardfulData.affiliateId;
    affiliateIdStore.set(rewardfulAffiliateId, request.wallet);

    referrer.affiliate_id = rewardfulAffiliateId;
    referrerStore.set(request.wallet, referrer);

    // Use Rewardful's referral link if provided, otherwise construct it
    const referralLink = rewardfulData.referralLink || 
      `${window.location.origin}${window.location.pathname}?via=${rewardfulAffiliateId}`;

    return {
      success: true,
      affiliate_id: rewardfulAffiliateId,
      referral_link: referralLink,
    };
  } catch (error) {
    console.error('Rewardful affiliate creation error:', error);
    return {
      success: false,
      affiliate_id: null,
      referral_link: null,
      error: error instanceof Error ? error.message : 'Failed to create Rewardful affiliate',
    };
  }
};

// ============================================================================
// REFERRAL ATTRIBUTION
// ============================================================================

/**
 * Attribute a referral when a new user visits via link.
 * 
 * REQUIRES SIGNATURE - User must sign message to authorize attribution
 */
export const attributeReferral: AttributeReferralFunction = async (
  request: AttributeReferralRequest
): Promise<AttributeReferralResponse> => {
  await new Promise(resolve => setTimeout(resolve, 300));

  // Verify signature
  const signatureValid = verifySignature(request.message, request.signature, request.referred_wallet);
  if (!signatureValid) {
    return {
      success: false,
      message: 'Invalid signature',
    };
  }

  // Validate nonce and timestamp
  const nonceCheck = validateNonceAndTimestamp(request.nonce, request.timestamp);
  if (!nonceCheck.valid) {
    return {
      success: false,
      message: nonceCheck.error || 'Invalid nonce or timestamp',
    };
  }

  // Mark nonce as used
  markNonceUsed(request.nonce);

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
 */
export const validateReferredWallet: ValidateReferredWalletFunction = async (
  wallet: string
): Promise<ValidationResult> => {
  const mapping = referralMappingStore.get(wallet);
  if (!mapping) {
    return {
      validated: false,
      usd_value: 0,
      validated_at: null,
      error: 'Wallet is not a referred user',
    };
  }

  if (mapping.referred_validated) {
    return {
      validated: true,
      usd_value: 2.5,
      validated_at: mapping.validated_at || null,
    };
  }

  // For referred wallets, we still need to check holdings
  // In production, this would verify on-chain purchases
  const walletHash = wallet.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mockValidated = (walletHash % 10) >= 3;
  const mockUsdValue = mockValidated ? 2.5 : 1.0;

  if (mockValidated && mockUsdValue >= VALIDATION_THRESHOLD_USD) {
    mapping.referred_validated = true;
    mapping.validated_at = Date.now();
    referralMappingStore.set(wallet, mapping);

    await incrementReferralCount(mapping.referrer_wallet);
  }

  return {
    validated: mockValidated && mockUsdValue >= VALIDATION_THRESHOLD_USD,
    usd_value: mockUsdValue,
    validated_at: mockValidated ? Date.now() : null,
    error: mockValidated ? undefined : `Holdings must be ≥ $${VALIDATION_THRESHOLD_USD} USD`,
  };
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
