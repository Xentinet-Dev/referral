/**
 * GET REFERRAL PROGRESS (VERCEL SERVERLESS)
 * 
 * Frontend reads referral progress from this endpoint only.
 * CRITICAL: Frontend must never calculate or modify referral counts.
 * 
 * Storage: Supabase Postgres (rewardful_conversions table)
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[REFERRAL-PROGRESS] Missing Supabase configuration');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Constants
const BASE_MULTIPLIER = 2;
const MAX_BONUS_MULTIPLIER = 3;
const BONUS_PER_REFERRAL = 1;

/**
 * Get current successful referral count for a wallet from Supabase
 * Counts referrals where this wallet is the referrer
 */
async function getReferralCount(wallet) {
  if (!supabase) {
    return 0;
  }

  try {
    // Count referrals where this wallet is the referrer
    const { count, error } = await supabase
      .from('referrals')
      .select('referee_wallet', { count: 'exact', head: true })
      .eq('referrer_wallet', wallet);

    if (error) {
      console.error('[REFERRAL-PROGRESS] Error getting referral count', {
        wallet: wallet.slice(0, 8) + '...',
        error: error.message,
      });
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('[REFERRAL-PROGRESS] Error getting referral count', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
    });
    return 0;
  }
}

/**
 * Calculate allocation multiplier for a wallet
 */
async function calculateAllocationMultiplier(wallet) {
  const successfulReferrals = await getReferralCount(wallet);
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

    // Query referral count from Supabase
    const count = await getReferralCount(wallet);
    const multiplier = await calculateAllocationMultiplier(wallet);

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
