/**
 * Backend Server for Stripe Conversion Trigger & Rewardful Affiliate Creation
 * 
 * Run: npm start (or node index.js)
 * 
 * Endpoints:
 * POST /api/trigger-conversion - Trigger Stripe conversion for Rewardful
 * POST /api/create-rewardful-affiliate - Create Rewardful affiliate for wallet
 */

import express from 'express';
import cors from 'cors';
import { triggerStripeConversion } from './stripeConversion.js';
import { createRewardfulAffiliate, markWalletActivated, getAffiliateWalletMap } from './rewardfulAffiliate.js';
import { verifyWalletActivation } from './signatureVerification.js';
import { processWebhook, getWalletReferralProgress } from './rewardfulWebhook.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 50),
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  console.log('[HEALTH] Check', {
    timestamp: new Date().toISOString(),
  });
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Verify wallet activation (signature required)
// CRITICAL: This endpoint cryptographically verifies signatures using tweetnacl
app.post('/api/verify-wallet', async (req, res) => {
  const startTime = Date.now();
  try {
    const { wallet, message, signature, nonce, timestamp } = req.body;

    console.log('[VERIFY-WALLET] Request received', {
      wallet: wallet ? wallet.slice(0, 8) + '...' : 'missing',
      hasMessage: !!message,
      hasSignature: !!signature,
      hasNonce: !!nonce,
      hasTimestamp: !!timestamp,
    });

    if (!wallet || !message || !signature || !nonce || !timestamp) {
      console.error('[VERIFY-WALLET] Missing required fields', {
        wallet: !!wallet,
        message: !!message,
        signature: !!signature,
        nonce: !!nonce,
        timestamp: !!timestamp,
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet, message, signature, nonce, timestamp',
      });
    }

    console.log('[WALLET-CONNECTED]', {
      wallet: wallet.slice(0, 8) + '...',
      status: 'unauthenticated',
      timestamp: new Date().toISOString(),
    });

    console.log('[WALLET-AUTH-REQUEST]', {
      wallet: wallet.slice(0, 8) + '...',
      nonce: nonce.slice(0, 8) + '...',
      timestamp,
      messageLength: message.length,
      signatureLength: signature.length,
    });

    // CRITICAL: Cryptographically verify signature using tweetnacl
    // This is NOT a placeholder - real verification happens here
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

    // Signature verified cryptographically
    console.log('[WALLET-AUTH-VERIFIED]', {
      wallet: wallet.slice(0, 8) + '...',
      signature_valid: true,
      nonce_consumed: true,
      timestamp: new Date().toISOString(),
    });

    // Mark wallet as activated (gates affiliate creation)
    markWalletActivated(wallet);
    
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

    res.json({ success: true });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[VERIFY-WALLET] Error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Create Rewardful affiliate
app.post('/api/create-rewardful-affiliate', async (req, res) => {
  const startTime = Date.now();
  try {
    const { wallet } = req.body;

    console.log('[CREATE-AFFILIATE] Request received', {
      wallet: wallet ? wallet.slice(0, 8) + '...' : 'missing',
    });

    if (!wallet) {
      console.error('[CREATE-AFFILIATE] Missing wallet', {
        body: Object.keys(req.body),
      });
      return res.status(400).json({
        success: false,
        error: 'wallet is required',
      });
    }

    console.log('[CREATE-AFFILIATE] Processing', {
      wallet: wallet.slice(0, 8) + '...',
    });

    const result = await createRewardfulAffiliate(wallet);

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log('[CREATE-AFFILIATE] Success', {
        wallet: wallet.slice(0, 8) + '...',
        affiliateId: result.affiliateId,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.json(result);
    } else {
      console.error('[CREATE-AFFILIATE] Failed', {
        wallet: wallet.slice(0, 8) + '...',
        error: result.error,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.status(500).json(result);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[CREATE-AFFILIATE] Error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Rewardful webhook endpoint
// CRITICAL: Rewardful is the source of truth for referral completion
// A referral is ONLY considered successful when Rewardful confirms it via webhook
app.post('/api/webhooks/rewardful', async (req, res) => {
  const startTime = Date.now();
  try {
    // Log entire payload for debugging
    console.log('[WEBHOOK] Raw payload received', {
      headers: req.headers,
      body: JSON.stringify(req.body),
      timestamp: new Date().toISOString(),
    });

    // Get affiliate → wallet mapping
    const affiliateWalletMap = getAffiliateWalletMap();

    // Process webhook
    const result = processWebhook(req.body, affiliateWalletMap);

    const duration = Date.now() - startTime;

    if (result.processed) {
      console.log('[WEBHOOK] Event processed', {
        event: result.event,
        success: result.result?.success,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.status(200).json({
        success: true,
        event: result.event,
        processed: true,
      });
    } else {
      console.log('[WEBHOOK] Event ignored or logged only', {
        event: result.event,
        message: result.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.status(200).json({
        success: true,
        event: result.event,
        processed: false,
        message: result.message,
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[WEBHOOK] Error processing webhook', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
    // Always return 200 to Rewardful (don't trigger retries for our errors)
    res.status(200).json({
      success: false,
      error: 'Webhook processing error',
    });
  }
});

// Get referral progress for a wallet (frontend reads from here only)
// CRITICAL: Frontend must never calculate or modify referral counts
app.get('/api/referral-progress/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    if (!wallet) {
      return res.status(400).json({
        success: false,
        error: 'wallet parameter is required',
      });
    }

    console.log('[REFERRAL-PROGRESS] Request', {
      wallet: wallet.slice(0, 8) + '...',
    });

    const progress = getWalletReferralProgress(wallet);

    console.log('[REFERRAL-PROGRESS] Response', {
      wallet: wallet.slice(0, 8) + '...',
      count: progress.count,
      multiplier: progress.multiplier.total + 'x',
    });

    res.json({
      success: true,
      wallet,
      successful_referrals: progress.count,
      max_referrals: 3,
      allocation_multiplier: {
        base: progress.multiplier.base,
        bonus: progress.multiplier.bonus,
        total: progress.multiplier.total,
        referrals: progress.multiplier.referrals,
        max_bonus_reached: progress.multiplier.referrals >= 3,
      },
    });
  } catch (error) {
    console.error('[REFERRAL-PROGRESS] Error', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Trigger Stripe conversion
app.post('/api/trigger-conversion', async (req, res) => {
  const startTime = Date.now();
  try {
    const { wallet, amount_usd, conversion_type } = req.body;

    console.log('[TRIGGER-CONVERSION] Request received', {
      wallet: wallet ? wallet.slice(0, 8) + '...' : 'missing',
      amount_usd,
      conversion_type,
    });

    if (!wallet) {
      console.error('[TRIGGER-CONVERSION] Missing wallet', {
        body: Object.keys(req.body),
      });
      return res.status(400).json({
        success: false,
        error: 'wallet is required',
      });
    }

    console.log('[TRIGGER-CONVERSION] Processing', {
      wallet: wallet.slice(0, 8) + '...',
      amount_usd: amount_usd || 2.0,
      conversion_type: conversion_type || 'buy_verified',
    });

    const result = await triggerStripeConversion(
      wallet,
      amount_usd || 2.0,
      conversion_type || 'buy_verified'
    );

    const duration = Date.now() - startTime;

    if (result.success) {
      console.log('[TRIGGER-CONVERSION] Success', {
        wallet: wallet.slice(0, 8) + '...',
        stripe_payment_id: result.stripe_payment_id,
        rewardful_conversion_id: result.rewardful_conversion_id,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.json(result);
    } else {
      console.error('[TRIGGER-CONVERSION] Failed', {
        wallet: wallet.slice(0, 8) + '...',
        error: result.error,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      res.status(500).json(result);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[TRIGGER-CONVERSION] Error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  console.warn('[404] Route not found', {
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString(),
  });
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('[SERVER] Starting backend server');
  console.log('='.repeat(60));
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
  console.log(`[SERVER] Environment:`, {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT,
    STRIPE_KEY: process.env.STRIPE_SECRET_KEY ? 'Set ✓' : 'Missing ✗',
    REWARDFUL_SECRET: process.env.REWARDFUL_SECRET ? 'Set ✓' : 'Missing ✗',
    FRONTEND_URL: process.env.FRONTEND_URL || 'Not set',
  });
  console.log('='.repeat(60));
});
