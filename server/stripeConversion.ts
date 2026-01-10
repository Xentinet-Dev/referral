/**
 * STRIPE CONVERSION TRIGGER (SERVER-SIDE ONLY)
 * 
 * This file implements Stripe test mode conversion for Rewardful attribution.
 * 
 * IMPORTANT: This must run server-side. Never expose Stripe secret keys to frontend.
 * 
 * Setup:
 * 1. Install Stripe: npm install stripe
 * 2. Set environment variable: STRIPE_SECRET_KEY=sk_test_...
 * 3. Uncomment the Stripe import and initialization below
 * 4. Uncomment all Stripe API calls
 * 
 * Usage:
 * - Deploy this as a backend API endpoint
 * - Call from your backend when buy verification succeeds
 * - Rewardful automatically tracks via cookie/session
 */

// Uncomment when Stripe package is installed:
// import Stripe from 'stripe';

// Initialize Stripe with test mode secret key
// Get from: https://dashboard.stripe.com/test/apikeys
// Uncomment when ready:
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
//   apiVersion: '2024-11-20.acacia',
// });

// Store for customer mapping (wallet → Stripe customer ID)
// In production, use a database
const walletCustomerMap = new Map<string, string>();

/**
 * Get or create Stripe customer for a wallet address
 */
async function getOrCreateCustomer(wallet: string): Promise<string> {
  // Check if customer already exists
  if (walletCustomerMap.has(wallet)) {
    return walletCustomerMap.get(wallet)!;
  }

  // TODO: Uncomment when Stripe is installed
  // Create new customer
  // const customer = await stripe.customers.create({
  //   email: `${wallet.slice(0, 8)}@example.com`, // Placeholder email
  //   metadata: {
  //     wallet_address: wallet,
  //   },
  //   description: `Customer for wallet ${wallet}`,
  // });
  // walletCustomerMap.set(wallet, customer.id);
  // return customer.id;
  
  // Temporary mock for development (remove when Stripe is installed)
  const mockCustomerId = `cus_mock_${wallet.slice(0, 8)}`;
  walletCustomerMap.set(wallet, mockCustomerId);
  return mockCustomerId;
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
  wallet: string,
  amountUsd: number,
  conversionType: 'buy_verified' | 'referral_bonus'
): Promise<{
  success: boolean;
  stripe_payment_id?: string;
  rewardful_conversion_id?: string;
  error?: string;
}> {
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
    // For $0 conversions, we use a payment intent with automatic payment method
    // For $2+ conversions, we create a normal payment intent
    const amountCents = Math.round(amountUsd * 100);

    // TODO: Uncomment when Stripe is installed
    // const paymentIntent = await stripe.paymentIntents.create({
    //   amount: amountCents,
    //   currency: 'usd',
    //   customer: customerId,
    //   payment_method_types: ['card'],
    //   metadata: {
    //     wallet_address: wallet,
    //     conversion_type: conversionType,
    //     rewardful_tracking: 'enabled', // Rewardful will read cookie automatically
    //   },
    //   // For test mode $0 payments, we can auto-confirm
    //   confirm: amountCents === 0,
    //   description: `Referral conversion: ${conversionType} for wallet ${wallet}`,
    // });

    // If amount > 0, we need to confirm the payment
    // In test mode, you can use test cards: https://stripe.com/docs/testing
    // For automatic conversion tracking, you might want to use Stripe Checkout instead
    // which automatically handles the payment flow and Rewardful tracking

    // Temporary mock for development (remove when Stripe is installed)
    const mockPaymentId = `pi_mock_${wallet.slice(0, 8)}_${Date.now()}`;

    return {
      success: true,
      stripe_payment_id: mockPaymentId,
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

/**
 * Alternative: Use Stripe Checkout for better Rewardful integration
 * 
 * Stripe Checkout automatically captures cookies and works better with Rewardful.
 * This creates a checkout session that can be redirected to.
 */
export async function createCheckoutSession(
  wallet: string,
  amountUsd: number,
  conversionType: 'buy_verified' | 'referral_bonus',
  successUrl: string,
  cancelUrl: string
): Promise<{
  success: boolean;
  checkout_url?: string;
  session_id?: string;
  error?: string;
}> {
  try {
    const customerId = await getOrCreateCustomer(wallet);
    const amountCents = Math.round(amountUsd * 100);

    // TODO: Uncomment when Stripe is installed
    // const session = await stripe.checkout.sessions.create({
    //   customer: customerId,
    //   payment_method_types: ['card'],
    //   line_items: [
    //     {
    //       price_data: {
    //         currency: 'usd',
    //         product_data: {
    //           name: `Referral Conversion: ${conversionType}`,
    //           description: `Wallet: ${wallet}`,
    //         },
    //         unit_amount: amountCents,
    //       },
    //       quantity: 1,
    //     },
    //   ],
    //   mode: amountCents === 0 ? 'payment' : 'payment',
    //   success_url: successUrl,
    //   cancel_url: cancelUrl,
    //   metadata: {
    //     wallet_address: wallet,
    //     conversion_type: conversionType,
    //   },
    //   // Rewardful will automatically track via cookie
    // });

    // Temporary mock for development (remove when Stripe is installed)
    const mockSessionId = `cs_mock_${wallet.slice(0, 8)}_${Date.now()}`;

    return {
      success: true,
      checkout_url: `${successUrl}?session_id=${mockSessionId}`,
      session_id: mockSessionId,
    };
  } catch (error) {
    console.error('Stripe Checkout error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
