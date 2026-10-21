/**
 * Typed GitHub REST API Service Layer
 */

import {
  GitHubCommit,
  GitHubContentItem,
  GitHubContributor,
  GitHubLicense,
  GitHubReadme,
  GitHubRelease,
  GitHubRepo,
  GitHubTag,
  GitHubTreeResponse,
  GitHubWorkflow,
  GitHubWorkflowRun,
} from '../types/github';
import { ApiFetchError, RawAnalysisData } from '../types/analysis';
import { rateLimitTracker, RateLimitState } from './rateLimit';
import { sessionCache } from './cache';
import { safeBase64Decode } from '../utils/sanitize';

const GITHUB_API_BASE = 'https://api.github.com';

interface RequestOptions {
  allowNotFound?: boolean;
  maxRetries?: number;
}

export class GitHubApiService {
  // Store optional token strictly in JavaScript memory only
  private customToken: string | null = null;

  // In-flight request deduplication map
  private inFlightRequests = new Map<string, Promise<{ data: unknown; error: ApiFetchError | null }>>();

  public setCustomToken(token: string | null): void {
    const trimmed = token && token.trim() ? token.trim() : null;
    this.customToken = trimmed;
    rateLimitTracker.setHasCustomToken(!!trimmed);
  }

  public getCustomToken(): string | null {
    return this.customToken;
  }

