/**
 * STRIPE CONVERSION TRIGGER (SERVER-SIDE ONLY)
 * 
 * This file implements Stripe test mode conversion for Rewardful attribution.
 * 
 * IMPORTANT: This must run server-side. Never expose Stripe secret keys to frontend.
 */

import Stripe from 'stripe';

// Initialize Stripe with test mode secret key
// Get from: https://dashboard.stripe.com/test/apikeys
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

// Store for customer mapping (wallet → Stripe customer ID)
// In production, use a database
const walletCustomerMap = new Map();

/**
 * Get or create Stripe customer for a wallet address
 */
async function getOrCreateCustomer(wallet) {
  console.log('[STRIPE-CUSTOMER] Getting/creating customer', {
    wallet: wallet.slice(0, 8) + '...',
  });

  // Check if customer already exists
  if (walletCustomerMap.has(wallet)) {
    const existingId = walletCustomerMap.get(wallet);
    console.log('[STRIPE-CUSTOMER] Existing customer found', {
      wallet: wallet.slice(0, 8) + '...',
      customerId: existingId,
    });
    return existingId;
  }

  // Create new customer
  console.log('[STRIPE-CUSTOMER] Creating new customer', {
    wallet: wallet.slice(0, 8) + '...',
  });
  const customer = await stripe.customers.create({
    email: `${wallet.slice(0, 8)}@example.com`, // Placeholder email
    metadata: {
      wallet_address: wallet,
    },
    description: `Customer for wallet ${wallet}`,
  });
  
  walletCustomerMap.set(wallet, customer.id);
  console.log('[STRIPE-CUSTOMER] Customer created', {
    wallet: wallet.slice(0, 8) + '...',
    customerId: customer.id,
    totalCustomers: walletCustomerMap.size,
  });
  return customer.id;
}

/**
 * Trigger Stripe conversion for Rewardful attribution
 * 
 * Rules:
 * - Creates $0 or $2 test-mode Stripe payment
 * - Associates with wallet/customer
 * - Rewardful cookie/session automatically attached
 * - Used when buy verified OR referral bonus condition met
 */
export async function triggerStripeConversion(
  wallet,
  amountUsd,
  conversionType
) {
  console.log('[STRIPE-CONVERSION] Starting', {
    wallet: wallet.slice(0, 8) + '...',
    amountUsd,
    conversionType,
  });

  try {
    // Validate amount
    if (amountUsd < 0) {
      console.error('[STRIPE-CONVERSION] Invalid amount', {
        wallet: wallet.slice(0, 8) + '...',
        amountUsd,
      });
      return {
        success: false,
        error: 'Amount must be non-negative',
      };
    }

    // Get or create customer
    console.log('[STRIPE-CONVERSION] Getting/creating customer', {
      wallet: wallet.slice(0, 8) + '...',
    });
    const customerId = await getOrCreateCustomer(wallet);
    console.log('[STRIPE-CONVERSION] Customer ready', {
      wallet: wallet.slice(0, 8) + '...',
      customerId,
    });

    // Create payment intent
    const amountCents = Math.round(amountUsd * 100);
    console.log('[STRIPE-CONVERSION] Creating payment intent', {
      wallet: wallet.slice(0, 8) + '...',
      amountCents,
      autoConfirm: amountCents === 0,
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        wallet_address: wallet,
        conversion_type: conversionType,
        rewardful_tracking: 'enabled', // Rewardful will read cookie automatically
      },
      // For test mode $0 payments, we can auto-confirm
      confirm: amountCents === 0,
      description: `Referral conversion: ${conversionType} for wallet ${wallet}`,
    });

    console.log('[STRIPE-CONVERSION] Payment intent created', {
      wallet: wallet.slice(0, 8) + '...',
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });

    // For amounts > 0, payment intent is created but needs confirmation
    // In test mode, you can use test cards: https://stripe.com/docs/testing
    // For automatic conversion tracking, Rewardful will track via cookie

    const conversionId = `conv_${wallet.slice(0, 8)}_${Date.now()}`;
    console.log('[STRIPE-CONVERSION] Success', {
      wallet: wallet.slice(0, 8) + '...',
      stripe_payment_id: paymentIntent.id,
      rewardful_conversion_id: conversionId,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      stripe_payment_id: paymentIntent.id,
      rewardful_conversion_id: conversionId,
    };
  } catch (error) {
    console.error('[STRIPE-CONVERSION] Error', {
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
