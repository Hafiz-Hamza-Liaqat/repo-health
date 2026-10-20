/**
 * CI/CD Workflow & Automation Analyzer
 */

import { GitHubRepo, GitHubWorkflow, GitHubWorkflowRun } from '../types/github';
import { ApiFetchError } from '../types/analysis';
import { Finding } from '../types/scoring';
import { SCORING_RULES } from '../config/scoringRules';

export function analyzeWorkflows(
  workflows: GitHubWorkflow[],
  workflowRuns: GitHubWorkflowRun[],
  repo: GitHubRepo,
  apiErrors: ApiFetchError[]
): Finding[] {
  const findings: Finding[] = [];

  const ci01Rule = SCORING_RULES['CI-01'];
  const ci02Rule = SCORING_RULES['CI-02'];
  const ci03Rule = SCORING_RULES['CI-03'];

  // Check if CI endpoint failed with rate limit or forbidden
  const actionsError = apiErrors.find((e) => e.endpoint.includes('/actions/'));
  const isActionsUnavailable = !!actionsError && workflows.length === 0 && workflowRuns.length === 0;

  if (isActionsUnavailable) {
    findings.push({
      id: 'CI-01-unavailable',
      ruleId: 'CI-01',
      category: 'ci_cd',
      title: 'Workflow Information Unavailable',
      status: 'unknown',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: ci01Rule.basePoints,
      explanation: `GitHub Actions API returned status ${actionsError.status} (${actionsError.message}). CI/CD workflows could not be verified.`,
      recommendation: 'Verify that GitHub Actions is enabled in repository settings and public read permissions are permitted.',
    });

    findings.push({
      id: 'CI-02-unavailable',
      ruleId: 'CI-02',
      category: 'ci_cd',
      title: 'Workflow Event Triggers Unavailable',
      status: 'unknown',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: ci02Rule.basePoints,
      explanation: 'Workflow trigger definitions could not be evaluated due to API limitations.',
    });

    findings.push({
      id: 'CI-03-unavailable',
      ruleId: 'CI-03',
      category: 'ci_cd',
      title: 'Workflow Execution Health Unavailable',
      status: 'unknown',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: ci03Rule.basePoints,
      explanation: 'Recent workflow run logs could not be retrieved from the GitHub Actions endpoint.',
    });

    return findings;
  }

  // CI-01: Workflow detection
  const activeWorkflows = workflows.filter((w) => w.state === 'active');

  if (workflows.length === 0) {
    findings.push({
      id: 'CI-01-not-detected',
      ruleId: 'CI-01',
      category: 'ci_cd',
      title: 'No CI/CD Workflows Detected',
      status: 'not_detected',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: ci01Rule.basePoints,
      explanation: 'No GitHub Actions workflows were found under .github/workflows.',
      recommendation: 'Add a continuous integration workflow (.github/workflows/ci.yml) to automatically build, lint, and test pull requests.',
      evidence: {
        label: 'Workflow Search',
        value: '0 workflows found via GitHub Actions API',
      },
    });

    findings.push({
      id: 'CI-02-not-detected',
      ruleId: 'CI-02',
      category: 'ci_cd',
      title: 'No CI Automation Triggers Configured',
      status: 'not_detected',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: ci02Rule.basePoints,
      explanation: 'Since no workflows exist, automated event triggers are not configured.',
    });

    findings.push({
      id: 'CI-03-not-detected',
      ruleId: 'CI-03',
      category: 'ci_cd',
      title: 'No Workflow Execution Records',
      status: 'not_detected',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: ci03Rule.basePoints,
      explanation: 'No automated workflow executions have been observed for this repository.',
    });

    return findings;
  }

  // Workflows exist
  const workflowNames = workflows.map((w) => `"${w.name}" (${w.path})`).join(', ');
  findings.push({
    id: 'CI-01-pass',
    ruleId: 'CI-01',
    category: 'ci_cd',
    title: `${workflows.length} GitHub Actions Workflow(s) Detected`,
    status: 'pass',
    severity: 'info',
    scoreEffect: ci01Rule.basePoints,
    maxEffect: ci01Rule.basePoints,
    explanation: `Found ${workflows.length} defined workflow(s): ${workflowNames}.`,
    evidence: {
      label: 'Detected Workflows',
      value: `${workflows.length} workflow(s) in .github/workflows`,
      sourcePath: workflows[0].path,
      sourceUrl: `${repo.html_url}/actions`,
    },
  });

  // CI-02: Automated Triggers
  // If active workflows exist, they represent push/PR triggers or cron
  if (activeWorkflows.length > 0) {
    findings.push({
      id: 'CI-02-pass',
      ruleId: 'CI-02',
      category: 'ci_cd',
      title: 'Active Workflow Configurations Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: ci02Rule.basePoints,
      maxEffect: ci02Rule.basePoints,
      explanation: `${activeWorkflows.length} active workflow(s) are configured to trigger on repository lifecycle events.`,
      evidence: {
        label: 'Active Workflows',
        value: activeWorkflows.map((w) => w.name).join(', '),
        sourceUrl: `${repo.html_url}/actions`,
      },
    });
  } else {
    findings.push({
      id: 'CI-02-warning',
      ruleId: 'CI-02',
      category: 'ci_cd',
      title: 'All Defined Workflows Are Inactive or Disabled',
      status: 'warning',
      severity: 'medium',
      scoreEffect: 1,
      maxEffect: ci02Rule.basePoints,
      explanation: 'Workflows were detected, but all appear disabled or inactive.',
      recommendation: 'Enable active CI workflows to ensure incoming changes are validated automatically.',
    });
  }

  // CI-03: Execution run status
  if (workflowRuns.length === 0) {
    findings.push({
      id: 'CI-03-no-runs',
      ruleId: 'CI-03',
      category: 'ci_cd',
      title: 'Workflows Detected, but No Run History Available',
      status: 'warning',
      severity: 'medium',
      scoreEffect: 2,
      maxEffect: ci03Rule.basePoints,
      explanation: 'Workflows exist in the repository, but no recent workflow run results were returned by GitHub.',
      recommendation: 'Trigger a workflow run on the default branch to establish a verified test and build history.',
      evidence: {
        label: 'Run Records',
        value: '0 completed runs recorded in recent window',
        sourceUrl: `${repo.html_url}/actions`,
      },
    });
    return findings;
  }

  const latestRun = workflowRuns[0];
  const successfulRuns = workflowRuns.filter((r) => r.conclusion === 'success');

  if (latestRun.conclusion === 'success') {
    findings.push({
      id: 'CI-03-pass',
      ruleId: 'CI-03',
      category: 'ci_cd',
      title: 'Recent Passing CI Execution Observed',
      status: 'pass',
      severity: 'info',
      scoreEffect: ci03Rule.basePoints,
      maxEffect: ci03Rule.basePoints,
      explanation: `Latest workflow run "${latestRun.name}" (#${latestRun.run_number}) concluded with SUCCESS on branch "${latestRun.head_branch}". Observed ${successfulRuns.length} of ${workflowRuns.length} recent runs passing. Note: Passing CI verifies configured pipeline steps, not production correctness.`,
      evidence: {
        label: 'Latest Run Result',
        value: `Success (#${latestRun.run_number})`,
        sourceUrl: latestRun.html_url,
      },
    });
  } else if (latestRun.conclusion === 'failure') {
    findings.push({
      id: 'CI-03-fail',
      ruleId: 'CI-03',
      category: 'ci_cd',
      title: 'Recent Workflow Run Failed',
      status: 'issue',
      severity: 'high',
      scoreEffect: 1,
      maxEffect: ci03Rule.basePoints,
      explanation: `Latest workflow run "${latestRun.name}" (#${latestRun.run_number}) failed on branch "${latestRun.head_branch}". Having failing CI workflows indicates broken tests, build errors, or lint failures.`,
      recommendation: 'Inspect recent workflow run failures and address failing jobs.',
      evidence: {
        label: 'Latest Run Result',
        value: `Failure (#${latestRun.run_number})`,
        sourceUrl: latestRun.html_url,
      },
    });
  } else if (latestRun.status === 'in_progress' || latestRun.status === 'queued') {
    findings.push({
      id: 'CI-03-in-progress',
      ruleId: 'CI-03',
      category: 'ci_cd',
      title: 'Workflow Run In Progress',
      status: 'warning',
      severity: 'low',
      scoreEffect: Math.floor(ci03Rule.basePoints / 2),
      maxEffect: ci03Rule.basePoints,
      explanation: `Latest workflow run "${latestRun.name}" is currently ${latestRun.status}. Prior runs show ${successfulRuns.length} successful of ${workflowRuns.length}.`,
      evidence: {
        label: 'Current Status',
        value: `${latestRun.status} (#${latestRun.run_number})`,
        sourceUrl: latestRun.html_url,
      },
    });
  } else {
    findings.push({
      id: 'CI-03-neutral',
      ruleId: 'CI-03',
      category: 'ci_cd',
      title: `Latest Run Concluded: ${latestRun.conclusion || latestRun.status}`,
      status: 'warning',
      severity: 'low',
      scoreEffect: 3,
      maxEffect: ci03Rule.basePoints,
      explanation: `Latest workflow run concluded with status "${latestRun.conclusion || latestRun.status}".`,
      evidence: {
        label: 'Conclusion',
        value: `${latestRun.conclusion || latestRun.status} (#${latestRun.run_number})`,
        sourceUrl: latestRun.html_url,
      },
    });
  }

  return findings;
}
