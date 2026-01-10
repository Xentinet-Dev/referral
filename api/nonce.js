/**
 * NONCE GENERATION (VERCEL SERVERLESS)
 * 
 * Generates and stores nonces for wallet verification.
 * Nonces expire after 5 minutes.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[NONCE] Missing Supabase configuration');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const NONCE_EXPIRY_MINUTES = 5;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Only GET is supported.',
    });
  }

  try {
    if (!supabase) {
      console.error('[NONCE] Supabase not configured', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey,
      });
      return res.status(500).json({
        success: false,
        error: 'Supabase not configured',
      });
    }

    const nonce = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(Date.now() + NONCE_EXPIRY_MINUTES * 60 * 1000).toISOString();

    console.log('[NONCE] Generating nonce', {
      nonce: nonce.slice(0, 8) + '...',
      timestamp,
    });

    const { error } = await supabase
      .from('nonces')
      .insert({
        nonce: nonce,
        expires_at: expiresAt,
      });

    if (error) {
      console.error('[NONCE] Error storing nonce', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return res.status(500).json({
        success: false,
        error: `Failed to generate nonce: ${error.message}`,
        code: error.code,
      });
    }

    return res.status(200).json({
      success: true,
      nonce: nonce,
      timestamp: timestamp,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('[NONCE] Error', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
