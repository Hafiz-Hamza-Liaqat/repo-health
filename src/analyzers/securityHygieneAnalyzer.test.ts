import { describe, it, expect } from 'vitest';
import {
  analyzeSecurityHygiene,
  isPotentiallySensitivePath,
  isSbomCandidatePath,
} from './securityHygieneAnalyzer';
import { runAllAnalyzers } from './index';
import { generateReport, REPORT_SCHEMA_VERSION } from '../engine/reportGenerator';
import { calculateAssessmentScore } from '../engine/scoringEngine';
import { SCORING_PERSPECTIVES } from '../config/scoringProfiles';
import { mockRawAnalysisData } from '../test/fixtures/sampleRepo';
import { generateMarkdownSummary } from '../utils/export';
import { GitTreeData } from '../types/analysis';

describe('Phase 2.1A: Preliminary Security Hygiene Analyzer', () => {
  const createMockTree = (paths: string[], isTruncated = false): GitTreeData => ({
    items: paths.map((path) => ({
      path,
      mode: '100644',
      type: 'blob',
      sha: `sha-${path}`,
      size: 100,
      url: '',
    })),
    isTruncated,
    totalItemsCount: paths.length,
  });

  describe('1. Security Policy Detection (SEC-POL-01)', () => {
    it.each([
      ['SECURITY.md', 'SECURITY.md'],
      ['.github/SECURITY.md', '.github/SECURITY.md'],
      ['docs/SECURITY.md', 'docs/SECURITY.md'],
      ['security.md', 'security.md (case-insensitive)'],
      ['.github/security.md', '.github/security.md (case-insensitive)'],
      ['docs/security.md', 'docs/security.md (case-insensitive)'],
    ])('should detect security policy at %s', (path) => {
      const tree = createMockTree(['README.md', 'LICENSE', path]);
      const assessment = analyzeSecurityHygiene(tree);
      const policyFinding = assessment.findings.find((f) => f.ruleId === 'SEC-POL-01');

      expect(policyFinding).toBeDefined();
      expect(policyFinding?.status).toBe('pass');
      expect(policyFinding?.evidence?.value).toBe(path);
      expect(policyFinding?.explanation).toContain(path);
    });

    it('should report not_detected when no security policy file exists in a complete tree', () => {
      const tree = createMockTree(['README.md', 'LICENSE', 'package.json']);
      const assessment = analyzeSecurityHygiene(tree);
      const policyFinding = assessment.findings.find((f) => f.ruleId === 'SEC-POL-01');

      expect(policyFinding?.status).toBe('not_detected');
      expect(policyFinding?.severity).toBe('info');
      expect(policyFinding?.recommendation).toContain('Add a SECURITY.md file');
    });
  });

  describe('2. Automated Dependency Update Detection (SEC-POL-02)', () => {
    it.each([
      ['.github/dependabot.yml', 'Dependabot'],
      ['.github/dependabot.yaml', 'Dependabot'],
      ['renovate.json', 'Renovate'],
      ['renovate.json5', 'Renovate'],
      ['.renovaterc', 'Renovate'],
      ['.renovaterc.json', 'Renovate'],
      ['.github/renovate.json', 'Renovate'],
      ['.github/.renovaterc.json', 'Renovate'],
    ])('should detect automated dependency update config at %s (%s)', (path, tool) => {
      const tree = createMockTree(['README.md', path]);
      const assessment = analyzeSecurityHygiene(tree);
      const depFinding = assessment.findings.find((f) => f.ruleId === 'SEC-POL-02');

      expect(depFinding).toBeDefined();
      expect(depFinding?.status).toBe('pass');
      expect(depFinding?.evidence?.value).toContain(tool);
      expect(depFinding?.evidence?.sourcePath).toBe(path);
    });

    it('should report not_detected when no dependency update config is found in a complete tree', () => {
      const tree = createMockTree(['README.md', 'package.json']);
      const assessment = analyzeSecurityHygiene(tree);
      const depFinding = assessment.findings.find((f) => f.ruleId === 'SEC-POL-02');

      expect(depFinding?.status).toBe('not_detected');
      expect(depFinding?.severity).toBe('info');
      expect(depFinding?.recommendation).toContain('Configure Dependabot or Renovate');
    });
  });

  describe('3. Potentially Sensitive Path Detection (SEC-SEC-01)', () => {
    it.each([
      ['.env'],
      ['.env.local'],
      ['.env.production'],
      ['.env.staging'],
      ['backend/.env'],
      ['config/.env.prod'],
      ['id_rsa'],
      ['id_ed25519'],
      ['id_ecdsa'],
      ['server.key'],
      ['privkey.pem'],
      ['secret.key'],
      ['credentials.json'],
      ['service-account.json'],
      ['client_secret.json'],
    ])('should flag sensitive path candidate: %s', (path) => {
      expect(isPotentiallySensitivePath(path)).toBe(true);

      const tree = createMockTree(['README.md', path]);
      const assessment = analyzeSecurityHygiene(tree);
      const secFinding = assessment.findings.find((f) => f.ruleId === 'SEC-SEC-01');

      expect(secFinding?.status).toBe('warning');
      expect(secFinding?.severity).toBe('medium');
      expect(secFinding?.evidence?.value).toContain(path);
      expect(secFinding?.explanation).toContain('heuristic path check does not inspect file contents');
    });

    it('should pass with info status when zero sensitive files are detected', () => {
      const tree = createMockTree(['src/index.ts', 'README.md', 'package.json', 'tsconfig.json']);
      const assessment = analyzeSecurityHygiene(tree);
      const secFinding = assessment.findings.find((f) => f.ruleId === 'SEC-SEC-01');

      expect(secFinding?.status).toBe('pass');
      expect(secFinding?.severity).toBe('info');
      expect(secFinding?.evidence?.value).toContain('0 potentially sensitive file paths');
    });
  });

  describe('4. Example, Template, Test and Mock Exclusions & Ambiguous Contexts (SEC-SEC-01)', () => {
    it.each([
      ['.env.example'],
      ['.env.sample'],
      ['.env.template'],
      ['.env.dist'],
      ['.env.defaults'],
      ['.env.default'],
      ['id_rsa.pub'],
      ['public.key'],
      ['pub.key'],
      ['ca.pem'],
      ['cacert.pem'],
      ['client_secret_example.json'],
      ['service-account.example.json'],
      ['credentials.example.json'],
    ])('should correctly exclude template/placeholder path: %s', (path) => {
      expect(isPotentiallySensitivePath(path)).toBe(false);

      const tree = createMockTree(['src/index.ts', path]);
      const assessment = analyzeSecurityHygiene(tree);
      const secFinding = assessment.findings.find((f) => f.ruleId === 'SEC-SEC-01');

      expect(secFinding?.status).toBe('pass');
    });

    it.each([
      ['.env.test'],
      ['.env.spec'],
      ['test.key'],
      ['sample.key'],
      ['dummy.key'],
      ['mock.key'],
      ['tests/mocks/mock.key'],
      ['test/fixtures/id_rsa'],
      ['tests/fixtures/.env'],
      ['test/__tests__/.env.local'],
      ['spec/fixtures/server.key'],
      ['docs/examples/.env'],
      ['examples/config/.env.prod'],
    ])('should not blanket-suppress suspicious path in test/docs/sample context: %s', (path) => {
      expect(isPotentiallySensitivePath(path)).toBe(true);

      const tree = createMockTree(['src/index.ts', path]);
      const assessment = analyzeSecurityHygiene(tree);
      const secFinding = assessment.findings.find((f) => f.ruleId === 'SEC-SEC-01');

      expect(secFinding?.status).toBe('warning');
      expect(secFinding?.severity).toBe('low');
      expect(secFinding?.title).toContain('Test/Documentation Context');
      expect(secFinding?.explanation).toContain('Context is ambiguous');
    });
  });

  describe('5. SBOM Filename Recognition (SEC-SC-01)', () => {
    it.each([
      ['bom.json', 'CycloneDX'],
      ['bom.cdx.json', 'CycloneDX'],
      ['bom.xml', 'CycloneDX'],
      ['service.cdx.xml', 'CycloneDX'],
      ['cdx.xml', 'CycloneDX'],
      ['sbom.json', 'CycloneDX/General'],
      ['sbom.cdx.json', 'CycloneDX'],
      ['release.spdx', 'SPDX'],
      ['app.spdx', 'SPDX'],
      ['release.spdx.json', 'SPDX'],
      ['build.spdx.yml', 'SPDX'],
      ['build.spdx.yaml', 'SPDX'],
      ['manifest.spdx.rdf', 'SPDX'],
      ['package.spdx.rdf.xml', 'SPDX'],
    ])('should detect SBOM filename candidate: %s (%s)', (path) => {
      expect(isSbomCandidatePath(path)).toBe(true);

      const tree = createMockTree(['README.md', path]);
      const assessment = analyzeSecurityHygiene(tree);
      const sbomFinding = assessment.findings.find((f) => f.ruleId === 'SEC-SC-01');

      expect(sbomFinding?.status).toBe('pass');
      expect(sbomFinding?.evidence?.value).toBe(path);
      expect(sbomFinding?.explanation).toContain('schema validity, component completeness, and currency are not verified in this preliminary phase');
    });

    it.each([
      ['BOM.JSON'],
      ['BOM.CDX.JSON'],
      ['BOM.XML'],
      ['SERVICE.CDX.XML'],
      ['SBOM.JSON'],
      ['RELEASE.SPDX'],
      ['RELEASE.SPDX.JSON'],
      ['BUILD.SPDX.YML'],
      ['BUILD.SPDX.YAML'],
      ['MANIFEST.SPDX.RDF'],
      ['PACKAGE.SPDX.RDF.XML'],
    ])('should detect SBOM candidates case-insensitively: %s', (path) => {
      expect(isSbomCandidatePath(path)).toBe(true);
    });

    it.each([
      ['pom.xml'],
      ['package.json'],
      ['spdx.txt'],
      ['sbom.pdf'],
      ['cdx.txt'],
      ['spdx_notes.md'],
      ['random.json'],
      ['test/fixtures/bom.json'],
    ])('should not match non-SBOM or test-fixture path: %s', (path) => {
      expect(isSbomCandidatePath(path)).toBe(false);
    });

    it('should report not_detected when no SBOM candidate exists in a complete tree', () => {
      const tree = createMockTree(['README.md', 'package.json', 'src/index.ts']);
      const assessment = analyzeSecurityHygiene(tree);
      const sbomFinding = assessment.findings.find((f) => f.ruleId === 'SEC-SC-01');

      expect(sbomFinding?.status).toBe('not_detected');
      expect(sbomFinding?.severity).toBe('info');
      expect(sbomFinding?.recommendation).toContain('Consider generating and publishing an SBOM');
    });
  });

  describe('6. Truncated and Unavailable Git Tree Behavior', () => {
    it('should label all rules unknown when tree is unavailable', () => {
      const assessment = analyzeSecurityHygiene(null, []);

      expect(assessment.coverage.treeStatus).toBe('unavailable');
      expect(assessment.summary.unknownCount).toBe(4);
      expect(assessment.findings.every((f) => f.status === 'unknown')).toBe(true);
    });

    it('should label negative findings unknown when tree is truncated', () => {
      const truncatedTree = createMockTree(['README.md', 'package.json'], true);
      const assessment = analyzeSecurityHygiene(truncatedTree);

      expect(assessment.coverage.treeStatus).toBe('truncated');
      expect(assessment.summary.unknownCount).toBe(4);
      expect(assessment.findings.every((f) => f.status === 'unknown')).toBe(true);
    });

    it('should preserve positive pass/warning findings even when tree is truncated', () => {
      const truncatedTreeWithFindings = createMockTree(
        ['SECURITY.md', '.env.production', 'bom.json', '.github/dependabot.yml'],
        true
      );
      const assessment = analyzeSecurityHygiene(truncatedTreeWithFindings);

      expect(assessment.coverage.treeStatus).toBe('truncated');
      expect(assessment.findings.find((f) => f.ruleId === 'SEC-POL-01')?.status).toBe('pass');
      expect(assessment.findings.find((f) => f.ruleId === 'SEC-POL-02')?.status).toBe('pass');
      expect(assessment.findings.find((f) => f.ruleId === 'SEC-SEC-01')?.status).toBe('warning');
      expect(assessment.findings.find((f) => f.ruleId === 'SEC-SC-01')?.status).toBe('pass');
      expect(assessment.summary.unknownCount).toBe(0);
    });
  });

  describe('7. No Additional API Requests Triggered by Phase 2.1A', () => {
    it('should not alter totalEndpoints or endpoint response counts', () => {
      const outcome = runAllAnalyzers(mockRawAnalysisData);

      expect(outcome.coverage.endpointsTotal).toBe(10);
      expect(outcome.coverage.endpointsSucceeded).toBe(10);
      expect(outcome.coverage.endpointsFailed).toBe(0);
      expect(outcome.coverage.endpointResponseLabel).toBe('10/10');
    });
  });

  describe('8. Preservation of Core Scoring Engine & Weights', () => {
    it('should maintain exact score results, category counts, and weights across all perspectives', () => {
      const outcome = runAllAnalyzers(mockRawAnalysisData);

      // Core findings array must strictly contain findings for the 6 core categories
      expect(outcome.findings.length).toBe(24);
      const categoriesFound = new Set(outcome.findings.map((f) => f.category));
      expect(categoriesFound).toEqual(
        new Set(['documentation', 'license', 'ci_cd', 'testing', 'releases', 'metadata'])
      );

      // Verify each perspective produces identical scores
      const balanced = calculateAssessmentScore(outcome.findings, 'balanced');
      const engineering = calculateAssessmentScore(outcome.findings, 'engineering');
      const presentation = calculateAssessmentScore(outcome.findings, 'presentation');

      expect(balanced.totalScore).toBe(99);
      expect(engineering.totalScore).toBe(99);
      expect(presentation.totalScore).toBe(99);

      // Verify perspective weights sum to exactly 100 and match v2.0.0 baseline
      expect(SCORING_PERSPECTIVES.balanced.weights).toEqual({
        documentation: 20,
        license: 15,
        ci_cd: 20,
        testing: 20,
        releases: 10,
        metadata: 15,
      });
      expect(SCORING_PERSPECTIVES.engineering.weights).toEqual({
        documentation: 10,
        license: 10,
        ci_cd: 30,
        testing: 30,
        releases: 10,
        metadata: 10,
      });
      expect(SCORING_PERSPECTIVES.presentation.weights).toEqual({
        documentation: 30,
        license: 25,
        ci_cd: 10,
        testing: 10,
        releases: 10,
        metadata: 15,
      });

      Object.values(SCORING_PERSPECTIVES).forEach((p) => {
        const sum = Object.values(p.weights).reduce((a, b) => a + b, 0);
        expect(sum).toBe(100);
      });
    });
  });

  describe('9. Separation of Security Findings from Core Accounting', () => {
    it('should strictly isolate security findings inside securityHygiene', () => {
      const outcome = runAllAnalyzers(mockRawAnalysisData);

      expect(outcome.securityHygiene).toBeDefined();
      expect(outcome.securityHygiene?.findings.length).toBe(4);

      // None of the security findings should be in the core findings array
      const coreRuleIds = outcome.findings.map((f) => f.ruleId);
      expect(coreRuleIds.some((id) => id.startsWith('SEC-'))).toBe(false);

      // Reconciled core summary counts must strictly sum to total core findings
      const balanced = calculateAssessmentScore(outcome.findings, 'balanced');
      const sumCore =
        balanced.summary.passCount +
        balanced.summary.warningCount +
        balanced.summary.issueCount +
        balanced.summary.notDetectedCount +
        balanced.summary.unknownCount;

      expect(sumCore).toBe(outcome.findings.length);
    });
  });

  describe('10. Report Compatibility (JSON, Markdown, Print)', () => {
    it('should generate additive Schema v1.2 report while maintaining v1.1 compatibility', () => {
      const outcome = runAllAnalyzers(mockRawAnalysisData);
      const report = generateReport(outcome, 'balanced');

      // Schema is updated additively to v1.2
      expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
      expect(REPORT_SCHEMA_VERSION).toBe('https://repohealth.dev/schemas/v1.2/report.json');

      // Version retains 1.1.0 for backwards compatibility with v1.1 parsers
      expect(report.version).toBe('1.1.0');

      // Additive securityHygiene block is present
      expect(report.securityHygiene).toBeDefined();
      expect(report.securityHygiene?.findings.length).toBe(4);

      // Serializes cleanly to JSON
      const json = JSON.stringify(report);
      const parsed = JSON.parse(json);
      expect(parsed.securityHygiene).toBeDefined();
      expect(parsed.securityHygiene.findings.length).toBe(4);
    });

    it('should include Security & Supply-Chain Hygiene section in Markdown summary', () => {
      const outcome = runAllAnalyzers(mockRawAnalysisData);
      const report = generateReport(outcome, 'balanced');
      const md = generateMarkdownSummary(report);

      expect(md).toContain('## Security & Supply-Chain Hygiene (Preliminary)');
      expect(md).toContain('SEC-POL-01');
      expect(md).toContain('SEC-POL-02');
      expect(md).toContain('SEC-SEC-01');
      expect(md).toContain('SEC-SC-01');
    });
  });
});
