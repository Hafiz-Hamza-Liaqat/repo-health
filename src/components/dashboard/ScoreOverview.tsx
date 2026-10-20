import React from 'react';
import { ScoreGauge } from '../common/ScoreGauge';
import { AssessmentScoreResult } from '../../types/scoring';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface ScoreOverviewProps {
  scoreResult: AssessmentScoreResult;
}

export const ScoreOverview: React.FC<ScoreOverviewProps> = ({ scoreResult }) => {
  const { totalScore, earnedTotal, maxTotal, grade, categoryScores, summary } = scoreResult;

  const categories = Object.values(categoryScores);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Overall gauge */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 border-b lg:border-b-0 lg:border-r border-slate-800/80">
          <ScoreGauge score={totalScore} grade={grade} size={150} />

          <div className="mt-4 text-center">
            <h2 className="text-sm font-semibold text-white">Repository Health Score</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {earnedTotal} earned of {maxTotal} applicable points
            </p>
          </div>

          {/* Quick summary badges */}
          <div className="flex items-center gap-2 mt-4 text-xs font-mono">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {summary.passCount} Pass
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              {summary.warningCount} Warning
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300">
              <XCircle className="w-3.5 h-3.5" />
              {summary.issueCount} Issue
            </span>
          </div>
        </div>

        {/* Right: Category bars */}
        <div className="lg:col-span-8 space-y-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-800">
            <span className="font-semibold text-slate-300">Category Evaluation</span>
            <span className="font-mono">Earned / Max Points</span>
          </div>

          <div className="space-y-3">
            {categories.map((cat) => {
              let barColor = 'bg-emerald-500';
              if (cat.percentage < 40) barColor = 'bg-rose-500';
              else if (cat.percentage < 70) barColor = 'bg-amber-500';

              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">{cat.label}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-400 text-[11px]">
                        ({cat.percentage}%)
                      </span>
                      <span className="text-white font-semibold">
                        {cat.earnedPoints} / {cat.maxPoints} pts
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800/80">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.max(3, cat.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