  public hasCustomToken(): boolean {
    return !!this.customToken;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'RepoHealth-Analyzer',
    };
    if (this.customToken) {
      headers['Authorization'] = `Bearer ${this.customToken}`;
    }
    return headers;
  }

  /**
   * Request with in-flight deduplication and pre-flight quota checks
   */
  public async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<{ data: T | null; error: ApiFetchError | null }> {
    // 1. Pre-flight rate limit check to prevent unnecessary requests
    if (rateLimitTracker.isRateLimited() && endpoint !== '/rate_limit') {
      const state = rateLimitTracker.getState();
      const message = rateLimitTracker.getHumanResetMessage();
      return {
        data: null,
        error: {
          endpoint,
          status: 403,
          errorType: state.rateLimitType === 'secondary' ? 'rate_limit_secondary' : 'rate_limit_primary',
          message,
          isRateLimit: true,
          isSecondaryRateLimit: state.isSecondaryLimit,
          rateLimitReset: state.resetTime,
          retryAfter: state.secondaryRetryAfter,
        },
      };
    }

    // 2. In-flight request deduplication key
    const dedupeKey = `${this.customToken ? 'auth' : 'anon'}:${endpoint}`;
    const existing = this.inFlightRequests.get(dedupeKey);
    if (existing) {
      return existing as Promise<{ data: T | null; error: ApiFetchError | null }>;
    }

    const promise = (async () => {
      try {
        return await this.executeWithRetry<T>(endpoint, options);
      } finally {
        this.inFlightRequests.delete(dedupeKey);
      }
    })();

    this.inFlightRequests.set(dedupeKey, promise as Promise<{ data: unknown; error: ApiFetchError | null }>);
    return promise;
  }

  /**
   * Execute fetch with bounded exponential backoff for transient failures (5xx or network errors)
   */
  private async executeWithRetry<T>(
    endpoint: string,
    options: RequestOptions
  ): Promise<{ data: T | null; error: ApiFetchError | null }> {
    const maxRetries = options.maxRetries ?? 2;
    const url = `${GITHUB_API_BASE}${endpoint}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: this.getHeaders(),
        });

        // Always update tracker from response headers
        rateLimitTracker.updateFromHeaders(response.headers);

        // 1. Handle HTTP 401: Invalid / Expired Token
        if (response.status === 401) {
          return {
            data: null,
            error: {
              endpoint,
              status: 401,
              errorType: 'bad_credentials',
              message: 'Invalid or expired GitHub Personal Access Token. Please verify or clear your token in Settings.',
            },
          };
        }

        // 2. Handle HTTP 403 / 429: Rate limits and permissions
        if (response.status === 403 || response.status === 429) {
          let bodyMessage = '';
          try {
            const body = await response.json();
            bodyMessage = body?.message || '';
          } catch {
            // Ignore parse errors
          }

          const remaining = response.headers.get('x-ratelimit-remaining');
          const resetHeader = response.headers.get('x-ratelimit-reset');
          const retryAfterHeader = response.headers.get('retry-after');
          const resetTime = resetHeader ? parseInt(resetHeader, 10) : undefined;
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

          const isSecondary =
            response.status === 429 ||
            /secondary rate limit|abuse detection/i.test(bodyMessage) ||
            !!retryAfterSec;

          const isPrimaryRateLimit =
            !isSecondary &&
            (remaining === '0' || /rate limit exceeded/i.test(bodyMessage));

          if (isSecondary) {
            const waitSec = retryAfterSec || 60;
            rateLimitTracker.setSecondaryRateLimit(waitSec);
            return {
              data: null,
              error: {
                endpoint,
                status: response.status,
                errorType: 'rate_limit_secondary',
                message: `GitHub API secondary rate limit triggered. Please wait ~${waitSec} seconds before retrying.`,
                isRateLimit: true,
                isSecondaryRateLimit: true,
                retryAfter: waitSec,
                rateLimitReset: resetTime,
              },
            };
          }

          if (isPrimaryRateLimit) {
            const limit = response.headers.get('x-ratelimit-limit') || (this.customToken ? '5,000' : '60');
            rateLimitTracker.setExhausted(resetTime, parseInt(limit, 10) || undefined);
            const resetMin = resetTime ? Math.max(1, Math.ceil((resetTime - Math.floor(Date.now() / 1000)) / 60)) : 60;
            const resetDate = resetTime ? new Date(resetTime * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'in an hour';

            return {
              data: null,
              error: {
                endpoint,
                status: 403,
                errorType: 'rate_limit_primary',
                message: this.customToken
                  ? `GitHub API authenticated rate limit reached (${limit} requests/hr). Quota resets in ~${resetMin} min (at ${resetDate}).`
                  : `GitHub API unauthenticated rate limit reached (60 requests/hr). Quota resets in ~${resetMin} min (at ${resetDate}). Add an optional Personal Access Token in Settings for 5,000 requests/hr.`,
                isRateLimit: true,
                rateLimitReset: resetTime,
              },
            };
          }

          // Non-rate-limit 403 (SAML enforcement, private repo permission, etc.)
          return {
            data: null,
            error: {
              endpoint,
              status: 403,
              errorType: 'forbidden',
              message: bodyMessage ? `Access forbidden by GitHub API: ${bodyMessage}` : 'Access forbidden by GitHub API. You may lack permission to view this resource.',
              isRateLimit: false,
            },
          };
        }

        // 3. Handle HTTP 404: Not Found
        if (response.status === 404) {
          if (options.allowNotFound) {
            return { data: null, error: null };
          }
          return {
            data: null,
            error: {
              endpoint,
              status: 404,
              errorType: 'not_found',
              message: 'Resource not found or private repository.',
            },
          };
        }

        // 4. Handle HTTP 5xx Server Errors (eligible for bounded retry)
        if (response.status >= 500) {
          if (attempt < maxRetries) {
            const delay = Math.min(1500, 300 * Math.pow(2, attempt) + Math.random() * 100);
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
          return {
            data: null,
            error: {
              endpoint,
              status: response.status,
              errorType: 'server_error',
              message: `GitHub API server error (${response.status} ${response.statusText}). Please try again shortly.`,
            },
          };
        }

        // 5. Other non-2xx client errors (400, 422, etc.)
        if (!response.ok) {
          let msg = `GitHub API error: ${response.status} ${response.statusText}`;
          try {
            const errBody = await response.json();
            if (errBody?.message) {
              msg = errBody.message;
            }
          } catch {
            // Ignore JSON parse error
          }
          return {
            data: null,
            error: {
              endpoint,
              status: response.status,
              errorType: 'general',
              message: msg,
            },
          };
        }

        // 6. Successful 2xx response
        const json = await response.json();
        return { data: json as T, error: null };
      } catch (err: unknown) {
        // Network or fetch error (offline, DNS, timeout)
        if (attempt < maxRetries) {
          const delay = Math.min(1500, 300 * Math.pow(2, attempt) + Math.random() * 100);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }

        const message = err instanceof Error ? err.message : 'Network error connecting to GitHub API.';
        return {
          data: null,
          error: {
            endpoint,
            status: 0,
            errorType: 'network_error',
            message: `Network error connecting to GitHub API: ${message}`,
          },
        };
      }
    }

    return {
      data: null,
      error: {
        endpoint,
        status: 0,
        errorType: 'network_error',
        message: 'Request failed after maximum retry attempts.',
      },
    };
  }

  /**
   * Check rate limit proactively using GET /rate_limit.
   * This endpoint DOES NOT consume rate-limit quota!
   */
  public async checkRateLimit(): Promise<{ state: RateLimitState; error: ApiFetchError | null }> {
    try {
      const response = await fetch(`${GITHUB_API_BASE}/rate_limit`, {
        headers: this.getHeaders(),
      });

      rateLimitTracker.updateFromHeaders(response.headers);

      if (response.status === 401) {
        return {
          state: rateLimitTracker.getState(),
          error: {
            endpoint: '/rate_limit',
            status: 401,
            errorType: 'bad_credentials',
            message: 'Invalid or expired GitHub Personal Access Token.',
          },
        };
      }

      if (response.ok) {
        const json = await response.json();
        if (json?.resources?.core) {
          const core = json.resources.core;
          // Update tracker with full core details
          const headers = new Headers({
            'x-ratelimit-limit': String(core.limit),
            'x-ratelimit-remaining': String(core.remaining),
            'x-ratelimit-reset': String(core.reset),
            'x-ratelimit-used': String(core.used),
          });
          rateLimitTracker.updateFromHeaders(headers);
        }
        return { state: rateLimitTracker.getState(), error: null };
      }

      return {
        state: rateLimitTracker.getState(),
        error: {
          endpoint: '/rate_limit',
          status: response.status,
          errorType: 'general',
          message: `Failed to check rate limit: ${response.status}`,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network failure checking rate limit';
      return {
        state: rateLimitTracker.getState(),
        error: {
          endpoint: '/rate_limit',
          status: 0,
          errorType: 'network_error',
          message,
        },
      };
    }
  }

  public async fetchCompleteRepositoryData(
    owner: string,
    repo: string,
    onProgress?: (stage: string, detail?: string) => void
  ): Promise<{ data: RawAnalysisData; errors: ApiFetchError[] }> {
    // 0. Initial fast-fail if rate limit is already exhausted
    if (rateLimitTracker.isRateLimited()) {
      throw new Error(rateLimitTracker.getHumanResetMessage());
    }

    const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    const cached = sessionCache.get<RawAnalysisData>(cacheKey);
    if (cached) {
      onProgress?.('complete', 'Loaded cached repository analysis');
      return { data: cached, errors: [] };
    }

    const apiErrors: ApiFetchError[] = [];

    // Helper to check for rate limit aborts during pipeline
    const checkForRateLimitAbort = (res: { error: ApiFetchError | null }) => {
      if (res.error?.isRateLimit) {
        throw new Error(res.error.message);
      }
    };

    // Stage 1: Repo metadata
    onProgress?.('fetching_meta', `Fetching ${owner}/${repo} metadata...`);
    const repoRes = await this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
    if (repoRes.error || !repoRes.data) {
      if (repoRes.error?.isRateLimit) {
        throw new Error(repoRes.error.message);
      }
      if (repoRes.error?.errorType === 'bad_credentials') {
        throw new Error(repoRes.error.message);
      }
      if (repoRes.error?.status === 404) {
        throw new Error(`Repository "${owner}/${repo}" was not found or is private. RepoHealth requires a public repository.`);
      }
      throw new Error(
        repoRes.error?.message || `Failed to access repository ${owner}/${repo}`
      );
    }
    const repository = repoRes.data;

    // Stage 2: Languages
    onProgress?.('fetching_contents', 'Fetching language distribution...');
    const langRes = await this.request<Record<string, number>>(
      `/repos/${owner}/${repo}/languages`,
      { allowNotFound: true }
    );
    checkForRateLimitAbort(langRes);
    if (langRes.error) apiErrors.push(langRes.error);
    const languages = langRes.data || {};

    // Stage 3: README & License
    onProgress?.('fetching_docs', 'Retrieving README and License...');
    const [readmeRes, licenseRes] = await Promise.all([
      this.request<GitHubReadme>(`/repos/${owner}/${repo}/readme`, {
        allowNotFound: true,
      }),
      this.request<GitHubLicense>(`/repos/${owner}/${repo}/license`, {
        allowNotFound: true,
      }),
    ]);
    checkForRateLimitAbort(readmeRes);
    checkForRateLimitAbort(licenseRes);
    if (readmeRes.error) apiErrors.push(readmeRes.error);
    if (licenseRes.error) apiErrors.push(licenseRes.error);

    const readme = readmeRes.data;
    if (readme && readme.content && readme.encoding === 'base64') {
      readme.decodedContent = safeBase64Decode(readme.content);
    }

    const license = licenseRes.data;
    if (license && license.content && license.encoding === 'base64') {
      license.content = safeBase64Decode(license.content);
    }

    // Stage 4: Workflows and runs
    onProgress?.('fetching_ci', 'Inspecting GitHub Actions workflows and runs...');
    const [workflowsRes, runsRes] = await Promise.all([
      this.request<{ total_count: number; workflows: GitHubWorkflow[] }>(
        `/repos/${owner}/${repo}/actions/workflows`,
        { allowNotFound: true }
      ),
      this.request<{ total_count: number; workflow_runs: GitHubWorkflowRun[] }>(
        `/repos/${owner}/${repo}/actions/runs?per_page=5`,
        { allowNotFound: true }
      ),
    ]);
    checkForRateLimitAbort(workflowsRes);
    checkForRateLimitAbort(runsRes);
    if (workflowsRes.error) apiErrors.push(workflowsRes.error);
    if (runsRes.error) apiErrors.push(runsRes.error);

    const workflows = workflowsRes.data?.workflows || [];
    const workflowRuns = runsRes.data?.workflow_runs || [];

    // Stage 5: Releases & Tags
    onProgress?.('fetching_releases', 'Inspecting releases and git tags...');
    const [releasesRes, tagsRes] = await Promise.all([
      this.request<GitHubRelease[]>(`/repos/${owner}/${repo}/releases?per_page=5`, {
        allowNotFound: true,
      }),
      this.request<GitHubTag[]>(`/repos/${owner}/${repo}/tags?per_page=5`, {
        allowNotFound: true,
      }),
    ]);
    checkForRateLimitAbort(releasesRes);
    checkForRateLimitAbort(tagsRes);
    if (releasesRes.error) apiErrors.push(releasesRes.error);
    if (tagsRes.error) apiErrors.push(tagsRes.error);

    const releases = releasesRes.data || [];
    const tags = tagsRes.data || [];

    // Stage 6: Commits, Contributors, Contents, and Recursive Git Tree
    onProgress?.('fetching_history', 'Sampling commits, contributors, and repository tree...');
    const defaultBranch = repository.default_branch || 'HEAD';
    const [commitsRes, contributorsRes, contentsRes, treeRes] = await Promise.all([
      this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/commits?per_page=10`, {
        allowNotFound: true,
      }),
      this.request<GitHubContributor[]>(
        `/repos/${owner}/${repo}/contributors?per_page=10`,
        { allowNotFound: true }
      ),
      this.request<GitHubContentItem[]>(`/repos/${owner}/${repo}/contents`, {
        allowNotFound: true,
      }),
      this.request<GitHubTreeResponse>(
        `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
        { allowNotFound: true }
      ),
    ]);
    checkForRateLimitAbort(commitsRes);
    checkForRateLimitAbort(contributorsRes);
    checkForRateLimitAbort(contentsRes);
    checkForRateLimitAbort(treeRes);
    if (commitsRes.error) apiErrors.push(commitsRes.error);
    if (contributorsRes.error) apiErrors.push(contributorsRes.error);
    if (contentsRes.error) apiErrors.push(contentsRes.error);
    if (treeRes.error) apiErrors.push(treeRes.error);

    const commits = commitsRes.data || [];
    const contributors = contributorsRes.data || [];
    const rootItems = contentsRes.data || [];

    const gitTree = treeRes.data
      ? {
          items: treeRes.data.tree || [],
          isTruncated: !!treeRes.data.truncated,
          totalItemsCount: treeRes.data.tree?.length || 0,
        }
      : null;

    // Combine root files from contents and tree
    const rootFiles = Array.from(
      new Set([
        ...(Array.isArray(rootItems) ? rootItems.map((i) => i.name) : []),
        ...(gitTree ? gitTree.items.filter((i) => !i.path.includes('/')).map((i) => i.path) : []),
      ])
    );

    // Stage 7: Fetch manifests for technology detection (if present in root)
    const manifestContents: RawAnalysisData['manifestContents'] = {};

    const packageJsonItem = rootFiles.find((f) => f.toLowerCase() === 'package.json');
    if (packageJsonItem) {
      const pRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/package.json`,
        { allowNotFound: true }
      );
      checkForRateLimitAbort(pRes);
      if (pRes.data?.content) {
        try {
          const decoded = safeBase64Decode(pRes.data.content);
          manifestContents.packageJson = JSON.parse(decoded);
        } catch {
          // Ignore invalid JSON
        }
      }
    }

    const pyprojectItem = rootFiles.find((f) => f.toLowerCase() === 'pyproject.toml');
    if (pyprojectItem) {
      const pyRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/pyproject.toml`,
        { allowNotFound: true }
      );
      checkForRateLimitAbort(pyRes);
      if (pyRes.data?.content) {
        manifestContents.pyprojectToml = safeBase64Decode(pyRes.data.content);
      }
    }

    const cargoItem = rootFiles.find((f) => f.toLowerCase() === 'cargo.toml');
    if (cargoItem) {
      const cRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/Cargo.toml`,
        { allowNotFound: true }
      );
      checkForRateLimitAbort(cRes);
      if (cRes.data?.content) {
        manifestContents.cargoToml = safeBase64Decode(cRes.data.content);
      }
    }

    const goModItem = rootFiles.find((f) => f.toLowerCase() === 'go.mod');
    if (goModItem) {
      const gRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/go.mod`,
        { allowNotFound: true }
      );
      checkForRateLimitAbort(gRes);
      if (gRes.data?.content) {
        manifestContents.goMod = safeBase64Decode(gRes.data.content);
      }
    }

    const dockerItem = rootFiles.find((f) => f.toLowerCase() === 'dockerfile');
    if (dockerItem) {
      const dRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/Dockerfile`,
        { allowNotFound: true }
      );
      checkForRateLimitAbort(dRes);
      if (dRes.data?.content) {
        manifestContents.dockerfile = safeBase64Decode(dRes.data.content);
      }
    }

    const rawData: RawAnalysisData = {
      repo: repository,
      languages,
      readme: readme || null,
      license: license || null,
      workflows,
      workflowRuns,
      releases,
      tags,
      commits,
      contributors,
      rootFiles,
      tree: gitTree,
      manifestContents,
      apiErrors,
    };

    // Cache successful fetch
    sessionCache.set(cacheKey, rawData);
    return { data: rawData, errors: apiErrors };
  }
}

export const githubApi = new GitHubApiService();
