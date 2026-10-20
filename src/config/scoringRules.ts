import { AssessmentCategoryKey, ScoringRule } from '../types/scoring';

export const SCORING_RULES: Record<string, ScoringRule> = {
  // Documentation
  'DOC-01': {
    id: 'DOC-01',
    category: 'documentation',
    title: 'README Presence & Substantive Content',
    description: 'Repository contains a dedicated, non-empty README file explaining the project.',
    basePoints: 4,
  },
  'DOC-02': {
    id: 'DOC-02',
    category: 'documentation',
    title: 'Project Purpose & Architecture Overview',
    description: 'README articulates the problem solved, architectural scope, or features.',
    basePoints: 4,
  },
  'DOC-03': {
    id: 'DOC-03',
    category: 'documentation',
    title: 'Installation & Environment Setup',
    description: 'Step-by-step guidance for installing dependencies and configuring environment.',
    basePoints: 4,
  },
  'DOC-04': {
    id: 'DOC-04',
    category: 'documentation',
    title: 'Usage Guide & Code Examples',
    description: 'Executable usage snippets, CLI flags, or API interaction examples.',
    basePoints: 3,
  },
  'DOC-05': {
    id: 'DOC-05',
    category: 'documentation',
    title: 'Testing Guidance in Documentation',
    description: 'Instructions on how developers or evaluators can run the test suite.',
    basePoints: 3,
  },
  'DOC-06': {
    id: 'DOC-06',
    category: 'documentation',
    title: 'Contribution or Live Demo Links',
    description: 'Provides contribution instructions or links to a live deployment.',
    basePoints: 2,
  },

  // License
  'LIC-01': {
    id: 'LIC-01',
    category: 'license',
    title: 'Recognized Open Source License (SPDX)',
    description: 'Repository defines an identifiable SPDX standard open source or commercial license.',
    basePoints: 7,
  },
  'LIC-02': {
    id: 'LIC-02',
    category: 'license',
    title: 'Dedicated License File',
    description: 'A physical LICENSE, COPYING, or LICENSE.md file exists in the repository root.',
    basePoints: 5,
  },
  'LIC-03': {
    id: 'LIC-03',
    category: 'license',
    title: 'Unambiguous Distribution Rights',
    description: 'No ambiguous or missing licensing claims that inhibit enterprise evaluation.',
    basePoints: 3,
  },

  // CI/CD Workflows
  'CI-01': {
    id: 'CI-01',
    category: 'ci_cd',
    title: 'Automated CI/CD Workflows Configured',
    description: 'Repository contains automated GitHub Actions workflow definitions.',
    basePoints: 8,
  },
  'CI-02': {
    id: 'CI-02',
    category: 'ci_cd',
    title: 'Automated Event Triggers',
    description: 'Workflows run on push, pull_request, or scheduled automated events.',
    basePoints: 5,
  },
  'CI-03': {
    id: 'CI-03',
    category: 'ci_cd',
    title: 'Recent Workflow Execution Health',
    description: 'Verified recent workflow runs pass without breaking pipelines.',
    basePoints: 7,
  },

  // Testing Evidence
  'TST-01': {
    id: 'TST-01',
    category: 'testing',
    title: 'Testing Framework Infrastructure',
    description: 'Manifests or configs confirm a recognized test runner (Vitest, Jest, Pytest, Playwright, etc.).',
    basePoints: 7,
  },
  'TST-02': {
    id: 'TST-02',
    category: 'testing',
    title: 'Executable Test Script Declared',
    description: 'A dedicated test script or command is exposed in project manifests (e.g. npm test).',
    basePoints: 5,
  },
  'TST-03': {
    id: 'TST-03',
    category: 'testing',
    title: 'Dedicated Test Directory & Spec Files',
    description: 'Repository contains structured test suites (e.g., test/, spec/, *.test.ts, test_*.py).',
    basePoints: 5,
  },
  'TST-04': {
    id: 'TST-04',
    category: 'testing',
    title: 'Automated Test Execution in CI',
    description: 'CI workflow configuration explicitly invokes the test suite on incoming changes.',
    basePoints: 3,
  },

  // Releases & Tags
  'REL-01': {
    id: 'REL-01',
    category: 'releases',
    title: 'Published GitHub Releases',
    description: 'Formal GitHub releases with version changelogs and release notes.',
    basePoints: 5,
  },
  'REL-02': {
    id: 'REL-02',
    category: 'releases',
    title: 'Git Version Tags Detected',
    description: 'Repository utilizes semantic version tags (e.g., v1.0.0) tracking milestones.',
    basePoints: 3,
  },
  'REL-03': {
    id: 'REL-03',
    category: 'releases',
    title: 'Release Recency & Packaging',
    description: 'Active release cadence with attached release assets or verified distribution.',
    basePoints: 2,
  },

  // Repository Metadata
  'META-01': {
    id: 'META-01',
    category: 'metadata',
    title: 'Repository Description & About Section',
    description: 'Concise, informative description populated in GitHub repository details.',
    basePoints: 4,
  },
  'META-02': {
    id: 'META-02',
    category: 'metadata',
    title: 'Topics & Discoverability Tags',
    description: 'Repository tags highlight core technologies and domain scope.',
    basePoints: 3,
  },
  'META-03': {
    id: 'META-03',
    category: 'metadata',
    title: 'Default Branch Hygiene & Lifecycle Status',
    description: 'Repository is active (not archived or disabled) with a modern default branch.',
    basePoints: 3,
  },
  'META-04': {
    id: 'META-04',
    category: 'metadata',
    title: 'Live Homepage or Documentation Link',
    description: 'Direct link to production deployment, staging preview, or docs site.',
    basePoints: 2,
  },
  'META-05': {
    id: 'META-05',
    category: 'metadata',
    title: 'Maintenance Recency',
    description: 'Repository shows commits or maintenance activity within reasonable development cycles.',
    basePoints: 3,
  },
};

export const CATEGORY_LABELS: Record<AssessmentCategoryKey, string> = {
  documentation: 'README & Documentation',
  license: 'License & Open Source Compliance',
  ci_cd: 'CI/CD Workflows & Automation',
  testing: 'Testing Evidence & Rigor',
  releases: 'Releases & Version Tags',
  metadata: 'Repository Metadata & Hygiene',
};
