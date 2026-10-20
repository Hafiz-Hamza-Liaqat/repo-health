import { describe, it, expect } from 'vitest';
import { analyzeReadme } from './readmeAnalyzer';
import { analyzeLicense } from './licenseAnalyzer';
import { analyzeWorkflows } from './workflowAnalyzer';
import { analyzeTestingEvidence } from './testingAnalyzer';
import { analyzeReleases } from './releasesAnalyzer';
import { analyzeMetadata } from './metadataAnalyzer';
import { detectTechnologies } from './technologyDetector';
import { analyzeProvenance } from './provenanceAnalyzer';
import { mockRepoData, mockRawAnalysisData } from '../test/fixtures/sampleRepo';

describe('Analyzer Modules', () => {
  describe('README Analyzer', () => {
    it('should detect substantive README and sections', () => {
      const findings = analyzeReadme(mockRawAnalysisData.readme, mockRepoData);
      expect(findings.length).toBeGreaterThan(0);

      const doc01 = findings.find((f) => f.ruleId === 'DOC-01');
      expect(doc01?.status).toBe('pass');

      const doc03 = findings.find((f) => f.ruleId === 'DOC-03');
      expect(doc03?.status).toBe('pass');

      const doc05 = findings.find((f) => f.ruleId === 'DOC-05');
      expect(doc05?.status).toBe('pass');
    });

    it('should handle missing README gracefully', () => {
      const findings = analyzeReadme(null, mockRepoData);
      const doc01 = findings.find((f) => f.ruleId === 'DOC-01');
      expect(doc01?.status).toBe('issue');
      expect(doc01?.scoreEffect).toBe(0);
    });

    it('should flag stub or minimal README as warning', () => {
      const stubReadme = {
        name: 'README.md',
        path: 'README.md',
        sha: '123',
        size: 30,
        url: '',
        html_url: '',
        download_url: '',
        content: btoa('# My Project\nWork in progress'),
        encoding: 'base64',
        decodedContent: '# My Project\nWork in progress',
      };
      const findings = analyzeReadme(stubReadme, mockRepoData);
      const doc01 = findings.find((f) => f.ruleId === 'DOC-01');
      expect(doc01?.status).toBe('warning');
    });
  });

  describe('License Analyzer', () => {
    it('should pass with recognized SPDX license and physical file', () => {
      const findings = analyzeLicense(
        mockRawAnalysisData.license,
        mockRepoData,
        ['LICENSE', 'README.md']
      );
      const lic01 = findings.find((f) => f.ruleId === 'LIC-01');
      expect(lic01?.status).toBe('pass');
      expect(lic01?.title).toContain('MIT');

      const lic02 = findings.find((f) => f.ruleId === 'LIC-02');
      expect(lic02?.status).toBe('pass');
    });

    it('should flag missing license as high severity issue', () => {
      const noLicRepo = { ...mockRepoData, license: null };
      const findings = analyzeLicense(null, noLicRepo, ['README.md']);
      const lic01 = findings.find((f) => f.ruleId === 'LIC-01');
      expect(lic01?.status).toBe('issue');
      expect(lic01?.severity).toBe('high');
    });
  });

  describe('CI/CD Workflow Analyzer', () => {
    it('should evaluate workflows and passing runs', () => {
      const findings = analyzeWorkflows(
        mockRawAnalysisData.workflows,
        mockRawAnalysisData.workflowRuns,
        mockRepoData,
        []
      );

      const ci01 = findings.find((f) => f.ruleId === 'CI-01');
      expect(ci01?.status).toBe('pass');

      const ci03 = findings.find((f) => f.ruleId === 'CI-03');
      expect(ci03?.status).toBe('pass');
      expect(ci03?.explanation).toContain('SUCCESS');
    });

    it('should flag failing recent workflow run as issue', () => {
      const failingRuns = [
        {
          ...mockRawAnalysisData.workflowRuns[0],
          conclusion: 'failure' as const,
        },
      ];
      const findings = analyzeWorkflows(
        mockRawAnalysisData.workflows,
        failingRuns,
        mockRepoData,
        []
      );

      const ci03 = findings.find((f) => f.ruleId === 'CI-03');
      expect(ci03?.status).toBe('issue');
      expect(ci03?.title).toContain('Failed');
    });

    it('should handle API endpoint failure as unknown status rather than zero score', () => {
      const apiErrors = [
        {
          endpoint: '/actions/workflows',
          status: 403,
          message: 'API rate limit or forbidden',
        },
      ];
      const findings = analyzeWorkflows([], [], mockRepoData, apiErrors);
      const ci01 = findings.find((f) => f.ruleId === 'CI-01');
      expect(ci01?.status).toBe('unknown');
    });
  });

  describe('Testing Evidence Analyzer', () => {
    it('should detect Vitest framework and test scripts', () => {
      const findings = analyzeTestingEvidence(mockRawAnalysisData, mockRepoData);

      const tst01 = findings.find((f) => f.ruleId === 'TST-01');
      expect(tst01?.status).toBe('pass');
      expect(tst01?.title).toContain('Vitest');

      const tst02 = findings.find((f) => f.ruleId === 'TST-02');
      expect(tst02?.status).toBe('pass');

      const tst03 = findings.find((f) => f.ruleId === 'TST-03');
      expect(tst03?.status).toBe('pass');
    });

    it('should flag missing test framework as high severity', () => {
      const emptyRaw = {
        ...mockRawAnalysisData,
        rootFiles: ['README.md'],
        manifestContents: {},
      };
      const findings = analyzeTestingEvidence(emptyRaw, mockRepoData);
      const tst01 = findings.find((f) => f.ruleId === 'TST-01');
      expect(tst01?.status).toBe('not_detected');
    });
  });

  describe('Releases Analyzer', () => {
    it('should identify published releases and semver tags', () => {
      const findings = analyzeReleases(
        mockRawAnalysisData.releases,
        mockRawAnalysisData.tags,
        mockRepoData
      );

      const rel01 = findings.find((f) => f.ruleId === 'REL-01');
      expect(rel01?.status).toBe('pass');
      expect(rel01?.title).toContain('v1.4.0');

      const rel02 = findings.find((f) => f.ruleId === 'REL-02');
      expect(rel02?.status).toBe('pass');
    });

    it('should detect absence of releases', () => {
      const findings = analyzeReleases([], [], mockRepoData);
      const rel01 = findings.find((f) => f.ruleId === 'REL-01');
      expect(rel01?.status).toBe('not_detected');
    });
  });

  describe('Repository Metadata Analyzer', () => {
    it('should verify description, topics, default branch, and recency', () => {
      const findings = analyzeMetadata(mockRepoData);
      const meta01 = findings.find((f) => f.ruleId === 'META-01');
      expect(meta01?.status).toBe('pass');

      const meta02 = findings.find((f) => f.ruleId === 'META-02');
      expect(meta02?.status).toBe('pass');

      const meta03 = findings.find((f) => f.ruleId === 'META-03');
      expect(meta03?.status).toBe('pass');
    });

    it('should warn if repository is archived', () => {
      const archivedRepo = { ...mockRepoData, archived: true };
      const findings = analyzeMetadata(archivedRepo);
      const meta03 = findings.find((f) => f.ruleId === 'META-03');
      expect(meta03?.status).toBe('warning');
      expect(meta03?.title).toContain('Archived');
    });
  });

  describe('Technology Detector', () => {
    it('should detect TypeScript, React, Vitest, and Tailwind CSS with confidence', () => {
      const techs = detectTechnologies(mockRawAnalysisData);
      const techNames = techs.map((t) => t.name);

      expect(techNames).toContain('TypeScript');
      expect(techNames).toContain('React');
      expect(techNames).toContain('Vitest');
      expect(techNames).toContain('Tailwind CSS');

      const react = techs.find((t) => t.name === 'React');
      expect(react?.confidence).toBe('strongly_evidenced');
    });
  });

  describe('Provenance Analyzer', () => {
    it('should detect contributor profile and report provenance disclaimer', () => {
      const signals = analyzeProvenance(
        mockRawAnalysisData.commits,
        mockRawAnalysisData.contributors,
        mockRawAnalysisData.rootFiles,
        mockRawAnalysisData.readme?.decodedContent || '',
        mockRepoData
      );

      expect(signals.totalContributorsSampled).toBe(2);
      expect(signals.commitAuthorConsistency).toBe('small_team');
      expect(signals.disclaimer).toContain('strictly separated from repository quality scores');
    });

    it('should detect explicit bot accounts', () => {
      const botCommits = [
        {
          ...mockRawAnalysisData.commits[0],
          author: { login: 'dependabot[bot]', id: 1, avatar_url: '', html_url: '' },
        },
      ];
      const signals = analyzeProvenance(
        botCommits,
        mockRawAnalysisData.contributors,
        mockRawAnalysisData.rootFiles,
        '',
        mockRepoData
      );
      expect(signals.botActivityDetected).toBe(true);
    });

    it('should detect AI tooling artifacts if .cursorrules or copilot file exists', () => {
      const signals = analyzeProvenance(
        mockRawAnalysisData.commits,
        mockRawAnalysisData.contributors,
        ['.cursorrules', 'README.md'],
        '',
        mockRepoData
      );
      expect(signals.aiToolingDetected).toBe(true);
      expect(signals.aiToolingEvidence?.[0]).toContain('.cursorrules');
    });
  });
});
