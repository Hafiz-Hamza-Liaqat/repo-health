import React, { useEffect, useState } from 'react';
import { X, Key, ShieldCheck, AlertCircle, CheckCircle2, Loader2, RotateCw } from 'lucide-react';
import { githubApi } from '../../services/githubApi';
import { rateLimitTracker, RateLimitState } from '../../services/rateLimit';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenSaved?: () => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  onTokenSaved,
}) => {
  const [tokenInput, setTokenInput] = useState<string>(githubApi.getCustomToken() || '');
  const [rateLimit, setRateLimit] = useState<RateLimitState>(rateLimitTracker.getState());
  const [isValidating, setIsValidating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = rateLimitTracker.subscribe(setRateLimit);
    return unsub;
  }, []);

  // When modal opens, sync input and proactively query rate limit
  useEffect(() => {
    if (isOpen) {
      setTokenInput(githubApi.getCustomToken() || '');
      setFeedback(null);
      githubApi.checkRateLimit().catch(() => {});
    }
  }, [isOpen]);

  // Live countdown timer ticker
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setRateLimit(rateLimitTracker.getState());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim();

    if (!cleanToken) {
      handleClear();
      return;
    }

    setIsValidating(true);
    setFeedback(null);

    // Apply token in memory and test against GitHub
    githubApi.setCustomToken(cleanToken);
    const { state, error } = await githubApi.checkRateLimit();
    setIsValidating(false);

    if (error && error.status === 401) {
      // Revert token on 401
      githubApi.setCustomToken(null);
      setFeedback({
        type: 'error',
        message: 'Invalid Personal Access Token. GitHub responded with 401 Bad credentials. Token was not saved.',
      });
      return;
    }

    if (error && error.status !== 0) {
      setFeedback({
        type: 'error',
        message: `Token test failed: ${error.message}`,
      });
      return;
    }

    setFeedback({
      type: 'success',
      message: `Token verified! Allowance increased to ${state.limit.toLocaleString()} requests/hour (${state.remaining} remaining).`,
    });
    onTokenSaved?.();
  };

  const handleClear = async () => {
    githubApi.setCustomToken(null);
    setTokenInput('');
    setIsValidating(true);
    const { state } = await githubApi.checkRateLimit();
    setIsValidating(false);
    setFeedback({
      type: 'success',
      message: `Token removed. Allowance reset to public baseline (${state.remaining}/${state.limit} remaining).`,
    });
  };

  const handleRefresh = async () => {
    setIsValidating(true);
    await githubApi.checkRateLimit();
    setIsValidating(false);
  };

  const isRateLimited = rateLimitTracker.isRateLimited();
  const resetMin = rateLimitTracker.getMinutesUntilReset();
  const resetClock = rateLimitTracker.getFormattedResetTime();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          aria-label="Close settings"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4 text-emerald-400">
          <Key className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-white">GitHub API & Rate Limits</h2>
        </div>

        {/* Rate limit status card */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800/80 mb-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <span>Hourly Request Allowance</span>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isValidating}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Refresh rate limit data from GitHub"
              >
                <RotateCw className={`w-3 h-3 ${isValidating ? 'animate-spin' : ''}`} />
              </button>
            </span>
            <span className="font-mono font-medium text-slate-200">
              {rateLimit.remaining} / {rateLimit.limit} remaining
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                isRateLimited || rateLimit.remaining < 10
                  ? 'bg-rose-500'
                  : rateLimit.remaining < 25
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{
                width: `${Math.max(0, Math.min(100, (rateLimit.remaining / rateLimit.limit) * 100))}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {isRateLimited ? (
                <span className="text-rose-400 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Rate limit exhausted!
                </span>
              ) : rateLimit.hasCustomToken ? (
                <span className="text-emerald-400 font-medium">Personal Access Token active</span>
              ) : (
                'Public unauthenticated requests'
              )}
            </span>
            <span>
              {isRateLimited ? (
                <span className="text-rose-300 font-medium">Resets in ~{resetMin} min (at {resetClock})</span>
              ) : (
                `Window resets at ${resetClock}`
              )}
            </span>
          </div>
        </div>

        {/* Optional token section */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Optional GitHub Personal Access Token (PAT)
            </label>
            <p className="text-xs text-slate-400 mb-2 leading-relaxed">
              Public IP requests allow 60 queries/hour. Adding a classic or fine-grained token with{' '}
              <strong className="text-slate-200">public_repo</strong> read-only permissions increases your limit to 5,000 queries/hour.
            </p>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              disabled={isValidating}
              autoComplete="off"
              spellCheck="false"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Your token is held exclusively in JavaScript memory for the active session. It is never written to disk, localStorage, or sessionStorage, never transmitted to third parties, and is discarded if you refresh or close this tab.
            </span>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/70 border border-rose-800 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <span className="leading-relaxed">{feedback.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {githubApi.hasCustomToken() ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={isValidating}
                className="text-xs text-rose-400 hover:text-rose-300 underline disabled:opacity-50"
              >
                Clear Token
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isValidating}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isValidating}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Save & Verify</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
