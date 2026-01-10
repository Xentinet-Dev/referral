/**
 * REWARDFUL WEBHOOK HANDLER (VERCEL SERVERLESS)
 * 
 * CRITICAL: Rewardful is the source of truth for referral completion.
 * A referral is ONLY considered successful when Rewardful confirms it via webhook.
 * Frontend must never decide referral success.
 * 
 * Storage: Supabase Postgres (rewardful_conversions table)
 * 
 * TEMPORARY: SOL-based eligibility check for referral system testing
 * Will be replaced with token-mint verification after launch
 */

import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[WEBHOOK] Missing Supabase configuration');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Constants
const BASE_MULTIPLIER = 2; // Base allocation multiplier
const MAX_BONUS_MULTIPLIER = 3; // Maximum bonus referrals
const BONUS_PER_REFERRAL = 1; // Each referral adds 1× bonus

// TEMPORARY: SOL-based eligibility (for testing only)
const SOL_USD_PRICE = 100; // mock, temporary
const MIN_ELIGIBILITY_USD = 2; // Minimum $2 USD worth of SOL
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'; // Mainnet RPC

/**
 * TEMPORARY: Check if wallet has minimum SOL balance (≥ $2 USD)
 * Will be replaced with token-mint verification after launch
 */
async function hasMinimumSol(wallet) {
  try {
    console.log('[SOL-ELIGIBILITY-CHECK]', {
      wallet: wallet.slice(0, 8) + '...',
    });

    // Validate wallet address
    let publicKey;
    try {
      publicKey = new PublicKey(wallet);
    } catch (error) {
      console.error('[SOL-ELIGIBILITY-CHECK] Invalid wallet address', {
        wallet: wallet.slice(0, 8) + '...',
        error: error.message,
      });
      return false;
    }

    // Connect to Solana RPC
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    // Fetch SOL balance
    const balanceLamports = await connection.getBalance(publicKey);
    const balanceSol = balanceLamports / 1e9; // Convert lamports to SOL
    const usdValue = balanceSol * SOL_USD_PRICE;

    console.log('[SOL-ELIGIBILITY-CHECK]', {
      wallet: wallet.slice(0, 8) + '...',
      sol_balance: balanceSol.toFixed(4),
      usd_value: usdValue.toFixed(2),
      minimum_required: MIN_ELIGIBILITY_USD,
    });

    const eligible = usdValue >= MIN_ELIGIBILITY_USD;

    if (eligible) {
      console.log('[SOL-ELIGIBLE]', {
        wallet: wallet.slice(0, 8) + '...',
        sol_balance: balanceSol.toFixed(4),
        usd_value: usdValue.toFixed(2),
      });
    } else {
      console.log('[SOL-INELIGIBLE]', {
        wallet: wallet.slice(0, 8) + '...',
        sol_balance: balanceSol.toFixed(4),
        usd_value: usdValue.toFixed(2),
        minimum_required: MIN_ELIGIBILITY_USD,
      });
    }

    return eligible;
  } catch (error) {
    console.error('[SOL-ELIGIBILITY-CHECK] Error checking SOL balance', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
    });
    // On error, fail closed (don't allow referral)
    return false;
  }
}

/**
 * Get affiliate → wallet mapping from Supabase
 */
async function getAffiliateWalletMap() {
  const map = new Map();
  
  if (!supabase) {
    console.warn('[WEBHOOK] Supabase not configured, cannot query affiliate mappings');
    return map;
  }

  try {
    const { data, error } = await supabase
      .from('wallet_affiliates')
      .select('affiliate_id, wallet');

    if (error) {
      console.error('[WEBHOOK] Error querying affiliate mappings from Supabase', {
        error: error.message,
      });
      return map;
    }

    if (data) {
      for (const row of data) {
        map.set(row.affiliate_id, row.wallet);
      }
      console.log('[WEBHOOK] Loaded affiliate mappings from Supabase', {
        count: map.size,
      });
    }
  } catch (error) {
    console.error('[WEBHOOK] Error querying affiliate mappings', {
      error: error.message,
    });
  }

  return map;
}

