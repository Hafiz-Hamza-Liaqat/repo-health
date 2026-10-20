import React from 'react';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

interface ScanProgressProps {
  currentStage: string;
  stageDetail?: string;
}

interface StageDef {
  key: string;
  label: string;
}

const STAGES: StageDef[] = [
  { key: 'fetching_meta', label: 'Querying repository metadata & languages' },
  { key: 'fetching_docs', label: 'Retrieving README and license documentation' },
  { key: 'fetching_ci', label: 'Inspecting GitHub Actions workflows & runs' },
  { key: 'fetching_releases', label: 'Checking published releases and Git version tags' },
  { key: 'fetching_history', label: 'Sampling commit author history and provenance' },
  { key: 'analyzing', label: 'Running evidence scoring and technology rules' },
];

export const ScanProgress: React.FC<ScanProgressProps> = ({
  currentStage,
  stageDetail,
}) => {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="w-full max-w-xl mx-auto my-8 p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-xl space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          <h3 className="text-sm font-semibold text-white">Analyzing Repository...</h3>
        </div>
        <span className="text-xs font-mono text-emerald-400">
          Step {Math.max(1, currentIdx + 1)} of {STAGES.length}
        </span>
      </div>

      <div className="space-y-3">
        {STAGES.map((stage, idx) => {
          const isDone = currentIdx > idx;
          const isCurrent = currentIdx === idx;
          const isPending = currentIdx < idx;

          return (
            <div
              key={stage.key}
              className={`flex items-center gap-3 text-xs transition-opacity duration-300 ${
                isPending ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-slate-600" />
                )}
              </div>
              <span
                className={`font-medium ${
                  isCurrent ? 'text-white' : isDone ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {stageDetail && (
        <div className="text-[11px] font-mono text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800/80 truncate">
          {stageDetail}
        </div>
      )}
    </div>
  );
};
