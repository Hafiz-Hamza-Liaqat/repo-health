import React, { useEffect, useState } from 'react';
import { Activity, Key, Github } from 'lucide-react';
import { rateLimitTracker, RateLimitState } from '../../services/rateLimit';

interface HeaderProps {
  onOpenSettings: () => void;
  onReset: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, onReset }) => {
  const [rateLimit, setRateLimit] = useState<RateLimitState>(rateLimitTracker.getState());

  useEffect(() => {
    return rateLimitTracker.subscribe(setRateLimit);
  }, []);

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={onReset}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:border-emerald-400 group-hover:bg-emerald-500/20 transition-all">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">RepoHealth</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                Phase 1 MVP
              </span>
            </div>
            <p className="hidden md:block text-xs text-slate-400 leading-tight">
              Evaluate code. Verify evidence. Make better hiring decisions.
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Rate limit status pill */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-600 text-slate-300 transition-colors"
            title="Configure GitHub API and check rate limits"
          >
            <div
              className={`w-2 h-2 rounded-full ${
                rateLimit.remaining < 10
                  ? 'bg-rose-400 animate-pulse'
                  : rateLimit.remaining < 25
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span className="font-mono">{rateLimit.remaining} reqs left</span>
            <Key className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>

          {/* GitHub link */}
          <a
            href="https://github.com/repo-health"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="GitHub Repository"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </div>
    </header>
  );
};
