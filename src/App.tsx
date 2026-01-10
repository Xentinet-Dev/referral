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
  const { publicKey, signMessage } = useWallet();
  const [countdown, setCountdown] = useState<number>(0);
  
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

  // Check for ?via= parameter (referred user) - NO SIGNING HERE
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viaParam = urlParams.get('via');
    if (viaParam) {
      setAffiliateIdFromUrl(viaParam);
    }
  }, []);

  // Fetch referrer data when wallet connects - NO SIGNING HERE
  useEffect(() => {
    const fetchReferrerData = async () => {
      if (!publicKey) return;

      try {
        const data = await getReferrerData(publicKey.toString());
        
        if (data.validated) {
          setValidationStatus('validated');
          
          if (data.affiliate_id) {
            setReferralLink(`${window.location.origin}${window.location.pathname}?via=${data.affiliate_id}`);
          }
        }

        if (data.allocation_multiplier) {
          setReferrerData({
            successful_referrals: data.allocation_multiplier.successful_referrals,
            allocation_multiplier: data.allocation_multiplier.total_multiplier,
            max_bonus_reached: data.allocation_multiplier.max_bonus_reached,
          });
        }
      } catch (error) {
        console.error('Error fetching referrer data:', error);
      }
    };

    fetchReferrerData();
  }, [publicKey]);

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
        
        // Automatically issue affiliate link after validation (requires another signature)
        await handleIssueAffiliateLink();
        
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
        {publicKey ? (
          <div className="text-center">
            <p className="text-sm text-gray-200">
              Connected: {truncateAddress(publicKey.toString())}
            </p>
          </div>
        ) : (
          <div className="flex justify-center">
            <WalletMultiButton />
          </div>
        )}
      </section>

      {/* Validation Gate - Primary CTA */}
      {publicKey && validationStatus !== 'validated' && (
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

      {/* Referral Link (Only after validation) */}
      {publicKey && validationStatus === 'validated' && referralLink && (
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

      {/* Allocation Multiplier */}
      {publicKey && validationStatus === 'validated' && referrerData && (
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

      {/* Referred User Section */}
      {publicKey && affiliateIdFromUrl && !attributionComplete && (
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

      {/* Referred User Validation */}
      {publicKey && affiliateIdFromUrl && attributionComplete && (
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
