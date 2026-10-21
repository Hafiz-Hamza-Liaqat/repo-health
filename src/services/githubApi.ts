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
import {
  parseWorkflowYaml,
  getUtf8ByteLength,
  WorkflowParseResult,
} from '../analyzers/workflowYamlParser';
import {
  analyzeWorkflowSecurity,
  WorkflowFileSecurityAssessment,
} from '../analyzers/workflowSecurityAnalyzer';

const GITHUB_API_BASE = 'https://api.github.com';

export interface RequestOptions {
  allowNotFound?: boolean;
  maxRetries?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
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

    // 2. In-flight request deduplication key (for default requests without cancellation/timeout/response limits)
    if (options.signal || options.timeoutMs || options.maxResponseBytes) {
      return await this.executeWithRetry<T>(endpoint, options);
    }

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
      if (options.signal?.aborted) {
        return {
          data: null,
          error: {
            endpoint,
            status: 0,
            errorType: 'general',
            message: 'Request was cancelled by caller.',
          },
        };
      }

      let attemptController: AbortController | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let abortHandler: (() => void) | undefined;

      if (options.timeoutMs || options.signal) {
        attemptController = new AbortController();
        if (options.timeoutMs) {
          timeoutId = setTimeout(() => {
            attemptController?.abort(new Error(`Request timed out after ${options.timeoutMs}ms`));
          }, options.timeoutMs);
        }
        if (options.signal) {
          abortHandler = () => attemptController?.abort(options.signal?.reason);
          options.signal.addEventListener('abort', abortHandler, { once: true });
        }
      }

