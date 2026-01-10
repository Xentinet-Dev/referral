/**
 * REWARDFUL AFFILIATE CREATION (SERVER-SIDE ONLY)
 * 
 * This file implements Rewardful affiliate creation via API.
 * 
 * IMPORTANT: This must run server-side. Never expose Rewardful API key to frontend.
 * 
 * SECURITY: This function should only be called after wallet activation is verified.
 * The calling endpoint must verify that the wallet has been activated via signature.
 */

// In-memory storage for wallet → Rewardful affiliate ID mapping
// In production, use a database
const walletAffiliateMap = new Map();

// In-memory storage for activated wallets (session-only, resets on server restart)
// In production, use Redis/DB with TTL
// CRITICAL: This gates Rewardful affiliate creation
const activatedWallets = new Set();

/**
 * Check if wallet is activated (has verified signature)
 * 
 * @param {string} wallet - Wallet address
 * @returns {boolean} - True if wallet is activated
 */
export function isWalletActivated(wallet) {
  return activatedWallets.has(wallet);
}

/**
 * Mark wallet as activated (called after signature verification)
 * 
 * @param {string} wallet - Wallet address
 */
export function markWalletActivated(wallet) {
  activatedWallets.add(wallet);
}

/**
 * Create or retrieve Rewardful affiliate for a wallet
 * 
 * SECURITY RULES:
 * - Wallet must be activated (verified signature) before affiliate creation
 * - Only creates affiliate if wallet is validated (≥ $2 holdings)
 * - One wallet = one Rewardful affiliate ID (immutable)
 * - Returns existing affiliate ID if already created
 * - Creates new affiliate in Rewardful if missing
 * 
 * @param {string} wallet - Solana wallet address
 * @returns {Promise<{success: boolean, affiliateId?: string, referralLink?: string, error?: string}>}
 */
export async function createRewardfulAffiliate(wallet) {
  console.log('[REWARDFUL-AFFILIATE] Creating affiliate', {
    wallet: wallet.slice(0, 8) + '...',
  });

  // CRITICAL: Gate affiliate creation behind activation
  if (!isWalletActivated(wallet)) {
    console.error('[REWARDFUL-AFFILIATE] Wallet not activated', {
      wallet: wallet.slice(0, 8) + '...',
      activatedWalletsCount: activatedWallets.size,
    });
    return {
      success: false,
      error: 'Wallet must be activated via signature before affiliate creation',
    };
  }

  console.log('[REWARDFUL-AFFILIATE] Wallet is activated', {
    wallet: wallet.slice(0, 8) + '...',
  });

  try {
    // Check if affiliate already exists
    if (walletAffiliateMap.has(wallet)) {
      const existingAffiliateId = walletAffiliateMap.get(wallet);
      const referralLink = `${process.env.FRONTEND_URL || 'https://yourdomain.com'}?via=${existingAffiliateId}`;
      
      console.log('[REWARDFUL-AFFILIATE] Existing affiliate found', {
        wallet: wallet.slice(0, 8) + '...',
        affiliateId: existingAffiliateId,
      });
      
      return {
        success: true,
        affiliateId: existingAffiliateId,
        referralLink,
      };
    }

    // Get Rewardful API Secret from environment
    // Rewardful API uses the SECRET for authentication (not the API Key)
    // API Key (a97c5f) is for frontend script only
    // API Secret (2124a8e1fa134b02f1005e2e655bcf58) is for backend API calls
    const rewardfulApiSecret = process.env.REWARDFUL_SECRET || process.env.REWARDFUL_API_SECRET;
    if (!rewardfulApiSecret) {
      console.error('[REWARDFUL-AFFILIATE] API Secret not configured', {
        wallet: wallet.slice(0, 8) + '...',
      });
      return {
        success: false,
        error: 'REWARDFUL_SECRET not configured. Get your API Secret from https://app.rewardful.com/settings/api',
      };
    }

    // Prepare affiliate data
    const shortPubkey = wallet.slice(0, 8);
    const affiliateData = {
      email: `wallet_${shortPubkey}@noemail.local`,
      first_name: 'Wallet',
      last_name: shortPubkey,
      metadata: {
        wallet: wallet,
      },
    };

    console.log('[REWARDFUL-AFFILIATE] Calling Rewardful API', {
      wallet: wallet.slice(0, 8) + '...',
      email: affiliateData.email,
    });

    // Create affiliate in Rewardful
    const response = await fetch('https://api.getrewardful.com/v1/affiliates', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${rewardfulApiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(affiliateData),
    });

    console.log('[REWARDFUL-AFFILIATE] API response', {
      wallet: wallet.slice(0, 8) + '...',
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[REWARDFUL-AFFILIATE] API error', {
        wallet: wallet.slice(0, 8) + '...',
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: `Rewardful API error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    console.log('[REWARDFUL-AFFILIATE] API success', {
      wallet: wallet.slice(0, 8) + '...',
      affiliateId: data.id,
      hasLinks: !!(data.links && data.links.length > 0),
    });
    
    // Extract affiliate ID from response
    // Rewardful returns: { id: "aff_9xYkP3", links: [{ url: "..." }] }
    const affiliateId = data.id;
    
    if (!affiliateId) {
      console.error('[REWARDFUL-AFFILIATE] No affiliate ID in response', {
        wallet: wallet.slice(0, 8) + '...',
        responseData: JSON.stringify(data).slice(0, 200),
      });
      return {
        success: false,
        error: 'Rewardful API did not return affiliate ID',
      };
    }

    // Store mapping (wallet → Rewardful affiliate ID)
    walletAffiliateMap.set(wallet, affiliateId);
    console.log('[REWARDFUL-AFFILIATE] Mapping stored', {
      wallet: wallet.slice(0, 8) + '...',
      affiliateId,
      totalMappings: walletAffiliateMap.size,
    });

    // Generate referral link
    // Use the link from Rewardful if available, otherwise construct it
    let referralLink;
    if (data.links && data.links.length > 0 && data.links[0].url) {
      referralLink = data.links[0].url;
      console.log('[REWARDFUL-AFFILIATE] Using Rewardful link', {
        wallet: wallet.slice(0, 8) + '...',
        referralLink,
      });
    } else {
      // Fallback: construct link manually
      const frontendUrl = process.env.FRONTEND_URL || 'https://yourdomain.com';
      referralLink = `${frontendUrl}?via=${affiliateId}`;
      console.log('[REWARDFUL-AFFILIATE] Constructed link', {
        wallet: wallet.slice(0, 8) + '...',
        referralLink,
      });
    }

    console.log('[REWARDFUL-AFFILIATE] Success', {
      wallet: wallet.slice(0, 8) + '...',
      affiliateId,
      referralLink,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      affiliateId,
      referralLink,
    };
  } catch (error) {
    console.error('[REWARDFUL-AFFILIATE] Error', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get Rewardful affiliate ID for a wallet (if exists)
 * 
 * @param {string} wallet - Solana wallet address
 * @returns {string|null} Rewardful affiliate ID or null
 */
export function getRewardfulAffiliateId(wallet) {
  return walletAffiliateMap.get(wallet) || null;
}
