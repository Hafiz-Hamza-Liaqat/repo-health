import React from 'react';
import { RepoHealthReport } from '../../types/report';
import { formatDate, formatNumber } from '../../utils/formatters';

interface PrintReportProps {
  report: RepoHealthReport;
}

export const PrintReport: React.FC<PrintReportProps> = ({ report }) => {
  const repo = report.repository;
  const score = report.scoring.assessment;
  const categories = Object.values(score.categoryScores);

  return (
    <div className="print-report-container text-slate-900 bg-white font-sans p-6">
      {/* 1. Report Header */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start print-avoid-break">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              RepoHealth Assessment Report
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 border border-slate-400 rounded">
              v{report.analyzerVersion}
            </span>
          </div>

          <p className="text-base font-bold text-slate-800 mt-1">
            Repository: {repo.fullName}
          </p>

          <p className="text-xs text-slate-600 mt-0.5">
            URL: <a href={repo.url} className="text-blue-700 underline">{repo.url}</a> | Default Branch: <span className="font-mono">{repo.defaultBranch}</span>
          </p>

          <p className="text-xs text-slate-500 mt-1">
            Evaluation Date: {formatDate(report.generatedAt)} | Active Perspective: <strong>{score.perspective.name}</strong>
          </p>
        </div>

        <div className="text-right border-l-2 border-slate-200 pl-6">
          <div className="text-4xl font-extrabold text-slate-900 font-mono">
            {score.totalScore}<span className="text-lg font-normal text-slate-500">/100</span>
          </div>
          <div className="text-sm font-bold text-slate-800 mt-1">
            Grade {score.grade}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            {score.earnedTotal} / {score.maxTotal} points
          </div>
        </div>
      </div>

      {/* 2. Quick Metrics & Reconciled Findings Summary Strip */}
      <div className="grid grid-cols-2 gap-4 mb-6 print-avoid-break">
        <div className="p-3 border border-slate-300 rounded bg-slate-50 text-xs">
          <span className="font-bold text-slate-700 block mb-1">Repository Snapshot</span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-600">
            <span>Primary Language: <strong>{repo.primaryLanguage || 'None'}</strong></span>
            <span>License: <strong>{repo.license?.spdxId || 'None'}</strong></span>
            <span>Stars: <strong>{formatNumber(repo.metrics.stars)}</strong></span>
            <span>Forks: <strong>{formatNumber(repo.metrics.forks)}</strong></span>
            <span>Open Issues: <strong>{formatNumber(repo.metrics.openIssues)}</strong></span>
            <span>Recorded Size: <strong>{repo.metrics.sizeKb} KB</strong></span>
          </div>
        </div>

        <div className="p-3 border border-slate-300 rounded bg-slate-50 text-xs">
          <span className="font-bold text-slate-700 block mb-1">Reconciled Findings Summary ({score.findings.length} total)</span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
            <span className="text-emerald-700 font-semibold">✓ Pass: {score.summary.passCount}</span>
            <span className="text-amber-700 font-semibold">⚠ Warning: {score.summary.warningCount}</span>
            <span className="text-rose-700 font-semibold">✗ Issue: {score.summary.issueCount}</span>
            <span className="text-slate-600 font-semibold">○ Not Detected: {score.summary.notDetectedCount}</span>
            {score.summary.unknownCount > 0 && (
              <span className="text-purple-700 font-semibold">? Unknown: {score.summary.unknownCount}</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Category Breakdown Table */}
      <div className="mb-6 print-avoid-break">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-300 pb-1">
          1. Category Scores Breakdown
        </h2>
        <table className="w-full text-xs text-left border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
              <th className="p-2 border border-slate-300">Assessment Category</th>
              <th className="p-2 border border-slate-300 text-center">Perspective Weight</th>
              <th className="p-2 border border-slate-300 text-center">Earned Points</th>
              <th className="p-2 border border-slate-300 text-center">Score %</th>
              <th className="p-2 border border-slate-300 text-center">Assessment Status</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.category} className="border-b border-slate-200">
                <td className="p-2 border border-slate-300 font-medium text-slate-900">{cat.label}</td>
                <td className="p-2 border border-slate-300 text-center font-mono">{cat.weight} pts</td>
                <td className="p-2 border border-slate-300 text-center font-mono font-semibold">{cat.earnedPoints} pts</td>
                <td className="p-2 border border-slate-300 text-center font-mono">{cat.percentage}%</td>
                <td className="p-2 border border-slate-300 text-center font-semibold">
                  {cat.percentage >= 70 ? (
                    <span className="text-emerald-700">Pass</span>
                  ) : cat.percentage >= 40 ? (
                    <span className="text-amber-700">Warning</span>
                  ) : (
                    <span className="text-rose-700">Needs Attention</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Detailed Verified Findings by Category */}
      <div className="mb-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3 border-b border-slate-300 pb-1">
          2. Verified Category Findings
        </h2>
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat.category} className="border border-slate-300 rounded p-3 bg-white print-avoid-break">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-200">
                <h3 className="font-bold text-xs text-slate-900">{cat.label}</h3>
                <span className="text-[11px] font-mono text-slate-600">
                  {cat.earnedPoints} / {cat.maxPoints} pts ({cat.percentage}%)
                </span>
              </div>

              <div className="space-y-2">
                {cat.findings.map((f) => (
                  <div key={f.id} className="text-xs border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                    <div className="flex justify-between items-start">
                      <div className="font-semibold text-slate-900">
                        <span className="font-mono text-slate-500 mr-1.5">[{f.ruleId}]</span>
                        {f.title}
                        <span className="ml-2 font-mono uppercase text-[10px] px-1.5 py-0.2 rounded border border-slate-300 text-slate-600">
                          {f.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-800 shrink-0 ml-2">
                        +{f.scoreEffect} / {f.maxEffect} pts
                      </span>
                    </div>

                    <p className="text-slate-700 mt-0.5 leading-relaxed">
                      {f.explanation}
                    </p>

                    {f.evidence && (
                      <div className="mt-1 text-[11px] font-mono bg-slate-50 border border-slate-200 p-1.5 rounded text-slate-700">
                        <strong>Evidence ({f.evidence.label}):</strong> {f.evidence.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Detected Technology Stack & Evidence */}
      <div className="mb-6 print-avoid-break">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-300 pb-1">
          3. Technology Stack & Evidence
        </h2>
        {report.technologies.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {report.technologies.map((t) => (
              <div key={t.id} className="p-2 border border-slate-200 rounded bg-slate-50">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="font-bold text-slate-900">{t.name}</span>
                  <span className="text-[10px] uppercase font-mono text-slate-600 border border-slate-300 px-1 rounded">
                    {t.confidence.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">{t.description}</p>
                {t.evidence.length > 0 && (
                  <p className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                    Evidence: {t.evidence[0].detail}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No specific framework manifests identified.</p>
        )}
      </div>

      {/* Security & Supply-Chain Hygiene (Preliminary) */}
      {report.securityHygiene && (
        <div className="mb-6 print-avoid-break">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-300 pb-1">
            Security & Supply-Chain Hygiene (Preliminary)
          </h2>
          <div className="p-3 border border-slate-300 rounded bg-slate-50 text-xs mb-3">
            <span className="font-bold text-slate-700 block mb-1">
              Path & Workflow Security Heuristics ({report.securityHygiene.findings.length} evaluated)
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
              <span className="text-emerald-700 font-semibold">✓ Pass: {report.securityHygiene.summary.passCount}</span>
              {report.securityHygiene.summary.issueCount > 0 && (
                <span className="text-rose-700 font-semibold">✖ Issue: {report.securityHygiene.summary.issueCount}</span>
              )}
              {report.securityHygiene.summary.warningCount > 0 && (
                <span className="text-amber-700 font-semibold">⚠ Warning: {report.securityHygiene.summary.warningCount}</span>
              )}
              {report.securityHygiene.summary.notDetectedCount > 0 && (
                <span className="text-slate-600 font-semibold">○ Not Detected: {report.securityHygiene.summary.notDetectedCount}</span>
              )}
              {report.securityHygiene.summary.unknownCount > 0 && (
                <span className="text-purple-700 font-semibold">? Indeterminate: {report.securityHygiene.summary.unknownCount}</span>
              )}
              {report.securityHygiene.summary.notApplicableCount > 0 && (
                <span className="text-slate-500 font-semibold">➖ N/A: {report.securityHygiene.summary.notApplicableCount}</span>
              )}
            </div>
            {report.securityHygiene.coverage.workflowCoverage && (
              <p className="text-[10px] text-slate-600 mt-1.5 font-mono">
                Workflows: {report.securityHygiene.coverage.workflowCoverage.retrievedCount}/{report.securityHygiene.coverage.workflowCoverage.discoveredCount} retrieved ({report.securityHygiene.coverage.workflowCoverage.status})
              </p>
            )}
          </div>
          <div className="space-y-2">
            {report.securityHygiene.findings.map((f) => (
              <div key={f.id} className="p-2 border border-slate-200 rounded text-xs bg-white">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-900">{f.title}</span>
                  <span className="font-mono text-[10px] uppercase font-bold text-slate-600">{f.ruleId} • {f.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-slate-700">{f.explanation}</p>
                {f.evidence && (
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Evidence: {f.evidence.label} — {f.evidence.value}
                    {f.evidence.sourcePath ? ` (${f.evidence.sourcePath}${f.evidence.line ? `:${f.evidence.line}` : ''})` : ''}
                  </p>
                )}
                {f.recommendation && (
                  <p className="text-[10px] text-slate-600 mt-1 italic">
                    Remediation: {f.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Prioritized Recommendations */}
      <div className="mb-6 print-avoid-break">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-2 border-b border-slate-300 pb-1">
          4. Prioritized Recommendations
        </h2>
        {report.recommendations.length > 0 ? (
          <ol className="list-decimal list-inside space-y-2 text-xs text-slate-800">
            {report.recommendations.map((rec) => (
              <li key={rec.id} className="leading-relaxed">
                <strong className="text-slate-900">[{rec.priority.toUpperCase()}] {rec.title}:</strong> {rec.action}
                <div className="text-slate-600 text-[11px] ml-5">
                  <em>Rationale: {rec.rationale}</em>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-slate-600">
            No critical issues detected. Repository adheres to core baseline engineering and documentation practices.
          </p>
        )}
      </div>

      {/* 7. Data Coverage, Endpoints & Limitations */}
      <div className="mb-6 border border-slate-300 rounded p-3 bg-slate-50 text-xs print-avoid-break">
        <h2 className="font-bold text-slate-900 mb-1">5. Data Coverage & Inspection Accounting</h2>
        <div className="grid grid-cols-2 gap-4 text-slate-700">
          <div>
            <p>Endpoint Responses: <strong>{report.dataCoverage.endpointResponseLabel}</strong> ({report.dataCoverage.endpointsSucceeded} succeeded, {report.dataCoverage.endpointsFailed} failed)</p>
            <p className="mt-0.5">Tree Inspection: <strong>{report.dataCoverage.treeCoverageNote}</strong></p>
          </div>
          <div>
            {report.dataCoverage.absentOptionalResources.length > 0 && (
              <p>Absent Optional Features: {report.dataCoverage.absentOptionalResources.join('; ')}</p>
            )}
            {report.dataCoverage.limitations.length > 0 && (
              <div className="mt-1 text-[11px] text-amber-800">
                Limitations: {report.dataCoverage.limitations.join('; ')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 8. Disclaimers */}
      <div className="border-t border-slate-300 pt-3 text-[10px] text-slate-500 leading-normal print-avoid-break">
        <p><strong>Assessment Notice:</strong> {report.notice.disclaimer}</p>
        <p className="mt-1">{report.notice.assessmentPhilosophy}</p>
      </div>
    </div>
  );
};
