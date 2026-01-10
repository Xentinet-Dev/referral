import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  validateHoldings,
  issueAffiliateLink,
  attributeReferral,
  validateReferredWallet,
  getReferrerData,
} from './mockBackend';

// Constants
const COUNTDOWN_END_UTC = new Date('2024-12-31T23:59:59Z').getTime();
const VALIDATION_THRESHOLD_USD = 2.0;

// Helper: Generate random nonce
function generateNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

function App() {
  const { publicKey, signMessage, wallet, disconnect, connected } = useWallet();
  const [countdown, setCountdown] = useState<number>(0);
  
  // Wallet activation state (CRITICAL: Required before any features unlock)
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  
  // Validation state
  const [validationStatus, setValidationStatus] = useState<'idle' | 'checking' | 'validated' | 'failed'>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Referral link state
  const [referralLink, setReferralLink] = useState<string | null>(null);
  
  // Referrer data
  const [referrerData, setReferrerData] = useState<{
    successful_referrals: number;
    allocation_multiplier: number;
    max_bonus_reached: boolean;
  } | null>(null);
  
  // Referred user state
  const [affiliateIdFromUrl, setAffiliateIdFromUrl] = useState<string | null>(null);
  const [referredValidationStatus, setReferredValidationStatus] = useState<'idle' | 'checking' | 'validated' | 'failed'>('idle');
  const [attributionComplete, setAttributionComplete] = useState(false);

  // CRITICAL: Force disconnect on mount - enforce stateless sessions
  // This ensures no cached wallet sessions persist across page reloads
  useEffect(() => {
    if (connected && wallet) {
      // Immediately disconnect any auto-connected wallet
      disconnect().catch((error) => {
        console.error('Error disconnecting wallet on mount:', error);
      });
    }
    // Reset verification state on mount (no session memory)
    setIsVerified(false);
    setVerificationError(null);
  }, []); // Run only once on mount

  // Reset verification when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setIsVerified(false);
      setVerificationError(null);
    }
  }, [connected]);

  // Countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, COUNTDOWN_END_UTC - now);
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format countdown display
  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Wallet activation via signature (MANDATORY before any features unlock)
  const handleVerifyWallet = useCallback(async () => {
    if (!publicKey || !signMessage) return;

    setVerificationError(null);

    try {
      // Generate unique nonce and timestamp
      const nonce = crypto.randomUUID();
      const timestamp = Math.floor(Date.now() / 1000);

      // Create activation message
      const message = `Activate wallet for affiliate access

Wallet: ${publicKey.toString()}
Timestamp: ${timestamp}
Nonce: ${nonce}`;

      // Request signature from user
      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);

      // Convert signature to base64
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < signature.length; i += chunkSize) {
        binary += String.fromCharCode(...signature.slice(i, i + chunkSize));
      }
      const signedMessage = btoa(binary);

      // Send to backend for verification
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
      const response = await fetch(`${backendUrl}/api/verify-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toString(),
          signature: signedMessage,
          message,
          nonce,
          timestamp,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Wallet verification failed');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Wallet verification failed');
      }

      // Wallet activated - unlock features
      setIsVerified(true);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Verification failed');
      setIsVerified(false);
    }
  }, [publicKey, signMessage]);

  // Check for ?via= parameter (referred user) - NO SIGNING HERE
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viaParam = urlParams.get('via');
    if (viaParam) {
      setAffiliateIdFromUrl(viaParam);
    }
  }, []);

  // Fetch referrer data when wallet is verified - NO SIGNING HERE, READ-ONLY
  // CRITICAL: Frontend only reads from backend, never modifies referral counts
  // Referral completion is ONLY determined by Rewardful webhooks
  useEffect(() => {
    const fetchReferrerData = async () => {
      // Only fetch if wallet is connected AND verified
      if (!publicKey || !connected || !isVerified) return;

      try {
        // Get validation and affiliate data from mock backend
        const data = await getReferrerData(publicKey.toString());
        
        // Display existing state (read-only, no authorization implied)
        if (data.validated) {
          setValidationStatus('validated');
          
          if (data.affiliate_id) {
            setReferralLink(`${window.location.origin}${window.location.pathname}?via=${data.affiliate_id}`);
          }
        }

        // CRITICAL: Get referral progress from backend API (webhook-driven)
        // Frontend never calculates or modifies referral counts
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
        try {
          const progressResponse = await fetch(`${backendUrl}/api/referral-progress/${publicKey.toString()}`);
          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            if (progressData.success) {
              // Use backend data (source of truth from webhooks)
              setReferrerData({
                successful_referrals: progressData.successful_referrals,
                allocation_multiplier: progressData.allocation_multiplier.total,
                max_bonus_reached: progressData.allocation_multiplier.max_bonus_reached,
              });
            } else {
              // Fallback to mock backend data if API fails
              if (data.allocation_multiplier) {
                setReferrerData({
                  successful_referrals: data.allocation_multiplier.successful_referrals,
                  allocation_multiplier: data.allocation_multiplier.total_multiplier,
                  max_bonus_reached: data.allocation_multiplier.max_bonus_reached,
                });
              }
            }
          } else {
            // Fallback to mock backend data if API unavailable
            if (data.allocation_multiplier) {
              setReferrerData({
                successful_referrals: data.allocation_multiplier.successful_referrals,
                allocation_multiplier: data.allocation_multiplier.total_multiplier,
                max_bonus_reached: data.allocation_multiplier.max_bonus_reached,
              });
            }
          }
        } catch (progressError) {
          console.error('Error fetching referral progress from backend:', progressError);
          // Fallback to mock backend data
          if (data.allocation_multiplier) {
            setReferrerData({
              successful_referrals: data.allocation_multiplier.successful_referrals,
              allocation_multiplier: data.allocation_multiplier.total_multiplier,
              max_bonus_reached: data.allocation_multiplier.max_bonus_reached,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching referrer data:', error);
      }
    };

    fetchReferrerData();
  }, [publicKey, connected, isVerified]);

  // Validate holdings - REQUIRES SIGNATURE (user click only)
  const handleValidateHoldings = useCallback(async () => {
    if (!publicKey || !signMessage) return;

    setValidationStatus('checking');
    setValidationError(null);

    try {
      // Generate nonce and timestamp
      const nonce = generateNonce();
      const timestamp = Date.now();
      
      // Create message to sign
      const message = `Action: ValidateHoldings
Wallet: ${publicKey.toString()}
Timestamp: ${timestamp}
Nonce: ${nonce}`;

      // Request signature from user
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);
      
      // Convert signature to base64 (browser-compatible)
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < signature.length; i += chunkSize) {
        binary += String.fromCharCode(...signature.slice(i, i + chunkSize));
      }
      const signedMessage = btoa(binary);

      // Send to backend with signature
      const result = await validateHoldings({
        wallet: publicKey.toString(),
        message,
        signature: signedMessage,
        timestamp,
        nonce,
      });
      
      if (result.validated) {
        setValidationStatus('validated');
        
        // Note: Affiliate link issuance requires a separate signature
        // User must click "Get Referral Link" button after validation
        // This ensures explicit user consent for link issuance
        
        // Refresh referrer data
        const data = await getReferrerData(publicKey.toString());
        if (data.allocation_multiplier) {
          setReferrerData({
            successful_referrals: data.allocation_multiplier.successful_referrals,
            allocation_multiplier: data.allocation_multiplier.total_multiplier,
            max_bonus_reached: data.allocation_multiplier.max_bonus_reached,
          });
        }
      } else {
        setValidationStatus('failed');
        setValidationError(result.error || 'Validation failed');
      }
    } catch (error) {
      setValidationStatus('failed');
      setValidationError(error instanceof Error ? error.message : 'Validation error');
    }
  }, [publicKey, signMessage]);

  // Issue affiliate link - REQUIRES SIGNATURE (user click only)
  const handleIssueAffiliateLink = useCallback(async () => {
    if (!publicKey || !signMessage) return;

    try {
      // Generate nonce and timestamp
      const nonce = generateNonce();
      const timestamp = Date.now();
      
      // Create message to sign
      const message = `Action: IssueAffiliateLink
Wallet: ${publicKey.toString()}
Timestamp: ${timestamp}
Nonce: ${nonce}`;

      // Request signature from user
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);
      
      // Convert signature to base64
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < signature.length; i += chunkSize) {
        binary += String.fromCharCode(...signature.slice(i, i + chunkSize));
      }
      const signedMessage = btoa(binary);

      // Send to backend with signature
      const linkResult = await issueAffiliateLink({
        wallet: publicKey.toString(),
        message,
        signature: signedMessage,
        timestamp,
        nonce,
      });
      
      if (linkResult.success && linkResult.referral_link) {
        setReferralLink(linkResult.referral_link);
      }
    } catch (error) {
      console.error('Error issuing affiliate link:', error);
    }
  }, [publicKey, signMessage]);

  // Attribute referral - REQUIRES SIGNATURE (user click only)
  const handleAttributeReferral = useCallback(async () => {
    if (!publicKey || !signMessage || !affiliateIdFromUrl || attributionComplete) return;

    try {
      // Generate nonce and timestamp
      const nonce = generateNonce();
      const timestamp = Date.now();
      
      // Create message to sign
      const message = `Action: AttributeReferral
Wallet: ${publicKey.toString()}
AffiliateID: ${affiliateIdFromUrl}
Timestamp: ${timestamp}
Nonce: ${nonce}`;

      // Request signature from user
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);
      
      // Convert signature to base64
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < signature.length; i += chunkSize) {
        binary += String.fromCharCode(...signature.slice(i, i + chunkSize));
      }
      const signedMessage = btoa(binary);

      // Send to backend with signature
      const result = await attributeReferral({
        referred_wallet: publicKey.toString(),
        affiliate_id: affiliateIdFromUrl,
        message,
        signature: signedMessage,
        timestamp,
        nonce,
      });
      
      if (result.success) {
        setAttributionComplete(true);
      }
    } catch (error) {
      console.error('Attribution error:', error);
    }
  }, [publicKey, signMessage, affiliateIdFromUrl, attributionComplete]);

  // Validate referred wallet (for users who came via ?via=)
  const handleValidateReferredWallet = useCallback(async () => {
    if (!publicKey || !affiliateIdFromUrl) return;

    setReferredValidationStatus('checking');

    try {
      const result = await validateReferredWallet(publicKey.toString());
      
      if (result.validated) {
        setReferredValidationStatus('validated');
      } else {
        setReferredValidationStatus('failed');
      }
    } catch (error) {
      setReferredValidationStatus('failed');
      console.error('Referred wallet validation error:', error);
    }
  }, [publicKey, affiliateIdFromUrl]);

  // Copy referral link
  const handleCopyLink = useCallback(() => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
  }, [referralLink]);

  // Truncate wallet address
  const truncateAddress = (address: string): string => {
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto text-white">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Countdown Window</h1>
        <p className="text-sm text-gray-300">
          The window closes when the timer reaches zero.
        </p>
      </header>

      {/* Countdown Timer */}
      <section className="mb-8">
        <div className="text-6xl font-mono font-bold text-center">
          {formatCountdown(countdown)}
        </div>
      </section>

      {/* Wallet Connection */}
      <section className="mb-8">
        {!connected ? (
          <div className="flex justify-center">
            <WalletMultiButton />
          </div>
        ) : publicKey ? (
          <div className="text-center">
            <p className="text-sm text-gray-200">
              Wallet detected: {truncateAddress(publicKey.toString())} (read-only)
            </p>
          </div>
        ) : null}
      </section>

      {/* WALLET ACTIVATION GATE - Locks app until signature */}
      {connected && publicKey && !isVerified && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-80 border-2 border-yellow-600 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">
              Signature Required to Activate Wallet
            </h2>
            <p className="text-sm text-gray-300 mb-2">
              Wallet detected (read-only)
            </p>
            <p className="text-sm text-gray-300 mb-4">
              To continue, you must verify ownership with a signature.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              This signature activates your wallet for affiliate access. No features are available until you verify.
            </p>
            {verificationError && (
              <p className="text-sm text-red-400 mb-4">{verificationError}</p>
            )}
            <button
              onClick={handleVerifyWallet}
              disabled={!signMessage}
              className="px-8 py-4 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-semibold text-lg"
            >
              Verify Wallet
            </button>
            <p className="text-xs text-gray-500 mt-4">
              If you refuse to sign, features remain locked.
            </p>
          </div>
        </section>
      )}

      {/* ALL FEATURES LOCKED UNTIL VERIFIED */}
      {!isVerified && connected && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-50 border border-gray-700 rounded-lg p-6 text-center">
            <p className="text-sm text-gray-400">
              All features are locked until wallet is verified.
            </p>
          </div>
        </section>
      )}

      {/* Validation Gate - Primary CTA (Only shown if wallet is verified) */}
      {isVerified && publicKey && validationStatus !== 'validated' && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-50 border border-gray-700 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">
              Validate Holdings + Obtain Referral Link
            </h2>
            <p className="text-sm text-gray-300 mb-4">
              You must hold ≥ ${VALIDATION_THRESHOLD_USD} USD worth of the countdown token to receive a referral link.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              This action requires a wallet signature to authorize validation.
            </p>
            {validationStatus === 'checking' && (
              <p className="text-sm text-gray-400 mb-4">Validating holdings...</p>
            )}
            {validationStatus === 'failed' && validationError && (
              <p className="text-sm text-red-400 mb-4">{validationError}</p>
            )}
            <button
              onClick={handleValidateHoldings}
              disabled={validationStatus === 'checking' || !signMessage}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-medium"
            >
              {validationStatus === 'checking' ? 'Validating...' : 'Validate Holdings'}
            </button>
          </div>
        </section>
      )}

      {/* Get Referral Link Button (After validation, requires signature) */}
      {publicKey && validationStatus === 'validated' && !referralLink && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-50 border border-gray-700 rounded-lg p-6 text-center">
            <h2 className="text-lg font-semibold mb-4">Get Your Referral Link</h2>
            <p className="text-sm text-gray-300 mb-4">
              Your holdings are validated. Get your unique referral link to start earning bonuses.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              This action requires a wallet signature to authorize link issuance.
            </p>
            <button
              onClick={handleIssueAffiliateLink}
              disabled={!signMessage}
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-medium"
            >
              Get Referral Link
            </button>
          </div>
        </section>
      )}

      {/* Referral Link Display (After issuance and verification) */}
      {isVerified && publicKey && validationStatus === 'validated' && referralLink && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Your Referral Link</h2>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="flex-1 px-3 py-2 border border-gray-400 rounded bg-gray-800 text-white text-sm"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Share this link to earn referral bonuses. Each successful referral adds +1× to your allocation multiplier (max 3×).
            </p>
          </div>
        </section>
      )}

      {/* Allocation Multiplier (Only shown if verified) */}
      {isVerified && publicKey && validationStatus === 'validated' && referrerData && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Allocation Multiplier</h2>
            <div className="space-y-2 text-sm">
              <p className="text-white">
                Base multiplier: <span className="font-semibold">2×</span>
              </p>
              <p className="text-white">
                Referral bonus: <span className="font-semibold">+{referrerData.successful_referrals}×</span>
                {referrerData.max_bonus_reached && (
                  <span className="text-yellow-400 ml-2">(Max reached)</span>
                )}
              </p>
              <p className="text-lg font-bold text-green-400">
                Total: {referrerData.allocation_multiplier}×
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Successful referrals: {referrerData.successful_referrals} / 3
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Referred User Section (Only shown if verified) */}
      {isVerified && publicKey && affiliateIdFromUrl && !attributionComplete && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Referred User</h2>
            <p className="text-sm text-gray-300 mb-4">
              You arrived via a referral link. Sign to authorize referral attribution.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              This action requires a wallet signature to authorize attribution.
            </p>
            <button
              onClick={handleAttributeReferral}
              disabled={!signMessage}
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-medium"
            >
              Authorize Referral Attribution
            </button>
          </div>
        </section>
      )}

      {/* Referred User Validation (Only shown if verified) */}
      {isVerified && publicKey && affiliateIdFromUrl && attributionComplete && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Referred User</h2>
            <p className="text-sm text-gray-300 mb-4">
              Referral attributed. Validate your holdings to count as a successful referral.
            </p>
            {referredValidationStatus === 'idle' && (
              <button
                onClick={handleValidateReferredWallet}
                className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
              >
                Validate Holdings
              </button>
            )}
            {referredValidationStatus === 'checking' && (
              <p className="text-sm text-gray-400">Validating...</p>
            )}
            {referredValidationStatus === 'validated' && (
              <p className="text-sm text-green-400">✓ Validated - You count as a successful referral!</p>
            )}
            {referredValidationStatus === 'failed' && (
              <p className="text-sm text-red-400">Validation failed - You must hold ≥ ${VALIDATION_THRESHOLD_USD} USD worth of token.</p>
            )}
          </div>
        </section>
      )}

      {/* Simple Explanation */}
      <section className="mt-12 pt-8 border-t border-gray-400 border-opacity-50">
        <p className="text-sm text-gray-200">
          Referral links are earned by validating holdings (≥ $2 USD). Each successful referral adds +1× to your allocation multiplier, up to a maximum of 3× total. All actions require wallet signatures for security.
        </p>
      </section>
    </div>
  );
}

export default App;
