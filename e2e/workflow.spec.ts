import { test, expect } from '@playwright/test';

test.describe('RepoHealth End-to-End User Journey', () => {
  test('should display home page, validation states, and example repositories', async ({ page }) => {
    await page.goto('/');

    // Check title and branding
    await expect(page).toHaveTitle(/RepoHealth/);
    await expect(page.getByRole('heading', { name: /Evaluate code/i })).toBeVisible();
    await expect(
      page.getByText('Evaluate code. Verify evidence. Make better hiring decisions.').first()
    ).toBeVisible();

    // Check URL input placeholder
    const input = page.getByPlaceholder(/Paste public GitHub repository URL/i);
    await expect(input).toBeVisible();

    // Test submitting invalid URL
    await input.fill('https://gitlab.com/some/repo');
    await page.getByRole('button', { name: /Analyze/i }).click();

    // Expect validation message
    await expect(page.getByText(/Unsupported host "gitlab.com"/i)).toBeVisible();

    // Check quick examples exist
    await expect(page.getByText('Quick Examples:')).toBeVisible();
    await expect(page.getByRole('button', { name: 'expressjs/express' })).toBeVisible();
  });

  test('should open API settings modal and show rate limits', async ({ page }) => {
    await page.goto('/');

    // Click rate limit / token pill in header
    await page.getByTitle(/Configure GitHub API and check rate limits/i).click();

    // Check modal appears
    await expect(page.getByText('GitHub API & Rate Limits')).toBeVisible();
    await expect(page.getByText(/Hourly Request Allowance/i)).toBeVisible();

    // Close modal using exact button text
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByText('GitHub API & Rate Limits')).not.toBeVisible();
  });

  test('should analyze repository, render dashboard, switch perspective, and offer export', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // Intercept GitHub REST API routes to return deterministic fixture data
    await page.route('https://api.github.com/repos/mock-org/mock-repo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 999111,
          name: 'mock-repo',
          full_name: 'mock-org/mock-repo',
          private: false,
          owner: { login: 'mock-org', html_url: 'https://github.com/mock-org' },
          html_url: 'https://github.com/mock-org/mock-repo',
          description: 'A mock repository for browser verification',
          fork: false,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2026-03-01T00:00:00Z',
          pushed_at: new Date().toISOString(),
          default_branch: 'main',
          stargazers_count: 350,
          forks_count: 45,
          open_issues_count: 2,
          license: { spdx_id: 'MIT', name: 'MIT License' },
          topics: ['typescript', 'testing'],
          archived: false,
          disabled: false,
          size: 1200,
        }),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/languages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ TypeScript: 45000, CSS: 5000 }),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/readme', async (route) => {
      const readmeText = '# mock-repo\n\n## Overview\nMock overview.\n\n## Installation\n```npm install```\n\n## Usage\n```code```\n\n## Testing\n```npm test```';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'README.md',
          path: 'README.md',
          content: Buffer.from(readmeText).toString('base64'),
          encoding: 'base64',
          html_url: 'https://github.com/mock-org/mock-repo#readme',
        }),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/license', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'LICENSE',
          path: 'LICENSE',
          license: { spdx_id: 'MIT', name: 'MIT License' },
        }),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/actions/workflows', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_count: 1,
          workflows: [
            { id: 1, name: 'CI Pipeline', path: '.github/workflows/ci.yml', state: 'active' },
          ],
        }),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/actions/runs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_count: 1,
          workflow_runs: [
            { id: 101, name: 'CI Pipeline', status: 'completed', conclusion: 'success', head_branch: 'main', run_number: 10 },
          ],
        }),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/releases*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, tag_name: 'v1.0.0', published_at: new Date().toISOString(), body: 'First release' },
        ]),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/tags*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { name: 'v1.0.0', commit: { sha: 'abcdef1' } },
        ]),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/commits*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { sha: '12345', commit: { author: { name: 'Dev', email: 'dev@mock.org', date: new Date().toISOString() }, message: 'init' }, author: { login: 'mockdev' } },
        ]),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/contributors*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { login: 'mockdev', id: 1, contributions: 20, avatar_url: '' },
        ]),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/contents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { name: 'README.md', path: 'README.md', type: 'file' },
          { name: 'LICENSE', path: 'LICENSE', type: 'file' },
          { name: 'package.json', path: 'package.json', type: 'file' },
          { name: 'tests', path: 'tests', type: 'dir' },
        ]),
      });
    });

    await page.route('https://api.github.com/repos/mock-org/mock-repo/contents/package.json', async (route) => {
      const pkg = JSON.stringify({
        name: 'mock-repo',
        scripts: { test: 'vitest run' },
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'package.json',
          path: 'package.json',
          content: Buffer.from(pkg).toString('base64'),
          encoding: 'base64',
        }),
      });
    });

    await page.goto('/');

    const input = page.getByPlaceholder(/Paste public GitHub repository URL/i);
    await input.fill('https://github.com/mock-org/mock-repo');
    await page.getByRole('button', { name: /Analyze/i }).click();

    // Verify Dashboard displays repository title
    await expect(page.getByRole('heading', { level: 1, name: 'mock-org/mock-repo' })).toBeVisible();
    await expect(page.getByText('Repository Health Score')).toBeVisible();

    // Verify categories
    await expect(page.getByText('Category Findings & Verification')).toBeVisible();
    await expect(page.getByRole('button', { name: /All Categories/i })).toBeVisible();

    // Test perspective switcher
    const engButton = page.getByRole('button', { name: /Engineering Evidence/i });
    await expect(engButton).toBeVisible();
    await engButton.click();

    // Verify Action Toolbar buttons
    await expect(page.getByRole('button', { name: /Copy Summary/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Export JSON/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Print \/ Save as PDF/i })).toBeVisible();

    // Click Copy Summary
    await page.getByRole('button', { name: /Copy Summary/i }).click();
    await expect(page.getByText(/Summary Copied!/i)).toBeVisible();
  });
});
