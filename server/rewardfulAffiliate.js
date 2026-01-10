/**
 * REWARDFUL AFFILIATE CREATION (SERVER-SIDE ONLY)
 * 
 * This file implements Rewardful affiliate creation via API.
 * 
 * IMPORTANT: This must run server-side. Never expose Rewardful API key to frontend.
 */

// In-memory storage for wallet → Rewardful affiliate ID mapping
// In production, use a database
const walletAffiliateMap = new Map();

/**
 * Create or retrieve Rewardful affiliate for a wallet
 * 
 * Rules:
 * - Only creates affiliate if wallet is validated (≥ $2 holdings)
 * - One wallet = one Rewardful affiliate ID (immutable)
 * - Returns existing affiliate ID if already created
 * - Creates new affiliate in Rewardful if missing
 * 
 * @param {string} wallet - Solana wallet address
 * @returns {Promise<{success: boolean, affiliateId?: string, referralLink?: string, error?: string}>}
 */
export async function createRewardfulAffiliate(wallet) {
  try {
    // Check if affiliate already exists
    if (walletAffiliateMap.has(wallet)) {
      const existingAffiliateId = walletAffiliateMap.get(wallet);
      const referralLink = `${process.env.FRONTEND_URL || 'https://yourdomain.com'}?via=${existingAffiliateId}`;
      
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

    // Create affiliate in Rewardful
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
      console.error('Rewardful API error:', response.status, errorText);
      return {
        success: false,
        error: `Rewardful API error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    
    // Extract affiliate ID from response
    // Rewardful returns: { id: "aff_9xYkP3", links: [{ url: "..." }] }
    const affiliateId = data.id;
    
    if (!affiliateId) {
      return {
        success: false,
        error: 'Rewardful API did not return affiliate ID',
      };
    }

    // Store mapping (wallet → Rewardful affiliate ID)
    walletAffiliateMap.set(wallet, affiliateId);

    // Generate referral link
    // Use the link from Rewardful if available, otherwise construct it
    let referralLink;
    if (data.links && data.links.length > 0 && data.links[0].url) {
      referralLink = data.links[0].url;
    } else {
      // Fallback: construct link manually
      const frontendUrl = process.env.FRONTEND_URL || 'https://yourdomain.com';
      referralLink = `${frontendUrl}?via=${affiliateId}`;
    }

    return {
      success: true,
      affiliateId,
      referralLink,
    };
  } catch (error) {
    console.error('Rewardful affiliate creation error:', error);
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
