import { RawAnalysisData } from '../../types/analysis';
import { GitHubRepo } from '../../types/github';

export const mockRepoData: GitHubRepo = {
  id: 123456,
  node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY=',
  name: 'sample-project',
  full_name: 'acme-corp/sample-project',
  private: false,
  owner: {
    login: 'acme-corp',
    id: 99999,
    avatar_url: 'https://avatars.githubusercontent.com/u/99999',
    html_url: 'https://github.com/acme-corp',
    type: 'Organization',
  },
  html_url: 'https://github.com/acme-corp/sample-project',
  description: 'A production-grade web service built with TypeScript and React',
  fork: false,
  url: 'https://api.github.com/repos/acme-corp/sample-project',
  created_at: '2023-01-15T10:00:00Z',
  updated_at: '2026-03-01T15:00:00Z',
  pushed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  git_url: 'git://github.com/acme-corp/sample-project.git',
  ssh_url: 'git@github.com:acme-corp/sample-project.git',
  clone_url: 'https://github.com/acme-corp/sample-project.git',
  homepage: 'https://sample-project.acme.dev',
  size: 4500,
  stargazers_count: 850,
  watchers_count: 850,
  language: 'TypeScript',
  forks_count: 120,
  open_issues_count: 8,
  license: {
    key: 'mit',
    name: 'MIT License',
    spdx_id: 'MIT',
    url: 'https://api.github.com/licenses/mit',
  },
  topics: ['typescript', 'react', 'vitest', 'tailwindcss', 'developer-tools'],
  default_branch: 'main',
  archived: false,
  disabled: false,
  has_issues: true,
  has_projects: true,
  has_wiki: false,
  has_pages: true,
};

export const sampleReadmeMarkdown = `# sample-project

## Overview
A production-grade web service that helps engineering teams track code health and software quality.
Designed for scalability, high availability, and deterministic verification.

## Features
- Automated code metrics
- Deterministic scoring
- Fast CI integration

## Installation
\`\`\`bash
npm install
npm run build
\`\`\`

## Usage
\`\`\`typescript
import { analyze } from 'sample-project';
const result = analyze('https://github.com/owner/repo');
console.log(result.score);
\`\`\`

## Testing
\`\`\`bash
npm test
\`\`\`

## Contributing
Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on pull request guidelines.
`;

export const mockRawAnalysisData: RawAnalysisData = {
  repo: mockRepoData,
  languages: {
    TypeScript: 85000,
    JavaScript: 12000,
    HTML: 3000,
  },
  readme: {
    name: 'README.md',
    path: 'README.md',
    sha: 'abcdef123456',
    size: sampleReadmeMarkdown.length,
    url: 'https://api.github.com/repos/acme-corp/sample-project/readme',
    html_url: 'https://github.com/acme-corp/sample-project#readme',
    download_url: 'https://raw.githubusercontent.com/acme-corp/sample-project/main/README.md',
    content: btoa(sampleReadmeMarkdown),
    encoding: 'base64',
    decodedContent: sampleReadmeMarkdown,
  },
  license: {
    name: 'LICENSE',
    path: 'LICENSE',
    sha: 'license123',
    size: 1080,
    url: 'https://api.github.com/repos/acme-corp/sample-project/license',
    html_url: 'https://github.com/acme-corp/sample-project/blob/main/LICENSE',
    download_url: 'https://raw.githubusercontent.com/acme-corp/sample-project/main/LICENSE',
    license: {
      key: 'mit',
      name: 'MIT License',
      spdx_id: 'MIT',
      url: 'https://api.github.com/licenses/mit',
      node_id: 'MDc6TGljZW5zZTEz',
    },
    content: 'MIT License\n\nCopyright (c) 2023 Acme Corp',
    encoding: 'utf-8',
  },
  workflows: [
    {
      id: 101,
      node_id: 'W_101',
      name: 'CI / Test & Build',
      path: '.github/workflows/ci.yml',
      state: 'active',
      created_at: '2023-01-20T00:00:00Z',
      updated_at: '2026-02-10T00:00:00Z',
      url: 'https://api.github.com/repos/acme-corp/sample-project/actions/workflows/101',
      html_url: 'https://github.com/acme-corp/sample-project/actions/workflows/ci.yml',
      badge_url: 'https://github.com/acme-corp/sample-project/workflows/CI/badge.svg',
    },
  ],
  workflowRuns: [
    {
      id: 5001,
      name: 'CI / Test & Build',
      head_branch: 'main',
      head_sha: '1a2b3c4d',
      path: '.github/workflows/ci.yml',
      run_number: 142,
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      workflow_id: 101,
      url: 'https://api.github.com/repos/acme-corp/sample-project/actions/runs/5001',
      html_url: 'https://github.com/acme-corp/sample-project/actions/runs/5001',
      created_at: '2026-03-01T12:00:00Z',
      updated_at: '2026-03-01T12:05:00Z',
    },
  ],
  releases: [
    {
      id: 9001,
      tag_name: 'v1.4.0',
      target_commitish: 'main',
      name: 'v1.4.0 - Major Performance Release',
      draft: false,
      prerelease: false,
      created_at: '2026-02-15T10:00:00Z',
      published_at: '2026-02-15T10:30:00Z',
      html_url: 'https://github.com/acme-corp/sample-project/releases/tag/v1.4.0',
      body: '## Changes in v1.4.0\n- High throughput stream processing\n- Vitest runner updates',
      assets: [],
    },
  ],
  tags: [
    {
      name: 'v1.4.0',
      commit: { sha: '1a2b3c4d', url: '' },
      zipball_url: '',
      tarball_url: '',
    },
    {
      name: 'v1.3.0',
      commit: { sha: '5e6f7g8h', url: '' },
      zipball_url: '',
      tarball_url: '',
    },
  ],
  commits: [
    {
      sha: '1a2b3c4d',
      commit: {
        author: {
          name: 'Jane Developer',
          email: 'jane@acme.dev',
          date: '2026-03-01T12:00:00Z',
        },
        committer: {
          name: 'Jane Developer',
          email: 'jane@acme.dev',
          date: '2026-03-01T12:00:00Z',
        },
        message: 'feat: add vitest testing suite',
      },
      author: {
        login: 'janedev',
        id: 1234,
        avatar_url: 'https://avatars.githubusercontent.com/u/1234',
        html_url: 'https://github.com/janedev',
      },
      html_url: 'https://github.com/acme-corp/sample-project/commit/1a2b3c4d',
    },
  ],
  contributors: [
    {
      login: 'janedev',
      id: 1234,
      avatar_url: 'https://avatars.githubusercontent.com/u/1234',
      html_url: 'https://github.com/janedev',
      contributions: 45,
      type: 'User',
    },
    {
      login: 'bob-engineer',
      id: 5678,
      avatar_url: 'https://avatars.githubusercontent.com/u/5678',
      html_url: 'https://github.com/bob-engineer',
      contributions: 28,
      type: 'User',
    },
  ],
  rootFiles: [
    'README.md',
    'LICENSE',
    'package.json',
    'tsconfig.json',
    'vitest.config.ts',
    'tailwind.config.js',
    'tests',
    'src',
    '.github',
  ],
  manifestContents: {
    packageJson: {
      name: 'sample-project',
      version: '1.4.0',
      scripts: {
        build: 'tsc && vite build',
        test: 'vitest run',
      },
      dependencies: {
        react: '^18.3.1',
        'react-dom': '^18.3.1',
      },
      devDependencies: {
        typescript: '^5.0.0',
        vitest: '^1.0.0',
        tailwindcss: '^3.4.0',
      },
    },
  },
  apiErrors: [],
};
