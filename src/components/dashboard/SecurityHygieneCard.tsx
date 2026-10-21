import React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  HelpCircle,
  FileCode,
  Info,
} from 'lucide-react';
import { SecurityHygieneAssessment, SecurityFinding } from '../../types/security';

interface SecurityHygieneCardProps {
  securityHygiene: SecurityHygieneAssessment;
}

export const SecurityHygieneCard: React.FC<SecurityHygieneCardProps> = ({
  securityHygiene,
}) => {
  const { findings, summary, coverage } = securityHygiene;

  const getStatusIcon = (status: SecurityFinding['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'unknown':
        return <HelpCircle className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'not_detected':
      default:
        return <Search className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  const getStatusBadge = (status: SecurityFinding['status']) => {
    switch (status) {
      case 'pass':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/80 border border-emerald-800 text-emerald-300">
            Pass
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/80 border border-amber-800 text-amber-300">
            Warning
          </span>
        );
      case 'unknown':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-950/80 border border-purple-800 text-purple-300">
            Unknown
          </span>
        );
      case 'not_detected':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800/80 border border-slate-700 text-slate-400">
            Not Detected
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Header & Meta Pill */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">
              Security & Supply-Chain Hygiene
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-850 text-slate-300 border border-slate-700 rounded-full">
              Phase 2.1A Heuristics
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Preliminary path-level verification • Independent of 100-point core score • Zero additional API calls
          </p>
        </div>

        {/* Reconciled Summary Strip */}
        <div
          className="flex flex-wrap items-center gap-2 text-xs font-mono"
          aria-label={`Security hygiene summary: ${summary.passCount} pass, ${summary.warningCount} warning, ${summary.notDetectedCount} not detected, ${summary.unknownCount} unknown out of ${findings.length} rules evaluated.`}
        >
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300"
            title={`${summary.passCount} passing security rules`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pass: {summary.passCount}
          </span>
          {summary.warningCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300"
              title={`${summary.warningCount} security warnings`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Flagged: {summary.warningCount}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400"
            title={`${summary.notDetectedCount} not detected (missing maturity artifacts)`}
          >
            <Search className="w-3.5 h-3.5 text-slate-500" />
            Not Found: {summary.notDetectedCount}
          </span>
          {summary.unknownCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800 text-purple-300"
              title={`${summary.unknownCount} indeterminate / unavailable results`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
              Indeterminate: {summary.unknownCount}
            </span>
          )}
        </div>
      </div>

      {/* Coverage note banner */}
      <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-400">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p>
            {coverage.notes[0] || 'Repository tracked paths inspected.'}
          </p>
          <p className="text-[10px] text-slate-500">
            Observation Notice: Missing security policy or dependency update files represent repository maturity opportunities, not confirmed exploitable vulnerabilities. Sensitive path indicators verify filename conventions only and do not inspect file contents or verify live credential status.
          </p>
        </div>
      </div>

      {/* 4 Security Rule Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {findings.map((f) => (
          <div
            key={f.id}
            className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-2.5 flex flex-col justify-between"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(f.status)}
                  <span className="text-xs font-mono font-semibold text-slate-400">
                    {f.ruleId}
                  </span>
                </div>
                {getStatusBadge(f.status)}
              </div>

              <h4 className="text-xs font-semibold text-white">
                {f.title}
              </h4>

              <p className="text-[11px] text-slate-300 leading-relaxed">
                {f.explanation}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/60">
              {f.evidence && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 truncate">
                  <FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-slate-500">{f.evidence.label}:</span>
                  <span className="text-slate-200 truncate" title={f.evidence.value}>
                    {f.evidence.value}
                  </span>
                </div>
              )}

              {f.recommendation && (
                <div className="text-[10px] text-slate-400 bg-slate-900/90 border border-slate-800 p-2 rounded leading-tight">
                  <span className="font-semibold text-slate-300 block mb-0.5">Remediation:</span>
                  {f.recommendation}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
