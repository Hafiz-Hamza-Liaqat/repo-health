import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAllAnalyzers } from './index';
import { generateReport } from '../engine/reportGenerator';
import { generateMarkdownSummary } from '../utils/export';
import { mockRawAnalysisData } from '../test/fixtures/sampleRepo';
import {
  MINIMAL_VALID_WORKFLOW,
  PINNED_SHA_WORKFLOW,
} from '../test/fixtures/workflowFixtures';
import { WorkflowRetrievalResult, WorkflowSecurityAnalysisReport } from '../services/githubApi';
import { getUtf8ByteLength } from './workflowYamlParser';
import { calculateAssessmentScore } from '../engine/scoringEngine';

describe('Phase 2.1B.4: Full Application & Security Hygiene Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockWorkflowSecurityReport(
    workflows: Array<{ path: string; content: string }>,
    skipped: Array<{ path: string; status: 'oversized' | 'budget_exhausted' | 'failed' | 'timeout'; reason: string }> = []
  ): WorkflowSecurityAnalysisReport {
    const retrieval: WorkflowRetrievalResult = {
      retrievedWorkflows: workflows.map((w) => ({
        path: w.path,
        content: w.content,
        byteLength: getUtf8ByteLength(w.content),
      })),
      skippedWorkflows: skipped.map((s) => ({
        path: s.path,
        status: s.status,
        reason: s.reason,
      })),
      summary: {
        discoveredCount: workflows.length + skipped.length,
        selectedCount: workflows.length + skipped.length,
        retrievedCount: workflows.length,
        skippedCount: skipped.filter((s) => s.status !== 'failed').length,
        failedCount: skipped.filter((s) => s.status === 'failed').length,
        totalBytesRetrieved: workflows.reduce((acc, w) => acc + getUtf8ByteLength(w.content), 0),
      },
      coverage: skipped.length === 0 ? 'complete' : workflows.length > 0 ? 'partial' : 'unknown',
      coverageNotes: skipped.length > 0 ? ['Some workflows skipped due to resource budgets.'] : ['All workflows retrieved successfully.'],
      errors: [],
    };

    return {
      assessments: [
            ...workflows.map((w) => ({
              filePath: w.path,
              workflowName: 'Test Workflow',
              parseSuccess: true,
              findings: [
                {
                  id: 'WFL-01-pass',
                  ruleId: 'WFL-01' as const,
                  title: 'Minimal Workflow Permissions Configured',
                  status: 'pass' as const,
                  severity: 'info' as const,
                  explanation: 'Workflow declares explicit read-only permissions.',
                  evidence: { label: 'Permissions', value: 'contents: read' },
                },
                {
                  id: 'WFL-02-pass',
                  ruleId: 'WFL-02' as const,
                  title: 'Immutable Commit SHA Pinning Verified',
                  status: 'pass' as const,
                  severity: 'info' as const,
                  explanation: 'Actions pinned to full commit SHAs.',
                  evidence: { label: 'Action Ref', value: 'actions/checkout@8e5e7e5ab8b370d6c329ec480221332ada57f0ab' },
                },
                {
                  id: 'WFL-03-pass',
                  ruleId: 'WFL-03' as const,
                  title: 'No Inline Script Injection Expressions Detected',
                  status: 'pass' as const,
                  severity: 'info' as const,
                  explanation: 'No untrusted context expressions found in run script steps.',
                },
                {
                  id: 'WFL-04-na',
                  ruleId: 'WFL-04' as const,
                  title: 'pull_request_target Pattern Not Applicable',
                  status: 'not_applicable' as const,
                  severity: 'info' as const,
                  explanation: 'Workflow does not trigger on pull_request_target.',
                },
              ],
              summary: { passCount: 3, warningCount: 0, issueCount: 0, unknownCount: 0, notApplicableCount: 1 },
            })),
            ...skipped.map((s) => ({
              filePath: s.path,
              parseSuccess: false,
              parseError: { code: 'FILE_OVERSIZED' as const, message: s.reason },
              findings: [
                { id: 'WFL-01-unk', ruleId: 'WFL-01' as const, title: 'WFL-01 Indeterminate', status: 'unknown' as const, severity: 'info' as const, explanation: s.reason },
                { id: 'WFL-02-unk', ruleId: 'WFL-02' as const, title: 'WFL-02 Indeterminate', status: 'unknown' as const, severity: 'info' as const, explanation: s.reason },
                { id: 'WFL-03-unk', ruleId: 'WFL-03' as const, title: 'WFL-03 Indeterminate', status: 'unknown' as const, severity: 'info' as const, explanation: s.reason },
                { id: 'WFL-04-unk', ruleId: 'WFL-04' as const, title: 'WFL-04 Indeterminate', status: 'unknown' as const, severity: 'info' as const, explanation: s.reason },
              ],
              summary: { passCount: 0, warningCount: 0, issueCount: 0, unknownCount: 4, notApplicableCount: 0 },
            })),
          ],
          retrieval,
          overallCoverage: retrieval.coverage,
          summary: {
            totalWorkflowsDiscovered: retrieval.summary.discoveredCount,
            totalWorkflowsAnalyzed: retrieval.summary.retrievedCount,
            totalWorkflowsSkipped: retrieval.summary.skippedCount + retrieval.summary.failedCount,
            passCount: workflows.length * 3,
            warningCount: 0,
            issueCount: 0,
            unknownCount: skipped.length * 4,
            notApplicableCount: workflows.length * 1,
          },
        };
  }

  // ==========================================================================
  // 1. Full Pipeline Integration
  // ==========================================================================
  it('should integrate workflow security findings into overall security-hygiene domain without affecting core score', () => {
    const mockReport = createMockWorkflowSecurityReport([
      { path: '.github/workflows/ci.yml', content: PINNED_SHA_WORKFLOW },
    ]);

    const rawData = {
      ...mockRawAnalysisData,
      workflowSecurityReport: mockReport,
    };

    const outcome = runAllAnalyzers(rawData);

    expect(outcome.securityHygiene).toBeDefined();
    const sh = outcome.securityHygiene!;

    // Must contain both Phase 2.1A (SEC-*) and Phase 2.1B (WFL-*) findings
    const secRules = sh.findings.filter((f) => f.ruleId.startsWith('SEC-'));
    const wflRules = sh.findings.filter((f) => f.ruleId.startsWith('WFL-'));
    expect(secRules.length).toBeGreaterThan(0);
    expect(wflRules.length).toBe(4);

    // Reconciled summary counts
    expect(sh.summary.passCount + sh.summary.warningCount + sh.summary.issueCount + sh.summary.notDetectedCount + sh.summary.unknownCount + sh.summary.notApplicableCount).toBe(sh.findings.length);
    expect(sh.summary.notApplicableCount).toBe(1); // WFL-04 was not applicable

    // Workflow coverage preserved
    expect(sh.coverage.workflowCoverage).toBeDefined();
    expect(sh.coverage.workflowCoverage?.status).toBe('complete');
    expect(sh.coverage.workflowCoverage?.retrievedCount).toBe(1);
    expect(sh.coverage.workflowCoverage?.discoveredCount).toBe(1);

    // CORE SCORING INVARIANCE: Core score calculation must be completely independent
    const scoreWithoutWf = calculateAssessmentScore(outcome.findings, 'balanced');
    const scoreWithWf = calculateAssessmentScore(outcome.findings, 'balanced');
    expect(scoreWithWf.totalScore).toBe(scoreWithoutWf.totalScore);
    expect(scoreWithWf.maxTotal).toBe(100);
    expect(outcome.coverage.endpointsTotal).toBe(10); // 10 core endpoints preserved
  });

  // ==========================================================================
  // 2. not_applicable Accounting and Representation
  // ==========================================================================
  it('should accurately represent not_applicable status in reports and exports without mapping to not_detected or pass', () => {
    const mockReport = createMockWorkflowSecurityReport([
      { path: '.github/workflows/build.yml', content: MINIMAL_VALID_WORKFLOW },
    ]);

    const rawData = {
      ...mockRawAnalysisData,
      workflowSecurityReport: mockReport,
    };

    const outcome = runAllAnalyzers(rawData);
    const report = generateReport(outcome, 'balanced');

    // 1. Report object
    expect(report.securityHygiene?.summary.notApplicableCount).toBe(1);

    // 2. Markdown Export
    const md = generateMarkdownSummary(report);
    expect(md).toContain('Not Applicable: 1');
    expect(md).toContain('➖ Not Applicable');
    expect(md).not.toContain('WFL-04: ⚪ Not Detected');

    // 3. JSON Export serialization
    const jsonStr = JSON.stringify(report);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.securityHygiene.summary.notApplicableCount).toBe(1);
    const naFinding = parsed.securityHygiene.findings.find((f: { ruleId: string }) => f.ruleId === 'WFL-04');
    expect(naFinding.status).toBe('not_applicable');
  });

  // ==========================================================================
  // 3. Empty Workflow Directory (HTTP 404) Integration
  // ==========================================================================
  it('should represent missing workflow directory with complete coverage and 0 findings', () => {
    const emptyReport: WorkflowSecurityAnalysisReport = {
      assessments: [],
      retrieval: {
        retrievedWorkflows: [],
        skippedWorkflows: [],
        summary: { discoveredCount: 0, selectedCount: 0, retrievedCount: 0, skippedCount: 0, failedCount: 0, totalBytesRetrieved: 0 },
        coverage: 'complete',
        coverageNotes: ['No GitHub Actions workflow files detected in repository.'],
        errors: [],
      },
      overallCoverage: 'complete',
      summary: { totalWorkflowsDiscovered: 0, totalWorkflowsAnalyzed: 0, totalWorkflowsSkipped: 0, passCount: 0, warningCount: 0, issueCount: 0, unknownCount: 0, notApplicableCount: 0 },
    };

    const rawData = {
      ...mockRawAnalysisData,
      workflowSecurityReport: emptyReport,
    };

    const outcome = runAllAnalyzers(rawData);
    expect(outcome.securityHygiene?.coverage.workflowCoverage?.status).toBe('complete');
    expect(outcome.securityHygiene?.coverage.workflowCoverage?.discoveredCount).toBe(0);
    expect(outcome.securityHygiene?.coverage.workflowCoverage?.retrievedCount).toBe(0);
    expect(outcome.securityHygiene?.findings.filter((f) => f.ruleId.startsWith('WFL-'))).toHaveLength(0);
  });

  // ==========================================================================
  // 4. Partial and Unknown Coverage Integration
  // ==========================================================================
  it('should represent skipped or failed workflows as indeterminate unknown findings', () => {
    const partialReport = createMockWorkflowSecurityReport(
      [{ path: '.github/workflows/ci.yml', content: PINNED_SHA_WORKFLOW }],
      [{ path: '.github/workflows/huge.yml', status: 'oversized', reason: 'Exceeded 256 KiB limit' }]
    );

    const rawData = {
      ...mockRawAnalysisData,
      workflowSecurityReport: partialReport,
    };

    const outcome = runAllAnalyzers(rawData);
    const sh = outcome.securityHygiene!;

    expect(sh.coverage.workflowCoverage?.status).toBe('partial');
    expect(sh.coverage.workflowCoverage?.discoveredCount).toBe(2);
    expect(sh.coverage.workflowCoverage?.retrievedCount).toBe(1);
    expect(sh.coverage.workflowCoverage?.skippedCount).toBe(1);

    // Skipped workflow produced 4 unknown findings
    const unknownWfl = sh.findings.filter((f) => f.ruleId.startsWith('WFL-') && f.status === 'unknown');
    expect(unknownWfl).toHaveLength(4);
    expect(sh.summary.unknownCount).toBeGreaterThanOrEqual(4);
  });

  // ==========================================================================
  // 5. Profile Invariance Across Balanced, Engineering, Presentation
  // ==========================================================================
  it('should confirm score and grade invariance across all 3 scoring profiles with security findings present', () => {
    const mockReport = createMockWorkflowSecurityReport([
      { path: '.github/workflows/ci.yml', content: PINNED_SHA_WORKFLOW },
    ]);

    const rawDataWithSecurity = {
      ...mockRawAnalysisData,
      workflowSecurityReport: mockReport,
    };

    const outcomeBaseline = runAllAnalyzers(mockRawAnalysisData);
    const outcomeSecurity = runAllAnalyzers(rawDataWithSecurity);

    for (const profile of ['balanced', 'engineering', 'presentation'] as const) {
      const repBaseline = generateReport(outcomeBaseline, profile);
      const repSecurity = generateReport(outcomeSecurity, profile);

      expect(repSecurity.scoring.assessment.totalScore).toBe(repBaseline.scoring.assessment.totalScore);
      expect(repSecurity.scoring.assessment.grade).toBe(repBaseline.scoring.assessment.grade);
      expect(repSecurity.scoring.assessment.categoryScores).toEqual(repBaseline.scoring.assessment.categoryScores);
    }
  });
});
