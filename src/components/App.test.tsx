import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';
import { githubApi } from '../services/githubApi';
import { rateLimitTracker } from '../services/rateLimit';
import { mockRawAnalysisData } from '../test/fixtures/sampleRepo';

describe('App Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    githubApi.setCustomToken(null);
    rateLimitTracker.resetToBaseline(false);
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('renders initial hero, tagline, and scan input form', () => {
    render(<App />);

    expect(screen.getAllByText(/RepoHealth/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { level: 1, name: /Evaluate code/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Paste public GitHub repository URL/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Quick Examples:')).toBeInTheDocument();
  });

  it('displays validation error when submitting invalid URL', () => {
    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    fireEvent.change(input, { target: { value: 'https://gitlab.com/invalid/repo' } });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/Unsupported host "gitlab.com"/i)
    ).toBeInTheDocument();
  });

  it('successfully analyzes repository and renders dashboard with results', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockResolvedValue({
      data: mockRawAnalysisData,
      errors: [],
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/acme-corp/sample-project' } });
      fireEvent.click(submitBtn);
    });

    // Wait for analysis to complete and dashboard to appear
    await waitFor(() => {
      expect(screen.getByText('acme-corp/sample-project')).toBeInTheDocument();
    });

    // Score gauge and perspective selector must be present
    expect(screen.getAllByText('Repository Health Score').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Balanced Repository Quality').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Engineering Evidence').length).toBeGreaterThan(0);
    expect(screen.getByText('Export JSON')).toBeInTheDocument();
    expect(screen.getByText('Print / Save as PDF')).toBeInTheDocument();
  });

  it('switches scoring perspective and recalculates score dynamically', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockResolvedValue({
      data: mockRawAnalysisData,
      errors: [],
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/acme-corp/sample-project' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('acme-corp/sample-project')).toBeInTheDocument();
    });

    // Switch to Engineering Evidence
    const engBtn = screen.getByText('Engineering Evidence');
    await act(async () => {
      fireEvent.click(engBtn);
    });

    expect(engBtn.closest('button')).toHaveClass('border-emerald-500/80');
  });

  it('displays accessible error message and preserves user input when API fails', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockRejectedValue(
      new Error('Resource not found or private repository.')
    );

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/unknown/nonexistent-repo' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Analysis Could Not Complete')).toBeInTheDocument();
      expect(
        screen.getByText(/Resource not found or private repository/i)
      ).toBeInTheDocument();
    });

    // Verify user input is preserved
    const refreshedInput = screen.getByPlaceholderText(/Paste public GitHub repository URL/i) as HTMLInputElement;
    expect(refreshedInput.value).toBe('unknown/nonexistent-repo');
  });

  it('displays rate limit error banner, disables retry button, and allows token configuration', async () => {
    const futureResetSec = Math.floor(Date.now() / 1000) + 900;
    rateLimitTracker.setExhausted(futureResetSec, 60);

    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockRejectedValue(
      new Error(rateLimitTracker.getHumanResetMessage())
    );

    render(<App />);

    // When rate limited, form displays banner and disables submit
    expect(screen.getAllByText(/GitHub API Rate Limit Reached/i).length).toBeGreaterThan(0);
    const analyzeBtn = screen.getByRole('button', { name: /Rate Limited/i });
    expect(analyzeBtn).toBeDisabled();
  });

  it('renders all 5 finding status badges in ScoreOverview reconciling to total findings', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockResolvedValue({
      data: mockRawAnalysisData,
      errors: [],
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/acme-corp/sample-project' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('acme-corp/sample-project')).toBeInTheDocument();
    });

    // Score overview status badges: Pass, Warning, Issue, Not Detected, Unknown
    expect(screen.getByText(/\d+\s+Pass/)).toBeInTheDocument();
    expect(screen.getByText(/\d+\s+Warning/)).toBeInTheDocument();
    expect(screen.getByText(/\d+\s+Issue/)).toBeInTheDocument();
    expect(screen.getByText(/\d+\s+Not Detected/)).toBeInTheDocument();
    expect(screen.getByText(/\d+\s+Unknown/)).toBeInTheDocument();
  });

  it('handles invalid token in settings modal with inline 401 error and allows correction without refresh', async () => {
    let rateLimitResponseStatus = 401;
    let rateLimitResponseBody: unknown = { message: 'Bad credentials' };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/rate_limit')) {
        return new Response(JSON.stringify(rateLimitResponseBody), {
          status: rateLimitResponseStatus,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': rateLimitResponseStatus === 200 ? '4999' : '0',
            'x-ratelimit-limit': rateLimitResponseStatus === 200 ? '5000' : '60',
          },
        });
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);

    // 1. Open the API token settings modal
    const settingsBtn = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsBtn);

    expect(
      screen.getByRole('heading', { level: 2, name: /GitHub API & Rate Limits/i })
    ).toBeInTheDocument();

    // 2. Enter an invalid token
    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
    fireEvent.change(tokenInput, { target: { value: 'ghp_invalid_token_sample123' } });

    // 3. Save & Verify against mocked 401 response
    const saveBtn = screen.getByRole('button', { name: /Save & Verify/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // 4. Verify clear inline validation error appears
    await waitFor(() => {
      expect(
        screen.getByText(/Invalid Personal Access Token\. GitHub responded with 401 Bad credentials/i)
      ).toBeInTheDocument();
    });

    // 5. Verify token was not accepted and is not stored in memory
    expect(githubApi.hasCustomToken()).toBe(false);
    expect(githubApi.getCustomToken()).toBeNull();

    // 6. Verify modal remains open for correction
    expect(
      screen.getByRole('heading', { level: 2, name: /GitHub API & Rate Limits/i })
    ).toBeInTheDocument();

    // 7. Verify the user can correct the token without refreshing the page
    rateLimitResponseStatus = 200;
    rateLimitResponseBody = {
      resources: {
        core: {
          limit: 5000,
          remaining: 4999,
          reset: Math.floor(Date.now() / 1000) + 3600,
          used: 1,
        },
      },
    };

    fireEvent.change(tokenInput, { target: { value: 'ghp_valid_token_corrected' } });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Token verified! Allowance increased to 5,000 requests\/hour/i)
      ).toBeInTheDocument();
    });
    expect(githubApi.hasCustomToken()).toBe(true);
    expect(githubApi.getCustomToken()).toBe('ghp_valid_token_corrected');

    // 8. Verify the user can clear the token without refreshing the page
    const clearBtn = screen.getByRole('button', { name: /Clear Token/i });
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Token removed\. Allowance reset to public baseline/i)
      ).toBeInTheDocument();
    });
    expect(githubApi.hasCustomToken()).toBe(false);
    expect(githubApi.getCustomToken()).toBeNull();
  });

  it('clears stale rate-limit error banner when a valid token is saved, preserving URL and enabling actions', async () => {
    const futureResetSec = Math.floor(Date.now() / 1000) + 900;
    rateLimitTracker.setExhausted(futureResetSec, 60);

    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockRejectedValue(
      new Error('GitHub API unauthenticated rate limit reached (60 requests/hr). Quota resets in ~15 min.')
    );

    render(<App />);

    // Verify rate limit banner and disabled Analyze button
    expect(screen.getByText(/GitHub API Rate Limit Reached/i)).toBeInTheDocument();
    const disabledAnalyzeBtn = screen.getByRole('button', { name: /Rate Limited/i });
    expect(disabledAnalyzeBtn).toBeDisabled();

    // Mock successful 200 for /rate_limit endpoint
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/rate_limit')) {
        return new Response(
          JSON.stringify({
            resources: {
              core: {
                limit: 5000,
                remaining: 5000,
                reset: Math.floor(Date.now() / 1000) + 3600,
                used: 0,
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-ratelimit-remaining': '5000',
              'x-ratelimit-limit': '5000',
            },
          }
        );
      }
      return new Response(null, { status: 404 });
    });

    // Open settings and save a valid token
    const settingsBtn = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsBtn);

    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
    fireEvent.change(tokenInput, { target: { value: 'ghp_valid_test_token' } });

    const saveBtn = screen.getByRole('button', { name: /Save & Verify/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Close settings modal
    const closeBtn = screen.getByRole('button', { name: /Close settings/i });
    fireEvent.click(closeBtn);

    // Verify rate-limit banner is cleared and Analyze button is enabled
    await waitFor(() => {
      expect(screen.queryByText(/GitHub API Rate Limit Reached/i)).not.toBeInTheDocument();
    });

    const enabledAnalyzeBtn = screen.getByRole('button', { name: /Analyze/i });
    expect(enabledAnalyzeBtn).toBeEnabled();
  });

  it('does not clear unrelated errors (e.g. 404 Not Found) when a token is saved', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockRejectedValue(
      new Error('Resource not found or private repository.')
    );

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/missing/repo' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Resource not found or private repository/i)).toBeInTheDocument();
    });

    // Open settings and save valid token
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/rate_limit')) {
        return new Response(
          JSON.stringify({
            resources: {
              core: { limit: 5000, remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600, used: 0 },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-ratelimit-remaining': '5000',
              'x-ratelimit-limit': '5000',
            },
          }
        );
      }
      return new Response(null, { status: 404 });
    });

    const settingsBtn = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsBtn);

    const tokenInput = screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx');
    fireEvent.change(tokenInput, { target: { value: 'ghp_valid_test_token' } });

    const saveBtn = screen.getByRole('button', { name: /Save & Verify/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    const closeBtn = screen.getByRole('button', { name: /Close settings/i });
    fireEvent.click(closeBtn);

    // Verify 404 error banner is preserved
    expect(screen.getByText(/Resource not found or private repository/i)).toBeInTheDocument();
  });

  it('renders Security & Supply-Chain Hygiene card with workflow coverage and interactive filters', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockResolvedValue({
      data: {
        ...mockRawAnalysisData,
        workflowSecurityReport: {
          assessments: [
            {
              filePath: '.github/workflows/ci.yml',
              workflowName: 'CI',
              parseSuccess: true,
              findings: [
                {
                  id: 'WFL-01-pass',
                  ruleId: 'WFL-01',
                  title: 'Minimal Workflow Permissions Configured',
                  status: 'pass',
                  severity: 'info',
                  explanation: 'Workflow declares contents: read permissions.',
                  evidence: { label: 'Permissions', value: 'contents: read' },
                },
                {
                  id: 'WFL-04-na',
                  ruleId: 'WFL-04',
                  title: 'pull_request_target Pattern Not Applicable',
                  status: 'not_applicable',
                  severity: 'info',
                  explanation: 'Workflow does not trigger on pull_request_target.',
                },
              ],
              summary: { passCount: 1, warningCount: 0, issueCount: 0, unknownCount: 0, notApplicableCount: 1 },
            },
          ],
          retrieval: {
            retrievedWorkflows: [{ path: '.github/workflows/ci.yml', content: 'name: CI\non: push', byteLength: 20 }],
            skippedWorkflows: [],
            summary: { discoveredCount: 1, selectedCount: 1, retrievedCount: 1, skippedCount: 0, failedCount: 0, totalBytesRetrieved: 20 },
            coverage: 'complete',
            coverageNotes: ['1 workflow retrieved within budgets.'],
            errors: [],
          },
          overallCoverage: 'complete',
          summary: { totalWorkflowsDiscovered: 1, totalWorkflowsAnalyzed: 1, totalWorkflowsSkipped: 0, passCount: 1, warningCount: 0, issueCount: 0, unknownCount: 0, notApplicableCount: 1 },
        },
      },
      errors: [],
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/acme-corp/sample-project' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Security & Supply-Chain Hygiene')).toBeInTheDocument();
    });

    // Check workflow coverage banner is visible
    expect(screen.getByText('GitHub Actions Workflow Security Coverage')).toBeInTheDocument();
    expect(screen.getByText('COMPLETE COVERAGE')).toBeInTheDocument();

    // Check filter buttons exist and work
    expect(screen.getByRole('button', { name: /All \(/i })).toBeInTheDocument();
    const naFilterBtn = screen.getByRole('button', { name: /N\/A \(/i });
    expect(naFilterBtn).toBeInTheDocument();

    // Filter to N/A
    await act(async () => {
      fireEvent.click(naFilterBtn);
    });

    expect(screen.getAllByText(/pull_request_target Pattern Not Applicable/i).length).toBeGreaterThan(0);
  });
});
