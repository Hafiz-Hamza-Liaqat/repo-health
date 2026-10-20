import React from 'react';
import {
  ExternalLink,
  GitFork,
  Star,
  AlertCircle,
  GitBranch,
  Calendar,
  Scale,
  Globe,
  Archive,
} from 'lucide-react';
import { RepoHealthReport } from '../../types/report';
import { formatDate, formatNumber, formatTimeAgo } from '../../utils/formatters';

interface DashboardHeaderProps {
  report: RepoHealthReport;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ report }) => {
  const repo = report.repository;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
      {/* Top row: Name, Owner, Links */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              {repo.fullName}
            </h1>

            {repo.isArchived && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800">
                <Archive className="w-3 h-3" />
                Archived
              </span>
            )}

            {repo.isFork && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                <GitFork className="w-3 h-3" />
                Fork
              </span>
            )}
          </div>

          {repo.description && (
            <p className="text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              {repo.description}
            </p>
          )}
        </div>

        {/* Action links */}
        <div className="flex items-center gap-2 shrink-0">
          {repo.homepage && (
            <a
              href={repo.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-750 hover:text-white border border-slate-700 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Website</span>
            </a>
          )}

          <a
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Topics */}
      {repo.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {repo.topics.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-950 text-slate-300 border border-slate-800"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Stats and metadata strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-slate-500 shrink-0" />
          <div>
            <span className="text-slate-500 block text-[10px]">Branch</span>
            <span className="font-mono font-medium text-slate-200">{repo.defaultBranch}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-500 shrink-0" />
          <div>
            <span className="text-slate-500 block text-[10px]">License</span>
            <span className="font-medium text-slate-200 truncate block max-w-[110px]" title={repo.license?.name || 'None'}>
              {repo.license?.spdxId || 'None'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500/80 shrink-0" />
          <div>
            <span className="text-slate-500 block text-[10px]">Stars</span>
            <span className="font-mono font-medium text-slate-200">
              {formatNumber(repo.metrics.stars)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <GitFork className="w-4 h-4 text-blue-400 shrink-0" />
          <div>
            <span className="text-slate-500 block text-[10px]">Forks</span>
            <span className="font-mono font-medium text-slate-200">
              {formatNumber(repo.metrics.forks)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
          <div>
            <span className="text-slate-500 block text-[10px]">Open Issues</span>
            <span className="font-mono font-medium text-slate-200">
              {formatNumber(repo.metrics.openIssues)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
          <div>
            <span className="text-slate-500 block text-[10px]">Last Push</span>
            <span className="font-medium text-slate-200" title={formatDate(repo.pushedAt)}>
              {formatTimeAgo(repo.pushedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
