/**
 * Backend Server for Stripe Conversion Trigger
 * 
 * Run: npm start (or node index.js)
 * 
 * Endpoints:
 * POST /api/trigger-conversion - Trigger Stripe conversion for Rewardful
 */

import express from 'express';
import cors from 'cors';
import { triggerStripeConversion } from './stripeConversion.js';
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
});
