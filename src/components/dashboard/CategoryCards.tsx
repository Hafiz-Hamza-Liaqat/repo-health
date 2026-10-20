import React, { useState } from 'react';
import {
  FileText,
  Scale,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Tag,
  Info,
  Beaker,
} from 'lucide-react';
import { AssessmentCategoryKey, CategoryScore, Finding } from '../../types/scoring';
import { Badge } from '../common/Badge';

interface CategoryCardsProps {
  categoryScores: Record<AssessmentCategoryKey, CategoryScore>;
}

export const CategoryCards: React.FC<CategoryCardsProps> = ({ categoryScores }) => {
  const [selectedCat, setSelectedCat] = useState<AssessmentCategoryKey | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const categories = Object.values(categoryScores);

  // Filter findings
  const displayedCategories = selectedCat === 'all'
    ? categories
    : categories.filter((c) => c.category === selectedCat);

  const getStatusIcon = (status: Finding['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'issue':
        return <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  const getCategoryIcon = (cat: AssessmentCategoryKey) => {
    switch (cat) {
      case 'documentation':
        return <FileText className="w-4 h-4" />;
      case 'license':
        return <Scale className="w-4 h-4" />;
      case 'ci_cd':
        return <GitPullRequest className="w-4 h-4" />;
      case 'testing':
        return <Beaker className="w-4 h-4" />;
      case 'releases':
        return <Tag className="w-4 h-4" />;
      case 'metadata':
        return <Info className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Category header & Filter pills */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-white">Category Findings & Verification</h3>
          <p className="text-xs text-slate-400">
            Transparent rules, point effects, and direct evidence links
          </p>
        </div>

        {/* Filter by status */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 mr-1">Status:</span>
          {(['all', 'issue', 'warning', 'pass'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Category selector tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCat('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedCat === 'all'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          All Categories
        </button>
        {categories.map((c) => {
          const isSelected = selectedCat === c.category;
          return (
            <button
              key={c.category}
              onClick={() => setSelectedCat(c.category)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {getCategoryIcon(c.category)}
              <span>{c.label}</span>
              <span className="font-mono text-[10px] opacity-75">({c.percentage}%)</span>
            </button>
          );
        })}
      </div>

      {/* Findings lists by category */}
      <div className="space-y-6">
        {displayedCategories.map((catScore) => {
          const filteredFindings = catScore.findings.filter((f) => {
            if (filterStatus === 'all') return true;
            return f.status === filterStatus;
          });

          if (filteredFindings.length === 0 && filterStatus !== 'all') {
            return null;
          }

          return (
            <div
              key={catScore.category}
              className="border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden"
            >
              {/* Category banner */}
              <div className="p-4 bg-slate-850/80 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded bg-slate-800 text-emerald-400">
                    {getCategoryIcon(catScore.category)}
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{catScore.label}</h4>
                    <span className="text-xs text-slate-400">
                      Weight: {catScore.weight} pts ({catScore.earnedPoints} earned)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-white">
                      {catScore.percentage}%
                    </span>
                    <span className="text-[10px] text-slate-400 block">Category Score</span>
                  </div>
                </div>
              </div>

              {/* Findings list */}
              <div className="divide-y divide-slate-800/80">
                {filteredFindings.map((f) => {
                  return (
                    <div key={f.id} className="p-4 hover:bg-slate-900/40 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1">
                          {getStatusIcon(f.status)}
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-slate-100">
                                {f.title}
                              </span>
                              <Badge status={f.status}>{f.status.replace(/_/g, ' ')}</Badge>
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                {f.ruleId}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 leading-relaxed">
                              {f.explanation}
                            </p>

                            {/* Evidence block */}
                            {f.evidence && (
                              <div className="mt-2 text-xs bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between gap-2">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] uppercase font-semibold text-slate-500">
                                    {f.evidence.label}
                                  </span>
                                  <p className="font-mono text-slate-300 text-[11px]">
                                    {f.evidence.value}
                                  </p>
                                </div>
                                {f.evidence.sourceUrl && (
                                  <a
                                    href={f.evidence.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                                  >
                                    <span>View Source</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Recommendation */}
                            {f.recommendation && (
                              <div className="mt-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg p-2 flex items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                                <div>
                                  <span className="font-semibold block text-[11px]">Recommendation:</span>
                                  <span className="text-slate-300">{f.recommendation}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Point effect badge */}
                        <div className="shrink-0 text-right font-mono text-xs">
                          <span
                            className={`font-semibold ${
                              f.scoreEffect === f.maxEffect
                                ? 'text-emerald-400'
                                : f.scoreEffect > 0
                                ? 'text-amber-400'
                                : 'text-slate-500'
                            }`}
                          >
                            +{f.scoreEffect}
                          </span>
                          <span className="text-slate-600"> / {f.maxEffect} pts</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
