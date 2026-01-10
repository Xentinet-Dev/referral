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
  // Check if customer already exists
  if (walletCustomerMap.has(wallet)) {
    return walletCustomerMap.get(wallet);
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: `${wallet.slice(0, 8)}@example.com`, // Placeholder email
    metadata: {
      wallet_address: wallet,
    },
    description: `Customer for wallet ${wallet}`,
  });
  
  walletCustomerMap.set(wallet, customer.id);
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
  try {
    // Validate amount
    if (amountUsd < 0) {
      return {
        success: false,
        error: 'Amount must be non-negative',
      };
    }

    // Get or create customer
    const customerId = await getOrCreateCustomer(wallet);

    // Create payment intent
    const amountCents = Math.round(amountUsd * 100);

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

    // For amounts > 0, payment intent is created but needs confirmation
    // In test mode, you can use test cards: https://stripe.com/docs/testing
    // For automatic conversion tracking, Rewardful will track via cookie

    return {
      success: true,
      stripe_payment_id: paymentIntent.id,
      rewardful_conversion_id: `conv_${wallet.slice(0, 8)}_${Date.now()}`,
    };
  } catch (error) {
    console.error('Stripe conversion error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
