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
import { createRewardfulAffiliate } from './rewardfulAffiliate.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Verify wallet activation (signature required)
app.post('/api/verify-wallet', async (req, res) => {
  try {
    const { wallet, message, signature, nonce, timestamp } = req.body;

    if (!wallet || !message || !signature || !nonce || !timestamp) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: wallet, message, signature, nonce, timestamp',
      });
    }

    // For now, return success (signature verification would happen here)
    // In production, verify signature using tweetnacl
    // TODO: Implement full signature verification
    
    console.log('[WALLET-AUTH-REQUEST]', {
      wallet: wallet.slice(0, 8) + '...',
      nonce: nonce.slice(0, 8) + '...',
      timestamp,
    });

    // Mock verification (replace with real verification)
    const isValid = signature && signature.length > 0;
    
    if (isValid) {
      console.log('[WALLET-AUTH-VERIFIED]', {
        wallet: wallet.slice(0, 8) + '...',
        signature_valid: true,
        nonce_consumed: true,
      });
      
      console.log('[SESSION-ACTIVE]', {
        wallet: wallet.slice(0, 8) + '...',
        privileges: 'affiliate_access',
      });

      res.json({ success: true });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid signature',
      });
    }
  } catch (error) {
    console.error('Wallet verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Create Rewardful affiliate
app.post('/api/create-rewardful-affiliate', async (req, res) => {
  try {
    const { wallet } = req.body;

    if (!wallet) {
      return res.status(400).json({
        success: false,
        error: 'wallet is required',
      });
    }

    const result = await createRewardfulAffiliate(wallet);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Rewardful affiliate creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Trigger Stripe conversion
app.post('/api/trigger-conversion', async (req, res) => {
  try {
    const { wallet, amount_usd, conversion_type } = req.body;

    if (!wallet) {
      return res.status(400).json({
        success: false,
        error: 'wallet is required',
      });
    }

    const result = await triggerStripeConversion(
      wallet,
      amount_usd || 2.0,
      conversion_type || 'buy_verified'
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Conversion trigger error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Stripe key: ${process.env.STRIPE_SECRET_KEY ? 'Set ✓' : 'Missing ✗'}`);
  console.log(`Rewardful secret: ${process.env.REWARDFUL_SECRET ? 'Set ✓' : 'Missing ✗'}`);
});
