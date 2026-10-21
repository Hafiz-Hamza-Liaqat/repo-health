import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { githubApi } from './githubApi';
import { rateLimitTracker } from './rateLimit';
import { generateReport } from '../engine/reportGenerator';
import { mockRawAnalysisData } from '../test/fixtures/sampleRepo';

describe('GitHub API Service — Rate Limits, Token Security & Resilience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    githubApi.setCustomToken(null);
    rateLimitTracker.resetToBaseline(false);
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token Memory Safety & Header Management', () => {
    it('stores and retrieves personal access token strictly in JavaScript memory', () => {
      expect(githubApi.hasCustomToken()).toBe(false);
      expect(githubApi.getCustomToken()).toBeNull();

      const sampleToken = 'ghp_testToken1234567890abcdef';
      githubApi.setCustomToken(sampleToken);

      expect(githubApi.hasCustomToken()).toBe(true);
      expect(githubApi.getCustomToken()).toBe(sampleToken);

      // Verify neither sessionStorage nor localStorage is written to
      expect(sessionStorage.getItem('repohealth_github_pat')).toBeNull();
      expect(sessionStorage.length).toBe(0);
      expect(localStorage.getItem('repohealth_github_pat')).toBeNull();
      expect(localStorage.length).toBe(0);

      // Clearing token removes from memory
      githubApi.setCustomToken(null);
      expect(githubApi.hasCustomToken()).toBe(false);
      expect(githubApi.getCustomToken()).toBeNull();
    });

    it('strips extra whitespace from custom token on set', () => {
      githubApi.setCustomToken('  ghp_spacedToken  ');
      expect(githubApi.getCustomToken()).toBe('ghp_spacedToken');
      githubApi.setCustomToken('');
      expect(githubApi.hasCustomToken()).toBe(false);
    });

    it('attaches Authorization: Bearer <token> to requests when custom token is present', async () => {
      const sampleToken = 'ghp_secretTokenVal123';
      githubApi.setCustomToken(sampleToken);

      let capturedHeaders: HeadersInit | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ id: 1, name: 'react' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-limit': '5000',
          },
        });
      });

      const res = await githubApi.request('/repos/facebook/react');
      expect(res.data).toBeDefined();

      const headersObj = capturedHeaders as Record<string, string>;
      expect(headersObj['Authorization']).toBe(`Bearer ${sampleToken}`);
    });

    it('removes Authorization header when token is cleared or null', async () => {
      githubApi.setCustomToken('ghp_toBeRemoved');
      githubApi.setCustomToken(null);

      let capturedHeaders: HeadersInit | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-limit': '60',
          },
        });
      });

      await githubApi.request('/repos/facebook/react');
      const headersObj = capturedHeaders as Record<string, string>;
      expect(headersObj['Authorization']).toBeUndefined();
    });

    it('ensures token is never present in generated reports or storage', () => {
      const secretToken = 'ghp_super_secret_pat_9999999999';
      githubApi.setCustomToken(secretToken);

      const report = generateReport(
        {
          raw: mockRawAnalysisData,
          findings: [],
          technologies: [],
          provenance: {
            totalContributorsSampled: 1,
            commitAuthorConsistency: 'single_author',
            topContributors: [],
            botActivityDetected: false,
            aiToolingDetected: false,
            disclaimer: '',
          },
          limitations: [],
          coverage: {
            endpointsTotal: 10,
            endpointsSucceeded: 10,
            endpointsFailed: 0,
            failedEndpoints: [],
            endpointResponseLabel: '10/10 responses',
            treeStatus: 'complete',
            treeItemsCount: 5,
            treeCoverageNote: '',
            absentOptionalResources: [],
            limitations: [],
          },
        },
        'balanced'
      );

      const reportString = JSON.stringify(report);
      expect(reportString).not.toContain(secretToken);
      expect(sessionStorage.length).toBe(0);
      expect(localStorage.length).toBe(0);
    });
  });

  describe('Rate Limit Detection & Handling', () => {
    it('detects primary rate limits when remaining requests reach 0 and parses reset timestamp', async () => {
      const futureResetSec = Math.floor(Date.now() / 1000) + 1200; // 20 minutes from now

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(JSON.stringify({ message: 'API rate limit exceeded for IP.' }), {
          status: 403,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-limit': '60',
            'x-ratelimit-reset': String(futureResetSec),
          },
        });
      });

      const res = await githubApi.request('/repos/facebook/react');
      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error?.isRateLimit).toBe(true);
      expect(res.error?.errorType).toBe('rate_limit_primary');
      expect(res.error?.message).toContain('rate limit reached');
      expect(res.error?.message).toContain('60 requests/hr');

      // Tracker must be marked exhausted
      expect(rateLimitTracker.isRateLimited()).toBe(true);
      expect(rateLimitTracker.getMinutesUntilReset()).toBeGreaterThanOrEqual(19);
      expect(rateLimitTracker.getMinutesUntilReset()).toBeLessThanOrEqual(21);
    });

    it('detects secondary rate limits from 403/429 responses and parses retry-after header', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            message: 'You have exceeded a secondary rate limit. Please wait a few minutes.',
          }),
          {
            status: 403,
            headers: {
              'content-type': 'application/json',
              'x-ratelimit-remaining': '35',
              'x-ratelimit-limit': '60',
              'retry-after': '45',
            },
          }
        );
      });

      const res = await githubApi.request('/repos/facebook/react');
      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error?.isRateLimit).toBe(true);
      expect(res.error?.isSecondaryRateLimit).toBe(true);
      expect(res.error?.errorType).toBe('rate_limit_secondary');
      expect(res.error?.retryAfter).toBe(45);
      expect(res.error?.message).toContain('secondary rate limit');

      expect(rateLimitTracker.isRateLimited()).toBe(true);
      expect(rateLimitTracker.getSecondsUntilReset()).toBeLessThanOrEqual(45);
    });

    it('detects 401 Bad credentials without treating it as generic rate limit', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            message: 'Bad credentials',
            documentation_url: 'https://docs.github.com/rest',
          }),
          {
            status: 401,
            headers: {
              'content-type': 'application/json',
              'x-ratelimit-remaining': '55',
            },
          }
        );
      });

      const res = await githubApi.request('/repos/facebook/react');
      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error?.status).toBe(401);
      expect(res.error?.errorType).toBe('bad_credentials');
      expect(res.error?.isRateLimit).toBeFalsy();
      expect(res.error?.message).toContain('Invalid or expired');
      expect(res.error?.message).not.toContain('rate limit');
    });

    it('detects 404 Not Found cleanly without generic rate limit message', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '50',
          },
        });
      });

      const res = await githubApi.request('/repos/unknown-user/non-existent-repo-99');
      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error?.status).toBe(404);
      expect(res.error?.errorType).toBe('not_found');
      expect(res.error?.isRateLimit).toBeFalsy();
      expect(res.error?.message).toContain('Resource not found');
    });

    it('halts requests when quota is exhausted before making network call', async () => {
      const futureResetSec = Math.floor(Date.now() / 1000) + 1800;
      rateLimitTracker.setExhausted(futureResetSec, 60);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await githubApi.request('/repos/facebook/react');
      // Should NOT have called fetch at all
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.data).toBeNull();
      expect(res.error?.isRateLimit).toBe(true);
      expect(res.error?.message).toContain('Rate limit exhausted');
    });
  });

  describe('Deduplication & Bounded Backoff Retries', () => {
    it('deduplicates identical in-flight requests during concurrent calls', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        // Small delay to simulate in-flight concurrency
        await new Promise((r) => setTimeout(r, 40));
        return new Response(JSON.stringify({ id: 1, full_name: 'facebook/react' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '55',
          },
        });
      });

      // Fire 3 simultaneous requests for the exact same endpoint
      const [res1, res2, res3] = await Promise.all([
        githubApi.request('/repos/facebook/react'),
        githubApi.request('/repos/facebook/react'),
        githubApi.request('/repos/facebook/react'),
      ]);

      expect(callCount).toBe(1);
      expect(res1.data).toEqual({ id: 1, full_name: 'facebook/react' });
      expect(res2.data).toEqual({ id: 1, full_name: 'facebook/react' });
      expect(res3.data).toEqual({ id: 1, full_name: 'facebook/react' });
    });

    it('retries transient 5xx server errors with bounded backoff and succeeds if transient', async () => {
      let attempts = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ id: 99, name: 'success-after-retry' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '55',
          },
        });
      });

      const res = await githubApi.request<{ id: number }>('/repos/test/repo', { maxRetries: 2 });
      expect(attempts).toBe(2);
      expect(res.data?.id).toBe(99);
      expect(res.error).toBeNull();
    });

    it('stops retrying immediately on non-transient 4xx errors (e.g. 404, 401)', async () => {
      let attempts = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        attempts++;
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      });

      const res = await githubApi.request('/repos/test/missing', { maxRetries: 2 });
      // 404 must not be retried!
      expect(attempts).toBe(1);
      expect(res.error?.status).toBe(404);
    });

    it('retries network failures up to maxRetries and reports clean error if unreachable', async () => {
      let attempts = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        attempts++;
        throw new TypeError('Failed to fetch');
      });

      const res = await githubApi.request('/repos/test/offline', { maxRetries: 2 });
      // Initial attempt + 2 retries = 3 attempts total
      expect(attempts).toBe(3);
      expect(res.data).toBeNull();
      expect(res.error?.errorType).toBe('network_error');
      expect(res.error?.message).toContain('Network error connecting to GitHub API');
    });
  });

  describe('Proactive Rate Limit Verification (/rate_limit)', () => {
    it('queries /rate_limit and updates rateLimitTracker without quota consumption', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).endsWith('/rate_limit')) {
          return new Response(
            JSON.stringify({
              resources: {
                core: {
                  limit: 5000,
                  remaining: 4850,
                  reset: Math.floor(Date.now() / 1000) + 3000,
                  used: 150,
                },
              },
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'x-ratelimit-remaining': '4850',
                'x-ratelimit-limit': '5000',
              },
            }
          );
        }
        return new Response(null, { status: 404 });
      });

      const { state, error } = await githubApi.checkRateLimit();
      expect(error).toBeNull();
      expect(state.limit).toBe(5000);
      expect(state.remaining).toBe(4850);
      expect(rateLimitTracker.getState().remaining).toBe(4850);
    });
  });
});
