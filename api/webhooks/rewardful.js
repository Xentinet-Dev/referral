/**
 * REWARDFUL WEBHOOK HANDLER (VERCEL SERVERLESS)
 * 
 * CRITICAL: Rewardful is the source of truth for referral completion.
 * A referral is ONLY considered successful when Rewardful confirms it via webhook.
 * Frontend must never decide referral success.
 * 
 * This is a Vercel serverless function that handles Rewardful webhooks.
 * 
 * MVP Storage: In-memory Maps/Sets (NOT persistent across serverless invocations)
 * TODO: Move to persistent DB/Redis before production
 * 
 * IMPORTANT: In serverless environment, in-memory storage resets between invocations.
 * For production, must use external database/Redis for persistence.
 */

// In-memory storage for processed referral IDs (idempotency)
// TODO: Move to Redis/DB with TTL before production
// NOTE: In serverless, this resets between cold starts - MUST use external storage in production
const processedReferralIds = new Set();

// In-memory storage for wallet referral counts
// TODO: Move to persistent DB before production
// NOTE: In serverless, this resets between cold starts - MUST use external storage in production
const walletReferralCounts = new Map(); // wallet → count

// Constants
const BASE_MULTIPLIER = 2; // Base allocation multiplier
const MAX_BONUS_MULTIPLIER = 3; // Maximum bonus referrals
const BONUS_PER_REFERRAL = 1; // Each referral adds 1× bonus

/**
 * Get affiliate → wallet mapping
 * 
 * CRITICAL: In serverless environment, we cannot use in-memory storage from other functions.
 * This MUST query a database or external storage.
 * 
 * For MVP: We'll query Rewardful API to get affiliate metadata containing wallet addresses.
 * In production: Query database directly.
 */
