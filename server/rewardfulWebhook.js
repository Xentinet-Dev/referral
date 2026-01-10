/**
 * REWARDFUL WEBHOOK HANDLER
 * 
 * CRITICAL: Rewardful is the source of truth for referral completion.
 * A referral is ONLY considered successful when Rewardful confirms it via webhook.
 * Frontend must never decide referral success.
 * 
 * MVP Storage: In-memory Maps/Sets (resets on server restart)
 * TODO: Move to persistent DB/Redis before production
 */

// In-memory storage for processed referral IDs (idempotency)
// TODO: Move to Redis/DB with TTL before production
const processedReferralIds = new Set();

// In-memory storage for wallet referral counts
// TODO: Move to persistent DB before production
// NOTE: This resets on server restart - must be persistent in production
const walletReferralCounts = new Map(); // wallet → count

/**
 * Get referral progress for a wallet (for API endpoints)
 * 
 * @param {string} wallet - Wallet address
 * @returns {{count: number, multiplier: Object}}
 */
export function getWalletReferralProgress(wallet) {
  const count = getReferralCount(wallet);
  const multiplier = calculateAllocationMultiplier(wallet);
  return {
    count,
    multiplier,
  };
}

// Constants
const BASE_MULTIPLIER = 2; // Base allocation multiplier
const MAX_BONUS_MULTIPLIER = 3; // Maximum bonus referrals
const BONUS_PER_REFERRAL = 1; // Each referral adds 1× bonus

/**
 * Check if referral ID has already been processed (idempotency)
 * 
 * @param {string} referralId - Rewardful referral ID
 * @returns {boolean} - True if already processed
 */
export function isReferralProcessed(referralId) {
  return processedReferralIds.has(referralId);
}

/**
 * Mark referral as processed (idempotency)
 * 
 * @param {string} referralId - Rewardful referral ID
 */
export function markReferralProcessed(referralId) {
  processedReferralIds.add(referralId);
  console.log('[WEBHOOK] Referral marked as processed', {
    referralId,
    totalProcessed: processedReferralIds.size,
  });
}

/**
 * Get current successful referral count for a wallet
 * 
 * @param {string} wallet - Wallet address
 * @returns {number} - Current referral count
 */
export function getReferralCount(wallet) {
  return walletReferralCounts.get(wallet) || 0;
}

/**
 * Increment successful referral count for a wallet
 * Enforces maximum of 3 referrals
 * 
 * @param {string} wallet - Wallet address
 * @returns {{success: boolean, newCount: number, capped: boolean}}
 */
export function incrementReferralCount(wallet) {
  const currentCount = getReferralCount(wallet);
  
  // Enforce maximum of 3 referrals
  if (currentCount >= MAX_BONUS_MULTIPLIER) {
    console.log('[WEBHOOK] Referral count already at maximum', {
      wallet: wallet.slice(0, 8) + '...',
      currentCount,
      max: MAX_BONUS_MULTIPLIER,
    });
    return {
      success: false,
      newCount: currentCount,
      capped: true,
    };
  }

  const newCount = currentCount + 1;
  walletReferralCounts.set(wallet, newCount);
  
  console.log('[WEBHOOK] Referral count incremented', {
    wallet: wallet.slice(0, 8) + '...',
    oldCount: currentCount,
    newCount,
    max: MAX_BONUS_MULTIPLIER,
  });

  return {
    success: true,
    newCount,
    capped: newCount >= MAX_BONUS_MULTIPLIER,
  };
}

/**
 * Calculate allocation multiplier for a wallet
 * 
 * Rules:
 * - Base: 2×
 * - Bonus: min(successful_referrals, 3) × 1
 * - Total: min(base + bonus, 3×)
 * 
 * @param {string} wallet - Wallet address
 * @returns {{base: number, bonus: number, total: number, referrals: number}}
 */
export function calculateAllocationMultiplier(wallet) {
  const successfulReferrals = getReferralCount(wallet);
  const bonus = Math.min(successfulReferrals, MAX_BONUS_MULTIPLIER) * BONUS_PER_REFERRAL;
  const total = Math.min(BASE_MULTIPLIER + bonus, 3); // Cap at 3× total

  return {
    base: BASE_MULTIPLIER,
    bonus,
    total,
    referrals: successfulReferrals,
  };
}

/**
 * Handle referral.converted webhook event
 * 
 * This is the ONLY way referrals are marked as successful.
 * 
 * @param {Object} payload - Rewardful webhook payload
 * @param {Object} affiliateWalletMap - Map of affiliate_id → wallet_address
 * @returns {{success: boolean, wallet?: string, error?: string}}
 */
