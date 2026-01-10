/**
 * SIGNATURE VERIFICATION (SERVER-SIDE)
 * 
 * CRITICAL: This must cryptographically verify signatures using tweetnacl.
 * No placeholders. No mocks. Real verification only.
 */

import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

// In-memory storage for used nonces (DEV ONLY - must use Redis/DB in production)
const usedNonces = new Set();
const SIGNATURE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify a Solana wallet signature cryptographically
 * 
 * @param {string} message - The exact message that was signed
 * @param {string} signature - Base64 encoded signature
 * @param {string} publicKey - Solana wallet public key (base58)
 * @returns {boolean} - True if signature is cryptographically valid
 */
export function verifySignature(message, signature, publicKey) {
  try {
    console.log('[SIGNATURE-VERIFY] Starting verification', {
      publicKey: publicKey.slice(0, 8) + '...',
      messageLength: message?.length,
      signatureLength: signature?.length,
    });

    // Basic validation
    if (!message || !signature || !publicKey) {
      console.error('[SIGNATURE-VERIFY] Missing required fields', {
        hasMessage: !!message,
        hasSignature: !!signature,
        hasPublicKey: !!publicKey,
      });
      return false;
    }

    // Decode signature from base64 to Uint8Array
    let signatureBytes;
    try {
      signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
      console.log('[SIGNATURE-VERIFY] Signature decoded', {
        signatureLength: signatureBytes.length,
      });
    } catch (error) {
      console.error('[SIGNATURE-VERIFY] Signature decode error', {
        error: error.message,
        stack: error.stack,
      });
      return false;
    }

    // Validate public key format and convert to bytes
    let publicKeyBytes;
    try {
      const pubkey = new PublicKey(publicKey);
      publicKeyBytes = pubkey.toBytes();
      console.log('[SIGNATURE-VERIFY] Public key validated', {
        publicKeyLength: publicKeyBytes.length,
      });
    } catch (error) {
      console.error('[SIGNATURE-VERIFY] Public key validation error', {
        error: error.message,
        stack: error.stack,
        publicKey: publicKey.slice(0, 8) + '...',
      });
      return false;
    }

    // Reconstruct the exact signed message
    const messageBytes = new TextEncoder().encode(message);
    console.log('[SIGNATURE-VERIFY] Message encoded', {
      messageLength: messageBytes.length,
    });

    // CRITICAL: Cryptographically verify signature using tweetnacl
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    console.log('[SIGNATURE-VERIFY] Verification result', {
      isValid,
      publicKey: publicKey.slice(0, 8) + '...',
    });

    return isValid;
  } catch (error) {
    console.error('[SIGNATURE-VERIFY] Verification error', {
      error: error.message,
      stack: error.stack,
      publicKey: publicKey?.slice(0, 8) + '...',
    });
    return false;
  }
}

/**
 * Validate nonce and timestamp
 * 
 * @param {string} nonce - Unique nonce
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {{valid: boolean, error?: string}}
 */
export function validateNonceAndTimestamp(nonce, timestamp) {
  console.log('[NONCE-VALIDATE] Checking nonce and timestamp', {
    nonce: nonce?.slice(0, 8) + '...',
    timestamp,
    usedNoncesCount: usedNonces.size,
  });

  // Check if nonce was already used
  if (usedNonces.has(nonce)) {
    console.error('[NONCE-VALIDATE] Replay attack detected', {
      nonce: nonce.slice(0, 8) + '...',
      timestamp: new Date().toISOString(),
    });
    return { valid: false, error: 'Nonce already used (replay attack detected)' };
  }

  // Check timestamp (reject signatures older than 5 minutes)
  const now = Math.floor(Date.now() / 1000); // Convert to seconds
  const age = now - timestamp;
  
  console.log('[NONCE-VALIDATE] Timestamp check', {
    now,
    timestamp,
    age,
    maxAge: SIGNATURE_TIMEOUT_MS / 1000,
  });

  if (age > SIGNATURE_TIMEOUT_MS / 1000) {
    console.error('[NONCE-VALIDATE] Timestamp expired', {
      age,
      maxAge: SIGNATURE_TIMEOUT_MS / 1000,
      timestamp: new Date().toISOString(),
    });
    return { valid: false, error: 'Signature too old (timestamp expired)' };
  }

  if (age < 0) {
    console.error('[NONCE-VALIDATE] Future timestamp', {
      age,
      timestamp: new Date().toISOString(),
    });
    return { valid: false, error: 'Invalid timestamp (future timestamp)' };
  }

  console.log('[NONCE-VALIDATE] Valid', {
    nonce: nonce.slice(0, 8) + '...',
    age,
  });

  return { valid: true };
}

/**
 * Mark nonce as used (prevents replay attacks)
 * 
 * @param {string} nonce - Nonce to mark as used
 */
export function markNonceUsed(nonce) {
  usedNonces.add(nonce);
  console.log('[NONCE-MARK] Nonce marked as used', {
    nonce: nonce.slice(0, 8) + '...',
    totalUsed: usedNonces.size,
  });
  
  // Clean up old nonces periodically (in production, use TTL cache)
  if (usedNonces.size > 10000) {
    console.warn('[NONCE-MARK] Clearing nonce cache (size limit reached)', {
      previousSize: usedNonces.size,
    });
    usedNonces.clear();
  }
}

/**
 * Verify wallet activation request
 * 
 * This is the complete verification function that:
 * 1. Verifies signature cryptographically
 * 2. Validates nonce (prevents replay)
 * 3. Validates timestamp (prevents stale signatures)
 * 
 * @param {string} wallet - Wallet address
 * @param {string} message - Signed message
 * @param {string} signature - Base64 signature
 * @param {string} nonce - Unique nonce
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {{valid: boolean, error?: string}}
 */
export function verifyWalletActivation(wallet, message, signature, nonce, timestamp) {
  // Step 1: Verify signature cryptographically
  const signatureValid = verifySignature(message, signature, wallet);
  if (!signatureValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Step 2: Validate nonce and timestamp
  const nonceCheck = validateNonceAndTimestamp(nonce, timestamp);
  if (!nonceCheck.valid) {
    return { valid: false, error: nonceCheck.error || 'Invalid nonce or timestamp' };
  }

  // Step 3: Mark nonce as used (prevents replay)
  markNonceUsed(nonce);

  return { valid: true };
}
