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

    describe('DOC-04 Web Application & Library Usage Rules (Phase 2)', () => {
      const baseRepo: typeof mockRepoData = {
        ...mockRepoData,
        homepage: null,
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

      const webAppPackageJson = {
        name: 'my-web-app',
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1',
        },
        devDependencies: {
          vite: '^6.0.0',
        },
      };

      const webAppFilePaths = [
        'README.md',
        'package.json',
        'index.html',
        'vite.config.ts',
        'src/App.tsx',
        'src/main.tsx',
        'docs/screenshots/dashboard.png',
      ];

      it('1. should award full points for a web app with an explicit usage guide, workflow steps and existing screenshot', () => {
        const md = `# RepoHealth Web Application

## Overview
A web-based GitHub repository health analyzer.

## How to Use RepoHealth
Follow these simple workflow steps to evaluate any public GitHub repository:
1. Enter a valid public GitHub repository URL into the scan input.
2. Click "Analyze Repository" and wait for real-time GitHub REST API collection.
3. Switch between Balanced, Engineering, and Presentation scoring perspectives.
4. Review category scores, verified findings, and prioritized recommendations.
5. Export findings as JSON or use print/save to generate a PDF report.

![Dashboard Screenshot](docs/screenshots/dashboard.png)
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, webAppFilePaths, webAppPackageJson);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('pass');
        expect(doc04?.scoreEffect).toBe(3);
        expect(doc04?.title).toContain('Usage Workflow');
        expect(doc04?.explanation).toContain('web-application user workflow');
        expect(doc04?.evidence?.value).toContain('docs/screenshots/dashboard.png');
      });

      it('2. should return warning with partial score for a usage guide referencing a screenshot that does not exist in the tree', () => {
        const md = `# Web App

## How to Use
1. Open the web interface in your browser.
2. Paste the target project URL into the search box.
3. Click submit and inspect the results dashboard.
4. Export the resulting audit summary as a PDF.

![Missing Screenshot](docs/screenshots/non-existent-image.png)
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, webAppFilePaths, webAppPackageJson);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('warning');
        expect(doc04?.scoreEffect).toBe(1);
        expect(doc04?.title).toContain('Unverified Screenshot References');
        expect(doc04?.explanation).toContain('could not be verified');
      });

      it('3. should NOT award full points to a web app with screenshots but no useful usage instructions', () => {
        const mdNoUsage = `# Web App

## Overview
Some web application.

## Screenshot Gallery
![Dashboard Screenshot](docs/screenshots/dashboard.png)
`;
        const findingsNoUsage = analyzeReadme(makeReadme(mdNoUsage), baseRepo, webAppFilePaths, webAppPackageJson);
        const doc04NoUsage = findingsNoUsage.find((f) => f.ruleId === 'DOC-04');
        expect(doc04NoUsage?.status).toBe('not_detected');
        expect(doc04NoUsage?.scoreEffect).toBe(0);

        const mdVague = `# Web App

## Usage
Just open the website and click around.

![Dashboard](docs/screenshots/dashboard.png)
`;
        const findingsVague = analyzeReadme(makeReadme(mdVague), baseRepo, webAppFilePaths, webAppPackageJson);
        const doc04Vague = findingsVague.find((f) => f.ruleId === 'DOC-04');
        expect(doc04Vague?.status).toBe('warning');
        expect(doc04Vague?.scoreEffect).toBe(1);
      });

      it('4. should award full points to a library README with a valid usage heading and code examples', () => {
        const libraryFilePaths = ['README.md', 'package.json', 'src/index.ts'];
        const libraryPackageJson = {
          name: 'math-library',
          dependencies: {},
        };
        const md = `# Math Library

## Usage
Import and calculate:
\`\`\`typescript
import { add, multiply } from 'math-library';
const sum = add(5, 10);
console.log(multiply(sum, 2));
\`\`\`
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, libraryFilePaths, libraryPackageJson);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('pass');
        expect(doc04?.scoreEffect).toBe(3);
        expect(doc04?.title).toContain('Code Snippets');
        expect(doc04?.explanation).toContain('executable code examples');
      });

      it('5. should return not_detected for a setup-only README with installation and test commands', () => {
        const md = `# Tool

## Installation
\`\`\`bash
npm install -g my-tool
\`\`\`

## Testing
\`\`\`bash
npm test
\`\`\`
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, webAppFilePaths, webAppPackageJson);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('not_detected');
        expect(doc04?.scoreEffect).toBe(0);
      });

      it('6. should return not_detected when code blocks appear only in unrelated sections', () => {
        const md = `# Project

## Architecture Overview
Here is how our data schema looks:
\`\`\`json
{
  "status": "active",
  "nodes": 4
}
\`\`\`
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, webAppFilePaths, webAppPackageJson);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('not_detected');
        expect(doc04?.scoreEffect).toBe(0);
      });

      it('7. should return not_detected for missing README and incomplete tree evidence', () => {
        const findings = analyzeReadme(null, baseRepo, []);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('not_detected');
        expect(doc04?.scoreEffect).toBe(0);
      });

      it('8. should award full points for RepoHealth web app with workflow steps and verified screenshots', () => {
        const actualRepoFilePaths = [
          'README.md',
          'package.json',
          'index.html',
          'vite.config.ts',
          'src/App.tsx',
          'docs/screenshots/homepage.png',
          'docs/screenshots/report-overview.png',
          'docs/screenshots/report-findings.png',
        ];
        const md = `# RepoHealth
## 1. Project Purpose
RepoHealth evaluates GitHub repositories.

## 2. Screenshot Gallery
![Homepage](docs/screenshots/homepage.png)
![Overview](docs/screenshots/report-overview.png)
![Findings](docs/screenshots/report-findings.png)

## 3. How to Use RepoHealth
1. Enter a public GitHub repository URL into the scanner input.
2. Start the scan and wait for actual GitHub API results across all stages.
3. Switch between Balanced, Engineering Evidence, and Presentation scoring perspectives.
4. Inspect category scores, evidence-backed findings, and recommendations.
5. Export the findings as JSON or print/save the report as PDF.
`;
        const findings = analyzeReadme(makeReadme(md), baseRepo, actualRepoFilePaths, webAppPackageJson);
        const doc04 = findings.find((f) => f.ruleId === 'DOC-04');
        expect(doc04?.status).toBe('pass');
        expect(doc04?.scoreEffect).toBe(3);
        expect(doc04?.title).toContain('Usage Workflow');
        expect(doc04?.explanation).toContain('web-application user workflow');
        expect(doc04?.evidence?.value).toContain('docs/screenshots/homepage.png');
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

    it('should handle Strideto scenario: root LICENSE file exists with NOASSERTION metadata', () => {
      const stridetoRepo = {
        ...mockRepoData,
        license: {
          key: 'other',
          name: 'Other',
          spdx_id: 'NOASSERTION',
          url: null,
          node_id: 'MDc6TGljZW5zZTA=',
        },
      };
      const stridetoLicense = {
        name: 'LICENSE',
        path: 'LICENSE',
        sha: 'strideto-lic-sha',
        size: 1024,
        url: '',
        html_url: '',
        download_url: '',
        content: btoa('Custom commercial or unparsed license terms...'),
        encoding: 'base64',
        decodedContent: 'Custom commercial or unparsed license terms...',
        license: {
          key: 'other',
          name: 'Other',
          spdx_id: 'NOASSERTION',
          url: null,
          node_id: 'MDc6TGljZW5zZTA=',
        },
      };

      const findings = analyzeLicense(stridetoLicense, stridetoRepo, ['LICENSE', 'README.md']);

      const lic01 = findings.find((f) => f.ruleId === 'LIC-01');
      expect(lic01).toBeDefined();
      expect(lic01?.status).toBe('warning');
      expect(lic01?.title).toBe('Unrecognized or Unverified License Metadata');
      expect(lic01?.scoreEffect).toBe(3); // Math.floor(7 / 2)
      // Must not falsely claim the repository is unlicensed
      expect(lic01?.explanation).toContain('not unlicensed');
      expect(lic01?.explanation).toContain('NOASSERTION');
      // Must not recommend adding a duplicate license file
      expect(lic01?.recommendation).not.toContain('Place a dedicated LICENSE');
      expect(lic01?.recommendation).not.toContain('Add a dedicated LICENSE');

      const lic02 = findings.find((f) => f.ruleId === 'LIC-02');
      expect(lic02).toBeDefined();
      expect(lic02?.status).toBe('pass');
      expect(lic02?.scoreEffect).toBe(5);
      expect(lic02?.title).toContain('LICENSE');

      const lic03 = findings.find((f) => f.ruleId === 'LIC-03');
      expect(lic03).toBeDefined();
      expect(lic03?.status).toBe('warning');
      expect(lic03?.title).toBe('License Terms Unverified in Repository Metadata');
      expect(lic03?.scoreEffect).toBe(1);
      // Must accurately distinguish file presence from unverified metadata
      expect(lic03?.explanation).toContain('dedicated license file exists');
      expect(lic03?.explanation).toContain('NOASSERTION');
    });

    it('should handle Ecommerce Furniture Store scenario: neither root LICENSE file nor license metadata exists', () => {
      const ecomRepo = { ...mockRepoData, license: null };
      const findings = analyzeLicense(null, ecomRepo, ['README.md', 'package.json']);

      const lic01 = findings.find((f) => f.ruleId === 'LIC-01');
      expect(lic01?.status).toBe('issue');
      expect(lic01?.severity).toBe('high');
      expect(lic01?.scoreEffect).toBe(0);
      expect(lic01?.explanation).toContain('Neither a dedicated root license file nor recognized license metadata');

      const lic02 = findings.find((f) => f.ruleId === 'LIC-02');
      expect(lic02?.status).toBe('issue');
      expect(lic02?.scoreEffect).toBe(0);
      expect(lic02?.title).toBe('Dedicated License File Not Found in Root');

      const lic03 = findings.find((f) => f.ruleId === 'LIC-03');
      expect(lic03?.status).toBe('issue');
      expect(lic03?.severity).toBe('high');
      expect(lic03?.scoreEffect).toBe(0);
      expect(lic03?.title).toBe('No Licensing or Distribution Terms Established');
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

    it('should handle Token-Unlock-Intelligence-MCP scenario: custom validation script without conventional test specs', () => {
      const tokenUnlockRaw: typeof mockRawAnalysisData = {
        ...mockRawAnalysisData,
        rootFiles: ['package.json', 'README.md', 'src'],
        tree: {
          items: [
            { path: 'package.json', mode: '100644', type: 'blob' as const, sha: 'p1', url: '' },
            { path: 'src/index.ts', mode: '100644', type: 'blob' as const, sha: 'i1', url: '' },
            { path: 'src/services/unlockService.ts', mode: '100644', type: 'blob' as const, sha: 's1', url: '' },
            { path: 'src/scripts/testUnlockCoverage.ts', mode: '100644', type: 'blob' as const, sha: 't1', url: '' },
          ],
          isTruncated: false,
          totalItemsCount: 4,
        },
        manifestContents: {
          packageJson: {
            name: 'token-unlock-intelligence-mcp',
            scripts: {
              build: 'tsc',
              test: 'tsx src/scripts/testUnlockCoverage.ts',
            },
          },
        },
      };

      const findings = analyzeTestingEvidence(tokenUnlockRaw, mockRepoData);

      // TST-01: Framework not detected, but notes custom verification script
      const tst01 = findings.find((f) => f.ruleId === 'TST-01');
      expect(tst01?.status).toBe('not_detected');
      expect(tst01?.severity).toBe('medium');
      expect(tst01?.explanation).toContain('testUnlockCoverage.ts');

      // TST-02: Executable test script declared in package.json
      const tst02 = findings.find((f) => f.ruleId === 'TST-02');
      expect(tst02?.status).toBe('pass');
      expect(tst02?.evidence?.value).toContain('npm run test');

      // TST-03: Recognizes custom test script, does not treat as full conventional test suite
      const tst03 = findings.find((f) => f.ruleId === 'TST-03');
      expect(tst03?.status).toBe('warning');
      expect(tst03?.title).toBe('Custom Test or Validation Script Detected (1 script)');
      expect(tst03?.scoreEffect).toBe(2); // 2 of 5 points (Math.floor(5/2)), not full 5
      expect(tst03?.explanation).toContain('src/scripts/testUnlockCoverage.ts');
      // Must not make the absolute claim that no automated validation file exists
      expect(tst03?.explanation).not.toContain('No automated test files');
      expect(tst03?.evidence?.sourcePath).toBe('src/scripts/testUnlockCoverage.ts');
    });

    it('should NOT award custom test credit to ordinary deployment, import, or build scripts under scripts/ or tools/', () => {
      const deployScriptsRaw: typeof mockRawAnalysisData = {
        ...mockRawAnalysisData,
        rootFiles: ['package.json', 'README.md', 'scripts', 'tools'],
        tree: {
          items: [
            { path: 'package.json', mode: '100644', type: 'blob' as const, sha: 'p1', url: '' },
            { path: 'README.md', mode: '100644', type: 'blob' as const, sha: 'r1', url: '' },
            { path: 'scripts/deploy.ts', mode: '100644', type: 'blob' as const, sha: 'd1', url: '' },
            { path: 'scripts/importData.js', mode: '100644', type: 'blob' as const, sha: 'i1', url: '' },
            { path: 'scripts/seedDatabase.ts', mode: '100644', type: 'blob' as const, sha: 's1', url: '' },
            { path: 'scripts/latestRelease.ts', mode: '100644', type: 'blob' as const, sha: 'l1', url: '' },
            { path: 'tools/buildSchema.ts', mode: '100644', type: 'blob' as const, sha: 'b1', url: '' },
            { path: 'bin/run-service.sh', mode: '100644', type: 'blob' as const, sha: 'rs1', url: '' },
          ],
          isTruncated: false,
          totalItemsCount: 8,
        },
        manifestContents: {
          packageJson: {
            name: 'deploy-utility-app',
            scripts: {
              deploy: 'tsx scripts/deploy.ts',
              build: 'tsx tools/buildSchema.ts',
            },
          },
        },
      };

      const findings = analyzeTestingEvidence(deployScriptsRaw, mockRepoData);

      // TST-01: Framework not detected, high severity (no test framework and no test scripts)
      const tst01 = findings.find((f) => f.ruleId === 'TST-01');
      expect(tst01?.status).toBe('not_detected');
      expect(tst01?.severity).toBe('high');
      expect(tst01?.explanation).not.toContain('deploy.ts');

      // TST-02: No test script found
      const tst02 = findings.find((f) => f.ruleId === 'TST-02');
      expect(tst02?.status).toBe('not_detected');

      // TST-03: Must NOT receive custom test credit or warning
      const tst03 = findings.find((f) => f.ruleId === 'TST-03');
      expect(tst03?.status).toBe('not_detected');
      expect(tst03?.severity).toBe('high');
      expect(tst03?.scoreEffect).toBe(0);
      expect(tst03?.title).toBe('No Automated Test Files or Test Directories Detected');
    });

    it('should handle repository with neither conventional tests nor custom test scripts (Ecommerce Furniture Store scenario)', () => {
      const ecomRaw: typeof mockRawAnalysisData = {
        ...mockRawAnalysisData,
        rootFiles: ['package.json', 'README.md', 'src'],
        tree: {
          items: [
            { path: 'package.json', mode: '100644', type: 'blob' as const, sha: 'p1', url: '' },
            { path: 'src/App.tsx', mode: '100644', type: 'blob' as const, sha: 'a1', url: '' },
            { path: 'src/components/Header.tsx', mode: '100644', type: 'blob' as const, sha: 'h1', url: '' },
            { path: 'src/styles/main.css', mode: '100644', type: 'blob' as const, sha: 'c1', url: '' },
          ],
          isTruncated: false,
          totalItemsCount: 4,
        },
        manifestContents: {
          packageJson: {
            name: 'ecommerce-furniture-store',
            scripts: {
              dev: 'vite',
              build: 'vite build',
            },
          },
        },
      };

      const findings = analyzeTestingEvidence(ecomRaw, mockRepoData);

      const tst01 = findings.find((f) => f.ruleId === 'TST-01');
      expect(tst01?.status).toBe('not_detected');
      expect(tst01?.severity).toBe('high');

      const tst02 = findings.find((f) => f.ruleId === 'TST-02');
      expect(tst02?.status).toBe('not_detected');
      expect(tst02?.title).toBe('No Executable Test Script Found in Project Manifest');

      const tst03 = findings.find((f) => f.ruleId === 'TST-03');
      expect(tst03?.status).toBe('not_detected');
      expect(tst03?.severity).toBe('high');
      expect(tst03?.scoreEffect).toBe(0);
      expect(tst03?.title).toBe('No Automated Test Files or Test Directories Detected');
      expect(tst03?.explanation).toContain('custom validation scripts');
    });

    it('should handle npm-workspace monorepo with root and nested package manifests and test files in multiple directories', () => {
      const monorepoRaw: typeof mockRawAnalysisData = {
        ...mockRawAnalysisData,
        rootFiles: ['package.json', 'README.md', 'packages'],
        tree: {
          items: [
            { path: 'package.json', mode: '100644', type: 'blob' as const, sha: 'p0', url: '' },
            { path: 'packages/core/package.json', mode: '100644', type: 'blob' as const, sha: 'p1', url: '' },
            { path: 'packages/core/src/index.ts', mode: '100644', type: 'blob' as const, sha: 'c1', url: '' },
            { path: 'packages/core/src/index.test.ts', mode: '100644', type: 'blob' as const, sha: 'ct1', url: '' },
            { path: 'packages/utils/package.json', mode: '100644', type: 'blob' as const, sha: 'p2', url: '' },
            { path: 'packages/utils/src/helpers.ts', mode: '100644', type: 'blob' as const, sha: 'u1', url: '' },
            { path: 'packages/utils/tests/helpers.spec.ts', mode: '100644', type: 'blob' as const, sha: 'ut1', url: '' },
          ],
          isTruncated: false,
          totalItemsCount: 7,
        },
        manifestContents: {
          packageJson: {
            name: 'acme-monorepo',
            workspaces: ['packages/*'],
            scripts: {
              build: 'turbo run build',
              lint: 'turbo run lint',
              // No root test script
            },
          },
        },
      };

      const findings = analyzeTestingEvidence(monorepoRaw, mockRepoData);

      // TST-02: Expresses root manifest limitation without asserting nested workspace scripts do not exist
      const tst02 = findings.find((f) => f.ruleId === 'TST-02');
      expect(tst02?.status).toBe('not_detected');
      expect(tst02?.title).toBe('No Workspace-Wide Test Script in Root Manifest');
      expect(tst02?.explanation).toContain('nested package workspaces may declare local test scripts');
      expect(tst02?.explanation).toContain('nested manifests are not retrieved during root evaluation');
      expect(tst02?.recommendation).toContain('npm test --workspaces');

      // TST-03: Describes total files discovered across tree, distributes across workspace packages, lists representative files
      const tst03 = findings.find((f) => f.ruleId === 'TST-03');
      expect(tst03?.status).toBe('pass');
      expect(tst03?.scoreEffect).toBe(5);
      expect(tst03?.title).toContain('2 files');
      expect(tst03?.explanation).toContain('discovered across the repository tree');
      expect(tst03?.explanation).toContain('distributed across 2 workspace packages (core, utils)');
      // Must not falsely claim all test files are located in a single directory
      expect(tst03?.explanation).not.toContain('in directory [packages/utils/tests]');
      expect(tst03?.evidence?.value).toContain('packages/core/src/index.test.ts, packages/utils/tests/helpers.spec.ts');
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
