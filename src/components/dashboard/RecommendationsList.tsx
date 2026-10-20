import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ListOrdered } from 'lucide-react';
import { RepoHealthReport } from '../../types/report';
import { Badge } from '../common/Badge';

interface RecommendationsListProps {
  recommendations: RepoHealthReport['recommendations'];
}

export const RecommendationsList: React.FC<RecommendationsListProps> = ({
  recommendations,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-semibold text-white">Prioritized Recommendations</h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {recommendations.length} action items
        </span>
      </div>

      {recommendations.length === 0 ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-300 text-xs">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>
            No critical issues identified. Repository demonstrates strong baseline documentation, testing, CI/CD, and metadata practices.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => {
            let borderStyle = 'border-slate-800';
            let icon = <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />;

            if (rec.priority === 'high') {
              borderStyle = 'border-rose-900/40 bg-rose-950/20';
              icon = <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />;
            } else if (rec.priority === 'medium') {
              borderStyle = 'border-amber-900/40 bg-amber-950/20';
              icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
            }

            return (
              <div
                key={rec.id}
                className={`p-4 rounded-lg border ${borderStyle} flex items-start gap-3 transition-colors`}
              >
                {icon}
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">{rec.title}</span>
                    <Badge severity={rec.priority}>{rec.priority} priority</Badge>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 font-mono">
                      {rec.category.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 font-medium pt-0.5">
                    {rec.action}
                  </p>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    <strong className="text-slate-300">Why it matters:</strong> {rec.rationale}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
