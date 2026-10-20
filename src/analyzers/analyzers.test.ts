import { describe, it, expect } from 'vitest';
import { analyzeReadme } from './readmeAnalyzer';
import { analyzeLicense } from './licenseAnalyzer';
import { analyzeWorkflows } from './workflowAnalyzer';
import { analyzeTestingEvidence } from './testingAnalyzer';
import { analyzeReleases } from './releasesAnalyzer';
import { analyzeMetadata } from './metadataAnalyzer';
import { detectTechnologies } from './technologyDetector';
import { analyzeProvenance } from './provenanceAnalyzer';
import { runAllAnalyzers } from './index';
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

    it('should recognize numbered ATX headings matching RepoHealth README structure without false warnings', () => {
      const repoHealthMarkdown = `# RepoHealth
Evaluate code. Verify evidence. Make better hiring decisions.

## 1. Project Purpose
RepoHealth helps engineering teams and recruiters assess repository health using deterministic checks.

## 2. Key Features
- Transparent scoring breakdown
- Evidence-based findings with direct links
- Recursive test discovery

## 3. Quick Start & Installation
\`\`\`bash
npm install
npm run dev
\`\`\`

## 4. Architecture Overview
RepoHealth follows a modular architecture separating GitHub REST ingestion, deterministic analyzers, and report generation.

## 5. Testing Strategy
\`\`\`bash
npm test
\`\`\`
`;
      const repoHealthReadme = {
        name: 'README.md',
        path: 'README.md',
        sha: 'rh123',
        size: repoHealthMarkdown.length,
        url: '',
        html_url: '',
        download_url: '',
        content: btoa(repoHealthMarkdown),
        encoding: 'base64',
        decodedContent: repoHealthMarkdown,
      };

      const findings = analyzeReadme(repoHealthReadme, mockRepoData);
      
      const doc02 = findings.find((f) => f.ruleId === 'DOC-02');
      expect(doc02?.status).toBe('pass');
      expect(doc02?.evidence?.value).toContain('1. Project Purpose');

      const doc03 = findings.find((f) => f.ruleId === 'DOC-03');
      expect(doc03?.status).toBe('pass');
      expect(doc03?.evidence?.value).toContain('3. Quick Start & Installation');

      // Test that 4. Architecture Overview also passes DOC-02 when present
      const archReadme = {
        ...repoHealthReadme,
        decodedContent: '# Repo\n\n## 4. Architecture Overview\nThis project separates analyzers and engines.',
      };
      const archFindings = analyzeReadme(archReadme, mockRepoData);
      const doc02Arch = archFindings.find((f) => f.ruleId === 'DOC-02');
      expect(doc02Arch?.status).toBe('pass');
      expect(doc02Arch?.evidence?.value).toContain('4. Architecture Overview');
    });

    it('should recognize synthetic alternate headings like About, What Is, and Roman numerals', () => {
      const altMarkdown = `# Developer Tool

## I. About
This tool was built to solve specific repository analysis challenges.

## II. What Is Developer Tool?
An open-source inspection engine for software engineering artifacts.

## III. System Design & Technical Architecture
Modular analyzers ingest data and output typed JSON reports.
`;
      const altReadme = {
        name: 'README.md',
        path: 'README.md',
        sha: 'alt123',
        size: altMarkdown.length,
        url: '',
        html_url: '',
        download_url: '',
        content: btoa(altMarkdown),
        encoding: 'base64',
        decodedContent: altMarkdown,
      };

      const findings = analyzeReadme(altReadme, mockRepoData);
      const doc02 = findings.find((f) => f.ruleId === 'DOC-02');
      expect(doc02?.status).toBe('pass');
      expect(doc02?.evidence?.value).toContain('I. About');
    });

    it('should NOT accept arbitrary paragraph mentions without a heading as proof of purpose or architecture', () => {
      const paragraphOnlyMarkdown = `# Minimal Project
Some random introduction text.
In this paragraph we casually mention the architecture overview of another system without providing our own.
And we also talk about the purpose of unrelated software tools.
No installation heading here.
`;
      const paraReadme = {
        name: 'README.md',
        path: 'README.md',
        sha: 'para123',
        size: paragraphOnlyMarkdown.length,
        url: '',
        html_url: '',
        download_url: '',
        content: btoa(paragraphOnlyMarkdown),
        encoding: 'base64',
        decodedContent: paragraphOnlyMarkdown,
      };

      const findings = analyzeReadme(paraReadme, mockRepoData);
      const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
      expect(doc04?.status).toBe('not_detected');
    });

    describe('Tightened README Evidence Rules (DOC-04 & DOC-06)', () => {
      const baseRepo: typeof mockRepoData = {
        ...mockRepoData,
        homepage: null, // Clear homepage by default so demo is not assumed
      };

      const makeReadme = (md: string) => ({
        name: 'README.md',
        path: 'README.md',
        sha: 'mock-sha',
        size: md.length,
        url: 'https://api.github.com/repos/acme/sample/readme',
        html_url: 'https://github.com/acme/sample#readme',
        download_url: '',
        content: btoa(md),
        encoding: 'base64',
        decodedContent: md,
      });

      // 1. A README with a methodology section and code blocks elsewhere, but no usage section
      it('1. should NOT award usage points for a methodology section with code blocks elsewhere when no usage section exists', () => {
        const md = `# Analytics Tool

## 1. Project Purpose
Calculates code metrics.

## 2. Scoring Methodology
Our formula uses linear regression:
\`\`\`python
score = sum(w * f for w, f in zip(weights, features))
\`\`\`

## 3. Installation
\`\`\`bash
pip install -r requirements.txt
\`\`\`
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, ['README.md']);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('not_detected');
        expect(doc04?.scoreEffect).toBe(0);
        expect(doc04?.explanation).toContain('No dedicated usage section');
      });

      // 2. A valid usage section with relevant code examples
      it('2. should award full points for a valid usage section with relevant code examples', () => {
        const md = `# Dev Tool

## Overview
A CLI and library for project analysis.

## Usage
Run the CLI:
\`\`\`bash
repo-health https://github.com/facebook/react --json
\`\`\`

Or use the programmatic TypeScript API:
\`\`\`typescript
import { analyze } from 'repo-health';
const report = await analyze('https://github.com/facebook/react');
console.log(report.score);
\`\`\`
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, ['README.md']);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('pass');
        expect(doc04?.scoreEffect).toBe(3);
        expect(doc04?.evidence?.value).toContain('Usage');
        expect(doc04?.evidence?.value).toContain('code examples');
      });

      // 3. A README with setup commands and test instructions but no usage examples
      it('3. should return not_detected for a README with setup commands and test instructions but no usage examples', () => {
        const md = `# Web Application

## Setup and Installation
\`\`\`bash
npm install
npm run build
\`\`\`

## Verification and Quality Commands
\`\`\`bash
npm run typecheck
npm run lint
npm test
\`\`\`
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, ['README.md']);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('not_detected');
        expect(doc04?.scoreEffect).toBe(0);
      });

      // 4. A generic "Setup and Development Commands" heading without contribution instructions
      it('4. should NOT award contribution points for a generic "Setup and Development Commands" heading without contribution instructions', () => {
        const md = `# Backend Service

## Overview
Backend API service.

## Setup and Development Commands
\`\`\`bash
npm install
npm run dev
\`\`\`
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, ['README.md', 'package.json']);
        const doc06 = findings.find((f) => f.ruleId === 'DOC-06');
        expect(doc06?.status).toBe('warning');
        expect(doc06?.scoreEffect).toBe(0);
        expect(doc06?.explanation).toContain('development setup commands, but lacks formal contribution guidelines');
      });

      // 5. A genuine contribution guide in the README
      it('5. should award full points for a genuine contribution guide heading in the README', () => {
        const md = `# Open Source Library

## Overview
General utility library.

## Contributing
We welcome contributions! Please open an issue to discuss your proposal before submitting a pull request.
Make sure all tests pass and follow our code conventions.
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, ['README.md']);
        const doc06 = findings.find((f) => f.ruleId === 'DOC-06');
        expect(doc06?.status).toBe('pass');
        expect(doc06?.scoreEffect).toBe(2);
        expect(doc06?.evidence?.value).toContain('Contributing');
      });

      // 6. A genuine CONTRIBUTING.md file detected through the repository tree
      it('6. should award full points when a genuine CONTRIBUTING.md file is detected in the repository tree', () => {
        const md = `# Cool Project

## Overview
Project overview without a contributing heading in the README.
`;
        // Tree has CONTRIBUTING.md
        const findingsRoot = analyzeReadme(makeReadme(md), baseRepo, ['README.md', 'package.json', 'CONTRIBUTING.md']);
        const doc06Root = findingsRoot.find((f) => f.ruleId === 'DOC-06');
        expect(doc06Root?.status).toBe('pass');
        expect(doc06Root?.scoreEffect).toBe(2);
        expect(doc06Root?.evidence?.value).toContain('CONTRIBUTING.md');

        // Supported equivalent: .github/CONTRIBUTING.md
        const findingsGithub = analyzeReadme(makeReadme(md), baseRepo, ['README.md', '.github/CONTRIBUTING.md']);
        const doc06Github = findingsGithub.find((f) => f.ruleId === 'DOC-06');
        expect(doc06Github?.status).toBe('pass');
        expect(doc06Github?.evidence?.value).toContain('.github/CONTRIBUTING.md');

        // Negative check: text mention of CONTRIBUTING.md without file in tree does NOT pass
        const mdWithMention = `# Project\n\nSee [CONTRIBUTING.md](CONTRIBUTING.md) for details.`;
        const findingsNoFile = analyzeReadme(makeReadme(mdWithMention), baseRepo, ['README.md']);
        const doc06NoFile = findingsNoFile.find((f) => f.ruleId === 'DOC-06');
        expect(doc06NoFile?.status).toBe('warning');
        expect(doc06NoFile?.scoreEffect).toBe(0);
        expect(doc06NoFile?.evidence?.value).toContain('references CONTRIBUTING.md but no corresponding file exists');
      });

      // 7. A valid live demo URL
      it('7. should award full points when a valid live demo URL is present in homepage or README', () => {
        // Case A: via repo homepage
        const repoWithHomepage: typeof mockRepoData = {
          ...baseRepo,
          homepage: 'https://repohealth-preview.vercel.app',
        };
        const mdA = `# Project\n\n## Overview\nSimple project.`;
        const findingsA = analyzeReadme(makeReadme(mdA), repoWithHomepage, ['README.md']);
        const doc06A = findingsA.find((f) => f.ruleId === 'DOC-06');
        expect(doc06A?.status).toBe('pass');
        expect(doc06A?.scoreEffect).toBe(2);
        expect(doc06A?.evidence?.value).toContain('https://repohealth-preview.vercel.app');

        // Case B: via explicit markdown link in README
        const mdB = `# Project\n\nCheck out our [Live Demo](https://demo.repohealth.dev) for a quick trial.`;
        const findingsB = analyzeReadme(makeReadme(mdB), baseRepo, ['README.md']);
        const doc06B = findingsB.find((f) => f.ruleId === 'DOC-06');
        expect(doc06B?.status).toBe('pass');
        expect(doc06B?.scoreEffect).toBe(2);
        expect(doc06B?.evidence?.value).toContain('https://demo.repohealth.dev');
      });

      // 8. Missing or incomplete evidence
      it('8. should return partial or warning for missing or incomplete evidence', () => {
        // Incomplete usage: usage section exists, but has only setup/test commands
        const mdSetupOnly = `# Tool

## Usage
\`\`\`bash
npm install
npm test
\`\`\`
`;
        const findingsUsage = analyzeReadme(makeReadme(mdSetupOnly), baseRepo, ['README.md']);
        const doc04Partial = findingsUsage.find((f) => f.ruleId === 'DOC-04');
        expect(doc04Partial?.status).toBe('warning');
        expect(doc04Partial?.scoreEffect).toBe(1);
        expect(doc04Partial?.explanation).toContain('contains setup or test commands rather than concrete usage examples');

        // Completely missing README
        const findingsMissing = analyzeReadme(null, baseRepo, []);
        const doc04Missing = findingsMissing.find((f) => f.ruleId === 'DOC-04');
        const doc06Missing = findingsMissing.find((f) => f.ruleId === 'DOC-06');
        expect(doc04Missing?.status).toBe('not_detected');
        expect(doc04Missing?.scoreEffect).toBe(0);
        expect(doc06Missing?.status).toBe('not_detected');
        expect(doc06Missing?.scoreEffect).toBe(0);
      });
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
        tree: {
          items: [{ path: 'README.md', mode: '100644', type: 'blob' as const, sha: '1', url: '' }],
          isTruncated: false,
          totalItemsCount: 1,
        },
        manifestContents: {},
      };
      const findings = analyzeTestingEvidence(emptyRaw, mockRepoData);
      const tst01 = findings.find((f) => f.ruleId === 'TST-01');
      expect(tst01?.status).toBe('not_detected');
    });

    it('should discover nested tests and co-located test files across recursive tree without root test directory', () => {
      const nestedTestData = {
        ...mockRawAnalysisData,
        rootFiles: ['package.json', 'src', 'README.md'], // No root test or tests directory
        tree: {
          items: [
            { path: 'package.json', mode: '100644', type: 'blob' as const, sha: 'p1', url: '' },
            { path: 'src/components/Button.tsx', mode: '100644', type: 'blob' as const, sha: 'b1', url: '' },
            { path: 'src/components/Button.test.tsx', mode: '100644', type: 'blob' as const, sha: 'bt1', url: '' },
            { path: 'src/analyzers/metrics.spec.ts', mode: '100644', type: 'blob' as const, sha: 'm1', url: '' },
          ],
          isTruncated: false,
          totalItemsCount: 4,
        },
      };

      const findings = analyzeTestingEvidence(nestedTestData, mockRepoData);
      const tst03 = findings.find((f) => f.ruleId === 'TST-03');
      expect(tst03?.status).toBe('pass');
      expect(tst03?.evidence?.value).toContain('Button.test.tsx');
    });

    it('should report unknown status when Git tree is truncated and test files are not in partial list', () => {
      const truncatedData = {
        ...mockRawAnalysisData,
        rootFiles: ['package.json', 'README.md'],
        tree: {
          items: [
            { path: 'package.json', mode: '100644', type: 'blob' as const, sha: 'p1', url: '' },
            { path: 'README.md', mode: '100644', type: 'blob' as const, sha: 'r1', url: '' },
          ],
          isTruncated: true,
          totalItemsCount: 2,
        },
      };

      const findings = analyzeTestingEvidence(truncatedData, mockRepoData);
      const tst03 = findings.find((f) => f.ruleId === 'TST-03');
      expect(tst03?.status).toBe('unknown');
      expect(tst03?.explanation).toContain('truncated');
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

  describe('Cross-Validation & Data Coverage (runAllAnalyzers)', () => {
    it('should NOT report empty repository warning when repo.size === 0 but valid files exist', () => {
      const zeroSizeRepoWithFiles = {
        ...mockRawAnalysisData,
        repo: {
          ...mockRepoData,
          size: 0, // GitHub API size is 0 KB
        },
      };

      const outcome = runAllAnalyzers(zeroSizeRepoWithFiles);
      
      // Should not have any finding calling the repo empty
      const emptyFindings = outcome.findings.filter(f => 
        f.title.toLowerCase().includes('empty repository') || 
        f.explanation.toLowerCase().includes('repository is empty')
      );
      expect(emptyFindings.length).toBe(0);

      // Should have a limitation noting metadata inconsistency in KB, not bytes
      const sizeLimitation = outcome.coverage.limitations.find((e: string) => 
        e.includes('0 KB')
      );
      expect(sizeLimitation).toBeDefined();
      expect(sizeLimitation).toContain('0 KB');
      expect(sizeLimitation).not.toContain('0 bytes');
    });

    it('should report confirmed empty repository only when no content or tree items exist', () => {
      const genuinelyEmptyRepo = {
        ...mockRawAnalysisData,
        repo: {
          ...mockRepoData,
          size: 0,
        },
        readme: null,
        rootFiles: [],
        tree: {
          items: [],
          isTruncated: false,
          totalItemsCount: 0,
        },
        commits: [],
      };

      const outcome = runAllAnalyzers(genuinelyEmptyRepo);
      const emptyNote = outcome.coverage.limitations.find((e: string) => 
        e.toLowerCase().includes('confirmed empty')
      );
      expect(emptyNote).toBeDefined();
    });

    it('should accurately separate endpoint responses from absent optional resources', () => {
      const repoWithoutOptional = {
        ...mockRawAnalysisData,
        workflows: [],
        workflowRuns: [],
        releases: [],
        tags: [],
        apiErrors: [], // No endpoint failures!
      };

      const outcome = runAllAnalyzers(repoWithoutOptional);

      // All 10 endpoints responded successfully
      expect(outcome.coverage.endpointsSucceeded).toBe(10);
      expect(outcome.coverage.failedEndpoints.length).toBe(0);

      // Absent optional resources are cataloged separately, not treated as errors
      expect(outcome.coverage.absentOptionalResources).toContain('No GitHub Actions workflows configured');
      expect(outcome.coverage.absentOptionalResources).toContain('No published GitHub releases');
      expect(outcome.coverage.absentOptionalResources).toContain('No Git version tags detected');
    });
  });
});
