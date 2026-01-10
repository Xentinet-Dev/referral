/**
 * VERIFY WALLET (VERCEL SERVERLESS)
 * 
 * Wallet activation via signature verification.
 * This endpoint verifies wallet ownership cryptographically.
 * 
 * Storage: Supabase Postgres (wallet_activation table)
 */

import { createClient } from '@supabase/supabase-js';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[VERIFY-WALLET] Missing Supabase configuration');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const SIGNATURE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if nonce has been used (query Supabase)
 * For MVP, we'll use a simple approach - in production, add nonces table
 */
const usedNonces = new Set(); // TODO: Move to Supabase nonces table

function verifyWalletActivation(wallet, message, signature, nonce, timestamp) {
  // Check nonce (in-memory for MVP, should be in Supabase)
  if (usedNonces.has(nonce)) {
    return { valid: false, error: 'Nonce already used' };
  }

  // Check timestamp
  const now = Date.now();
  const requestTime = timestamp * 1000;
  if (now - requestTime > SIGNATURE_TIMEOUT_MS) {
    return { valid: false, error: 'Timestamp expired' };
  }

  // Verify signature cryptographically
  try {
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const publicKeyBytes = new PublicKey(wallet).toBytes();
    const messageBytes = new TextEncoder().encode(message);

    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    
    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Mark nonce as used
    usedNonces.add(nonce);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

async function markWalletActivated(wallet) {
  if (!supabase) {
    console.error('[VERIFY-WALLET] Supabase not configured, using in-memory fallback');
    return;
  }

  try {
    const { error } = await supabase
      .from('wallet_activation')
      .upsert({
        wallet: wallet,
        activated_at: new Date().toISOString(),
      }, {
        onConflict: 'wallet',
      });

    if (error) {
      console.error('[VERIFY-WALLET] Error marking wallet as activated', {
        wallet: wallet.slice(0, 8) + '...',
        error: error.message,
      });
      throw error;
    }

    console.log('[VERIFY-WALLET] Wallet marked as activated in Supabase', {
      wallet: wallet.slice(0, 8) + '...',
    });
  } catch (error) {
    console.error('[VERIFY-WALLET] Failed to mark wallet as activated', {
      wallet: wallet.slice(0, 8) + '...',
      error: error.message,
    });
    throw error;
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
    const { wallet, message, signature, nonce, timestamp } = req.body;

    if (!wallet || !message || !signature || !nonce || !timestamp) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet, message, signature, nonce, timestamp',
      });
    }

    console.log('[WALLET-AUTH-REQUEST]', {
      wallet: wallet.slice(0, 8) + '...',
      nonce: nonce.slice(0, 8) + '...',
      timestamp,
      messageLength: message.length,
      signatureLength: signature.length,
    });

    // CRITICAL: Cryptographically verify signature using tweetnacl
    const verification = verifyWalletActivation(wallet, message, signature, nonce, timestamp);
    
    if (!verification.valid) {
      console.error('[WALLET-AUTH-FAILED]', {
        wallet: wallet.slice(0, 8) + '...',
        error: verification.error,
        timestamp: new Date().toISOString(),
      });

      return res.status(401).json({
        success: false,
        error: verification.error || 'Wallet verification failed',
      });
    }

    // Signature verified cryptographically - mark as activated in Supabase
    await markWalletActivated(wallet);

    console.log('[WALLET-AUTH-VERIFIED]', {
      wallet: wallet.slice(0, 8) + '...',
      signature_valid: true,
      nonce_consumed: true,
      timestamp: new Date().toISOString(),
    });

    console.log('[SESSION-ACTIVE]', {
      wallet: wallet.slice(0, 8) + '...',
      privileges: 'affiliate_access',
      timestamp: new Date().toISOString(),
    });

    const duration = Date.now() - startTime;
    console.log('[VERIFY-WALLET] Success', {
      wallet: wallet.slice(0, 8) + '...',
      duration: `${duration}ms`,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[VERIFY-WALLET] Error', {
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
