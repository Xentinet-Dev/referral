/**
 * GET REFERRAL PROGRESS (VERCEL SERVERLESS)
 * 
 * Frontend reads referral progress from this endpoint only.
 * CRITICAL: Frontend must never calculate or modify referral counts.
 * 
 * This endpoint returns the current referral count and allocation multiplier
 * for a wallet, as determined by Rewardful webhooks.
 * 
 * IMPORTANT: In serverless environment, in-memory storage is NOT shared between
 * function invocations. This MUST use a database in production.
 */

// In-memory storage (NOT shared with webhook handler in serverless)
// TODO: In production, query from database (same DB as webhook handler)
const walletReferralCounts = new Map(); // wallet → count

// Constants
const BASE_MULTIPLIER = 2;
const MAX_BONUS_MULTIPLIER = 3;
const BONUS_PER_REFERRAL = 1;

/**
 * Get current successful referral count for a wallet
 */
function getReferralCount(wallet) {
  return walletReferralCounts.get(wallet) || 0;
}

/**
 * Calculate allocation multiplier for a wallet
 */
function calculateAllocationMultiplier(wallet) {
  const successfulReferrals = getReferralCount(wallet);
  const bonus = Math.min(successfulReferrals, MAX_BONUS_MULTIPLIER) * BONUS_PER_REFERRAL;
  const total = Math.min(BASE_MULTIPLIER + bonus, 3);

  return {
    base: BASE_MULTIPLIER,
    bonus,
    total,
    referrals: successfulReferrals,
  };
}

/**
 * Vercel serverless function handler
 */
export default async function handler(req, res) {
  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Only GET is supported.',
    });
  }

  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({
        success: false,
        error: 'wallet parameter is required',
      });
    }

    console.log('[REFERRAL-PROGRESS] Request', {
      wallet: wallet.slice(0, 8) + '...',
    });

    // TODO: In production, query from database instead of in-memory Map
    const count = getReferralCount(wallet);
    const multiplier = calculateAllocationMultiplier(wallet);

    console.log('[REFERRAL-PROGRESS] Response', {
      wallet: wallet.slice(0, 8) + '...',
      count,
      multiplier: multiplier.total + 'x',
    });

    return res.status(200).json({
      success: true,
      wallet,
      successful_referrals: count,
      max_referrals: 3,
      allocation_multiplier: {
        base: multiplier.base,
        bonus: multiplier.bonus,
        total: multiplier.total,
        referrals: multiplier.referrals,
        max_bonus_reached: multiplier.referrals >= 3,
      },
    });
  } catch (error) {
    console.error('[REFERRAL-PROGRESS] Error', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
