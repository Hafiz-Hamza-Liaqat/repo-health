import React, { useState } from 'react';
import {
  RotateCcw,
  Copy,
  Check,
  Printer,
  FileJson,
} from 'lucide-react';
import { RepoHealthReport } from '../../types/report';
import { downloadReportJson, generateMarkdownSummary, printReport, copyToClipboard } from '../../utils/export';

interface ActionToolbarProps {
  report: RepoHealthReport;
  onRescan: () => void;
  isLoading: boolean;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  report,
  onRescan,
  isLoading,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const md = generateMarkdownSummary(report);
    const success = await copyToClipboard(md);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownload = () => {
    downloadReportJson(report);
  };

  const handlePrint = () => {
    printReport();
  };

  return (
    <div className="action-toolbar flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>Scan generated at:</span>
        <span className="font-mono text-slate-200">
          {new Date(report.generatedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Rescan */}
        <button
          type="button"
          onClick={onRescan}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
          title="Re-run assessment against latest GitHub state"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Rescan</span>
        </button>

        {/* Copy summary */}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-colors"
          title="Copy formatted Markdown report to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Summary Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Summary</span>
            </>
          )}
        </button>

        {/* Export JSON */}
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-colors"
          title="Download complete report schema as JSON file"
        >
          <FileJson className="w-3.5 h-3.5 text-blue-400" />
          <span>Export JSON</span>
        </button>

        {/* Print / Save PDF */}
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm"
          title="Print or Save as PDF"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print / Save as PDF</span>
        </button>
      </div>
    </div>
  );
};
