import React, { useState } from 'react';
import { Search, ArrowRight, AlertCircle, X, Shield, FileText, Cpu } from 'lucide-react';
import { parseAndValidateGitHubUrl } from '../../analyzers/urlParser';
import { EXAMPLE_REPOSITORIES, ExampleRepo } from '../../config/exampleRepos';

interface ScanFormProps {
  onScan: (owner: string, repo: string) => void;
  isLoading: boolean;
  initialValue?: string;
}

export const ScanForm: React.FC<ScanFormProps> = ({
  onScan,
  isLoading,
  initialValue = '',
}) => {
  const [inputUrl, setInputUrl] = useState(initialValue);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputUrl(val);
    if (validationError && val.trim().length > 0) {
      setValidationError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) {
      setValidationError('Please enter a GitHub repository URL or "owner/repository".');
      return;
    }

    const parsed = parseAndValidateGitHubUrl(inputUrl);
    if (!parsed.isValid) {
      setValidationError(parsed.error || 'Invalid GitHub repository URL.');
      return;
    }

    setValidationError(null);
    onScan(parsed.owner, parsed.repo);
  };

  const handleSelectExample = (ex: ExampleRepo) => {
    const full = `https://github.com/${ex.owner}/${ex.repo}`;
    setInputUrl(full);
    setValidationError(null);
    onScan(ex.owner, ex.repo);
  };

  const handleClear = () => {
    setInputUrl('');
    setValidationError(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Input box */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          <div className="absolute left-4 text-slate-400 pointer-events-none">
            <Search className="w-5 h-5" />
          </div>

          <input
            type="text"
            value={inputUrl}
            onChange={handleInputChange}
            disabled={isLoading}
            placeholder="Paste public GitHub repository URL (e.g. https://github.com/facebook/react or owner/repo)"
            className={`w-full pl-12 pr-28 py-4 bg-slate-900 border rounded-xl text-slate-100 placeholder-slate-500 shadow-xl focus:outline-none transition-all text-sm md:text-base ${
              validationError
                ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                : 'border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
            }`}
          />

          <div className="absolute right-2 flex items-center gap-1.5">
            {inputUrl && !isLoading && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
            >
              {isLoading ? (
                <span>Analyzing...</span>
              ) : (
                <>
                  <span>Analyze</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {validationError && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-rose-950/60 border border-rose-900 rounded-lg text-xs text-rose-300 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}
      </form>

      {/* Examples picker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs text-slate-400">
        <span className="shrink-0 text-slate-500">Quick Examples:</span>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_REPOSITORIES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => handleSelectExample(ex)}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/60 text-slate-300 font-mono text-[11px] transition-colors"
              title={`${ex.category}: ${ex.description}`}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trust & Methodology highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800/60 text-left">
        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800/60 flex items-start gap-3">
          <FileText className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-slate-200">Evidence Over Popularity</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              No points for stars or follower counts. Scores evaluate documentation, tests, CI/CD, and release hygiene.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800/60 flex items-start gap-3">
          <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-slate-200">Safe Public Inspection</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Analyzes public GitHub REST API endpoints without downloading or executing untrusted code.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800/60 flex items-start gap-3">
          <Cpu className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-slate-200">3 Assessment Perspectives</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Switch dynamically between Balanced Quality, Engineering Rigor, and Presentation profiles.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
