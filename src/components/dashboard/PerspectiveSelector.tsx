import React from 'react';
import { Layers, Wrench, Eye } from 'lucide-react';
import { ScoringPerspectiveKey } from '../../types/scoring';
import { SCORING_PERSPECTIVES } from '../../config/scoringProfiles';

interface PerspectiveSelectorProps {
  activeKey: ScoringPerspectiveKey;
  onChange: (key: ScoringPerspectiveKey) => void;
}

export const PerspectiveSelector: React.FC<PerspectiveSelectorProps> = ({
  activeKey,
  onChange,
}) => {
  const perspectives = Object.values(SCORING_PERSPECTIVES);

  const getIcon = (key: ScoringPerspectiveKey) => {
    switch (key) {
      case 'balanced':
        return <Layers className="w-4 h-4" />;
      case 'engineering':
        return <Wrench className="w-4 h-4" />;
      case 'presentation':
        return <Eye className="w-4 h-4" />;
    }
  };

  const activePerspective = SCORING_PERSPECTIVES[activeKey];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Assessment Perspective</h3>
          <p className="text-xs text-slate-400">
            Recalculate transparent score weights from the same verified findings
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {perspectives.map((p) => {
          const isActive = p.key === activeKey;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              className={`p-3 rounded-lg border text-left transition-all relative ${
                isActive
                  ? 'bg-slate-850 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={isActive ? 'text-emerald-400' : 'text-slate-500'}>
                  {getIcon(p.key)}
                </span>
                <span className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}>
                  {p.name}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                {p.tagline}
              </p>
            </button>
          );
        })}
      </div>

      <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>{activePerspective.description}</span>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span>Docs: {activePerspective.weights.documentation}%</span>
          <span>•</span>
          <span>Lic: {activePerspective.weights.license}%</span>
          <span>•</span>
          <span>CI/CD: {activePerspective.weights.ci_cd}%</span>
          <span>•</span>
          <span>Test: {activePerspective.weights.testing}%</span>
          <span>•</span>
          <span>Rel: {activePerspective.weights.releases}%</span>
          <span>•</span>
          <span>Meta: {activePerspective.weights.metadata}%</span>
        </div>
      </div>
    </div>
  );
};
