import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 py-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>
            <strong>RepoHealth</strong> — Public GitHub Repository Health & Evidence Analyzer
          </span>
        </div>

        <div className="text-center md:text-right space-y-1">
          <p>
            Assessments are automated indicators based strictly on public repository data.
          </p>
          <p className="text-slate-600">
            Phase 2 supports public repositories without requiring credentials or private access.
          </p>
        </div>
      </div>
    </footer>
  );
};
