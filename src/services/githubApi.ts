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
  GitHubWorkflow,
  GitHubWorkflowRun,
} from '../types/github';
import { ApiFetchError, RawAnalysisData } from '../types/analysis';
import { rateLimitTracker } from './rateLimit';
import { sessionCache } from './cache';
import { safeBase64Decode } from '../utils/sanitize';

const GITHUB_API_BASE = 'https://api.github.com';
const USER_TOKEN_KEY = 'repohealth_user_pat';

export class GitHubApiService {
  private customToken: string | null = null;

  constructor() {
    try {
      this.customToken = sessionStorage.getItem(USER_TOKEN_KEY);
    } catch {
      this.customToken = null;
    }
  }

  public setCustomToken(token: string | null): void {
    this.customToken = token && token.trim() ? token.trim() : null;
    try {
      if (this.customToken) {
        sessionStorage.setItem(USER_TOKEN_KEY, this.customToken);
      } else {
        sessionStorage.removeItem(USER_TOKEN_KEY);
      }
    } catch {
      // Ignore
    }
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

  private async request<T>(
    endpoint: string,
    options: { allowNotFound?: boolean } = {}
  ): Promise<{ data: T | null; error: ApiFetchError | null }> {
    const url = `${GITHUB_API_BASE}${endpoint}`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      // Track rate limit headers
      rateLimitTracker.updateFromHeaders(response.headers);

      if (response.status === 403) {
        const remaining = response.headers.get('x-ratelimit-remaining');
        const resetTime = response.headers.get('x-ratelimit-reset');
        const isRateLimit = remaining === '0';

        return {
          data: null,
          error: {
            endpoint,
            status: 403,
            message: isRateLimit
              ? 'GitHub API unauthenticated rate limit reached (60 requests/hr). Please wait for reset or configure an optional personal token.'
              : 'Access forbidden by GitHub API.',
            isRateLimit,
            rateLimitReset: resetTime ? parseInt(resetTime, 10) : undefined,
          },
        };
      }

      if (response.status === 404) {
        if (options.allowNotFound) {
          return { data: null, error: null };
        }
        return {
          data: null,
          error: {
            endpoint,
            status: 404,
            message: 'Resource not found or private repository.',
          },
        };
      }

      if (!response.ok) {
        let msg = `GitHub API error: ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody?.message) {
            msg = errBody.message;
          }
        } catch {
          // Ignore json parse error
        }
        return {
          data: null,
          error: {
            endpoint,
            status: response.status,
            message: msg,
          },
        };
      }

      const json = await response.json();
      return { data: json as T, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error connecting to GitHub API.';
      return {
        data: null,
        error: {
          endpoint,
          status: 0,
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
    const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    const cached = sessionCache.get<RawAnalysisData>(cacheKey);
    if (cached) {
      onProgress?.('complete', 'Loaded cached repository analysis');
      return { data: cached, errors: [] };
    }

    const apiErrors: ApiFetchError[] = [];

    // Stage 1: Repo metadata
    onProgress?.('fetching_meta', `Fetching ${owner}/${repo} metadata...`);
    const repoRes = await this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
    if (repoRes.error || !repoRes.data) {
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
    if (releasesRes.error) apiErrors.push(releasesRes.error);
    if (tagsRes.error) apiErrors.push(tagsRes.error);

    const releases = releasesRes.data || [];
    const tags = tagsRes.data || [];

    // Stage 6: Commits & Contributors (Sampled for provenance signals)
    onProgress?.('fetching_history', 'Sampling recent commits and contributors...');
    const [commitsRes, contributorsRes, contentsRes] = await Promise.all([
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
    ]);
    if (commitsRes.error) apiErrors.push(commitsRes.error);
    if (contributorsRes.error) apiErrors.push(contributorsRes.error);
    if (contentsRes.error) apiErrors.push(contentsRes.error);

    const commits = commitsRes.data || [];
    const contributors = contributorsRes.data || [];
    const rootItems = contentsRes.data || [];
    const rootFiles = Array.isArray(rootItems) ? rootItems.map((i) => i.name) : [];

    // Stage 7: Fetch manifests for technology detection (if present in root)
    const manifestContents: RawAnalysisData['manifestContents'] = {};

    const packageJsonItem = rootItems.find?.((i) => i.name.toLowerCase() === 'package.json');
    if (packageJsonItem) {
      const pRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/package.json`,
        { allowNotFound: true }
      );
      if (pRes.data?.content) {
        try {
          const decoded = safeBase64Decode(pRes.data.content);
          manifestContents.packageJson = JSON.parse(decoded);
        } catch {
          // Ignore invalid JSON
        }
      }
    }

    const pyprojectItem = rootItems.find?.((i) => i.name.toLowerCase() === 'pyproject.toml');
    if (pyprojectItem) {
      const pyRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/pyproject.toml`,
        { allowNotFound: true }
      );
      if (pyRes.data?.content) {
        manifestContents.pyprojectToml = safeBase64Decode(pyRes.data.content);
      }
    }

    const cargoItem = rootItems.find?.((i) => i.name.toLowerCase() === 'cargo.toml');
    if (cargoItem) {
      const cRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/Cargo.toml`,
        { allowNotFound: true }
      );
      if (cRes.data?.content) {
        manifestContents.cargoToml = safeBase64Decode(cRes.data.content);
      }
    }

    const goModItem = rootItems.find?.((i) => i.name.toLowerCase() === 'go.mod');
    if (goModItem) {
      const gRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/go.mod`,
        { allowNotFound: true }
      );
      if (gRes.data?.content) {
        manifestContents.goMod = safeBase64Decode(gRes.data.content);
      }
    }

    const dockerItem = rootItems.find?.((i) => i.name.toLowerCase() === 'dockerfile');
    if (dockerItem) {
      const dRes = await this.request<GitHubContentItem>(
        `/repos/${owner}/${repo}/contents/Dockerfile`,
        { allowNotFound: true }
      );
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
      manifestContents,
      apiErrors,
    };

    // Cache successful fetch
    sessionCache.set(cacheKey, rawData);
    return { data: rawData, errors: apiErrors };
  }
}

export const githubApi = new GitHubApiService();
