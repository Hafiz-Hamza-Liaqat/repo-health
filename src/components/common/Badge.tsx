import React from 'react';
import { FindingSeverity, FindingStatus } from '../../types/scoring';
import { TechConfidence } from '../../types/technology';

export interface BadgeProps {
  status?: FindingStatus;
  severity?: FindingSeverity;
  confidence?: TechConfidence;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  status,
  severity,
  confidence,
  children,
  className = '',
}) => {
  let colorStyles = 'bg-slate-800 text-slate-300 border-slate-700';

  if (status) {
    switch (status) {
      case 'pass':
        colorStyles = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50';
        break;
      case 'warning':
        colorStyles = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
        break;
      case 'issue':
        colorStyles = 'bg-rose-950/70 text-rose-300 border-rose-700/50';
        break;
      case 'not_detected':
        colorStyles = 'bg-slate-900 text-slate-400 border-slate-800';
        break;
      case 'unknown':
      case 'not_applicable':
        colorStyles = 'bg-purple-950/50 text-purple-300 border-purple-800/40';
        break;
    }
  } else if (severity) {
    switch (severity) {
      case 'high':
        colorStyles = 'bg-rose-950/70 text-rose-300 border-rose-700/50';
        break;
      case 'medium':
        colorStyles = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
        break;
      case 'low':
        colorStyles = 'bg-blue-950/70 text-blue-300 border-blue-700/50';
        break;
      case 'info':
        colorStyles = 'bg-slate-900 text-slate-300 border-slate-700';
        break;
    }
  } else if (confidence) {
    switch (confidence) {
      case 'strongly_evidenced':
        colorStyles = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50';
        break;
      case 'detected':
        colorStyles = 'bg-blue-950/70 text-blue-300 border-blue-700/50';
        break;
      case 'config_or_dependency_only':
        colorStyles = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
        break;
      case 'inferred':
        colorStyles = 'bg-indigo-950/70 text-indigo-300 border-indigo-700/50';
        break;
      default:
        colorStyles = 'bg-slate-900 text-slate-400 border-slate-800';
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorStyles} ${className}`}
    >
      {children}
    </span>
  );
};
