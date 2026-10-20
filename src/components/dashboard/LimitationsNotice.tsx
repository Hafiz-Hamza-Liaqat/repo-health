import React from 'react';
import { AlertCircle, CheckCircle2, Database, FolderTree, Info } from 'lucide-react';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-semibold text-white">Data Coverage & Limitations</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-slate-850 border border-slate-700 text-slate-300">
            Endpoint responses: {coverage.endpointResponseLabel}
          </span>
          <span
            className={`px-2 py-0.5 rounded border ${
              coverage.treeStatus === 'complete'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : coverage.treeStatus === 'truncated'
                ? 'bg-amber-950/80 border-amber-800 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            Tree: {coverage.treeStatus}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Left: Disclaimers & Tree Completeness */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-3">
          <div className="space-y-1.5">
            <span className="font-semibold text-slate-200 block">Assessment Disclaimers</span>
            <p className="text-slate-400 leading-relaxed">
              {notice.disclaimer}
            </p>
            <p className="text-slate-400 leading-relaxed">
              {notice.assessmentPhilosophy}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
              Repository Tree Evidence
            </span>
            <p className="text-slate-400 font-mono text-[11px]">
              {coverage.treeCoverageNote}
            </p>
          </div>
        </div>

        {/* Right: Endpoints, Optional Resources, and Limitations */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-3">
          <div>
            <span className="font-semibold text-slate-200 block mb-1">API Requests Accounting</span>
            <div className="flex items-center justify-between text-slate-300">
              <span>Queried Endpoints Succeeded:</span>
              <span className="font-mono text-emerald-400">
                {coverage.endpointsSucceeded} / {coverage.endpointsTotal}
              </span>
            </div>
            {coverage.endpointsFailed > 0 && (
              <div className="mt-1 text-[11px] text-rose-300">
                Failed/rate-limited: {coverage.failedEndpoints.join(', ')}
              </div>
            )}
          </div>

          {coverage.absentOptionalResources.length > 0 && (
            <div className="pt-2 border-t border-slate-800 space-y-1">
              <span className="font-semibold text-slate-400 flex items-center gap-1.5 text-[11px]">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                Absent Optional Project Features (Not Failures)
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-400">
                {coverage.absentOptionalResources.map((res, i) => (
                  <li key={i}>{res}</li>
                ))}
              </ul>
            </div>
          )}

          {coverage.limitations.length > 0 ? (
            <div className="pt-2 border-t border-slate-800 space-y-1 text-slate-400">
              <span className="font-semibold text-slate-300 block text-[11px]">Identified Coverage Limitations</span>
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
              <span>Full evidence coverage across queried repository endpoints and tree.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