      try {
        const response = await fetch(url, {
          headers: this.getHeaders(),
          signal: attemptController?.signal,
        });
        if (timeoutId) clearTimeout(timeoutId);

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
        if (options.maxResponseBytes) {
          // Pre-check Content-Length header if provided by server
          const clHeader = response.headers.get('content-length');
          if (clHeader) {
            const cl = parseInt(clHeader, 10);
            if (!isNaN(cl) && cl > options.maxResponseBytes) {
              return {
                data: null,
                error: {
                  endpoint,
                  status: response.status,
                  errorType: 'general',
                  message: `Transport response size (${cl} bytes) exceeds limit of ${options.maxResponseBytes} bytes.`,
                },
              };
            }
          }

          // Read stream chunks incrementally to abort oversized payloads before buffering
          if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let totalBytes = 0;
            let isOversized = false;

            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                  totalBytes += value.byteLength;
                  if (totalBytes > options.maxResponseBytes) {
                    isOversized = true;
                    await reader.cancel('Transport response size exceeded limit');
                    break;
                  }
                  chunks.push(value);
                }
              }
            } catch (streamErr) {
              if (isOversized) {
                return {
                  data: null,
                  error: {
                    endpoint,
                    status: response.status,
                    errorType: 'general',
                    message: `Transport response size exceeded limit of ${options.maxResponseBytes} bytes.`,
                  },
                };
              }
              throw streamErr;
            }

            if (isOversized) {
              return {
                data: null,
                error: {
                  endpoint,
                  status: response.status,
                  errorType: 'general',
                  message: `Transport response size exceeded limit of ${options.maxResponseBytes} bytes.`,
                },
              };
            }

            const combined = new Uint8Array(totalBytes);
            let offset = 0;
            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.byteLength;
            }
            const text = new TextDecoder('utf-8').decode(combined);
            try {
              const json = JSON.parse(text);
              return { data: json as T, error: null };
            } catch {
              return {
                data: null,
                error: {
                  endpoint,
                  status: response.status,
                  errorType: 'general',
                  message: 'Malformed JSON payload received from GitHub API.',
                },
              };
            }
          } else {
            const text = await response.text();
            const byteLength = new TextEncoder().encode(text).byteLength;
            if (byteLength > options.maxResponseBytes) {
              return {
                data: null,
                error: {
                  endpoint,
                  status: response.status,
                  errorType: 'general',
                  message: `Transport response size (${byteLength} bytes) exceeds limit of ${options.maxResponseBytes} bytes.`,
                },
              };
            }
            try {
              const json = JSON.parse(text);
              return { data: json as T, error: null };
            } catch {
              return {
                data: null,
                error: {
                  endpoint,
                  status: response.status,
                  errorType: 'general',
                  message: 'Malformed JSON payload received from GitHub API.',
                },
              };
            }
          }
        }

        const json = await response.json();
        return { data: json as T, error: null };
      } catch (err: unknown) {
        if (timeoutId) clearTimeout(timeoutId);

        const isCallerCancelled = options.signal?.aborted;
        if (isCallerCancelled) {
          return {
            data: null,
            error: {
              endpoint,
              status: 0,
              errorType: 'general',
              message: 'Request was cancelled by caller.',
            },
          };
        }

        const isTimeout =
          err instanceof Error &&
          (err.name === 'AbortError' || err.message.includes('timed out'));

        if (isTimeout) {
          return {
            data: null,
            error: {
              endpoint,
              status: 0,
              errorType: 'network_error',
              message: `Request timed out after ${options.timeoutMs}ms.`,
            },
          };
        }

        // Network or fetch error (offline, DNS, transient socket drop)
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
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (options.signal && abortHandler) {
          options.signal.removeEventListener('abort', abortHandler);
        }
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

    // Stage 8: Bounded GitHub Actions Workflow Security (Phase 2.1B.4)
    let workflowSecurityReport: WorkflowSecurityAnalysisReport | undefined;
    if (!rateLimitTracker.isRateLimited() && rateLimitTracker.getState().remaining >= 2) {
      try {
        onProgress?.('fetching_ci', 'Inspecting GitHub Actions workflows and static security...');
        workflowSecurityReport = await this.fetchAndAnalyzeWorkflows(owner, repo);
      } catch (wfErr) {
        // Workflow retrieval failures are non-fatal to overall repo scan; logged in apiErrors
        apiErrors.push({
          endpoint: `/repos/${owner}/${repo}/contents/.github/workflows`,
          status: 0,
          errorType: 'general',
          message: wfErr instanceof Error ? wfErr.message : 'Workflow retrieval error',
        });
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
      workflowSecurityReport,
    };

    // Cache successful fetch
    sessionCache.set(cacheKey, rawData);
    return { data: rawData, errors: apiErrors };
  }

  /**
   * Bounded GitHub Actions Workflow Content Retrieval (Phase 2.1B.3)
   *
   * Enforces strict resource, rate-limit, timeout, and cancellation budgets:
   * - Max 10 workflow files per analysis
   * - Max 256 KiB (262,144 bytes) per workflow file
   * - Max 1 MiB (1,048,576 bytes) aggregate retrieved workflow content
   * - Explicit request-attempt budget (retries counted against budget)
   * - Explicit per-request timeouts (default 10s) and cancellation support (AbortSignal)
   * - Concurrency-safe budget reservation: aggregate limit cannot be exceeded by concurrent downloads
   * - Accurate coverage reporting (complete, partial, unknown) with sanitized limitation notes
   */
  public async fetchWorkflowContents(
    owner: string,
    repo: string,
    options: WorkflowRetrievalOptions = {}
  ): Promise<WorkflowRetrievalResult> {
    const maxFiles = options.maxFiles ?? WORKFLOW_RETRIEVAL_DEFAULTS.MAX_WORKFLOW_FILES;
    const maxFileBytes = options.maxFileBytes ?? WORKFLOW_RETRIEVAL_DEFAULTS.MAX_FILE_BYTES;
    const maxAggregateBytes = options.maxAggregateBytes ?? WORKFLOW_RETRIEVAL_DEFAULTS.MAX_AGGREGATE_BYTES;
    const maxTransportBytes = options.maxTransportBytes ?? WORKFLOW_RETRIEVAL_DEFAULTS.MAX_TRANSPORT_BYTES;
    const timeoutMs = options.timeoutMs ?? WORKFLOW_RETRIEVAL_DEFAULTS.DEFAULT_TIMEOUT_MS;
    const maxAttempts = options.maxAttemptsPerFile ?? WORKFLOW_RETRIEVAL_DEFAULTS.MAX_ATTEMPTS_PER_FILE;
    const minRateLimit = options.minRateLimitRemaining ?? WORKFLOW_RETRIEVAL_DEFAULTS.MIN_RATE_LIMIT_REMAINING;

    // 1. Pre-flight cancellation check
    if (options.signal?.aborted) {
      return {
        retrievedWorkflows: [],
        skippedWorkflows: [],
        summary: {
          discoveredCount: 0,
          selectedCount: 0,
          retrievedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          totalBytesRetrieved: 0,
        },
        coverage: 'unknown',
        coverageNotes: ['Workflow retrieval cancelled by caller.'],
        errors: [{
          endpoint: 'discovery',
          status: 0,
          errorType: 'general',
          message: 'Operation was cancelled by caller.',
        }],
      };
    }

    // 2. Pre-flight rate limit check
    if (rateLimitTracker.isRateLimited() || rateLimitTracker.getState().remaining < minRateLimit) {
      const state = rateLimitTracker.getState();
      const resetMsg = rateLimitTracker.getHumanResetMessage();
      return {
        retrievedWorkflows: [],
        skippedWorkflows: [],
        summary: {
          discoveredCount: 0,
          selectedCount: 0,
          retrievedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          totalBytesRetrieved: 0,
        },
        coverage: 'unknown',
        coverageNotes: ['Workflow retrieval skipped: rate-limit quota is exhausted or insufficient.'],
        errors: [{
          endpoint: `/repos/${owner}/${repo}/actions/workflows`,
          status: 403,
          errorType: state.rateLimitType === 'secondary' ? 'rate_limit_secondary' : 'rate_limit_primary',
          message: resetMsg,
          isRateLimit: true,
        }],
      };
    }

    // 3. Discover candidates
    let rawCandidates: CandidateWorkflowItem[] = [];
    const discoveryErrors: ApiFetchError[] = [];
    let discoverySucceeded = false;

    if (options.candidateWorkflows && options.candidateWorkflows.length > 0) {
      rawCandidates = options.candidateWorkflows;
      discoverySucceeded = true;
    } else {
      const discoveryRes = await this.request<GitHubContentItem[] | GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/.github/workflows`,
        {
          allowNotFound: true,
          signal: options.signal,
          timeoutMs,
          maxRetries: 1,
        }
      );

      if (discoveryRes.error) {
        discoveryErrors.push(discoveryRes.error);
      } else if (discoveryRes.data === null) {
        // 404 Not Found -> clean zero workflows detected
        discoverySucceeded = true;
      } else {
        discoverySucceeded = true;
        const items = Array.isArray(discoveryRes.data) ? discoveryRes.data : [discoveryRes.data];
        for (const item of items) {
          if (item && item.type !== 'dir' && typeof item.name === 'string') {
            const lowerName = item.name.toLowerCase();
            if (lowerName.endsWith('.yml') || lowerName.endsWith('.yaml')) {
              rawCandidates.push({
                path: item.path || `.github/workflows/${item.name}`,
                size: typeof item.size === 'number' ? item.size : undefined,
                sha: item.sha,
              });
            }
          }
        }
      }
    }

    // If discovery failed due to network / permission error and no candidate paths provided
    if (!discoverySucceeded) {
      return {
        retrievedWorkflows: [],
        skippedWorkflows: [],
        summary: {
          discoveredCount: 0,
          selectedCount: 0,
          retrievedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          totalBytesRetrieved: 0,
        },
        coverage: 'unknown',
        coverageNotes: [`Workflow discovery failed: ${discoveryErrors[0]?.message || 'Unknown discovery error'}`],
        errors: discoveryErrors,
      };
    }

    // 4. Deduplicate and sort discovered candidates deterministically
    const candidateMap = new Map<string, CandidateWorkflowItem>();
    for (const cand of rawCandidates) {
      const normalizedPath = cand.path.replace(/\\/g, '/');
      const key = normalizedPath.toLowerCase();
      if (!candidateMap.has(key)) {
        candidateMap.set(key, { ...cand, path: normalizedPath });
      }
    }

    const discoveredList = Array.from(candidateMap.values()).sort((a, b) =>
      a.path.localeCompare(b.path)
    );
    const discoveredCount = discoveredList.length;

    // If clean zero workflows exist
    if (discoveredCount === 0) {
      return {
        retrievedWorkflows: [],
        skippedWorkflows: [],
        summary: {
          discoveredCount: 0,
          selectedCount: 0,
          retrievedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          totalBytesRetrieved: 0,
        },
        coverage: 'complete',
        coverageNotes: ['No GitHub Actions workflow files (.yml/.yaml) detected in repository.'],
        errors: [],
      };
    }

    // 5. Select up to maxFiles (10), overflow goes to skipped
    const selectedList = discoveredList.slice(0, maxFiles);
    const overflowList = discoveredList.slice(maxFiles);

    const skippedWorkflows: SkippedWorkflowFile[] = overflowList.map((item) => ({
      path: item.path,
      status: 'budget_exhausted',
      reason: `Exceeded maximum limit of ${maxFiles} workflow files per repository.`,
      declaredSizeBytes: item.size,
    }));

    // 6. Concurrency-safe retrieval with budget reservation queue
    const retrievedWorkflows: RetrievedWorkflowFile[] = [];
    const retrievalErrors: ApiFetchError[] = [];
    let aggregateBytesRetrieved = 0;
    let reservedBytes = 0;

    interface ReservationWaiter {
      resolve: () => void;
    }
    const reservationWaiters: ReservationWaiter[] = [];

    const notifyWaiters = () => {
      const waiters = reservationWaiters.splice(0);
      for (const w of waiters) {
        w.resolve();
      }
    };

    const acquireBudgetSlot = async (): Promise<number | 'exhausted' | 'cancelled'> => {
      for (;;) {
        if (options.signal?.aborted) {
          return 'cancelled';
        }

        if (aggregateBytesRetrieved >= maxAggregateBytes) {
          return 'exhausted';
        }

        const remainingBudget = maxAggregateBytes - aggregateBytesRetrieved;
        const neededReservation = Math.min(maxFileBytes, remainingBudget);

        // Safe allocation rule:
        // A worker can proceed if either:
        // 1. No other worker is in flight (reservedBytes === 0), allowing serialized progress on whatever budget remains, OR
        // 2. The combined accepted + in-flight reserved bytes plus this worker's needed reservation does not exceed maxAggregateBytes.
        if (reservedBytes === 0 || aggregateBytesRetrieved + reservedBytes + neededReservation <= maxAggregateBytes) {
          reservedBytes += neededReservation;
          return neededReservation;
        }

        // Wait for an in-flight worker to finish and release its reservation
        await new Promise<void>((resolve) => {
          const waiter: ReservationWaiter = { resolve };
          reservationWaiters.push(waiter);
          if (options.signal) {
            const onAbort = () => {
              const idx = reservationWaiters.indexOf(waiter);
              if (idx !== -1) {
                reservationWaiters.splice(idx, 1);
              }
              resolve();
            };
            options.signal.addEventListener('abort', onAbort, { once: true });
          }
        });
      }
    };

    const processCandidate = async (cand: CandidateWorkflowItem) => {
      // 1. Check cancellation
      if (options.signal?.aborted) {
        skippedWorkflows.push({
          path: cand.path,
          status: 'cancelled',
          reason: 'Workflow retrieval was cancelled by caller.',
          declaredSizeBytes: cand.size,
        });
        return;
      }

      // 2. Check rate limit
      if (rateLimitTracker.isRateLimited() || rateLimitTracker.getState().remaining < minRateLimit) {
        skippedWorkflows.push({
          path: cand.path,
          status: 'rate_limited',
          reason: 'GitHub API rate-limit quota exhausted or insufficient.',
          declaredSizeBytes: cand.size,
        });
        return;
      }

      // 3. Pre-flight check declared size against per-file limit
      if (typeof cand.size === 'number' && cand.size > maxFileBytes) {
        skippedWorkflows.push({
          path: cand.path,
          status: 'oversized',
          reason: `Workflow file size (${cand.size} bytes) exceeds maximum limit of 256 KiB (${maxFileBytes} bytes).`,
          declaredSizeBytes: cand.size,
        });
        return;
      }

      // 4. Pre-flight check declared size against total remaining aggregate budget
      const declaredSize = typeof cand.size === 'number' ? cand.size : 0;
      if (declaredSize > 0 && aggregateBytesRetrieved + declaredSize > maxAggregateBytes) {
        skippedWorkflows.push({
          path: cand.path,
          status: 'budget_exhausted',
          reason: `Workflow file size (${declaredSize} bytes) exceeds remaining aggregate budget of ${Math.max(0, maxAggregateBytes - aggregateBytesRetrieved)} bytes.`,
          declaredSizeBytes: cand.size,
        });
        return;
      }

      // 5. Check if aggregate budget is already completely exhausted
      if (aggregateBytesRetrieved >= maxAggregateBytes) {
        skippedWorkflows.push({
          path: cand.path,
          status: 'budget_exhausted',
          reason: `Aggregate workflow content limit (${maxAggregateBytes} bytes) exhausted.`,
          declaredSizeBytes: cand.size,
        });
        return;
      }

      // 6. Acquire budget slot safely through reservation queue
      const reservationResult = await acquireBudgetSlot();
      if (reservationResult === 'cancelled') {
        skippedWorkflows.push({
          path: cand.path,
          status: 'cancelled',
          reason: 'Workflow retrieval was cancelled by caller.',
          declaredSizeBytes: cand.size,
        });
        return;
      }
      if (reservationResult === 'exhausted') {
        skippedWorkflows.push({
          path: cand.path,
          status: 'budget_exhausted',
          reason: `Aggregate workflow content limit (${maxAggregateBytes} bytes) exhausted.`,
          declaredSizeBytes: cand.size,
        });
        return;
      }
      const reservation = reservationResult;

      try {
        const cleanPath = cand.path.startsWith('/') ? cand.path.slice(1) : cand.path;
        const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');

        const res = await this.request<GitHubContentItem>(
          `/repos/${owner}/${repo}/contents/${encodedPath}`,
          {
            allowNotFound: true,
            signal: options.signal,
            timeoutMs,
            maxRetries: Math.max(0, maxAttempts - 1),
            maxResponseBytes: maxTransportBytes,
          }
        );

        if (res.error) {
          retrievalErrors.push(res.error);
          let failStatus: WorkflowFileRetrievalStatus = 'failed';
          if (res.error.isRateLimit) failStatus = 'rate_limited';
          else if (res.error.message.includes('timed out')) failStatus = 'timeout';
          else if (res.error.message.includes('cancelled')) failStatus = 'cancelled';
          else if (res.error.message.includes('Transport response size') || res.error.message.includes('exceeds limit')) {
            failStatus = 'oversized';
          }

          skippedWorkflows.push({
            path: cand.path,
            status: failStatus,
            reason: res.error.message,
            declaredSizeBytes: cand.size,
          });
          return;
        }

        if (!res.data || typeof res.data.content !== 'string') {
          skippedWorkflows.push({
            path: cand.path,
            status: 'failed',
            reason: 'Workflow file not found or empty payload returned by GitHub API.',
            declaredSizeBytes: cand.size,
          });
          return;
        }

        const decoded = safeBase64Decode(res.data.content);
        const actualByteLength = getUtf8ByteLength(decoded);

        // Enforce per-file size guard on decoded content
        if (actualByteLength > maxFileBytes) {
          skippedWorkflows.push({
            path: cand.path,
            status: 'oversized',
            reason: `Decoded workflow content (${actualByteLength} bytes) exceeds maximum limit of 256 KiB (${maxFileBytes} bytes).`,
            declaredSizeBytes: actualByteLength,
          });
          return;
        }

        // Enforce aggregate budget guard on actual decoded content
        if (aggregateBytesRetrieved + actualByteLength > maxAggregateBytes) {
          skippedWorkflows.push({
            path: cand.path,
            status: 'budget_exhausted',
            reason: `Decoded workflow content (${actualByteLength} bytes) exceeds remaining aggregate budget (${maxAggregateBytes - aggregateBytesRetrieved} bytes).`,
            declaredSizeBytes: actualByteLength,
          });
          return;
        }

        // Successfully retrieved within all budgets
        retrievedWorkflows.push({
          path: cand.path,
          content: decoded,
          byteLength: actualByteLength,
          sha: res.data.sha,
        });
        aggregateBytesRetrieved += actualByteLength;
      } finally {
        reservedBytes -= reservation;
        notifyWaiters();
      }
    };

    // Execute candidates (honoring concurrency limit; default sequential for determinism)
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, 5));
    if (concurrency === 1) {
      for (const cand of selectedList) {
        await processCandidate(cand);
      }
    } else {
      let currentIndex = 0;
      const workers = Array.from({ length: concurrency }).map(async () => {
        while (currentIndex < selectedList.length) {
          const index = currentIndex++;
          await processCandidate(selectedList[index]);
        }
      });
      await Promise.all(workers);
    }

    // Sort retrieved workflows deterministically by path
    retrievedWorkflows.sort((a, b) => a.path.localeCompare(b.path));

    // 7. Calculate coverage and summary
    const retrievedCount = retrievedWorkflows.length;
    const selectedCount = selectedList.length;
    const skippedCount = skippedWorkflows.filter((w) => w.status !== 'failed').length;
    const failedCount = skippedWorkflows.filter((w) => w.status === 'failed').length;

    let coverage: WorkflowCoverageStatus = 'complete';
    const coverageNotes: string[] = [];

    if (retrievedCount === discoveredCount && skippedWorkflows.length === 0) {
      coverage = 'complete';
      coverageNotes.push(`All ${retrievedCount} discovered workflow file(s) retrieved successfully within resource budgets.`);
    } else if (retrievedCount > 0) {
      coverage = 'partial';
      coverageNotes.push(`Retrieved ${retrievedCount} of ${discoveredCount} workflow file(s); ${skippedWorkflows.length} file(s) skipped or unavailable.`);
    } else {
      coverage = 'unknown';
      coverageNotes.push(`Zero of ${discoveredCount} workflow file(s) could be retrieved.`);
    }

    if (overflowList.length > 0) {
      coverageNotes.push(`Discovered ${discoveredCount} workflows; limited to top ${maxFiles} by resource policy.`);
    }

    const oversized = skippedWorkflows.filter((w) => w.status === 'oversized');
    if (oversized.length > 0) {
      coverageNotes.push(`${oversized.length} workflow file(s) exceeded the 256 KiB limit and were skipped.`);
    }

    const budgetExhausted = skippedWorkflows.filter((w) => w.status === 'budget_exhausted');
    if (budgetExhausted.length > 0) {
      coverageNotes.push(`${budgetExhausted.length} workflow file(s) skipped due to resource budgets (10 files / 1 MiB aggregate cap).`);
    }

    const rateLimited = skippedWorkflows.filter((w) => w.status === 'rate_limited');
    if (rateLimited.length > 0) {
      coverageNotes.push('Workflow retrieval halted: rate-limit quota exhausted or insufficient.');
    }

    const timeouts = skippedWorkflows.filter((w) => w.status === 'timeout');
    if (timeouts.length > 0) {
      coverageNotes.push(`${timeouts.length} workflow request(s) timed out.`);
    }

    const cancelled = skippedWorkflows.filter((w) => w.status === 'cancelled');
    if (cancelled.length > 0) {
      coverageNotes.push('Workflow retrieval was cancelled by caller.');
    }

    return {
      retrievedWorkflows,
      skippedWorkflows,
      summary: {
        discoveredCount,
        selectedCount,
        retrievedCount,
        skippedCount,
        failedCount,
        totalBytesRetrieved: aggregateBytesRetrieved,
      },
      coverage,
      coverageNotes,
      errors: retrievalErrors,
    };
  }

  /**
   * Fetches workflows and evaluates static security rules (Phase 2.1B.3)
   */
  public async fetchAndAnalyzeWorkflows(
    owner: string,
    repo: string,
    options?: WorkflowRetrievalOptions
  ): Promise<WorkflowSecurityAnalysisReport> {
    const retrieval = await this.fetchWorkflowContents(owner, repo, options);
    return analyzeRetrievedWorkflows(retrieval);
  }
}

// ============================================================================
// Workflow Retrieval Types & Constants
// ============================================================================

export const WORKFLOW_RETRIEVAL_DEFAULTS = {
  MAX_WORKFLOW_FILES: 10,
  MAX_FILE_BYTES: 256 * 1024,        // 256 KiB = 262,144 bytes
  MAX_AGGREGATE_BYTES: 1024 * 1024,  // 1 MiB = 1,048,576 bytes
  MAX_TRANSPORT_BYTES: 512 * 1024,   // 512 KiB = 524,288 bytes (transport response limit)
  DEFAULT_TIMEOUT_MS: 10_000,        // 10 seconds
  MAX_ATTEMPTS_PER_FILE: 2,          // 1 initial + 1 retry max
  MIN_RATE_LIMIT_REMAINING: 2,       // Stop if fewer than 2 requests remaining
} as const;

export type WorkflowFileRetrievalStatus =
  | 'retrieved'
  | 'oversized'
  | 'budget_exhausted'
  | 'rate_limited'
  | 'timeout'
  | 'cancelled'
  | 'failed'
  | 'skipped';

export interface RetrievedWorkflowFile {
  path: string;
  content: string;
  byteLength: number;
  sha?: string;
}

export interface SkippedWorkflowFile {
  path: string;
  status: WorkflowFileRetrievalStatus;
  reason: string;
  declaredSizeBytes?: number;
}

export type WorkflowCoverageStatus = 'complete' | 'partial' | 'unknown';

export interface WorkflowRetrievalResult {
  retrievedWorkflows: RetrievedWorkflowFile[];
  skippedWorkflows: SkippedWorkflowFile[];
  summary: {
    discoveredCount: number;
    selectedCount: number;
    retrievedCount: number;
    skippedCount: number;
    failedCount: number;
    totalBytesRetrieved: number;
  };
  coverage: WorkflowCoverageStatus;
  coverageNotes: string[];
  errors: ApiFetchError[];
}

export interface CandidateWorkflowItem {
  path: string;
  size?: number;
  sha?: string;
}

export interface WorkflowRetrievalOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxFiles?: number;
  maxFileBytes?: number;
  maxAggregateBytes?: number;
  maxTransportBytes?: number;
  maxAttemptsPerFile?: number;
  minRateLimitRemaining?: number;
  concurrency?: number;
  candidateWorkflows?: CandidateWorkflowItem[];
}

export interface WorkflowSecurityAnalysisReport {
  assessments: WorkflowFileSecurityAssessment[];
  retrieval: WorkflowRetrievalResult;
  overallCoverage: WorkflowCoverageStatus;
  summary: {
    totalWorkflowsDiscovered: number;
    totalWorkflowsAnalyzed: number;
    totalWorkflowsSkipped: number;
    passCount: number;
    warningCount: number;
    issueCount: number;
    unknownCount: number;
    notApplicableCount: number;
  };
}

/**
 * Connects retrieved workflows to the existing safe parser and static security rules.
 * Skips or failed workflows produce conservative 'unknown' assessments.
 */
export function analyzeRetrievedWorkflows(
  retrieval: WorkflowRetrievalResult
): WorkflowSecurityAnalysisReport {
  const assessments: WorkflowFileSecurityAssessment[] = [];

  // 1. Analyze successfully retrieved workflows
  for (const wf of retrieval.retrievedWorkflows) {
    const parseRes = parseWorkflowYaml(wf.content, wf.path);
    const assessment = analyzeWorkflowSecurity(parseRes, wf.path);
    assessments.push(assessment);
  }

  // 2. For skipped or failed workflows, generate conservative indeterminate assessments
  for (const skipped of retrieval.skippedWorkflows) {
    const isOversized = skipped.status === 'oversized';
    const fakeParseResult: WorkflowParseResult = {
      success: false,
      error: {
        code: isOversized ? 'FILE_OVERSIZED' : 'YAML_SHAPE_ERROR',
        message: skipped.reason,
      },
      stats: { nodeCount: 0, maxDepthReached: 0, expressionCount: 0 },
    };
    const assessment = analyzeWorkflowSecurity(fakeParseResult, skipped.path);
    assessments.push(assessment);
  }

  // Calculate summary counts
  let passCount = 0;
  let warningCount = 0;
  let issueCount = 0;
  let unknownCount = 0;
  let notApplicableCount = 0;

  for (const a of assessments) {
    passCount += a.summary.passCount;
    warningCount += a.summary.warningCount;
    issueCount += a.summary.issueCount;
    unknownCount += a.summary.unknownCount;
    notApplicableCount += a.summary.notApplicableCount;
  }

  return {
    assessments,
    retrieval,
    overallCoverage: retrieval.coverage,
    summary: {
      totalWorkflowsDiscovered: retrieval.summary.discoveredCount,
      totalWorkflowsAnalyzed: retrieval.summary.retrievedCount,
      totalWorkflowsSkipped: retrieval.summary.skippedCount + retrieval.summary.failedCount,
      passCount,
      warningCount,
      issueCount,
      unknownCount,
      notApplicableCount,
    },
  };
}

export const githubApi = new GitHubApiService();