export function handleReferralConverted(payload, affiliateWalletMap) {
  try {
    // Extract required fields
    const affiliateId = payload.affiliate?.id;
    const referralId = payload.referral?.id || payload.id;
    const convertedAt = payload.converted_at || payload.created_at || new Date().toISOString();

    if (!affiliateId) {
      console.error('[WEBHOOK] Missing affiliate.id in payload', {
        payloadKeys: Object.keys(payload),
      });
      return {
        success: false,
        error: 'Missing affiliate.id in webhook payload',
      };
    }

    if (!referralId) {
      console.error('[WEBHOOK] Missing referral.id in payload', {
        payloadKeys: Object.keys(payload),
      });
      return {
        success: false,
        error: 'Missing referral.id in webhook payload',
      };
    }

    console.log('[REWARDFUL-WEBHOOK-RECEIVED]', {
      event: 'referral.converted',
      affiliate_id: affiliateId,
      referral_id: referralId,
      converted_at: convertedAt,
    });

    // Check idempotency (don't process same referral twice)
    if (isReferralProcessed(referralId)) {
      console.log('[WEBHOOK] Referral already processed (idempotency)', {
        referralId,
        affiliateId,
      });
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Referral already processed',
      };
    }

    // Resolve affiliate_id → wallet_address
    const wallet = affiliateWalletMap.get(affiliateId);
    if (!wallet) {
      console.error('[WEBHOOK] Affiliate ID not found in mapping', {
        affiliateId,
        availableAffiliates: Array.from(affiliateWalletMap.keys()).slice(0, 5),
      });
      return {
        success: false,
        error: `Affiliate ID ${affiliateId} not found in wallet mapping`,
      };
    }

    // Increment referral count (enforces max 3)
    const incrementResult = incrementReferralCount(wallet);
    
    if (!incrementResult.success && incrementResult.capped) {
      console.log('[WEBHOOK] Referral count already at maximum', {
        wallet: wallet.slice(0, 8) + '...',
        currentCount: incrementResult.newCount,
      });
      // Still mark as processed to prevent reprocessing
      markReferralProcessed(referralId);
      return {
        success: true,
        capped: true,
        message: 'Referral count already at maximum (3)',
      };
    }

    // Mark referral as processed (idempotency)
    markReferralProcessed(referralId);

    // Calculate new allocation multiplier
    const multiplier = calculateAllocationMultiplier(wallet);

    console.log('[REFERRAL-COMPLETED]', {
      wallet: wallet.slice(0, 8) + '...',
      successful_referrals: `${multiplier.referrals}/${MAX_BONUS_MULTIPLIER}`,
      allocation_multiplier: `${multiplier.total}x`,
    });

    return {
      success: true,
      wallet,
      newCount: incrementResult.newCount,
      multiplier,
    };
  } catch (error) {
    console.error('[WEBHOOK] Error processing referral.converted', {
      error: error.message,
      stack: error.stack,
      payload: JSON.stringify(payload).slice(0, 500),
    });
    return {
      success: false,
      error: error.message || 'Unknown error processing referral',
    };
  }
}

/**
 * Process Rewardful webhook payload
 * 
 * Only processes referral.converted events.
 * Logs sale.created but does not process.
 * Ignores all other events.
 * 
 * @param {Object} payload - Rewardful webhook payload
 * @param {Object} affiliateWalletMap - Map of affiliate_id → wallet_address
 * @returns {{processed: boolean, event?: string, result?: Object}}
 */
export function processWebhook(payload, affiliateWalletMap) {
  const event = payload.event || payload.type;

  console.log('[WEBHOOK] Received webhook', {
    event,
    payloadKeys: Object.keys(payload),
    timestamp: new Date().toISOString(),
  });

  // Only process referral.converted
  if (event === 'referral.converted') {
    const result = handleReferralConverted(payload, affiliateWalletMap);
    return {
      processed: true,
      event: 'referral.converted',
      result,
    };
  }

  // Log sale.created but don't process
  if (event === 'sale.created') {
    console.log('[WEBHOOK] sale.created event (logged only)', {
      sale_id: payload.sale?.id,
      affiliate_id: payload.affiliate?.id,
      amount: payload.amount,
    });
    return {
      processed: false,
      event: 'sale.created',
      message: 'Logged but not processed',
    };
  }

  // Ignore all other events
  console.log('[WEBHOOK] Ignoring event', {
    event,
    reason: 'Not referral.converted or sale.created',
  });

  return {
    processed: false,
    event,
    message: 'Event ignored',
  };
}
