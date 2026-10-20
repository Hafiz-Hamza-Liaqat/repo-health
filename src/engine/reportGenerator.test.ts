import { describe, it, expect } from 'vitest';
import { generateReport } from './reportGenerator';
import { runAllAnalyzers } from '../analyzers';
import { mockRawAnalysisData } from '../test/fixtures/sampleRepo';
import { generateMarkdownSummary } from '../utils/export';

describe('Report Generator and Export', () => {
  it('should generate a typed, versioned report object', () => {
    const outcome = runAllAnalyzers(mockRawAnalysisData);
    const report = generateReport(outcome, 'balanced');

    expect(report.version).toBe('1.0.0');
    expect(report.repository.fullName).toBe('acme-corp/sample-project');
    expect(report.scoring.activePerspective).toBe('balanced');
    expect(report.scoring.assessment.totalScore).toBeGreaterThan(70);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.technologies.length).toBeGreaterThan(0);
    expect(report.dataCoverage.coveragePercentage).toBe(100);
    expect(report.notice.disclaimer).toBeDefined();
  });

  it('should serialize cleanly to valid JSON', () => {
    const outcome = runAllAnalyzers(mockRawAnalysisData);
    const report = generateReport(outcome, 'engineering');

    const jsonString = JSON.stringify(report);
    const parsed = JSON.parse(jsonString);

    expect(parsed.version).toBe('1.0.0');
    expect(parsed.scoring.activePerspective).toBe('engineering');
    expect(parsed.repository.name).toBe('sample-project');
  });

  it('should generate human-readable markdown summary for clipboard sharing', () => {
    const outcome = runAllAnalyzers(mockRawAnalysisData);
    const report = generateReport(outcome, 'balanced');
    const md = generateMarkdownSummary(report);

    expect(md).toContain('# RepoHealth Assessment: acme-corp/sample-project');
    expect(md).toContain('Overall Health Score');
    expect(md).toContain('Category Breakdown');
    expect(md).toContain('Technology Stack Detected');
  });
});
