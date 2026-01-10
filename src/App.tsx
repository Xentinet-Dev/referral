import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  recordAttribution,
  getAttribution,
  getReferrals,
  verifyBuy,
  getBuyVerification,
} from './mockBackend';

// Constants
const COUNTDOWN_END_UTC = new Date('2024-12-31T23:59:59Z').getTime(); // Fixed UTC end timestamp
const TOKEN_MINT = 'So11111111111111111111111111111111111111112'; // Mock token mint (replace with actual)
const TOKEN_PRICE_USD = 0.5; // Mock price constant (replace with actual)
const QUALIFICATION_THRESHOLD_USD = 2.0;
const BONUS_THRESHOLD = 3; // 3 qualified buyers needed for bonus

function App() {
  const { publicKey, signMessage } = useWallet();
  const { connection } = useConnection();
  const [countdown, setCountdown] = useState<number>(0);
  const [referrerWallet, setReferrerWallet] = useState<string | null>(null);
  const [attributionComplete, setAttributionComplete] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [usdValue, setUsdValue] = useState<number>(0);
  const [buyVerified, setBuyVerified] = useState<boolean | null>(null);
  const [referrals, setReferrals] = useState<string[]>([]);
  const [qualifiedBuyers, setQualifiedBuyers] = useState<number>(0);
  const [copied, setCopied] = useState(false);

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

  // Read referral from URL and store in sessionStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');

    if (refParam) {
      const stored = sessionStorage.getItem('referrer_wallet');
      // Never overwrite existing stored referrer
      if (!stored) {
        sessionStorage.setItem('referrer_wallet', refParam);
        setReferrerWallet(refParam);
      } else {
        setReferrerWallet(stored);
      }
    } else {
      // Check if already stored
      const stored = sessionStorage.getItem('referrer_wallet');
      if (stored) {
        setReferrerWallet(stored);
      }
    }
  }, []);

  // Handle referral attribution on first wallet connect
  useEffect(() => {
    const handleAttribution = async () => {
      if (
        !publicKey ||
        !referrerWallet ||
        attributionComplete ||
        !signMessage
      ) {
        return;
      }

      try {
        // Check if already attributed
        const existing = await getAttribution(publicKey.toString());
        if (existing.referrer) {
          setAttributionComplete(true);
          return;
        }

        // Prompt user to sign message
        const message = `I entered via referral from: ${referrerWallet}`;
        const encodedMessage = new TextEncoder().encode(message);

        const signature = await signMessage(encodedMessage);
        // Convert Uint8Array to base64 (browser-compatible)
        // Handle large arrays by chunking to avoid stack overflow
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < signature.length; i += chunkSize) {
          binary += String.fromCharCode(...signature.slice(i, i + chunkSize));
        }
        const signedMessage = btoa(binary);

        // Send to backend
        const response = await recordAttribution({
          referred_wallet: publicKey.toString(),
          referrer_wallet: referrerWallet,
          signed_message: signedMessage,
        });

        if (response.success) {
          setAttributionComplete(true);
        }
      } catch (error) {
        console.error('Attribution error:', error);
      }
    };

    handleAttribution();
  }, [publicKey, referrerWallet, attributionComplete, signMessage]);

  // Fetch token balance and calculate USD value
  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!publicKey || !connection) return;

      try {
        // Mock token balance fetch
        // In production, replace with actual SPL token balance check
        const mockBalance = Math.random() * 10; // Mock for demonstration
        setTokenBalance(mockBalance);
        setUsdValue(mockBalance * TOKEN_PRICE_USD);

        // Real implementation would be:
        // const tokenAccount = await getAccount(connection, tokenAccountPubkey);
        // const mintInfo = await getMint(connection, new PublicKey(TOKEN_MINT));
        // const balance = Number(tokenAccount.amount) / Math.pow(10, mintInfo.decimals);
      } catch (error) {
        console.error('Token balance error:', error);
      }
    };

    fetchTokenBalance();
    // Poll every 10 seconds (minimum)
    const interval = setInterval(fetchTokenBalance, 10000);
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  // Check buy verification status (for referred users only)
  // Once verified → permanently true, no re-checking
  useEffect(() => {
    const checkBuyVerification = async () => {
      if (!publicKey || !referrerWallet) return;

      // If already verified, stop checking
      if (buyVerified === true) return;

      try {
        // First check if already verified in backend
        const verification = await getBuyVerification(publicKey.toString());
        if (verification.verified) {
          setBuyVerified(true);
          return;
        }

        // Only attempt verification if not already verified
        // and countdown window is still active
        if (countdown > 0) {
          // Window starts from when countdown began
          // countdown = COUNTDOWN_END_UTC - now
          // So window_start = COUNTDOWN_END_UTC - countdown = now
          // For practical purposes, use a fixed window start (30 days before end)
          // In production, this should be the actual campaign start time
          const windowStart = COUNTDOWN_END_UTC - (30 * 24 * 60 * 60 * 1000); // 30 days before end
          const result = await verifyBuy({
            wallet: publicKey.toString(),
            token_mint: TOKEN_MINT,
            window_start: windowStart,
            window_end: COUNTDOWN_END_UTC,
          });
          
          if (result.verified) {
            setBuyVerified(true);
            return; // Stop polling once verified
          }
        }
      } catch (error) {
        console.error('Buy verification error:', error);
      }
    };

    if (referrerWallet && publicKey && buyVerified !== true) {
      checkBuyVerification();
      // Poll every 10 seconds (minimum) until verified
      const interval = setInterval(checkBuyVerification, 10000);
      return () => clearInterval(interval);
    }
  }, [publicKey, referrerWallet, countdown, buyVerified]);

  // Fetch referral stats
  useEffect(() => {
    const fetchReferralStats = async () => {
      if (!publicKey) return;

      try {
        const refs = await getReferrals(publicKey.toString());
        setReferrals(refs);

        // Count qualified buyers
        let qualified = 0;
        for (const wallet of refs) {
          const verification = await getBuyVerification(wallet);
          if (verification.verified) {
            qualified++;
          }
        }
        setQualifiedBuyers(qualified);
      } catch (error) {
        console.error('Referral stats error:', error);
      }
    };

    if (publicKey) {
      fetchReferralStats();
      // Poll every 10 seconds
      const interval = setInterval(fetchReferralStats, 10000);
      return () => clearInterval(interval);
    }
  }, [publicKey]);

  // Copy referral link
  const handleCopyLink = useCallback(() => {
    if (!publicKey) return;

    const link = `${window.location.origin}${window.location.pathname}?ref=${publicKey.toString()}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  // Qualification status
  const isQualified = usdValue >= QUALIFICATION_THRESHOLD_USD;
  const bonusEligible = qualifiedBuyers >= BONUS_THRESHOLD;

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

      {/* Referral Link Section */}
      {publicKey && (
        <section className="mb-8">
          <label className="block text-sm font-medium mb-2">
            Your Referral Link
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}${window.location.pathname}?ref=${publicKey.toString()}`}
              className="flex-1 px-3 py-2 border border-gray-400 rounded bg-gray-900 bg-opacity-50 text-white text-sm"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </section>
      )}

      {/* Token Qualification Status */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Token Qualification Status</h2>
        <div className="space-y-1 text-sm text-white">
          <p>Countdown token balance: {tokenBalance.toFixed(4)}</p>
          <p>USD value: ${usdValue.toFixed(2)}</p>
          <p className="font-medium">
            Qualification state:{' '}
            {isQualified ? (
              <span className="text-green-400">Qualified for Snapshot</span>
            ) : (
              <span className="text-red-400">Not Qualified</span>
            )}
          </p>
        </div>
      </section>

      {/* Buy Verification Status (Referred Users Only) */}
      {referrerWallet && publicKey && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Buy Verification Status</h2>
          <p className="text-sm text-white">
            Buy Verified:{' '}
            {buyVerified === null ? (
              <span className="text-gray-300">Checking...</span>
            ) : buyVerified ? (
              <span className="text-green-400">Yes</span>
            ) : (
              <span className="text-red-400">No</span>
            )}
          </p>
        </section>
      )}

      {/* Referral Progress */}
      {publicKey && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Referral Progress</h2>
          <div className="space-y-1 text-sm text-white">
            <p>Total Referrals: {referrals.length}</p>
            <p>Qualified Buyers: {qualifiedBuyers}</p>
            <p className="font-medium">
              Bonus Eligible:{' '}
              {bonusEligible ? (
                <span className="text-green-400">Yes</span>
              ) : (
                <span className="text-red-400">No</span>
              )}
            </p>
          </div>
        </section>
      )}

      {/* Simple Explanation */}
      <section className="mt-12 pt-8 border-t border-gray-400 border-opacity-50">
        <p className="text-sm text-gray-200">
          A referral is counted when a referred wallet acquires at least $2 worth of the token during the active window.
          Transfers and airdrops do not qualify.
        </p>
      </section>
    </div>
  );
}

export default App;
