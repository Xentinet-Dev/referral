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

async function verifyAndConsumeNonce(nonce) {
  if (!supabase) {
    return { valid: false, code: 'NONCE_INVALID', message: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('nonces')
      .select('nonce, expires_at')
      .eq('nonce', nonce)
      .single();

    if (error || !data) {
      return { valid: false, code: 'NONCE_INVALID', message: 'Nonce not found' };
    }

    const now = new Date();
    const expiresAt = new Date(data.expires_at);

    if (now > expiresAt) {
      await supabase
        .from('nonces')
        .delete()
        .eq('nonce', nonce);
      return { valid: false, code: 'NONCE_EXPIRED', message: 'Nonce expired' };
    }

    await supabase
      .from('nonces')
      .delete()
      .eq('nonce', nonce);

    return { valid: true };
  } catch (error) {
    console.error('[VERIFY-WALLET] Error verifying nonce', {
      error: error.message,
    });
    return { valid: false, code: 'NONCE_INVALID', message: 'Nonce verification failed' };
  }
}

function verifySignature(wallet, message, signature) {
  try {
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const publicKeyBytes = new PublicKey(wallet).toBytes();
    const messageBytes = new TextEncoder().encode(message);

    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    
    if (!isValid) {
      return { valid: false, code: 'SIGNATURE_INVALID', message: 'Invalid signature' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, code: 'SIGNATURE_INVALID', message: error.message };
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

    // DEBUG: Log exact values received
    console.log('[VERIFY-BACKEND]', {
      wallet,
      nonce,
      timestamp,
      message,
      messageLength: message.length,
      messageBytes: Array.from(new TextEncoder().encode(message)),
    });

    console.log('[WALLET-AUTH-REQUEST]', {
      wallet: wallet.slice(0, 8) + '...',
      nonce: nonce.slice(0, 8) + '...',
      timestamp,
      messageLength: message.length,
      signatureLength: signature.length,
    });

    const nonceVerification = await verifyAndConsumeNonce(nonce);
    if (!nonceVerification.valid) {
      console.error('[WALLET-AUTH-FAILED]', {
        wallet: wallet.slice(0, 8) + '...',
        code: nonceVerification.code,
        message: nonceVerification.message,
        timestamp: new Date().toISOString(),
      });

      return res.status(401).json({
        success: false,
        code: nonceVerification.code,
        error: nonceVerification.message,
      });
    }

    const now = Date.now();
    const requestTime = timestamp * 1000;
    if (Math.abs(now - requestTime) > SIGNATURE_TIMEOUT_MS) {
      console.error('[WALLET-AUTH-FAILED]', {
        wallet: wallet.slice(0, 8) + '...',
        code: 'SIGNATURE_EXPIRED',
        message: 'Signature timestamp expired',
        timestamp: new Date().toISOString(),
      });

      return res.status(401).json({
        success: false,
        code: 'SIGNATURE_EXPIRED',
        error: 'Signature timestamp expired',
      });
    }

    const signatureVerification = verifySignature(wallet, message, signature);
    if (!signatureVerification.valid) {
      console.error('[WALLET-AUTH-FAILED]', {
        wallet: wallet.slice(0, 8) + '...',
        code: signatureVerification.code,
        message: signatureVerification.message,
        timestamp: new Date().toISOString(),
      });

      return res.status(401).json({
        success: false,
        code: signatureVerification.code,
        error: signatureVerification.message,
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
