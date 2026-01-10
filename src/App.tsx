import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [showLearnMore, setShowLearnMore] = useState<boolean>(false);
  const [activationPending, setActivationPending] = useState<boolean>(false);
  
  // SAFETY GUARD: Track user-initiated connection intent
  // CRITICAL: This flag is ONLY set when user explicitly clicks Connect Wallet button
  // Prevents auto-sign on page load, refresh, wallet auto-reconnect, or background rehydration
  const userClickedConnect = useRef<boolean>(false); // Set ONLY on Connect Wallet click
  const previousConnectedState = useRef<boolean | null>(null); // null = initial state
  const hasSeenDisconnectAfterMount = useRef<boolean>(false); // Track if we've seen disconnect after mount
  
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
    setActivationPending(false);
    // CRITICAL: Clear user intent flags on mount (prevents auto-sign on load/refresh)
    userClickedConnect.current = false;
    previousConnectedState.current = null; // null = initial state
    hasSeenDisconnectAfterMount.current = false;
  }, []); // Run only once on mount

  // Reset verification when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setIsVerified(false);
      setVerificationError(null);
      setActivationPending(false);
      // Clear user intent when disconnected
      userClickedConnect.current = false;
      // Mark that we've seen a disconnect (after mount, this means user can reconnect)
      hasSeenDisconnectAfterMount.current = true;
    }
    // Track previous state to detect transitions
    if (previousConnectedState.current === null) {
      // First state we've seen - set it
      previousConnectedState.current = connected;
    }
  }, [connected]);

  // SAFETY GUARD: Track connection state transitions
  // This updates previousConnectedState to detect false → true transitions
  // But does NOT set activation flag - that requires explicit user click
  useEffect(() => {
    // Update previous state for next render
    if (previousConnectedState.current !== null) {
      previousConnectedState.current = connected;
    } else {
      // First state we've seen - set it
      previousConnectedState.current = connected;
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
  // Accepts nonce and timestamp from caller (must be fetched from /api/nonce)
  const beginActivation = useCallback(async (nonce: string, timestamp: number) => {
    if (!publicKey || !signMessage) {
      setActivationPending(false);
      return;
    }

    setVerificationError(null);

    try {
      // Create activation message
      const message = `Verify ownership and continue

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
      // Use relative URL for Vercel serverless functions, or VITE_BACKEND_URL if set
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const apiPath = backendUrl ? `${backendUrl}/api/verify-wallet` : '/api/verify-wallet';
      const response = await fetch(apiPath, {
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
        throw new Error(errorData.error || errorData.code || 'Wallet verification failed');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || data.code || 'Wallet verification failed');
      }

      // Wallet activated - unlock features
      setIsVerified(true);
      setActivationPending(false);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Verification failed');
      setIsVerified(false);
      setActivationPending(false);
    }
  }, [publicKey, signMessage]);

  // Auto-activate on connect (1 click + 1 signature flow)
  // SAFETY GUARD: Only triggers if userClickedConnect flag is set (explicit user click)
  // This prevents auto-sign on page load, refresh, wallet auto-reconnect, or background rehydration
  // NOTE: This useEffect must be AFTER beginActivation declaration
  useEffect(() => {
    const wasDisconnected = previousConnectedState.current === false;
    const isNowConnected = connected === true;
    const transitionedToConnected = wasDisconnected && isNowConnected;
    
    // Only attempt activation if ALL conditions are met:
    // 1. User explicitly clicked Connect Wallet (SAFETY GUARD - REQUIRED)
    // 2. Connection transitioned from false → true (user's click resulted in connection)
    // 3. We've seen a disconnect after mount (prevents auto-reconnect on page load)
    // 4. Currently connected
    // 5. Not already verified
    // 6. Not already pending activation
    // 7. User has signMessage capability
    if (
      userClickedConnect.current && // EXPLICIT GUARD: Only set on user click
      transitionedToConnected &&
      hasSeenDisconnectAfterMount.current &&
      connected &&
      publicKey &&
      !isVerified &&
      !activationPending &&
      signMessage
    ) {
      setActivationPending(true);
      // Fetch nonce before activation
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const noncePath = backendUrl ? `${backendUrl}/api/nonce` : '/api/nonce';
      fetch(noncePath)
        .then(res => res.json())
        .then(nonceData => {
          if (nonceData.success && nonceData.nonce && nonceData.timestamp) {
            beginActivation(nonceData.nonce, nonceData.timestamp);
          } else {
            setVerificationError('Failed to fetch nonce');
            setActivationPending(false);
          }
        })
        .catch(error => {
          setVerificationError('Failed to fetch nonce');
          setActivationPending(false);
        });
      // Clear flag after triggering (prevents re-prompt if user cancels)
      userClickedConnect.current = false;
    }
  }, [connected, publicKey, isVerified, activationPending, signMessage, beginActivation]);

  // Manual verification fallback (if user cancels signature)
  const handleVerifyWallet = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setVerificationError('Wallet not ready');
      return;
    }

    setActivationPending(true);
    setVerificationError(null);

    try {
      // Fetch a fresh nonce (EVERY click)
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const noncePath = backendUrl ? `${backendUrl}/api/nonce` : '/api/nonce';
      const nonceRes = await fetch(noncePath);
      const nonceData = await nonceRes.json();

      if (!nonceData.success || !nonceData.nonce || !nonceData.timestamp) {
        throw new Error('Failed to fetch nonce');
      }

      const { nonce, timestamp } = nonceData;

      // Call beginActivation with fetched nonce and timestamp
      await beginActivation(nonce, timestamp);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Verification failed');
      setActivationPending(false);
    }
  }, [publicKey, signMessage, beginActivation]);

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
        // Use relative URL for Vercel serverless functions, or VITE_BACKEND_URL if set
        const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
        const apiPath = backendUrl ? `${backendUrl}/api/referral-progress` : '/api/referral-progress';
        try {
          const progressResponse = await fetch(`${apiPath}/${publicKey.toString()}`);
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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Countdown Window</h1>
            <p className="text-sm text-gray-300">
              The window closes when the timer reaches zero.
            </p>
          </div>
          <button
            onClick={() => setShowLearnMore(true)}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Learn More
          </button>
        </div>
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
          <div 
            className="flex justify-center"
            onClick={() => {
              // SAFETY GUARD: Set flag ONLY when user clicks Connect Wallet
              // This is the ONLY place this flag is set - explicit user intent
              userClickedConnect.current = true;
            }}
          >
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
      {connected && publicKey && !isVerified && !activationPending && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-80 border-2 border-yellow-600 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">
              Signature Required to Continue
            </h2>
            <p className="text-sm text-gray-300 mb-4">
              You must sign to verify wallet ownership and continue.
            </p>
            {verificationError && (
              <p className="text-sm text-red-400 mb-4">{verificationError}</p>
            )}
            <button
              onClick={handleVerifyWallet}
              disabled={!signMessage}
              className="px-8 py-4 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-semibold text-lg"
            >
              Verify (sign)
            </button>
          </div>
        </section>
      )}

      {/* Activation in progress */}
      {connected && publicKey && !isVerified && activationPending && (
        <section className="mb-8">
          <div className="bg-gray-900 bg-opacity-80 border-2 border-blue-600 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-300">
              Please approve the signature request in your wallet...
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

      {/* Learn More Modal */}
      {showLearnMore && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold">How referrals work</h2>
              <button
                onClick={() => setShowLearnMore(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-gray-200">
              <div>
                <p className="mb-2">1. You must hold at least $2 of the token to unlock your referral link.</p>
              </div>
              
              <div>
                <p className="mb-2">2. You'll be asked to sign once to prove wallet ownership (no gas).</p>
              </div>
              
              <div>
                <p className="mb-2">3. Your referral link is unique to your wallet.</p>
              </div>
              
              <div>
                <p className="mb-2">4. A referral only counts when someone uses your link and buys/holds ≥ $2 during the window.</p>
              </div>
              
              <div>
                <p className="mb-2">5. When you reach 3 successful referrals, your allocation multiplier increases (max 3× total).</p>
              </div>
              
              <div>
                <p className="mb-2">6. When the timer ends, allocations are finalized and the airdrop occurs (after the timer ends).</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700">
              <h3 className="text-lg font-semibold mb-3">Troubleshooting</h3>
              <div className="space-y-3 text-sm text-gray-300">
                <div>
                  <p className="font-medium mb-1">I used a link but referrals didn't increase</p>
                  <p className="text-gray-400">They haven't hit $2 yet or Rewardful hasn't confirmed yet.</p>
                </div>
                <div>
                  <p className="font-medium mb-1">I connected but nothing happened</p>
                  <p className="text-gray-400">You must sign to proceed.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
