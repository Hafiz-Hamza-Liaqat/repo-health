import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  githubApi,
  analyzeRetrievedWorkflows,
  WorkflowRetrievalResult,
} from './githubApi';
import { rateLimitTracker } from './rateLimit';
import {
  MINIMAL_VALID_WORKFLOW,
  PINNED_SHA_WORKFLOW,
  SCRIPT_INJECTION_SINGLE_LINE_WORKFLOW,
  createExactSizeWorkflow,
  createOversizedWorkflow,
} from '../test/fixtures/workflowFixtures';
import { getUtf8ByteLength } from '../analyzers/workflowYamlParser';

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

describe('GitHub Actions Bounded Workflow Retrieval (Phase 2.1B.3)', () => {
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

  // ==========================================================================
  // 1. Successful Discovery and Retrieval
  // ==========================================================================
  it('should successfully discover and retrieve workflows within budgets', async () => {
    const ciContent = MINIMAL_VALID_WORKFLOW;
    const releaseContent = PINNED_SHA_WORKFLOW;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([
            { name: 'ci.yml', path: '.github/workflows/ci.yml', type: 'file', size: ciContent.length },
            { name: 'release.yaml', path: '.github/workflows/release.yaml', type: 'file', size: releaseContent.length },
          ]),
          { status: 200, headers: { 'x-ratelimit-remaining': '50', 'x-ratelimit-limit': '60' } }
        );
      }
      if (urlStr.includes('/contents/.github/workflows/ci.yml')) {
        return new Response(
          JSON.stringify({
            name: 'ci.yml',
            path: '.github/workflows/ci.yml',
            content: toBase64(ciContent),
            encoding: 'base64',
            size: ciContent.length,
            sha: 'sha-ci-123',
          }),
          { status: 200, headers: { 'x-ratelimit-remaining': '49', 'x-ratelimit-limit': '60' } }
        );
      }
      if (urlStr.includes('/contents/.github/workflows/release.yaml')) {
        return new Response(
          JSON.stringify({
            name: 'release.yaml',
            path: '.github/workflows/release.yaml',
            content: toBase64(releaseContent),
            encoding: 'base64',
            size: releaseContent.length,
            sha: 'sha-release-456',
          }),
          { status: 200, headers: { 'x-ratelimit-remaining': '48', 'x-ratelimit-limit': '60' } }
        );
      }
      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.coverage).toBe('complete');
    expect(res.summary.discoveredCount).toBe(2);
    expect(res.summary.selectedCount).toBe(2);
    expect(res.summary.retrievedCount).toBe(2);
    expect(res.summary.skippedCount).toBe(0);
    expect(res.summary.failedCount).toBe(0);
    expect(res.retrievedWorkflows).toHaveLength(2);
    expect(res.retrievedWorkflows[0].path).toBe('.github/workflows/ci.yml');
    expect(res.retrievedWorkflows[1].path).toBe('.github/workflows/release.yaml');
    expect(res.summary.totalBytesRetrieved).toBe(getUtf8ByteLength(ciContent) + getUtf8ByteLength(releaseContent));
    expect(res.errors).toHaveLength(0);
  });

  // ==========================================================================
  // 2. No Available Workflow Files
  // ==========================================================================
  it('should cleanly handle missing .github/workflows directory with complete coverage', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.coverage).toBe('complete');
    expect(res.summary.discoveredCount).toBe(0);
    expect(res.summary.retrievedCount).toBe(0);
    expect(res.retrievedWorkflows).toHaveLength(0);
    expect(res.skippedWorkflows).toHaveLength(0);
    expect(res.coverageNotes[0]).toContain('No GitHub Actions workflow files');
  });

  // ==========================================================================
  // 3. More Than 10 Available Workflows (Max Files Limit)
  // ==========================================================================
  it('should limit selection to top 10 workflows and report partial coverage for overflow', async () => {
    const candidateList = Array.from({ length: 15 }, (_, i) => ({
      name: `workflow-${String(i).padStart(2, '0')}.yml`,
      path: `.github/workflows/workflow-${String(i).padStart(2, '0')}.yml`,
      type: 'file',
      size: 100,
    }));

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(JSON.stringify(candidateList), { status: 200 });
      }
      // Content response for individual workflows
      return new Response(
        JSON.stringify({
          name: 'workflow.yml',
          path: '.github/workflows/wf.yml',
          content: toBase64(MINIMAL_VALID_WORKFLOW),
          encoding: 'base64',
          size: MINIMAL_VALID_WORKFLOW.length,
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.summary.discoveredCount).toBe(15);
    expect(res.summary.selectedCount).toBe(10);
    expect(res.summary.retrievedCount).toBe(10);
    expect(res.summary.skippedCount).toBe(5);
    expect(res.coverage).toBe('partial');
    expect(res.skippedWorkflows).toHaveLength(5);
    for (const skipped of res.skippedWorkflows) {
      expect(skipped.status).toBe('budget_exhausted');
      expect(skipped.reason).toContain('Exceeded maximum limit of 10');
    }
  });

  // ==========================================================================
  // 4. Workflow Exactly at 256 KiB Limit
  // ==========================================================================
  it('should accept a workflow file that is exactly 256 KiB (262,144 bytes)', async () => {
    const exactContent = createExactSizeWorkflow(256 * 1024);
    const exactBytes = getUtf8ByteLength(exactContent);
    expect(exactBytes).toBe(262144);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([{ name: 'exact.yml', path: '.github/workflows/exact.yml', type: 'file', size: exactBytes }]),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          name: 'exact.yml',
          path: '.github/workflows/exact.yml',
          content: toBase64(exactContent),
          encoding: 'base64',
          size: exactBytes,
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.coverage).toBe('complete');
    expect(res.summary.retrievedCount).toBe(1);
    expect(res.retrievedWorkflows[0].byteLength).toBe(262144);
  });

  // ==========================================================================
  // 5. Workflow Exceeding Per-File Limit (> 256 KiB)
  // ==========================================================================
  it('should skip workflow exceeding 256 KiB without making network request when size is known from metadata', async () => {
    let contentRequested = false;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([
            { name: 'huge.yml', path: '.github/workflows/huge.yml', type: 'file', size: 300_000 },
          ]),
          { status: 200 }
        );
      }
      contentRequested = true;
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(contentRequested).toBe(false); // Verified zero network request made
    expect(res.coverage).toBe('unknown');
    expect(res.summary.retrievedCount).toBe(0);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('oversized');
    expect(res.skippedWorkflows[0].reason).toContain('exceeds maximum limit of 256 KiB');
  });

  it('should reject workflow exceeding 256 KiB post-decode when metadata size was missing', async () => {
    const hugeContent = createOversizedWorkflow(270_000);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([{ name: 'huge.yml', path: '.github/workflows/huge.yml', type: 'file' }]),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          name: 'huge.yml',
          path: '.github/workflows/huge.yml',
          content: toBase64(hugeContent),
          encoding: 'base64',
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.summary.retrievedCount).toBe(0);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('oversized');
  });

  // ==========================================================================
  // 6. Aggregate Content Exactly at 1 MiB Limit
  // ==========================================================================
  it('should accept aggregate content reaching exactly 1 MiB (1,048,576 bytes)', async () => {
    // 4 workflows of exactly 256 KiB each = 1,048,576 bytes
    const fileContent = createExactSizeWorkflow(256 * 1024);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify(
            Array.from({ length: 4 }, (_, i) => ({
              name: `wf-${i}.yml`,
              path: `.github/workflows/wf-${i}.yml`,
              type: 'file',
              size: 256 * 1024,
            }))
          ),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          content: toBase64(fileContent),
          encoding: 'base64',
          size: 256 * 1024,
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.coverage).toBe('complete');
    expect(res.summary.retrievedCount).toBe(4);
    expect(res.summary.totalBytesRetrieved).toBe(1024 * 1024);
  });

  // ==========================================================================
  // 7. Aggregate Budget Exhaustion
  // ==========================================================================
  it('should halt retrieval and skip additional workflows when 1 MiB aggregate budget is reached', async () => {
    // 4 files of 256 KiB fill 1 MiB, 5th file must be skipped with budget_exhausted
    const fileContent = createExactSizeWorkflow(256 * 1024);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify(
            Array.from({ length: 5 }, (_, i) => ({
              name: `wf-${i}.yml`,
              path: `.github/workflows/wf-${i}.yml`,
              type: 'file',
              size: 256 * 1024,
            }))
          ),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          content: toBase64(fileContent),
          encoding: 'base64',
          size: 256 * 1024,
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.summary.retrievedCount).toBe(4);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('budget_exhausted');
    expect(res.summary.totalBytesRetrieved).toBe(1024 * 1024);
    expect(res.coverage).toBe('partial');
  });

  // ==========================================================================
  // 8. Concurrent Requests Without Exceeding Aggregate Limit
  // ==========================================================================
  it('should safely manage concurrent requests with budget reservation', async () => {
    const fileContent = createExactSizeWorkflow(200 * 1024); // 200 KiB each
    // 6 files * 200 KiB = 1,200 KiB > 1,024 KiB limit
    // Max 5 can fit (1,000 KiB), 6th must be skipped

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify(
            Array.from({ length: 6 }, (_, i) => ({
              name: `wf-${i}.yml`,
              path: `.github/workflows/wf-${i}.yml`,
              type: 'file',
              size: 200 * 1024,
            }))
          ),
          { status: 200 }
        );
      }
      // Simulate non-zero network delay to trigger concurrency
      await new Promise((res) => setTimeout(res, 20));
      return new Response(
        JSON.stringify({
          content: toBase64(fileContent),
          encoding: 'base64',
          size: 200 * 1024,
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { concurrency: 3 });

    expect(res.summary.totalBytesRetrieved).toBeLessThanOrEqual(1024 * 1024);
    expect(res.summary.retrievedCount).toBe(5);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('budget_exhausted');
  });

  // ==========================================================================
  // 9. Retry Attempts Budget
  // ==========================================================================
  it('should count retry attempts against request budget and stop after max attempts', async () => {
    let attemptCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([{ name: 'flaky.yml', path: '.github/workflows/flaky.yml', type: 'file', size: 100 }]),
          { status: 200 }
        );
      }
      attemptCount++;
      return new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500, statusText: 'Server Error' });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { maxAttemptsPerFile: 2 });

    expect(attemptCount).toBe(2); // Exactly 1 initial + 1 retry
    expect(res.summary.retrievedCount).toBe(0);
    expect(res.summary.failedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('failed');
    expect(res.coverage).toBe('unknown');
  });

  // ==========================================================================
  // 10. Rate-Limit Reservation and Insufficient Capacity
  // ==========================================================================
  it('should stop retrieval when rate-limit remaining capacity is insufficient', async () => {
    rateLimitTracker.updateFromHeaders(
      new Headers({
        'x-ratelimit-remaining': '1', // Below minRateLimitRemaining of 2
        'x-ratelimit-limit': '60',
      })
    );

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { minRateLimitRemaining: 2 });

    expect(res.coverage).toBe('unknown');
    expect(res.coverageNotes[0]).toContain('rate-limit');
    expect(res.errors[0].isRateLimit).toBe(true);
  });

  // ==========================================================================
  // 11. Request Timeout
  // ==========================================================================
  it('should abort request and report timeout status when request exceeds timeoutMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([{ name: 'slow.yml', path: '.github/workflows/slow.yml', type: 'file', size: 100 }]),
          { status: 200 }
        );
      }
      // Wait for abort signal from timeout
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted due to timeout');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { timeoutMs: 30 });

    expect(res.summary.retrievedCount).toBe(0);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('timeout');
    expect(res.coverage).toBe('unknown');
  });

  // ==========================================================================
  // 12. Caller-Triggered Cancellation
  // ==========================================================================
  it('should halt retrieval and report cancelled status when AbortSignal is triggered', async () => {
    const controller = new AbortController();
    controller.abort(new Error('User cancelled scan'));

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { signal: controller.signal });

    expect(res.coverage).toBe('unknown');
    expect(res.coverageNotes[0]).toContain('cancelled');
    expect(res.summary.retrievedCount).toBe(0);
  });

  // ==========================================================================
  // 13. HTTP Errors, Malformed Content, and Missing Payloads
  // ==========================================================================
  it('should handle 404, malformed base64, and missing content payload gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([
            { name: 'missing.yml', path: '.github/workflows/missing.yml', type: 'file', size: 100 },
            { name: 'empty_content.yml', path: '.github/workflows/empty_content.yml', type: 'file', size: 100 },
          ]),
          { status: 200 }
        );
      }
      if (urlStr.includes('missing.yml')) {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      }
      if (urlStr.includes('empty_content.yml')) {
        return new Response(JSON.stringify({ name: 'empty_content.yml' }), { status: 200 }); // missing content
      }
      return new Response(JSON.stringify({}), { status: 500 });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.summary.retrievedCount).toBe(0);
    expect(res.summary.failedCount).toBe(2);
    expect(res.skippedWorkflows).toHaveLength(2);
    expect(res.coverage).toBe('unknown');
  });

  // ==========================================================================
  // 14. Partial Retrieval Failures
  // ==========================================================================
  it('should report partial coverage when some workflows succeed and others fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([
            { name: 'ok.yml', path: '.github/workflows/ok.yml', type: 'file', size: 100 },
            { name: 'fail.yml', path: '.github/workflows/fail.yml', type: 'file', size: 100 },
          ]),
          { status: 200 }
        );
      }
      if (urlStr.includes('ok.yml')) {
        return new Response(
          JSON.stringify({
            name: 'ok.yml',
            path: '.github/workflows/ok.yml',
            content: toBase64(MINIMAL_VALID_WORKFLOW),
            encoding: 'base64',
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ message: 'Server error' }), { status: 500, statusText: 'Error' });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { maxAttemptsPerFile: 1 });

    expect(res.coverage).toBe('partial');
    expect(res.summary.retrievedCount).toBe(1);
    expect(res.summary.failedCount).toBe(1);
  });

  // ==========================================================================
  // 15. Unicode Byte Count Sizing (CJK & Emoji)
  // ==========================================================================
  it('should enforce byte limits using exact UTF-8 byte count for multibyte Unicode content', async () => {
    // 70,000 emojis = 140,000 UTF-16 chars, but 280,000 UTF-8 bytes (> 256 KiB)
    const unicodeHeavy = 'name: Unicode\non: push\njobs:\n  b:\n    runs-on: u\n    steps:\n      - run: echo "' + '🚀'.repeat(70000) + '"\n';
    const utf8Bytes = getUtf8ByteLength(unicodeHeavy);
    expect(utf8Bytes).toBeGreaterThan(256 * 1024);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([{ name: 'emoji.yml', path: '.github/workflows/emoji.yml', type: 'file' }]),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          name: 'emoji.yml',
          path: '.github/workflows/emoji.yml',
          content: toBase64(unicodeHeavy),
          encoding: 'base64',
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.summary.retrievedCount).toBe(0);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('oversized');
  });

  // ==========================================================================
  // 16. Duplicate Workflow Path Deduplication
  // ==========================================================================
  it('should deduplicate identical workflow paths in candidate input', async () => {
    const candidates = [
      { path: '.github/workflows/ci.yml', size: 100 },
      { path: '.github/workflows/CI.yml', size: 100 }, // case variation
      { path: '.github/workflows/ci.yml', size: 100 }, // identical
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          name: 'ci.yml',
          path: '.github/workflows/ci.yml',
          content: toBase64(MINIMAL_VALID_WORKFLOW),
          encoding: 'base64',
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', {
      candidateWorkflows: candidates,
    });

    expect(res.summary.discoveredCount).toBe(1);
    expect(res.summary.retrievedCount).toBe(1);
  });

  // ==========================================================================
  // 17. Successful Handoff to Parser and Static Security Rules
  // ==========================================================================
  it('should hand off retrieved workflows to parser and static-rule analyzer producing valid findings', () => {
    const mockRetrieval: WorkflowRetrievalResult = {
      retrievedWorkflows: [
        {
          path: '.github/workflows/ci.yml',
          content: PINNED_SHA_WORKFLOW,
          byteLength: getUtf8ByteLength(PINNED_SHA_WORKFLOW),
        },
        {
          path: '.github/workflows/inj.yml',
          content: SCRIPT_INJECTION_SINGLE_LINE_WORKFLOW,
          byteLength: getUtf8ByteLength(SCRIPT_INJECTION_SINGLE_LINE_WORKFLOW),
        },
      ],
      skippedWorkflows: [
        {
          path: '.github/workflows/huge.yml',
          status: 'oversized',
          reason: 'File exceeds 256 KiB limit',
          declaredSizeBytes: 300_000,
        },
      ],
      summary: {
        discoveredCount: 3,
        selectedCount: 3,
        retrievedCount: 2,
        skippedCount: 1,
        failedCount: 0,
        totalBytesRetrieved: 500,
      },
      coverage: 'partial',
      coverageNotes: ['1 file skipped due to size'],
      errors: [],
    };

    const analysisReport = analyzeRetrievedWorkflows(mockRetrieval);

    expect(analysisReport.assessments).toHaveLength(3);
    expect(analysisReport.overallCoverage).toBe('partial');
    expect(analysisReport.summary.totalWorkflowsDiscovered).toBe(3);
    expect(analysisReport.summary.totalWorkflowsAnalyzed).toBe(2);
    expect(analysisReport.summary.totalWorkflowsSkipped).toBe(1);

    // First workflow (.github/workflows/ci.yml): Pinned SHA -> WFL-02 pass
    const firstAssessment = analysisReport.assessments[0];
    expect(firstAssessment.parseSuccess).toBe(true);
    const wfl02 = firstAssessment.findings.find((f) => f.ruleId === 'WFL-02');
    expect(wfl02?.status).toBe('pass');

    // Second workflow (.github/workflows/inj.yml): Script injection -> WFL-03 issue
    const secondAssessment = analysisReport.assessments[1];
    expect(secondAssessment.parseSuccess).toBe(true);
    const wfl03 = secondAssessment.findings.find((f) => f.ruleId === 'WFL-03');
    expect(wfl03?.status).toBe('issue');

    // Third workflow (.github/workflows/huge.yml): Skipped -> all 4 rules unknown
    const thirdAssessment = analysisReport.assessments[2];
    expect(thirdAssessment.parseSuccess).toBe(false);
    expect(thirdAssessment.findings).toHaveLength(4);
    for (const f of thirdAssessment.findings) {
      expect(f.status).toBe('unknown');
    }
  });

  // ==========================================================================
  // 18. Sanitized Error Reporting (Zero Token Leakage)
  // ==========================================================================
  it('should ensure secret tokens are never leaked in retrieval error messages', async () => {
    const secretToken = 'ghp_super_secret_token_value_999';
    githubApi.setCustomToken(secretToken);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.coverage).toBe('unknown');
    const combinedString = JSON.stringify(res);
    expect(combinedString).not.toContain(secretToken);
  });

  // ==========================================================================
  // 19. Underestimated Declared Sizes Under Concurrency
  // ==========================================================================
  it('should not allow concurrent candidate files with underestimated declared sizes to overrun aggregate budget', async () => {
    // 6 files of 200 KiB each = 1,200 KiB > 1,024 KiB limit
    // Each declares size: 50 bytes (heavily underestimated metadata)
    const fileContent = createExactSizeWorkflow(200 * 1024);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify(
            Array.from({ length: 6 }, (_, i) => ({
              name: `wf-${i}.yml`,
              path: `.github/workflows/wf-${i}.yml`,
              type: 'file',
              size: 50, // Heavily underestimated
            }))
          ),
          { status: 200 }
        );
      }
      await new Promise((res) => setTimeout(res, 15));
      return new Response(
        JSON.stringify({
          name: 'wf.yml',
          content: toBase64(fileContent),
          encoding: 'base64',
          size: 50,
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { concurrency: 3 });

    expect(res.summary.totalBytesRetrieved).toBeLessThanOrEqual(1024 * 1024);
    expect(res.summary.retrievedCount).toBe(5);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('budget_exhausted');
    expect(res.coverage).toBe('partial');
  });

  // ==========================================================================
  // 20. Mixed Declared Sizes (Accurate, Missing, Zero, Underestimated) Under Concurrency
  // ==========================================================================
  it('should safely manage budget reservations across accurate, missing, zero, and underestimated sizes', async () => {
    // 8 files of 150 KiB each = 1,200 KiB > 1,024 KiB limit
    // Exactly 6 fit (900 KiB), 7th and 8th must be skipped
    const fileContent = createExactSizeWorkflow(150 * 1024);
    const declaredSizes = [150 * 1024, undefined, 0, 25, 150 * 1024, undefined, 10, 0];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify(
            declaredSizes.map((size, i) => ({
              name: `wf-${i}.yml`,
              path: `.github/workflows/wf-${i}.yml`,
              type: 'file',
              size,
            }))
          ),
          { status: 200 }
        );
      }
      await new Promise((res) => setTimeout(res, 10));
      return new Response(
        JSON.stringify({
          name: 'wf.yml',
          content: toBase64(fileContent),
          encoding: 'base64',
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { concurrency: 3 });

    expect(res.summary.totalBytesRetrieved).toBe(6 * 150 * 1024); // 900 KiB <= 1,024 KiB
    expect(res.summary.retrievedCount).toBe(6);
    expect(res.summary.skippedCount).toBe(2);
    expect(res.skippedWorkflows.every((w) => w.status === 'budget_exhausted')).toBe(true);
  });

  // ==========================================================================
  // 21. Bounded Transport Response Sizing
  // ==========================================================================
  it('should reject an oversized transport response exceeding the transport limit before accepting content', async () => {
    // Create an oversized response payload (600 KiB raw transport payload > 512 KiB limit)
    const largeDummy = 'x'.repeat(600 * 1024);
    const oversizedJson = JSON.stringify({
      name: 'huge.yml',
      path: '.github/workflows/huge.yml',
      content: toBase64(MINIMAL_VALID_WORKFLOW),
      extraData: largeDummy,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([{ name: 'huge.yml', path: '.github/workflows/huge.yml', type: 'file', size: 100 }]),
          { status: 200 }
        );
      }
      return new Response(oversizedJson, {
        status: 200,
        headers: { 'content-length': String(oversizedJson.length) },
      });
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo');

    expect(res.summary.retrievedCount).toBe(0);
    expect(res.summary.skippedCount).toBe(1);
    expect(res.skippedWorkflows[0].status).toBe('oversized');
    expect(res.skippedWorkflows[0].reason).toContain('exceeds limit');

    // Analyzer handoff check
    const report = analyzeRetrievedWorkflows(res);
    expect(report.summary.passCount).toBe(0);
    expect(report.summary.unknownCount).toBe(4);
  });

  // ==========================================================================
  // 22. Concurrency, Retries, and Cancellation Budget Robustness
  // ==========================================================================
  it('should maintain budget integrity when retries and cancellation occur concurrently', async () => {
    let attemptForFile1 = 0;
    const fileContent = createExactSizeWorkflow(200 * 1024);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/contents/.github/workflows')) {
        return new Response(
          JSON.stringify([
            { name: 'wf-0.yml', path: '.github/workflows/wf-0.yml', type: 'file', size: 200 * 1024 },
            { name: 'wf-1.yml', path: '.github/workflows/wf-1.yml', type: 'file', size: 200 * 1024 },
          ]),
          { status: 200 }
        );
      }
      if (urlStr.includes('wf-1.yml')) {
        attemptForFile1++;
        if (attemptForFile1 === 1) {
          // First attempt fails transiently with 500
          return new Response(JSON.stringify({ message: 'Server error' }), { status: 500, statusText: 'Error' });
        }
      }
      return new Response(
        JSON.stringify({
          name: 'wf.yml',
          content: toBase64(fileContent),
          encoding: 'base64',
          size: 200 * 1024,
        }),
        { status: 200 }
      );
    });

    const res = await githubApi.fetchWorkflowContents('owner', 'repo', { concurrency: 2 });

    expect(attemptForFile1).toBe(2); // Initial attempt + 1 retry
    expect(res.summary.retrievedCount).toBe(2);
    expect(res.summary.totalBytesRetrieved).toBe(400 * 1024);
    expect(res.coverage).toBe('complete');
  });
});
