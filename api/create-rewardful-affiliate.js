/**
 * CREATE REWARDFUL AFFILIATE (VERCEL SERVERLESS)
 * 
 * Creates a Rewardful affiliate for a wallet.
 * Only works if wallet is activated (verified signature).
 * 
 * Storage: Supabase Postgres (wallet_affiliates table)
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
  console.error('[CREATE-AFFILIATE] Missing Supabase configuration');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

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
    // On error, fail closed (don't allow affiliate creation)
    return false;
  }
}

async function isWalletActivated(wallet) {
  if (!supabase) {
    console.warn('[CREATE-AFFILIATE] Supabase not configured, cannot check activation');
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('wallet_activation')
      .select('wallet')
      .eq('wallet', wallet)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[CREATE-AFFILIATE] Error checking wallet activation', {
        wallet: wallet.slice(0, 8) + '...',
        error: error.message,
      });
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('[CREATE-AFFILIATE] Error checking activation', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
    });
    return false;
  }
}

async function getAffiliateId(wallet) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('wallet_affiliates')
      .select('affiliate_id')
      .eq('wallet', wallet)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[CREATE-AFFILIATE] Error getting affiliate ID', {
        wallet: wallet.slice(0, 8) + '...',
        error: error.message,
      });
      return null;
    }

    return data?.affiliate_id || null;
  } catch (error) {
    console.error('[CREATE-AFFILIATE] Error getting affiliate', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
    });
    return null;
  }
}

async function storeAffiliateMapping(wallet, affiliateId) {
  if (!supabase) {
    console.error('[CREATE-AFFILIATE] Supabase not configured, cannot store mapping');
    return;
  }

  try {
    const { error } = await supabase
      .from('wallet_affiliates')
      .upsert({
        wallet: wallet,
        affiliate_id: affiliateId,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'wallet',
      });

    if (error) {
      console.error('[CREATE-AFFILIATE] Error storing affiliate mapping', {
        wallet: wallet.slice(0, 8) + '...',
        affiliateId,
        error: error.message,
      });
      throw error;
    }

    console.log('[CREATE-AFFILIATE] Affiliate mapping stored in Supabase', {
      wallet: wallet.slice(0, 8) + '...',
      affiliateId,
    });
  } catch (error) {
    console.error('[CREATE-AFFILIATE] Failed to store mapping', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
    });
    throw error;
  }
}

async function createRewardfulAffiliate(wallet) {
  // Check if already exists in Supabase
  const existingAffiliateId = await getAffiliateId(wallet);
  if (existingAffiliateId) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://referral-blue.vercel.app';
    return {
      success: true,
      affiliateId: existingAffiliateId,
      referralLink: `${frontendUrl}?via=${existingAffiliateId}`,
    };
  }

  // Check activation in Supabase
  const activated = await isWalletActivated(wallet);
  if (!activated) {
    return {
      success: false,
      error: 'Wallet must be activated via signature before affiliate creation',
    };
  }

  // Get API secret
  const rewardfulApiSecret = process.env.REWARDFUL_SECRET || process.env.REWARDFUL_API_SECRET;
  if (!rewardfulApiSecret) {
    return {
      success: false,
      error: 'REWARDFUL_SECRET not configured',
    };
  }

  // Create affiliate in Rewardful
  const shortPubkey = wallet.slice(0, 8);
  const affiliateData = {
    email: `wallet_${shortPubkey}@noemail.local`,
    first_name: 'Wallet',
    last_name: shortPubkey,
    metadata: { wallet: wallet },
  };

  try {
    const response = await fetch('https://api.getrewardful.com/v1/affiliates', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${rewardfulApiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(affiliateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Rewardful API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const affiliateId = data.id;
    
    // Store mapping in Supabase
    await storeAffiliateMapping(wallet, affiliateId);
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://referral-blue.vercel.app';
    const referralLink = data.links?.[0]?.url || `${frontendUrl}?via=${affiliateId}`;

    return {
      success: true,
      affiliateId,
      referralLink,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to create affiliate',
    };
  }
}

/**
 * Vercel serverless function handler
 */
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Only POST is supported.',
    });
  }

  const startTime = Date.now();
  try {
    const { wallet } = req.body;

    if (!wallet) {
      return res.status(400).json({
        success: false,
        error: 'wallet parameter is required',
      });
    }

    console.log('[CREATE-AFFILIATE] Request received', {
      wallet: wallet.slice(0, 8) + '...',
    });

    // SECURITY: Check if wallet is activated (verified signature) in Supabase
    const activated = await isWalletActivated(wallet);
    if (!activated) {
      console.error('[CREATE-AFFILIATE] Wallet not activated', {
        wallet: wallet.slice(0, 8) + '...',
      });
      return res.status(403).json({
        success: false,
        error: 'Wallet must be activated via signature verification first',
      });
    }

    // TEMPORARY: Check SOL eligibility before creating affiliate
    const isEligible = await hasMinimumSol(wallet);
    if (!isEligible) {
      console.error('[CREATE-AFFILIATE] Wallet does not meet SOL eligibility requirement', {
        wallet: wallet.slice(0, 8) + '...',
      });
      return res.status(403).json({
        success: false,
        error: 'Wallet must hold at least $2 worth of SOL',
      });
    }

    // Create or retrieve Rewardful affiliate
    const result = await createRewardfulAffiliate(wallet);

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log('[CREATE-AFFILIATE] Success', {
        wallet: wallet.slice(0, 8) + '...',
        affiliateId: result.affiliateId,
        duration: `${duration}ms`,
      });
      return res.status(200).json(result);
    } else {
      console.error('[CREATE-AFFILIATE] Failed', {
        wallet: wallet.slice(0, 8) + '...',
        error: result.error,
        duration: `${duration}ms`,
      });
      return res.status(500).json(result);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[CREATE-AFFILIATE] Error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
