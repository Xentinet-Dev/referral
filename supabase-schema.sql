-- Supabase Postgres Schema for Referral System
-- Run this in your Supabase SQL Editor

-- Table 1: Wallet Activation
-- Stores wallets that have been activated via signature verification
CREATE TABLE IF NOT EXISTS wallet_activation (
  wallet_address TEXT PRIMARY KEY,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_activation_wallet ON wallet_activation(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_activation_activated_at ON wallet_activation(activated_at);

-- Table 2: Wallet Affiliates
-- Maps wallet addresses to Rewardful affiliate IDs
CREATE TABLE IF NOT EXISTS wallet_affiliates (
  wallet_address TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_affiliates_wallet ON wallet_affiliates(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_affiliates_affiliate ON wallet_affiliates(affiliate_id);

-- Table 3: Rewardful Conversions
-- Tracks processed referral conversions for idempotency and referral counts
CREATE TABLE IF NOT EXISTS rewardful_conversions (
  referral_id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  affiliate_id TEXT NOT NULL,
  converted_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  successful_referrals_count INTEGER NOT NULL DEFAULT 0
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rewardful_conversions_referral ON rewardful_conversions(referral_id);
CREATE INDEX IF NOT EXISTS idx_rewardful_conversions_wallet ON rewardful_conversions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_rewardful_conversions_affiliate ON rewardful_conversions(affiliate_id);
-- Index for counting referrals per wallet (used by referral-progress endpoint)
CREATE INDEX IF NOT EXISTS idx_rewardful_conversions_wallet_count ON rewardful_conversions(wallet_address, processed_at);

-- Enable Row Level Security (RLS) - API routes use service role key, so this is for safety
ALTER TABLE wallet_activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewardful_conversions ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by API routes)
CREATE POLICY "Service role full access wallet_activation" ON wallet_activation
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access wallet_affiliates" ON wallet_affiliates
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access rewardful_conversions" ON rewardful_conversions
  FOR ALL USING (auth.role() = 'service_role');
