import { useEffect, useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { ApiSettingsModal } from './components/layout/ApiSettingsModal';
import { ScanForm } from './components/scanner/ScanForm';
import { ScanProgress } from './components/scanner/ScanProgress';
import { DashboardHeader } from './components/dashboard/DashboardHeader';
import { ScoreOverview } from './components/dashboard/ScoreOverview';
import { PerspectiveSelector } from './components/dashboard/PerspectiveSelector';
import { CategoryCards } from './components/dashboard/CategoryCards';
import { TechnologyBadges } from './components/dashboard/TechnologyBadges';
import { ProvenanceOverview } from './components/dashboard/ProvenanceOverview';
import { RecommendationsList } from './components/dashboard/RecommendationsList';
import { LimitationsNotice } from './components/dashboard/LimitationsNotice';
import { ActionToolbar } from './components/dashboard/ActionToolbar';
import { PrintReport } from './components/print/PrintReport';

import { githubApi } from './services/githubApi';
import { sessionCache } from './services/cache';
import { runAllAnalyzers } from './analyzers';
import { generateReport } from './engine/reportGenerator';
import { AnalysisOutcome } from './types/analysis';
import { RepoHealthReport } from './types/report';
import { ScoringPerspectiveKey } from './types/scoring';
import { AlertCircle, RotateCcw, Key } from 'lucide-react';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progressStage, setProgressStage] = useState('fetching_meta');
  const [progressDetail, setProgressDetail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeRepo, setActiveRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [analysisOutcome, setAnalysisOutcome] = useState<AnalysisOutcome | null>(null);
  const [activePerspective, setActivePerspective] = useState<ScoringPerspectiveKey>('balanced');
  const [report, setReport] = useState<RepoHealthReport | null>(null);

  const executeScan = useCallback(async (owner: string, repo: string, forceFresh = false) => {
    if (forceFresh) {
      sessionCache.delete(`${owner.toLowerCase()}/${repo.toLowerCase()}`);
    }

    setIsLoading(true);
    setErrorMsg(null);
    setActiveRepo({ owner, repo });
    setProgressStage('fetching_meta');
    setProgressDetail(`Connecting to GitHub API for ${owner}/${repo}...`);

    // Update query string without page reload
    try {
      const newUrl = `${window.location.pathname}?repo=${encodeURIComponent(`${owner}/${repo}`)}`;
      window.history.pushState({ repo: `${owner}/${repo}` }, '', newUrl);
    } catch {
      // Ignore history errors
    }

    try {
      const { data } = await githubApi.fetchCompleteRepositoryData(
        owner,
        repo,
        (stage, detail) => {
          setProgressStage(stage);
          if (detail) setProgressDetail(detail);
        }
      );

      setProgressStage('analyzing');
      setProgressDetail('Evaluating evidence, scoring rules, and technology stacks...');

      // Run analyzers
      const outcome = runAllAnalyzers(data);
      setAnalysisOutcome(outcome);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while analyzing the repository.';
      setErrorMsg(msg);
      setAnalysisOutcome(null);
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync URL query params on initial load (?repo=owner/repo)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const repoParam = params.get('repo');
      if (repoParam && repoParam.includes('/')) {
        const [owner, name] = repoParam.split('/');
        if (owner && name) {
          executeScan(owner, name);
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, [executeScan]);

  // Update report when outcome or perspective changes
  useEffect(() => {
    if (analysisOutcome) {
      const rep = generateReport(analysisOutcome, activePerspective);
      setReport(rep);
    }
  }, [analysisOutcome, activePerspective]);

  const handlePerspectiveChange = (key: ScoringPerspectiveKey) => {
    setActivePerspective(key);
  };

  const handleRescan = () => {
    if (activeRepo) {
      executeScan(activeRepo.owner, activeRepo.repo, true);
    }
  };

  const handleReset = () => {
    setActiveRepo(null);
    setAnalysisOutcome(null);
    setReport(null);
    setErrorMsg(null);
    try {
      window.history.pushState({}, '', window.location.pathname);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onReset={handleReset}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="interactive-dashboard no-print space-y-8">
          {/* Hero section */}
          {!report && (
            <div className="text-center max-w-3xl mx-auto space-y-3 pt-6 pb-2">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
                Evaluate code. <span className="text-emerald-400">Verify evidence.</span>
              </h1>
              <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Transparent, evidence-based health assessments for public GitHub repositories.
                Analyze documentation, tests, CI/CD, releases, and software practices for hiring decisions.
              </p>
            </div>
          )}

          {/* Scan Input Form (Hidden during active scan if results present) */}
          {(!report || isLoading) && (
            <ScanForm
              onScan={(owner, repo) => executeScan(owner, repo)}
              isLoading={isLoading}
              initialValue={activeRepo ? `${activeRepo.owner}/${activeRepo.repo}` : ''}
            />
          )}

          {/* Live Step-by-Step Progress */}
          {isLoading && (
            <ScanProgress
              currentStage={progressStage}
              stageDetail={progressDetail}
            />
          )}

          {/* Error Alert */}
          {errorMsg && !isLoading && (
            <div className="max-w-2xl mx-auto p-5 bg-rose-950/60 border border-rose-800 rounded-xl shadow-lg space-y-3 animate-fadeIn">
              <div className="flex items-start gap-3 text-rose-300">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Analysis Could Not Complete</h4>
                  <p className="text-xs text-rose-200 leading-relaxed">{errorMsg}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-rose-900/60 text-xs">
                <button
                  type="button"
                  onClick={() => handleRescan()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-white bg-rose-700 hover:bg-rose-600 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-300 hover:text-white bg-rose-900/50 hover:bg-rose-900 border border-rose-800 transition-colors"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Configure API Token</span>
                </button>
              </div>
            </div>
          )}

          {/* Report Dashboard */}
          {report && !isLoading && (
            <div className="space-y-8 animate-fadeIn">
              {/* Action Toolbar */}
              <ActionToolbar
                report={report}
                onRescan={handleRescan}
                isLoading={isLoading}
              />

              {/* Dashboard Header */}
              <DashboardHeader report={report} />

              {/* Perspective Selector */}
              <PerspectiveSelector
                activeKey={activePerspective}
                onChange={handlePerspectiveChange}
              />

              {/* Overall Score Overview */}
              <ScoreOverview scoreResult={report.scoring.assessment} />

              {/* Prioritized Recommendations */}
              <RecommendationsList recommendations={report.recommendations} />

              {/* Category Findings Cards */}
              <CategoryCards categoryScores={report.scoring.assessment.categoryScores} />

              {/* Technology Stack Badges */}
              <TechnologyBadges technologies={report.technologies} />

              {/* Provenance Signals */}
              <ProvenanceOverview provenance={report.provenance} />

              {/* Data Coverage & Limitations Notice */}
              <LimitationsNotice
                coverage={report.dataCoverage}
                notice={report.notice}
              />
            </div>
          )}
        </div>

        {/* Dedicated Print Report View (Visible only during window.print()) */}
        {report && <PrintReport report={report} />}
      </main>

      <Footer />

      {/* Settings Modal */}
      <ApiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
