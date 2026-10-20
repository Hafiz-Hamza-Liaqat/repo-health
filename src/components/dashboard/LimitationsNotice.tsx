import React from 'react';
import { AlertCircle, CheckCircle2, Database } from 'lucide-react';
import { RepoHealthReport } from '../../types/report';

interface LimitationsNoticeProps {
  coverage: RepoHealthReport['dataCoverage'];
  notice: RepoHealthReport['notice'];
}

export const LimitationsNotice: React.FC<LimitationsNoticeProps> = ({
  coverage,
  notice,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-semibold text-white">Data Coverage & Limitations</h3>
        </div>
        <span className="text-xs font-mono text-emerald-400">
          {coverage.coveragePercentage}% API Coverage
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-2">
          <span className="font-semibold text-slate-200 block">Assessment Disclaimers</span>
          <p className="text-slate-400 leading-relaxed">
            {notice.disclaimer}
          </p>
          <p className="text-slate-400 leading-relaxed pt-1">
            {notice.assessmentPhilosophy}
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-2">
          <span className="font-semibold text-slate-200 block">Endpoints & Completeness</span>
          <div className="flex items-center justify-between text-slate-300">
            <span>Successful Endpoints:</span>
            <span className="font-mono text-emerald-400">
              {coverage.endpointsSucceeded} / {coverage.endpointsTotal}
            </span>
          </div>

          {coverage.limitations.length > 0 ? (
            <div className="pt-2 border-t border-slate-800 space-y-1 text-slate-400">
              {coverage.limitations.map((lim, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                  <span>{lim}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-2 border-t border-slate-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>All standard REST endpoints responded successfully with complete coverage.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