/**
 * Check if referral ID has already been processed (idempotency) - query Supabase
 */
async function isReferralProcessed(referralId) {
  if (!supabase) {
    console.warn('[WEBHOOK] Supabase not configured, cannot check idempotency');
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('rewardful_conversions')
      .select('referral_id')
      .eq('referral_id', referralId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[WEBHOOK] Error checking referral idempotency', {
        referralId,
        error: error.message,
      });
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('[WEBHOOK] Error checking idempotency', {
      referralId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get current successful referral count for a wallet from Supabase
 */
async function getReferralCount(wallet) {
  if (!supabase) {
    return 0;
  }

  try {
    // Count distinct referral_ids for this wallet
    const { count, error } = await supabase
      .from('rewardful_conversions')
      .select('referral_id', { count: 'exact', head: true })
      .eq('wallet', wallet);

    if (error) {
      console.error('[WEBHOOK] Error getting referral count', {
        wallet: wallet.slice(0, 8) + '...',
        error: error.message,
      });
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('[WEBHOOK] Error getting referral count', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
    });
    return 0;
  }
}

/**
 * Increment successful referral count for a wallet
 * Enforces maximum of 3 referrals
 * Stores conversion in Supabase
 */
async function incrementReferralCount(wallet, referralId, affiliateId, convertedAt) {
  // Get current count
  const currentCount = await getReferralCount(wallet);
  
  // Enforce maximum of 3 referrals
  if (currentCount >= MAX_BONUS_MULTIPLIER) {
    console.log('[REFERRAL-LIMIT-REACHED]', {
      wallet: wallet.slice(0, 8) + '...',
      currentCount,
      max: MAX_BONUS_MULTIPLIER,
    });
    
    // Still store the conversion for idempotency, but don't increment
    if (supabase) {
      try {
        await supabase
          .from('rewardful_conversions')
          .upsert({
            referral_id: referralId,
            wallet: wallet,
            affiliate_id: affiliateId,
            converted_at: convertedAt,
          }, {
            onConflict: 'referral_id',
          });
      } catch (error) {
        console.error('[WEBHOOK] Error storing capped conversion', {
          error: error.message,
        });
      }
    }
    
    return {
      success: false,
      newCount: currentCount,
      capped: true,
    };
  }

  const newCount = currentCount + 1;

  // Store conversion in Supabase
  if (supabase) {
    try {
      const { error } = await supabase
        .from('rewardful_conversions')
        .upsert({
          referral_id: referralId,
          wallet: wallet,
          affiliate_id: affiliateId,
          converted_at: convertedAt,
        }, {
          onConflict: 'referral_id',
        });

      if (error) {
        console.error('[WEBHOOK] Error storing conversion', {
          wallet: wallet.slice(0, 8) + '...',
          referralId,
          error: error.message,
        });
        throw error;
      }
    } catch (error) {
      console.error('[WEBHOOK] Failed to store conversion', {
        wallet: wallet.slice(0, 8) + '...',
        error: error.message,
      });
      throw error;
    }
  }
  
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
 */
async function calculateAllocationMultiplier(wallet) {
  const successfulReferrals = await getReferralCount(wallet);
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
 */
async function handleReferralConverted(payload, affiliateWalletMap) {
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

    // Check idempotency (don't process same referral twice) - query Supabase
    const alreadyProcessed = await isReferralProcessed(referralId);
    if (alreadyProcessed) {
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

    // Resolve affiliate_id → wallet from Supabase (this is the referrer)
    const referrerWallet = affiliateWalletMap.get(affiliateId);
    if (!referrerWallet) {
      console.error('[WEBHOOK] Affiliate ID not found in mapping', {
        affiliateId,
        availableAffiliates: Array.from(affiliateWalletMap.keys()).slice(0, 5),
      });
      return {
        success: false,
        error: `Affiliate ID ${affiliateId} not found in wallet mapping`,
      };
    }

    // TEMPORARY: Get referred wallet from webhook payload
    // Strict candidate-resolution guard: exactly one wallet must be resolved
    const referredWalletCandidates = [
      payload.customer?.metadata?.wallet,
      payload.customer?.wallet,
      payload.referral?.customer?.metadata?.wallet,
      payload.referral?.customer?.wallet,
      payload.referral?.metadata?.referred_wallet,
      payload.referral?.metadata?.wallet,
      payload.sale?.customer?.metadata?.wallet,
      payload.sale?.customer?.wallet,
      payload.metadata?.referred_wallet,
      payload.metadata?.wallet,
    ].filter(Boolean);

    const uniqueReferredWallets = [...new Set(referredWalletCandidates)];

    if (uniqueReferredWallets.length !== 1) {
      console.error('[WEBHOOK] Referred wallet ambiguous or missing', {
        candidates: referredWalletCandidates.map(w => w?.slice(0, 8) + '...'),
        uniqueCount: uniqueReferredWallets.length,
        payloadKeys: Object.keys(payload),
      });
      return {
        success: false,
        error: 'Referred wallet ambiguous or missing in webhook payload',
      };
    }

    const referredWallet = uniqueReferredWallets[0];

    // TEMPORARY: Check SOL eligibility of referred wallet before counting referral
    const isEligible = await hasMinimumSol(referredWallet);
    if (!isEligible) {
      console.log('[REFERRAL-INELIGIBLE-SOL]', {
        referred_wallet: referredWallet.slice(0, 8) + '...',
        referrer_wallet: referrerWallet.slice(0, 8) + '...',
        affiliate_id: affiliateId,
        referral_id: referralId,
        reason: 'Referred wallet does not hold ≥ $2 worth of SOL',
      });
      
      // Store conversion for idempotency but don't increment count
      if (supabase) {
        try {
          await supabase
            .from('rewardful_conversions')
            .upsert({
              referral_id: referralId,
              wallet: referrerWallet,
              affiliate_id: affiliateId,
              converted_at: convertedAt,
            }, {
              onConflict: 'referral_id',
            });
        } catch (error) {
          console.error('[WEBHOOK] Error storing ineligible conversion', {
            error: error.message,
          });
        }
      }
      
      return {
        success: true,
        eligible: false,
        message: 'Referral converted but referred wallet does not meet SOL eligibility requirement',
      };
    }

    // Increment referral count (enforces max 3) - stores in Supabase
    const incrementResult = await incrementReferralCount(referrerWallet, referralId, affiliateId, convertedAt);
    
    if (!incrementResult.success && incrementResult.capped) {
      console.log('[REFERRAL-LIMIT-REACHED]', {
        wallet: referrerWallet.slice(0, 8) + '...',
        currentCount: incrementResult.newCount,
      });
      return {
        success: true,
        capped: true,
        message: 'Referral count already at maximum (3)',
      };
    }

    // Calculate new allocation multiplier
    const multiplier = await calculateAllocationMultiplier(referrerWallet);

    console.log('[REFERRAL-COMPLETED]', {
      wallet: referrerWallet.slice(0, 8) + '...',
      referred_wallet: referredWallet.slice(0, 8) + '...',
      successful_referrals: `${multiplier.referrals}/${MAX_BONUS_MULTIPLIER}`,
      allocation_multiplier: `${multiplier.total}x`,
    });

    return {
      success: true,
      wallet: referrerWallet,
      referredWallet,
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

    // Get affiliate → wallet mapping from Supabase
    const affiliateWalletMap = await getAffiliateWalletMap();

    // Only process referral.converted
    if (event === 'referral.converted') {
      const result = await handleReferralConverted(payload, affiliateWalletMap);
      
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
