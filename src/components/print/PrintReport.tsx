import React from 'react';
import { RepoHealthReport } from '../../types/report';
import { formatDate } from '../../utils/formatters';

interface PrintReportProps {
  report: RepoHealthReport;
}

export const PrintReport: React.FC<PrintReportProps> = ({ report }) => {
  const repo = report.repository;
  const score = report.scoring.assessment;
  const categories = Object.values(score.categoryScores);

  return (
    <div className="print-only-header print-container p-6 text-slate-900 bg-white">
      <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RepoHealth Assessment Report</h1>
          <p className="text-sm font-semibold text-slate-700 mt-1">
            Repository: {repo.fullName} ({repo.url})
          </p>
          <p className="text-xs text-slate-500">
            Generated: {formatDate(report.generatedAt)} | Analyzer: v{report.analyzerVersion} | Perspective: {score.perspective.name}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold text-slate-900 font-mono">
            {score.totalScore}/100
          </div>
          <div className="text-sm font-bold text-slate-700">
            Grade {score.grade}
          </div>
        </div>
      </div>

      {/* Category breakdown table */}
      <div className="mb-6">
        <h2 className="text-base font-bold mb-2">1. Category Scores</h2>
        <table className="w-full text-xs text-left border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 font-bold">
              <th className="p-2 border border-slate-300">Category</th>
              <th className="p-2 border border-slate-300">Weight</th>
              <th className="p-2 border border-slate-300">Earned</th>
              <th className="p-2 border border-slate-300">Score %</th>
              <th className="p-2 border border-slate-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.category} className="border-b border-slate-200">
                <td className="p-2 border border-slate-300 font-medium">{cat.label}</td>
                <td className="p-2 border border-slate-300 font-mono">{cat.weight} pts</td>
                <td className="p-2 border border-slate-300 font-mono">{cat.earnedPoints} pts</td>
                <td className="p-2 border border-slate-300 font-mono">{cat.percentage}%</td>
                <td className="p-2 border border-slate-300">
                  {cat.percentage >= 70 ? 'Pass' : cat.percentage >= 40 ? 'Warning' : 'Needs Attention'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Technology detections */}
      <div className="mb-6">
        <h2 className="text-base font-bold mb-2">2. Detected Technologies & Evidence</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {report.technologies.map((t) => (
            <div key={t.id} className="p-2 border border-slate-200 rounded">
              <strong>{t.name}</strong> ({t.category}): {t.confidence.replace(/_/g, ' ')}
            </div>
          ))}
        </div>
      </div>

      {/* Prioritized recommendations */}
      <div className="mb-6">
        <h2 className="text-base font-bold mb-2">3. Prioritized Recommendations</h2>
        <ol className="list-decimal list-inside space-y-2 text-xs">
          {report.recommendations.map((rec) => (
            <li key={rec.id} className="text-slate-800">
              <strong>[{rec.priority.toUpperCase()}] {rec.title}:</strong> {rec.action}
            </li>
          ))}
        </ol>
      </div>

      {/* Disclaimers */}
      <div className="border-t border-slate-300 pt-4 text-[10px] text-slate-500">
        <p>{report.notice.disclaimer}</p>
        <p className="mt-1">{report.notice.assessmentPhilosophy}</p>
      </div>
    </div>
  );
};