async function getAffiliateWalletMap() {
  const map = new Map();
  
  // Get Rewardful API Secret from environment
  const rewardfulApiSecret = process.env.REWARDFUL_SECRET || process.env.REWARDFUL_API_SECRET;
  if (!rewardfulApiSecret) {
    console.warn('[WEBHOOK] REWARDFUL_SECRET not configured - cannot query affiliate mappings');
    return map;
  }

  try {
    // Query Rewardful API for affiliates
    // In production, this should be cached or queried from database
    const response = await fetch('https://api.getrewardful.com/v1/affiliates', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${rewardfulApiSecret}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      // Rewardful returns array of affiliates
      if (Array.isArray(data)) {
        for (const affiliate of data) {
          // Extract wallet from metadata
          if (affiliate.metadata?.wallet && affiliate.id) {
            map.set(affiliate.id, affiliate.metadata.wallet);
          }
        }
        console.log('[WEBHOOK] Loaded affiliate mappings', {
          count: map.size,
        });
      } else if (data.affiliates && Array.isArray(data.affiliates)) {
        // Handle paginated response
        for (const affiliate of data.affiliates) {
          if (affiliate.metadata?.wallet && affiliate.id) {
            map.set(affiliate.id, affiliate.metadata.wallet);
          }
        }
        console.log('[WEBHOOK] Loaded affiliate mappings', {
          count: map.size,
        });
      }
    } else {
      console.error('[WEBHOOK] Failed to query Rewardful API for affiliates', {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.error('[WEBHOOK] Error querying affiliate mappings', {
      error: error.message,
    });
  }

  // TODO: In production, query database instead:
  // SELECT affiliate_id, wallet_address FROM affiliates;
  
  return map;
}

/**
 * Check if referral ID has already been processed (idempotency)
 * 
 * @param {string} referralId - Rewardful referral ID
 * @returns {boolean} - True if already processed
 */
function isReferralProcessed(referralId) {
  return processedReferralIds.has(referralId);
}

/**
 * Mark referral as processed (idempotency)
 * 
 * @param {string} referralId - Rewardful referral ID
 */
function markReferralProcessed(referralId) {
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
function getReferralCount(wallet) {
  return walletReferralCounts.get(wallet) || 0;
}

/**
 * Increment successful referral count for a wallet
 * Enforces maximum of 3 referrals
 * 
 * @param {string} wallet - Wallet address
 * @returns {{success: boolean, newCount: number, capped: boolean}}
 */
function incrementReferralCount(wallet) {
  const currentCount = getReferralCount(wallet);
  
  // Enforce maximum of 3 referrals
  if (currentCount >= MAX_BONUS_MULTIPLIER) {
    console.log('[REFERRAL-LIMIT-REACHED]', {
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
 * Rules (STRICT):
 * - Base: 2× (all validated holders)
 * - Bonus: min(successful_referrals, 3) × 1 (1× per referral, max 3×)
 * - Total: min(base + bonus, 3×) (hard cap at 3× total)
 * 
 * @param {string} wallet - Wallet address
 * @returns {{base: number, bonus: number, total: number, referrals: number}}
 */
function calculateAllocationMultiplier(wallet) {
  const successfulReferrals = getReferralCount(wallet);
  const bonus = Math.min(successfulReferrals, MAX_BONUS_MULTIPLIER) * BONUS_PER_REFERRAL;
  // CRITICAL: Total is capped at 3× (base 2× + max bonus 1× = 3× total)
  const total = Math.min(BASE_MULTIPLIER + bonus, 3);

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
 * @param {Map} affiliateWalletMap - Map of affiliate_id → wallet_address
 * @returns {{success: boolean, wallet?: string, error?: string}}
 */
function handleReferralConverted(payload, affiliateWalletMap) {
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
      console.log('[REFERRAL-IGNORED-DUPLICATE]', {
        referralId,
        affiliateId,
        reason: 'Already processed',
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
      console.log('[REFERRAL-LIMIT-REACHED]', {
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
 * Vercel serverless function handler
 * 
 * Handles Rewardful webhook events.
 * Only processes referral.converted events.
 * Logs sale.created but does not process.
 * Ignores all other events.
 */
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    console.warn('[WEBHOOK] Invalid method', {
      method: req.method,
      allowed: 'POST',
    });
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Only POST is supported.',
    });
  }

  try {
    // Log entire payload for debugging
    console.log('[WEBHOOK] Raw payload received', {
      headers: req.headers,
      body: JSON.stringify(req.body),
      timestamp: new Date().toISOString(),
    });

    const payload = req.body;
    const event = payload.event || payload.type;

    console.log('[WEBHOOK] Received webhook', {
      event,
      payloadKeys: Object.keys(payload),
      timestamp: new Date().toISOString(),
    });

    // Get affiliate → wallet mapping
    // TODO: In production, this should query a database
    const affiliateWalletMap = await getAffiliateWalletMap();

    // Only process referral.converted
    if (event === 'referral.converted') {
      const result = handleReferralConverted(payload, affiliateWalletMap);
      
      // Always return 200 to Rewardful (prevents retries)
      return res.status(200).json({
        success: true,
        event: 'referral.converted',
        processed: result.success,
        message: result.message || 'Referral processed',
      });
    }

    // Log sale.created but don't process
    if (event === 'sale.created') {
      console.log('[WEBHOOK] sale.created event (logged only)', {
        sale_id: payload.sale?.id,
        affiliate_id: payload.affiliate?.id,
        amount: payload.amount,
      });
      return res.status(200).json({
        success: true,
        event: 'sale.created',
        processed: false,
        message: 'Logged but not processed',
      });
    }

    // Ignore all other events
    console.log('[WEBHOOK] Ignoring event', {
      event,
      reason: 'Not referral.converted or sale.created',
    });

    return res.status(200).json({
      success: true,
      event,
      processed: false,
      message: 'Event ignored',
    });
  } catch (error) {
    // NEVER throw uncaught errors - always return 200 to Rewardful
    console.error('[WEBHOOK] Unhandled error', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    
    // Always return 200 to prevent Rewardful retries
    return res.status(200).json({
      success: false,
      error: 'Webhook processing error',
      message: 'Error logged but not retried',
    });
  }
}
