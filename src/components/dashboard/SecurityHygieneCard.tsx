import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  HelpCircle,
  MinusCircle,
  FileCode,
  Info,
  Workflow,
} from 'lucide-react';
import { SecurityHygieneAssessment, SecurityFinding } from '../../types/security';

interface SecurityHygieneCardProps {
  securityHygiene: SecurityHygieneAssessment;
}

export const SecurityHygieneCard: React.FC<SecurityHygieneCardProps> = ({
  securityHygiene,
}) => {
  const { findings, summary, coverage } = securityHygiene;
  const [filter, setFilter] = useState<string>('all');

  const getStatusIcon = (status: SecurityFinding['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'issue':
        return <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'unknown':
        return <HelpCircle className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'not_applicable':
        return <MinusCircle className="w-4 h-4 text-slate-400 shrink-0" />;
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
      case 'issue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/80 border border-rose-800 text-rose-300">
            Issue
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
      case 'not_applicable':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800/80 border border-slate-700 text-slate-300">
            Not Applicable
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

  const visibleFindings = findings.filter((f) => {
    if (filter === 'all') return true;
    if (filter === 'attention') return f.status === 'issue' || f.status === 'warning';
    return f.status === filter;
  });

  const workflowCoverage = coverage.workflowCoverage;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Header & Meta Pill */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <h3 className="text-base font-semibold text-white">
              Security & Supply-Chain Hygiene
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full">
              Phase 2.1 Heuristics
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Path & workflow static verification • Independent of 100-point core score • Bounded resource execution
          </p>
        </div>

        {/* Reconciled Summary Strip */}
        <div
          className="flex flex-wrap items-center gap-2 text-xs font-mono"
          aria-label={`Security hygiene summary: ${summary.passCount} pass, ${summary.issueCount} issue, ${summary.warningCount} warning, ${summary.notDetectedCount} not detected, ${summary.unknownCount} unknown, ${summary.notApplicableCount} not applicable out of ${findings.length} findings evaluated.`}
        >
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300"
            title={`${summary.passCount} passing security rules`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pass: {summary.passCount}
          </span>
          {summary.issueCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300"
              title={`${summary.issueCount} security issues`}
            >
              <XCircle className="w-3.5 h-3.5" />
              Issue: {summary.issueCount}
            </span>
          )}
          {summary.warningCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300"
              title={`${summary.warningCount} security warnings`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Warning: {summary.warningCount}
            </span>
          )}
          {summary.notDetectedCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400"
              title={`${summary.notDetectedCount} not detected (missing maturity artifacts)`}
            >
              <Search className="w-3.5 h-3.5 text-slate-500" />
              Not Detected: {summary.notDetectedCount}
            </span>
          )}
          {summary.unknownCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800 text-purple-300"
              title={`${summary.unknownCount} indeterminate / unavailable results`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
              Indeterminate: {summary.unknownCount}
            </span>
          )}
          {summary.notApplicableCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300"
              title={`${summary.notApplicableCount} not applicable results`}
            >
              <MinusCircle className="w-3.5 h-3.5 text-slate-400" />
              N/A: {summary.notApplicableCount}
            </span>
          )}
        </div>
      </div>

      {/* Workflow Retrieval Coverage Banner (if workflows evaluated) */}
      {workflowCoverage && (
        <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-slate-200">
              <Workflow className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>GitHub Actions Workflow Security Coverage</span>
            </div>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                workflowCoverage.status === 'complete'
                  ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                  : workflowCoverage.status === 'partial'
                  ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
                  : 'bg-purple-950/80 border border-purple-800 text-purple-300'
              }`}
            >
              {workflowCoverage.status.toUpperCase()} COVERAGE
            </span>
          </div>
          <div className="text-[11px] text-slate-400 space-y-1">
            <p>
              Retrieved {workflowCoverage.retrievedCount} of {workflowCoverage.discoveredCount} workflow file(s) ({Math.round(workflowCoverage.totalBytesRetrieved / 1024)} KiB analyzed).
              {workflowCoverage.skippedCount > 0 && ` ${workflowCoverage.skippedCount} file(s) skipped by resource policies.`}
              {workflowCoverage.failedCount > 0 && ` ${workflowCoverage.failedCount} file(s) failed retrieval.`}
            </p>
            {workflowCoverage.notes.length > 0 && (
              <p className="text-[10px] text-slate-500 font-mono">
                {workflowCoverage.notes.join(' • ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Observation Notice */}
      <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-400">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p>
            {coverage.notes[0] || 'Repository paths and workflows inspected.'}
          </p>
          <p className="text-[10px] text-slate-500">
            Advisory Notice: These static heuristics inspect public GitHub metadata and workflow YAML syntax. They indicate hygiene maturity and common pattern risks, not proof of exploitable vulnerability or certification of security compliance.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs border-b border-slate-800 pb-2">
        <span className="text-slate-400 mr-1 text-[11px]">Filter:</span>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            filter === 'all'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          All ({findings.length})
        </button>
        {(summary.issueCount > 0 || summary.warningCount > 0) && (
          <button
            type="button"
            onClick={() => setFilter('attention')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              filter === 'attention'
                ? 'bg-amber-950 border border-amber-800 text-amber-300'
                : 'text-amber-400 hover:bg-slate-800'
            }`}
          >
            Issues / Warnings ({summary.issueCount + summary.warningCount})
          </button>
        )}
        {summary.passCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter('pass')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              filter === 'pass'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Pass ({summary.passCount})
          </button>
        )}
        {summary.notDetectedCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter('not_detected')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              filter === 'not_detected'
                ? 'bg-slate-800 text-slate-200'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Not Detected ({summary.notDetectedCount})
          </button>
        )}
        {summary.unknownCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter('unknown')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              filter === 'unknown'
                ? 'bg-purple-950 border border-purple-800 text-purple-300'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Indeterminate ({summary.unknownCount})
          </button>
        )}
        {summary.notApplicableCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter('not_applicable')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              filter === 'not_applicable'
                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            N/A ({summary.notApplicableCount})
          </button>
        )}
      </div>

      {/* Security Findings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleFindings.map((f) => (
          <div
            key={f.id}
            className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-2.5 flex flex-col justify-between"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {getStatusIcon(f.status)}
                  <span className="text-xs font-mono font-semibold text-slate-400 shrink-0">
                    {f.ruleId}
                  </span>
                </div>
                {getStatusBadge(f.status)}
              </div>

              <h4 className="text-xs font-semibold text-white break-words">
                {f.title}
              </h4>

              <p className="text-[11px] text-slate-300 leading-relaxed break-words">
                {f.explanation}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/60">
              {f.evidence && (
                <div className="space-y-0.5 text-[11px] font-mono text-slate-400 break-words">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span>{f.evidence.label}:</span>
                  </div>
                  <div className="pl-5 text-slate-200">
                    <span>{f.evidence.value}</span>
                    {f.evidence.sourcePath && (
                      <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                        Location: {f.evidence.sourcePath}
                        {typeof f.evidence.line === 'number' ? `:${f.evidence.line}` : ''}
                        {typeof f.evidence.column === 'number' ? `:${f.evidence.column}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {f.recommendation && (
                <div className="text-[10px] text-slate-400 bg-slate-900/90 border border-slate-800 p-2 rounded leading-tight break-words">
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
