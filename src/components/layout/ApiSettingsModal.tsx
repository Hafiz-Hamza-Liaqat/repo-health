import React, { useEffect, useState } from 'react';
import { X, Key, ShieldCheck } from 'lucide-react';
import { githubApi } from '../../services/githubApi';
import { rateLimitTracker, RateLimitState } from '../../services/rateLimit';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [token, setToken] = useState<string>(githubApi.getCustomToken() || '');
  const [rateLimit, setRateLimit] = useState<RateLimitState>(rateLimitTracker.getState());
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const unsub = rateLimitTracker.subscribe(setRateLimit);
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    githubApi.setCustomToken(token);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleClear = () => {
    githubApi.setCustomToken(null);
    setToken('');
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const resetMinutes = Math.ceil(rateLimitTracker.getSecondsUntilReset() / 60);

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
            <span>Hourly Request Allowance</span>
            <span className="font-mono">
              {rateLimit.remaining} / {rateLimit.limit} remaining
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                rateLimit.remaining < 10
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
              {rateLimitTracker.isRateLimited() ? (
                <span className="text-rose-400 font-medium">Rate limit exhausted!</span>
              ) : (
                'Public unauthenticated requests'
              )}
            </span>
            <span>Resets in ~{resetMinutes} min</span>
          </div>
        </div>

        {/* Optional token section */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Optional GitHub Personal Access Token (PAT)
            </label>
            <p className="text-xs text-slate-400 mb-2">
              Public requests allow 60 queries/hour. Adding a classic or fine-grained token with{' '}
              <strong className="text-slate-200">public_repo</strong> read-only permissions increases your limit to 5,000 queries/hour.
            </p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Your token is stored exclusively in this browser's session memory. It is never logged, sent to external servers, or persisted across browser restarts.
            </span>
          </div>

          {saveSuccess && (
            <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300">
              Settings updated successfully.
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {githubApi.hasCustomToken() ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-rose-400 hover:text-rose-300 underline"
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
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
