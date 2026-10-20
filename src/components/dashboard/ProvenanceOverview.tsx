import React from 'react';
import { Users, Bot, Sparkles, ShieldAlert, History } from 'lucide-react';
import { ProvenanceSignals } from '../../types/analysis';

interface ProvenanceOverviewProps {
  provenance: ProvenanceSignals;
}

export const ProvenanceOverview: React.FC<ProvenanceOverviewProps> = ({ provenance }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">
              Provenance & Activity Signals (Initial Scope)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Public contribution indicators and explicit tooling artifacts
          </p>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-800 text-indigo-300">
          Independent of Quality Score
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Contributor distribution */}
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Contributor Profile</span>
          </div>

          <div className="text-xs text-slate-300 space-y-1">
            <p>
              Sampled contributors: <strong className="font-mono text-white">{provenance.totalContributorsSampled}</strong>
            </p>
            <p className="capitalize">
              Pattern: <strong className="text-slate-200">{provenance.commitAuthorConsistency.replace(/_/g, ' ')}</strong>
            </p>
          </div>

          {provenance.topContributors.length > 0 && (
            <div className="pt-2 border-t border-slate-800/60">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-1.5">
                Top Sampled Contributors:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {provenance.topContributors.map((c) => (
                  <span
                    key={c.login}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono"
                  >
                    @{c.login} ({c.contributions})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bot activity */}
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Bot className="w-4 h-4 text-blue-400" />
            <span>Automated Bot Activity</span>
          </div>

          <p className="text-xs text-slate-300">
            {provenance.botActivityDetected ? (
              <span className="text-blue-300 font-medium">
                Automated bot commits or dependency automation detected.
              </span>
            ) : (
              'No standard dependency bot accounts identified in recent commit sample.'
            )}
          </p>

          {provenance.botDetails && (
            <div className="pt-2 border-t border-slate-800/60 space-y-1">
              {provenance.botDetails.map((b, i) => (
                <div key={i} className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded">
                  {b}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Tooling Artifacts */}
        <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>AI Tooling Indicators</span>
          </div>

          <p className="text-xs text-slate-300">
            {provenance.aiToolingDetected ? (
              <span className="text-purple-300 font-medium">
                Observed explicit AI configuration files or documentation disclosures.
              </span>
            ) : (
              'AI provenance unknown. No explicit AI configuration files (.cursorrules, copilot instructions) detected.'
            )}
          </p>

          {provenance.aiToolingEvidence && (
            <div className="pt-2 border-t border-slate-800/60 space-y-1">
              {provenance.aiToolingEvidence.map((ev, i) => (
                <div key={i} className="text-[11px] font-mono text-purple-300 bg-purple-950/40 border border-purple-900/60 px-2 py-1 rounded">
                  {ev}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Prominent disclaimer notice */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950 border border-slate-800/90 text-[11px] text-slate-400">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">{provenance.disclaimer}</p>
      </div>
    </div>
  );
};
