-- Supabase Postgres Schema for Referral System
-- Run this in your Supabase SQL Editor

-- Table 1: Wallet Activation
-- Stores wallets that have been activated via signature verification
CREATE TABLE IF NOT EXISTS wallet_activation (
  wallet TEXT PRIMARY KEY,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_activation_wallet ON wallet_activation(wallet);
CREATE INDEX IF NOT EXISTS idx_wallet_activation_activated_at ON wallet_activation(activated_at);

-- Table 2: Wallet Affiliates
-- Maps wallet addresses to Rewardful affiliate IDs
CREATE TABLE IF NOT EXISTS wallet_affiliates (
  wallet TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_affiliates_wallet ON wallet_affiliates(wallet);
CREATE INDEX IF NOT EXISTS idx_wallet_affiliates_affiliate ON wallet_affiliates(affiliate_id);

-- Table 3: Nonces
-- Stores nonces for wallet verification with expiration
CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup of expired nonces
CREATE INDEX IF NOT EXISTS idx_nonces_expires_at ON nonces(expires_at);

-- Table 4: Referrals
-- Server-authoritative referral bindings (immutable)
CREATE TABLE IF NOT EXISTS referrals (
  referee_wallet TEXT PRIMARY KEY,
  referrer_wallet TEXT NOT NULL,
  referrer_affiliate_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_wallet);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON referrals(referrer_affiliate_id);

-- Table 5: Rewardful Conversions
-- Tracks processed referral conversions for idempotency (analytics only)
CREATE TABLE IF NOT EXISTS rewardful_conversions (
  referral_id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  affiliate_id TEXT NOT NULL,
  converted_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rewardful_conversions_referral ON rewardful_conversions(referral_id);
CREATE INDEX IF NOT EXISTS idx_rewardful_conversions_wallet ON rewardful_conversions(wallet);
CREATE INDEX IF NOT EXISTS idx_rewardful_conversions_affiliate ON rewardful_conversions(affiliate_id);

-- Enable Row Level Security (RLS) - API routes use service role key, so this is for safety
ALTER TABLE wallet_activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewardful_conversions ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by API routes)
-- Drop policies if they exist (allows re-running this script safely)
DROP POLICY IF EXISTS "Service role full access wallet_activation" ON wallet_activation;
DROP POLICY IF EXISTS "Service role full access wallet_affiliates" ON wallet_affiliates;
DROP POLICY IF EXISTS "Service role full access nonces" ON nonces;
DROP POLICY IF EXISTS "Service role full access referrals" ON referrals;
DROP POLICY IF EXISTS "Service role full access rewardful_conversions" ON rewardful_conversions;

-- Create policies with both USING and WITH CHECK clauses
-- USING: controls SELECT, UPDATE (existing rows), DELETE
-- WITH CHECK: controls INSERT, UPDATE (new values)
CREATE POLICY "Service role full access wallet_activation" ON wallet_activation
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access wallet_affiliates" ON wallet_affiliates
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access nonces" ON nonces
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access referrals" ON referrals
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access rewardful_conversions" ON rewardful_conversions
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
