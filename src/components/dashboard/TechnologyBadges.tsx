import React, { useState } from 'react';
import { Cpu, ChevronDown, ChevronUp, FileCode } from 'lucide-react';
import { DetectedTechnology } from '../../types/technology';
import { Badge } from '../common/Badge';

interface TechnologyBadgesProps {
  technologies: DetectedTechnology[];
}

export const TechnologyBadges: React.FC<TechnologyBadgesProps> = ({ technologies }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">Technology Stack & Evidence</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Verified from project manifests, configuration files, and GitHub language statistics
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {technologies.length} technologies identified
        </span>
      </div>

      {technologies.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-500">
          No recognized technologies or framework configurations were detected from public manifests.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {technologies.map((tech) => {
            const isExpanded = expandedId === tech.id;

            return (
              <div
                key={tech.id}
                className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-all cursor-pointer"
                onClick={() => toggleExpand(tech.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white">{tech.name}</span>
                      {tech.version && (
                        <span className="text-[10px] font-mono text-slate-400">
                          {tech.version}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      {tech.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Badge confidence={tech.confidence}>
                      {tech.confidence.replace(/_/g, ' ')}
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {tech.description}
                </p>

                {/* Evidence dropdown */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs animate-fadeIn">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Observed Evidence:
                    </span>
                    {tech.evidence.map((ev, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-1.5 font-mono text-[11px] text-emerald-400 bg-slate-900 px-2 py-1 rounded"
                      >
                        <FileCode className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          {ev.file ? `${ev.file}: ` : ''}
                          {ev.detail}
                        </span>
                      </div>
                    ))}
                    {tech.disclaimer && (
                      <p className="text-[10px] text-slate-500 italic pt-1">
                        {tech.disclaimer}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
