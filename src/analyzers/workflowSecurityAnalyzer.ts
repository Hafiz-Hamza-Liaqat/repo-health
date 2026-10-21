/**
 * GitHub Actions Workflow Static Security Rules Engine (Phase 2.1B.2)
 *
 * Implements four bounded, evidence-based static security rules for GitHub Actions workflows:
 * - WFL-01: Workflow permissions (least privilege, write-all, granular scopes, job overrides)
 * - WFL-02: Action and reusable-workflow reference pinning (commit SHA, mutable tags/branches)
 * - WFL-03: Potential script-expression injection in run: scripts
 * - WFL-04: Risky pull_request_target patterns (untrusted checkout + subsequent execution)
 *
 * Security & Quality Guarantees:
 * - Purely structural and deterministic: operates entirely on parsed AST data and offline fixtures.
 * - Zero external API calls, network requests, shell executions, or file modifications.
 * - Source coordinates (file, line, column) preserved when available from the parser.
 * - Parser failure containment: incomplete/failed parses produce conservative 'unknown' status,
 *   never confident 'pass' findings from unavailable data.
 * - Completely isolated from the core 100-point score denominator and scoring engine.
 */

import { SecurityFindingStatus, SecurityFindingSeverity } from '../types/security';
import {
  ParsedWorkflowStructure,
  WorkflowParseResult,
  WorkflowParseError,
  parseWorkflowYaml,
  GITHUB_ACTIONS_PERMISSION_SCOPES,
} from './workflowYamlParser';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type WorkflowRuleId = 'WFL-01' | 'WFL-02' | 'WFL-03' | 'WFL-04';

export interface WorkflowRuleEvidence {
  label: string;
  value: string;
  sourcePath?: string;
  line?: number;
  column?: number;
  details?: Record<string, unknown>;
}

export interface WorkflowRuleFinding {
  id: string;
  ruleId: WorkflowRuleId;
  title: string;
  status: SecurityFindingStatus;
  severity: SecurityFindingSeverity;
  explanation: string;
  evidence?: WorkflowRuleEvidence;
  recommendation?: string;
  sourceLocation?: {
    filePath?: string;
    line?: number;
    column?: number;
  };
}

export interface WorkflowFileSecurityAssessment {
  filePath: string;
  workflowName?: string;
  parseSuccess: boolean;
  parseError?: WorkflowParseError;
  findings: WorkflowRuleFinding[];
  summary: {
    passCount: number;
    warningCount: number;
    issueCount: number;
    unknownCount: number;
    notApplicableCount: number;
  };
}

// ============================================================================
// WFL-01: Workflow Permissions Analysis
// ============================================================================

interface ScopeValidationResult {
  isValid: boolean;
  unknownScope?: string;
  unsupportedLevel?: { scope: string; level: string };
}

function validateScopes(scopes?: Record<string, string>): ScopeValidationResult {
  if (!scopes) return { isValid: true };

  const knownScopes = GITHUB_ACTIONS_PERMISSION_SCOPES as Record<string, readonly string[]>;

  for (const [scope, level] of Object.entries(scopes)) {
    const allowedLevels = knownScopes[scope];
    if (!allowedLevels) {
      return { isValid: false, unknownScope: scope };
    }
    if (!allowedLevels.includes(level.toLowerCase())) {
      return { isValid: false, unsupportedLevel: { scope, level } };
    }
  }

  return { isValid: true };
}

/**
 * WFL-01: Static analysis of workflow-level and job-level permissions.
 *
 * Distinguishes:
 * 1. Missing declarations at workflow and job levels (warning - defaults to repository policy).
 * 2. Explicit broad write permissions, including write-all (issue).
 * 3. Explicit read-only configurations, including read-all and empty maps {} (pass).
 * 4. Granular scopes set to read, write, or none (pass - undeclared scopes default to none).
 * 5. Job-level overrides of workflow-level permissions.
 * 6. Unknown scopes and unsupported access levels (unknown).
 */
export function analyzeWorkflowPermissions(
  workflow: ParsedWorkflowStructure,
  filePath?: string
): WorkflowRuleFinding {
  const effectiveFilePath = filePath || workflow.filePath;
  const wfPerms = workflow.permissions;

  // 1. Validate workflow-level permissions syntax/scopes if present
  if (wfPerms) {
    if (wfPerms.mode === 'unknown') {
      return {
        id: 'WFL-01-unknown-mode',
        ruleId: 'WFL-01',
        title: 'Workflow Permissions Unrecognized or Malformed',
        status: 'unknown',
        severity: 'low',
        explanation: 'Workflow permissions declaration contains an unrecognized scalar or malformed structure.',
        evidence: {
          label: 'Workflow Permissions',
          value: String(wfPerms.raw ?? 'unknown'),
          sourcePath: effectiveFilePath,
          line: wfPerms.line,
          column: wfPerms.column,
        },
        sourceLocation: {
          filePath: effectiveFilePath,
          line: wfPerms.line,
          column: wfPerms.column,
        },
        recommendation: 'Configure explicit permissions using read-all, write-all, {}, or granular scope mappings.',
      };
    }

    if (wfPerms.mode === 'granular') {
      const scopeCheck = validateScopes(wfPerms.scopes);
      if (!scopeCheck.isValid) {
        const detail = scopeCheck.unknownScope
          ? `Unknown permission scope: "${scopeCheck.unknownScope}"`
          : `Unsupported access level "${scopeCheck.unsupportedLevel?.level}" for scope "${scopeCheck.unsupportedLevel?.scope}"`;
        return {
          id: 'WFL-01-unknown-scope',
          ruleId: 'WFL-01',
          title: 'Unknown or Unsupported Workflow Permission Scope',
          status: 'unknown',
          severity: 'low',
          explanation: `Workflow declares invalid or unsupported permission scopes: ${detail}. Static analysis could not determine effective permissions.`,
          evidence: {
            label: 'Invalid Scope Declaration',
            value: detail,
            sourcePath: effectiveFilePath,
            line: wfPerms.line,
            column: wfPerms.column,
          },
          sourceLocation: {
            filePath: effectiveFilePath,
            line: wfPerms.line,
            column: wfPerms.column,
          },
          recommendation: 'Use only standard GitHub Actions permission scopes (e.g. contents, pull-requests, issues) and supported access levels (read, write, none).',
        };
      }
    }
  }

  // 2. Validate job-level permissions syntax/scopes
  const jobEntries = Object.entries(workflow.jobs);
  for (const [jobId, job] of jobEntries) {
    const jobPerms = job.permissions;
    if (jobPerms) {
      if (jobPerms.mode === 'unknown') {
        return {
          id: `WFL-01-unknown-mode-job-${jobId}`,
          ruleId: 'WFL-01',
          title: `Job "${jobId}" Permissions Unrecognized or Malformed`,
          status: 'unknown',
          severity: 'low',
          explanation: `Job "${jobId}" permissions declaration contains an unrecognized scalar or malformed structure.`,
          evidence: {
            label: 'Job Permissions',
            value: String(jobPerms.raw ?? 'unknown'),
            sourcePath: effectiveFilePath,
            line: jobPerms.line,
            column: jobPerms.column,
          },
          sourceLocation: {
            filePath: effectiveFilePath,
            line: jobPerms.line,
            column: jobPerms.column,
          },
          recommendation: 'Configure explicit permissions using read-all, write-all, {}, or granular scope mappings.',
        };
      }

      if (jobPerms.mode === 'granular') {
        const scopeCheck = validateScopes(jobPerms.scopes);
        if (!scopeCheck.isValid) {
          const detail = scopeCheck.unknownScope
            ? `Unknown permission scope: "${scopeCheck.unknownScope}"`
            : `Unsupported access level "${scopeCheck.unsupportedLevel?.level}" for scope "${scopeCheck.unsupportedLevel?.scope}"`;
          return {
            id: `WFL-01-unknown-scope-job-${jobId}`,
            ruleId: 'WFL-01',
            title: `Unknown or Unsupported Permission Scope in Job "${jobId}"`,
            status: 'unknown',
            severity: 'low',
            explanation: `Job "${jobId}" declares invalid or unsupported permission scopes: ${detail}.`,
            evidence: {
              label: 'Invalid Scope Declaration',
              value: detail,
              sourcePath: effectiveFilePath,
              line: jobPerms.line,
              column: jobPerms.column,
            },
            sourceLocation: {
              filePath: effectiveFilePath,
              line: jobPerms.line,
              column: jobPerms.column,
            },
            recommendation: 'Use only standard GitHub Actions permission scopes and supported access levels.',
          };
        }
      }
    }
  }

  // 3. Check for explicit broad write permissions (write-all)
  // Check job-level write-all
  const jobsWithWriteAll = jobEntries.filter(([, job]) => job.permissions?.mode === 'write-all');
  if (jobsWithWriteAll.length > 0) {
    const [, firstJob] = jobsWithWriteAll[0];
    const jobList = jobsWithWriteAll.map(([id]) => `"${id}"`).join(', ');
    return {
      id: 'WFL-01-issue-job-write-all',
      ruleId: 'WFL-01',
      title: 'Broad Write Permissions Configured in Job (`write-all`)',
      status: 'issue',
      severity: 'high',
      explanation: `Job ${jobList} declares explicit broad write permissions (\`permissions: write-all\`). When broad write access is granted, any compromised step or action can perform unauthorized modifications across all repository resources.`,
      evidence: {
        label: 'Elevated Job Permissions',
        value: `Job ${jobList} declares write-all`,
        sourcePath: effectiveFilePath,
        line: firstJob.permissions?.line,
        column: firstJob.permissions?.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: firstJob.permissions?.line,
        column: firstJob.permissions?.column,
      },
      recommendation: 'Replace write-all with granular least-privilege permissions, granting write access only to the specific scopes needed by the job.',
    };
  }

  // Check workflow-level write-all and whether all jobs override it
  if (wfPerms?.mode === 'write-all') {
    if (jobEntries.length > 0) {
      const unoverriddenJobs = jobEntries.filter(([, job]) => !job.permissions);
      if (unoverriddenJobs.length === 0) {
        // Every single job in the workflow overrode the workflow-level write-all
        return {
          id: 'WFL-01-warning-overridden-write-all',
          ruleId: 'WFL-01',
          title: 'Workflow-Level `write-all` Overridden by All Jobs',
          status: 'warning',
          severity: 'low',
          explanation: 'Workflow declares `permissions: write-all`, but all defined jobs explicitly override permissions with restricted or granular declarations. While effective job permissions are restricted, top-level write-all creates risk if new jobs are added without overrides.',
          evidence: {
            label: 'Overridden Workflow Permissions',
            value: `Top-level write-all overridden across all ${jobEntries.length} jobs`,
            sourcePath: effectiveFilePath,
            line: wfPerms.line,
            column: wfPerms.column,
          },
          sourceLocation: {
            filePath: effectiveFilePath,
            line: wfPerms.line,
            column: wfPerms.column,
          },
          recommendation: 'Remove top-level write-all and declare a secure top-level default such as permissions: read-all or permissions: {}.',
        };
      }

      // At least one job inherits top-level write-all
      const inheritingJobsList = unoverriddenJobs.map(([id]) => `"${id}"`).join(', ');
      return {
        id: 'WFL-01-issue-workflow-write-all',
        ruleId: 'WFL-01',
        title: 'Broad Write Permissions Configured at Workflow Level (`write-all`)',
        status: 'issue',
        severity: 'high',
        explanation: `Workflow grants broad write permissions (\`permissions: write-all\`), inherited by jobs ${inheritingJobsList}. Elevated write access enables compromised steps or dependencies to modify repository contents, releases, packages, and workflows.`,
        evidence: {
          label: 'Workflow Permissions',
          value: `write-all inherited by ${unoverriddenJobs.length} job(s): ${inheritingJobsList}`,
          sourcePath: effectiveFilePath,
          line: wfPerms.line,
          column: wfPerms.column,
        },
        sourceLocation: {
          filePath: effectiveFilePath,
          line: wfPerms.line,
          column: wfPerms.column,
        },
        recommendation: 'Set top-level permissions to read-all or {} and grant granular write scopes only to specific jobs requiring them.',
      };
    }

    // Workflow has write-all and no jobs
    return {
      id: 'WFL-01-issue-workflow-write-all',
      ruleId: 'WFL-01',
      title: 'Broad Write Permissions Configured at Workflow Level (`write-all`)',
      status: 'issue',
      severity: 'high',
      explanation: 'Workflow declares broad write permissions (`permissions: write-all`).',
      evidence: {
        label: 'Workflow Permissions',
        value: 'write-all',
        sourcePath: effectiveFilePath,
        line: wfPerms.line,
        column: wfPerms.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: wfPerms.line,
        column: wfPerms.column,
      },
      recommendation: 'Replace write-all with read-all, {}, or granular scopes.',
    };
  }

  // 4. Check for undeclared permissions
  if (!wfPerms) {
    const unpermissionedJobs = jobEntries.filter(([, job]) => !job.permissions);
    if (unpermissionedJobs.length > 0 || jobEntries.length === 0) {
      const sample = unpermissionedJobs.map(([id]) => `"${id}"`).join(', ');
      return {
        id: 'WFL-01-warning-missing',
        ruleId: 'WFL-01',
        title: 'Workflow Permissions Undeclared (Defaults to Repository Policy)',
        status: 'warning',
        severity: 'medium',
        explanation: 'Neither workflow nor jobs declare explicit permissions. When omitted, GitHub Actions defaults to the repository or organization default workflow permissions, which may permit broad read and write capabilities across all scopes.',
        evidence: {
          label: 'Undeclared Permissions',
          value: unpermissionedJobs.length > 0
            ? `Permissions omitted for ${unpermissionedJobs.length} job(s): ${sample}`
            : 'No permissions declared at workflow level',
          sourcePath: effectiveFilePath,
          line: unpermissionedJobs[0]?.[1]?.line,
          column: unpermissionedJobs[0]?.[1]?.column,
        },
        sourceLocation: {
          filePath: effectiveFilePath,
          line: unpermissionedJobs[0]?.[1]?.line,
          column: unpermissionedJobs[0]?.[1]?.column,
        },
        recommendation: 'Declare explicit top-level permissions (e.g. permissions: read-all or permissions: {}) to enforce least privilege regardless of organization-level defaults.',
      };
    }
  }

  // 5. All jobs have explicit permissions (top-level read-all/empty/granular, or job-level overrides)
  // Collect any granular write scopes across jobs for evidence reporting
  const jobsWithGranularWrite: string[] = [];
  for (const [jobId, job] of jobEntries) {
    const effective = job.permissions || wfPerms;
    if (effective?.scopes) {
      const writeScopes = Object.entries(effective.scopes)
        .filter(([, level]) => level.toLowerCase() === 'write')
        .map(([scope]) => scope);
      if (writeScopes.length > 0) {
        jobsWithGranularWrite.push(`job "${jobId}" (${writeScopes.join(', ')})`);
      }
    }
  }

  const writeNote = jobsWithGranularWrite.length > 0
    ? ` Explicit scoped write access granted to: ${jobsWithGranularWrite.join('; ')}.`
    : '';

  const primaryLine = wfPerms?.line ?? jobEntries[0]?.[1]?.permissions?.line;
  const primaryColumn = wfPerms?.column ?? jobEntries[0]?.[1]?.permissions?.column;

  return {
    id: 'WFL-01-pass',
    ruleId: 'WFL-01',
    title: 'Explicit Workflow Permissions Configured (Least Privilege)',
    status: 'pass',
    severity: 'info',
    explanation: `Workflow configures explicit permissions across all jobs.${writeNote} Under GitHub Actions semantics, unspecified scopes default to none.`,
    evidence: {
      label: 'Permissions Configuration',
      value: wfPerms
        ? `Workflow-level mode: ${wfPerms.mode}${jobsWithGranularWrite.length > 0 ? '; includes scoped job writes' : ''}`
        : `Explicit per-job permissions configured across ${jobEntries.length} job(s)`,
      sourcePath: effectiveFilePath,
      line: primaryLine,
      column: primaryColumn,
    },
    sourceLocation: {
      filePath: effectiveFilePath,
      line: primaryLine,
      column: primaryColumn,
    },
  };
}

// ============================================================================
// WFL-02: Action and Reusable-Workflow Reference Pinning
// ============================================================================

export type ActionRefType =
  | 'pinned-sha'
  | 'mutable-ref'
  | 'local'
  | 'docker'
  | 'malformed';

export interface ActionReferenceOccurrence {
  raw: string;
  type: ActionRefType;
  target?: string;
  ref?: string;
  jobId: string;
  stepIndex?: number;
  isReusableWorkflow: boolean;
  line?: number;
  column?: number;
}

const COMMIT_SHA_40_REGEX = /^[0-9a-fA-F]{40}$/;

export function classifyActionReference(
  rawRef: string,
  jobId: string,
  stepIndex?: number,
  line?: number,
  column?: number
): ActionReferenceOccurrence {
  const trimmed = rawRef.trim();

  // Local action reference (./path or ../path)
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return {
      raw: trimmed,
      type: 'local',
      target: trimmed,
      jobId,
      stepIndex,
      isReusableWorkflow: false,
      line,
      column,
    };
  }

  // Docker container action reference
  if (trimmed.startsWith('docker://')) {
    return {
      raw: trimmed,
      type: 'docker',
      target: trimmed,
      jobId,
      stepIndex,
      isReusableWorkflow: false,
      line,
      column,
    };
  }

  // External action or reusable workflow: requires @ delimiter
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return {
      raw: trimmed,
      type: 'malformed',
      target: trimmed,
      jobId,
      stepIndex,
      isReusableWorkflow: false,
      line,
      column,
    };
  }

  const target = trimmed.slice(0, atIndex).trim();
  const ref = trimmed.slice(atIndex + 1).trim();

  const isReusableWorkflow =
    target.includes('/.github/workflows/') ||
    target.endsWith('.yml') ||
    target.endsWith('.yaml');

  const isFullSha = COMMIT_SHA_40_REGEX.test(ref);

  return {
    raw: trimmed,
    type: isFullSha ? 'pinned-sha' : 'mutable-ref',
    target,
    ref,
    jobId,
    stepIndex,
    isReusableWorkflow,
    line,
    column,
  };
}

/**
 * WFL-02: Action and reusable-workflow reference pinning.
 *
 * Distinguishes:
 * 1. External actions and reusable workflows pinned to full 40-character commit SHA (pass).
 * 2. References using mutable tags, branches, or short SHAs (warning).
 * 3. Local actions (./...) handled separately (commit SHA does not apply).
 * 4. Docker container actions (docker://...) handled separately.
 * 5. Malformed references (unknown).
 */
export function analyzeActionPinning(
  workflow: ParsedWorkflowStructure,
  filePath?: string
): WorkflowRuleFinding {
  const effectiveFilePath = filePath || workflow.filePath;
  const occurrences: ActionReferenceOccurrence[] = [];

  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    // Check job-level uses (reusable workflow call)
    if (job.uses) {
      occurrences.push(
        classifyActionReference(job.uses, jobId, undefined, job.line, job.column)
      );
    }

    // Check step-level uses
    for (const step of job.steps) {
      if (step.uses) {
        occurrences.push(
          classifyActionReference(step.uses, jobId, step.index, step.line, step.column)
        );
      }
    }
  }

  // 1. If no actions or reusable workflows referenced
  if (occurrences.length === 0) {
    return {
      id: 'WFL-02-not-applicable-none',
      ruleId: 'WFL-02',
      title: 'No Actions or Reusable Workflows Referenced',
      status: 'not_applicable',
      severity: 'info',
      explanation: 'Workflow does not reference any external actions or reusable workflows.',
      sourceLocation: { filePath: effectiveFilePath },
    };
  }

  // 2. Filter external references (exclude local and docker)
  const externalRefs = occurrences.filter((o) => o.type !== 'local' && o.type !== 'docker');

  if (externalRefs.length === 0) {
    return {
      id: 'WFL-02-not-applicable-local-or-docker',
      ruleId: 'WFL-02',
      title: 'No External Git Actions Referenced (Local or Container Only)',
      status: 'not_applicable',
      severity: 'info',
      explanation: 'Workflow only references local repository actions or container images; Git commit SHA pinning does not apply.',
      sourceLocation: {
        filePath: effectiveFilePath,
        line: occurrences[0]?.line,
        column: occurrences[0]?.column,
      },
    };
  }

  // 3. Check for malformed references
  const malformedRefs = externalRefs.filter((o) => o.type === 'malformed');
  if (malformedRefs.length > 0) {
    const first = malformedRefs[0];
    return {
      id: 'WFL-02-unknown-malformed',
      ruleId: 'WFL-02',
      title: 'Malformed Action or Reusable Workflow Reference',
      status: 'unknown',
      severity: 'low',
      explanation: `Detected malformed action reference "${first.raw}" in job "${first.jobId}". References must follow standard "owner/repo@ref" syntax.`,
      evidence: {
        label: 'Malformed Reference',
        value: first.raw,
        sourcePath: effectiveFilePath,
        line: first.line,
        column: first.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: first.line,
        column: first.column,
      },
      recommendation: 'Specify valid action references with full commit SHAs, e.g. actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675.',
    };
  }

  // 4. Check for mutable references (tags, branches, short SHAs)
  const mutableRefs = externalRefs.filter((o) => o.type === 'mutable-ref');
  if (mutableRefs.length > 0) {
    // Deduplicate by raw reference string for clean reporting
    const grouped = new Map<string, ActionReferenceOccurrence[]>();
    for (const ref of mutableRefs) {
      const list = grouped.get(ref.raw) || [];
      list.push(ref);
      grouped.set(ref.raw, list);
    }

    const summaryParts: string[] = [];
    for (const [raw, list] of grouped.entries()) {
      const locs = list.map((l) => (l.line ? `line ${l.line}` : `job ${l.jobId}`)).join(', ');
      summaryParts.push(`${raw} (${list.length}x: ${locs})`);
    }

    const first = mutableRefs[0];

    return {
      id: 'WFL-02-warning-unpinned',
      ruleId: 'WFL-02',
      title: `Unpinned Action Reference${grouped.size > 1 ? 's' : ''} Detected (${grouped.size})`,
      status: 'warning',
      severity: 'medium',
      explanation: `Workflow references ${grouped.size} external action or reusable workflow dependency using mutable tags or branch names instead of immutable 40-character commit SHAs. Tags can be reassigned or deleted by repository owners or attackers, creating supply-chain tampering risk.`,
      evidence: {
        label: 'Unpinned References',
        value: summaryParts.join('; '),
        sourcePath: effectiveFilePath,
        line: first.line,
        column: first.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: first.line,
        column: first.column,
      },
      recommendation: 'Pin external actions and reusable workflows to full 40-character commit SHAs (e.g. actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675) and manage updates with Dependabot or Renovate.',
    };
  }

  // 5. All external references are pinned to full 40-character commit SHAs
  const pinnedRefs = externalRefs.filter((o) => o.type === 'pinned-sha');
  const distinctTargets = Array.from(new Set(pinnedRefs.map((p) => p.target))).join(', ');
  const first = pinnedRefs[0];

  return {
    id: 'WFL-02-pass',
    ruleId: 'WFL-02',
    title: 'All External Actions and Reusable Workflows Pinned to Full Commit SHA',
    status: 'pass',
    severity: 'info',
    explanation: `All ${pinnedRefs.length} external action and reusable workflow reference(s) are pinned to immutable 40-character commit SHAs (${distinctTargets}). Note: Pinning mitigates tag mutability; it does not guarantee that referenced actions are audited, verified, or vulnerability-free.`,
    evidence: {
      label: 'Pinned Actions',
      value: `${pinnedRefs.length} action/workflow reference(s) pinned to full 40-character SHA`,
      sourcePath: effectiveFilePath,
      line: first.line,
      column: first.column,
    },
    sourceLocation: {
      filePath: effectiveFilePath,
      line: first.line,
      column: first.column,
    },
  };
}

// ============================================================================
// WFL-03: Potential Script-Expression Injection in run: Scripts
// ============================================================================

export interface UntrustedContextPattern {
  name: string;
  pattern: RegExp;
}

/**
 * Curated list of attacker-controllable GitHub contexts.
 * Direct interpolation into `run:` scripts allows shell command injection.
 */
export const UNTRUSTED_CONTEXT_PATTERNS: UntrustedContextPattern[] = [
  { name: 'github.event.issue.title', pattern: /\bgithub\.event\.issue\.title\b/i },
  { name: 'github.event.issue.body', pattern: /\bgithub\.event\.issue\.body\b/i },
  { name: 'github.event.pull_request.title', pattern: /\bgithub\.event\.pull_request\.title\b/i },
  { name: 'github.event.pull_request.body', pattern: /\bgithub\.event\.pull_request\.body\b/i },
  { name: 'github.event.comment.body', pattern: /\bgithub\.event\.comment\.body\b/i },
  { name: 'github.event.review.body', pattern: /\bgithub\.event\.review\.body\b/i },
  { name: 'github.event.review_comment.body', pattern: /\bgithub\.event\.review_comment\.body\b/i },
  { name: 'github.event.discussion.title', pattern: /\bgithub\.event\.discussion\.title\b/i },
  { name: 'github.event.discussion.body', pattern: /\bgithub\.event\.discussion\.body\b/i },
  { name: 'github.event.head_commit.message', pattern: /\bgithub\.event\.head_commit\.message\b/i },
  { name: 'github.event.head_commit.author', pattern: /\bgithub\.event\.head_commit\.author\.(name|email)\b/i },
  { name: 'github.event.commits.*.message', pattern: /\bgithub\.event\.commits(\[\d+\]|\.\*)?\.message\b/i },
  { name: 'github.event.commits.*.author', pattern: /\bgithub\.event\.commits(\[\d+\]|\.\*)?\.author\.(name|email)\b/i },
  { name: 'github.head_ref', pattern: /\bgithub\.head_ref\b/i },
  { name: 'github.event.pull_request.head.ref', pattern: /\bgithub\.event\.pull_request\.head\.ref\b/i },
  { name: 'github.event.pull_request.head.label', pattern: /\bgithub\.event\.pull_request\.head\.label\b/i },
  { name: 'github.event.pull_request.head.repo.default_branch', pattern: /\bgithub\.event\.pull_request\.head\.repo\.default_branch\b/i },
  { name: 'github.event.workflow_run.head_branch', pattern: /\bgithub\.event\.workflow_run\.head_branch\b/i },
  { name: 'github.event.workflow_run.head_commit.message', pattern: /\bgithub\.event\.workflow_run\.head_commit\.message\b/i },
];

export interface ScriptInjectionOccurrence {
  jobId: string;
  stepIndex: number;
  stepName?: string;
  matchedContext: string;
  expression: string;
  line?: number;
  column?: number;
}

const GITHUB_EXPRESSION_REGEX = /\$\{\{\s*([^}]+?)\s*\}\}/g;

export function inspectScriptForInjection(
  runScript: string,
  jobId: string,
  stepIndex: number,
  stepName?: string,
  stepLine?: number,
  stepColumn?: number
): ScriptInjectionOccurrence[] {
  const findings: ScriptInjectionOccurrence[] = [];
  let match: RegExpExecArray | null;

  GITHUB_EXPRESSION_REGEX.lastIndex = 0;

  while ((match = GITHUB_EXPRESSION_REGEX.exec(runScript)) !== null) {
    const rawExpression = match[1];

    for (const untrusted of UNTRUSTED_CONTEXT_PATTERNS) {
      if (untrusted.pattern.test(rawExpression)) {
        findings.push({
          jobId,
          stepIndex,
          stepName,
          matchedContext: untrusted.name,
          expression: `\${{ ${rawExpression.trim()} }}`,
          line: stepLine,
          column: stepColumn,
        });
        break; // Stop after first matched pattern in this expression
      }
    }
  }

  return findings;
}

/**
 * WFL-03: Potential script-expression injection.
 *
 * Inspects `jobs.<job_id>.steps[].run` for direct interpolation of curated,
 * potentially attacker-controlled GitHub context values.
 *
 * Key guarantees:
 * - Direct interpolation is detected regardless of surrounding shell quotes,
 *   as GitHub expression substitution occurs before the shell executes.
 * - Environment-variable indirection (passing via step `env:` mapping) is recognized
 *   as a mitigation and is NOT flagged as direct interpolation in `run:`.
 * - Curated pattern matching prevents false positives on safe contexts (github.sha, matrix.*).
 */
export function analyzeScriptInjection(
  workflow: ParsedWorkflowStructure,
  filePath?: string
): WorkflowRuleFinding {
  const effectiveFilePath = filePath || workflow.filePath;
  let totalRunSteps = 0;
  const injectionOccurrences: ScriptInjectionOccurrence[] = [];

  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps) {
      if (typeof step.run === 'string' && step.run.trim().length > 0) {
        totalRunSteps++;
        const detected = inspectScriptForInjection(
          step.run,
          jobId,
          step.index,
          step.name,
          step.line,
          step.column
        );
        injectionOccurrences.push(...detected);
      }
    }
  }

  // 1. If workflow has no steps with `run:`
  if (totalRunSteps === 0) {
    return {
      id: 'WFL-03-not-applicable-no-scripts',
      ruleId: 'WFL-03',
      title: 'No Script Execution Steps (`run:`) Present',
      status: 'not_applicable',
      severity: 'info',
      explanation: 'Workflow does not contain any shell script execution steps (`run:`).',
      sourceLocation: { filePath: effectiveFilePath },
    };
  }

  // 2. Untrusted context interpolation detected in run:
  if (injectionOccurrences.length > 0) {
    const first = injectionOccurrences[0];
    const summaryList = injectionOccurrences
      .map(
        (o) =>
          `job "${o.jobId}" step ${o.stepIndex}${o.stepName ? ` ("${o.stepName}")` : ''} interpolated ${o.expression}${o.line ? ` at line ${o.line}` : ''}`
      )
      .join('; ');

    return {
      id: 'WFL-03-issue-script-injection',
      ruleId: 'WFL-03',
      title: `Potential Script Injection via Direct Context Interpolation in \`run:\` (${injectionOccurrences.length})`,
      status: 'issue',
      severity: 'high',
      explanation: `Detected direct interpolation of untrusted GitHub context value(s) in shell script (\`run:\`). GitHub Actions substitutes \${{ ... }} expressions before invoking the shell, enabling attackers to inject arbitrary commands via pull request titles, commit messages, comments, or branch names. Surrounding shell quotes do not prevent command breakout.`,
      evidence: {
        label: 'Injected Expressions',
        value: summaryList,
        sourcePath: effectiveFilePath,
        line: first.line,
        column: first.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: first.line,
        column: first.column,
      },
      recommendation: 'Transfer untrusted context values through environment variables (env:) and reference them as shell variables (e.g. "$ISSUE_TITLE" or "$PR_BRANCH") rather than interpolating expressions directly into script text.',
    };
  }

  // 3. No untrusted direct interpolation detected
  return {
    id: 'WFL-03-pass',
    ruleId: 'WFL-03',
    title: 'No Direct Untrusted Context Interpolation in `run:`',
    status: 'pass',
    severity: 'info',
    explanation: `Inspected all ${totalRunSteps} shell script step(s); no direct interpolation of attacker-controlled GitHub context expressions was detected. (Where environment variables are used for indirection, ensure scripts handle variable values safely.)`,
    evidence: {
      label: 'Inspected Script Steps',
      value: `${totalRunSteps} run: step(s) evaluated`,
      sourcePath: effectiveFilePath,
    },
    sourceLocation: { filePath: effectiveFilePath },
  };
}

// ============================================================================
// WFL-04: Risky pull_request_target Patterns
// ============================================================================

export interface UntrustedCheckoutDetails {
  jobId: string;
  stepIndex: number;
  stepName?: string;
  ref?: string;
  repository?: string;
  isOptOut: boolean;
  line?: number;
  column?: number;
}

export interface SubsequentExecutionDetails {
  jobId: string;
  stepIndex: number;
  stepName?: string;
  type: 'run' | 'local_action';
  commandSnippet?: string;
  line?: number;
  column?: number;
}

const UNTRUSTED_PR_HEAD_REF_REGEX =
  /\$\{\{\s*github\.(event\.pull_request\.head\.(sha|ref)|head_ref)\s*\}\}/i;

const UNTRUSTED_FORK_REPO_REGEX =
  /\$\{\{\s*github\.event\.pull_request\.head\.repo\.(full_name|clone_url)\s*\}\}/i;

function isCheckoutAction(uses?: string): boolean {
  if (!uses) return false;
  const lower = uses.toLowerCase();
  return lower === 'actions/checkout' || lower.startsWith('actions/checkout@');
}

/**
 * WFL-04: Risky pull_request_target patterns.
 *
 * Assesses evidence:
 * 1. Whether `pull_request_target` trigger is present (not_applicable if absent).
 * 2. Whether checkout retrieves untrusted pull-request head code (ref: head.sha/ref or fork repo).
 * 3. Whether subsequent steps in the same job execute code (via run: or local actions ./...).
 * 4. Whether explicit opt-out `allow-unsafe-pr-checkout: true` is present.
 */
export function analyzePullRequestTarget(
  workflow: ParsedWorkflowStructure,
  filePath?: string
): WorkflowRuleFinding {
  const effectiveFilePath = filePath || workflow.filePath;

  // 1. Check if pull_request_target is present in triggers
  const hasPullRequestTarget = workflow.triggers.events.includes('pull_request_target');
  if (!hasPullRequestTarget) {
    return {
      id: 'WFL-04-not-applicable-trigger',
      ruleId: 'WFL-04',
      title: 'Trigger `pull_request_target` Not Configured',
      status: 'not_applicable',
      severity: 'info',
      explanation: 'Workflow does not declare a `pull_request_target` trigger; risky pull_request_target checkout patterns do not apply.',
      sourceLocation: {
        filePath: effectiveFilePath,
        line: workflow.triggers.line,
        column: workflow.triggers.column,
      },
    };
  }

  // 2. Inspect each job for untrusted checkout followed by execution
  const untrustedCheckouts: UntrustedCheckoutDetails[] = [];
  const executionsFollowingCheckout: Array<{
    checkout: UntrustedCheckoutDetails;
    execution: SubsequentExecutionDetails;
  }> = [];

  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    let activeCheckoutInJob: UntrustedCheckoutDetails | null = null;

    for (const step of job.steps) {
      if (isCheckoutAction(step.uses)) {
        const withParams = step.with || {};
        const refParam = typeof withParams.ref === 'string' ? withParams.ref : '';
        const repoParam = typeof withParams.repository === 'string' ? withParams.repository : '';
        const isOptOut =
          withParams['allow-unsafe-pr-checkout'] === true ||
          withParams['allow-unsafe-pr-checkout'] === 'true';

        const isUntrustedRef = UNTRUSTED_PR_HEAD_REF_REGEX.test(refParam);
        const isUntrustedRepo = UNTRUSTED_FORK_REPO_REGEX.test(repoParam);

        if (isUntrustedRef || isUntrustedRepo) {
          activeCheckoutInJob = {
            jobId,
            stepIndex: step.index,
            stepName: step.name,
            ref: refParam || undefined,
            repository: repoParam || undefined,
            isOptOut,
            line: step.line,
            column: step.column,
          };
          untrustedCheckouts.push(activeCheckoutInJob);
          continue;
        }
      }

      // If untrusted checkout occurred earlier in this job, check if step executes code
      if (activeCheckoutInJob) {
        if (typeof step.run === 'string' && step.run.trim().length > 0) {
          executionsFollowingCheckout.push({
            checkout: activeCheckoutInJob,
            execution: {
              jobId,
              stepIndex: step.index,
              stepName: step.name,
              type: 'run',
              commandSnippet: step.run.slice(0, 80).replace(/\s+/g, ' ').trim(),
              line: step.line,
              column: step.column,
            },
          });
        } else if (
          typeof step.uses === 'string' &&
          (step.uses.startsWith('./') || step.uses.startsWith('../'))
        ) {
          executionsFollowingCheckout.push({
            checkout: activeCheckoutInJob,
            execution: {
              jobId,
              stepIndex: step.index,
              stepName: step.name,
              type: 'local_action',
              commandSnippet: step.uses,
              line: step.line,
              column: step.column,
            },
          });
        }
      }
    }
  }

  // Case A: No untrusted checkout detected in pull_request_target workflow
  if (untrustedCheckouts.length === 0) {
    return {
      id: 'WFL-04-pass',
      ruleId: 'WFL-04',
      title: '`pull_request_target` Trigger Present Without Detected Untrusted Checkout',
      status: 'pass',
      severity: 'info',
      explanation: 'Workflow triggers on `pull_request_target`, but no untrusted pull request head code checkout was detected in workflow steps. (Note: Heuristic analysis verifies known checkout patterns; ensure any custom tools do not clone untrusted forks.)',
      evidence: {
        label: 'Trigger Verification',
        value: 'pull_request_target declared without untrusted checkout ref',
        sourcePath: effectiveFilePath,
        line: workflow.triggers.line,
        column: workflow.triggers.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: workflow.triggers.line,
        column: workflow.triggers.column,
      },
    };
  }

  // Case B: Untrusted checkout detected AND followed by code execution
  if (executionsFollowingCheckout.length > 0) {
    const pair = executionsFollowingCheckout[0];
    const isExplicitOptOut = pair.checkout.isOptOut;

    if (isExplicitOptOut) {
      return {
        id: 'WFL-04-warning-opt-out',
        ruleId: 'WFL-04',
        title: 'Unsafe Pull Request Checkout Explicitly Opted-In',
        status: 'warning',
        severity: 'low',
        explanation: `Workflow triggers on \`pull_request_target\` and checks out untrusted pull request code with \`allow-unsafe-pr-checkout: true\`, followed by execution in step ${pair.execution.stepIndex}. Ensure this workflow is strictly hardened and does not expose privileged credentials.`,
        evidence: {
          label: 'Opt-Out Checkout Execution',
          value: `Checkout at line ${pair.checkout.line}; followed by execution at line ${pair.execution.line}`,
          sourcePath: effectiveFilePath,
          line: pair.checkout.line,
          column: pair.checkout.column,
        },
        sourceLocation: {
          filePath: effectiveFilePath,
          line: pair.checkout.line,
          column: pair.checkout.column,
        },
        recommendation: 'Re-evaluate workflow architecture to use unprivileged pull_request triggers or separate privileged operations using workflow_run.',
      };
    }

    const execDesc =
      pair.execution.type === 'run'
        ? `script execution (\`${pair.execution.commandSnippet}\`)`
        : `local action execution (\`${pair.execution.commandSnippet}\`)`;

    return {
      id: 'WFL-04-issue-untrusted-checkout-exec',
      ruleId: 'WFL-04',
      title: 'Untrusted PR Code Checkout Followed by Execution Under `pull_request_target`',
      status: 'issue',
      severity: 'high',
      explanation: `Workflow triggers on \`pull_request_target\` (which runs in the context of the base repository with elevated tokens and secret access) and checks out untrusted pull request code, followed by ${execDesc} in step ${pair.execution.stepIndex}. This allows pull request authors from forks to execute arbitrary code with repository write permissions and secrets.`,
      evidence: {
        label: 'Vulnerable Pattern',
        value: `Untrusted checkout in job "${pair.checkout.jobId}" (step ${pair.checkout.stepIndex}${pair.checkout.line ? `, line ${pair.checkout.line}` : ''}) followed by ${execDesc} (step ${pair.execution.stepIndex}${pair.execution.line ? `, line ${pair.execution.line}` : ''})`,
        sourcePath: effectiveFilePath,
        line: pair.checkout.line,
        column: pair.checkout.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: pair.checkout.line,
        column: pair.checkout.column,
      },
      recommendation: 'Do not checkout untrusted pull request code in pull_request_target workflows. If building or testing pull requests, use the unprivileged pull_request event, or isolate testing in an unprivileged workflow triggered by workflow_run.',
    };
  }

  // Case C: Untrusted checkout detected WITHOUT subsequent execution established
  const firstCheckout = untrustedCheckouts[0];
  return {
    id: 'WFL-04-warning-checkout-no-exec',
    ruleId: 'WFL-04',
    title: 'Untrusted PR Code Checked Out Under `pull_request_target` (Execution Not Established)',
    status: 'warning',
    severity: 'medium',
    explanation: 'Workflow triggers on `pull_request_target` and checks out untrusted pull request head code, but no subsequent script execution (`run:`) or local action execution was identified in workflow steps. Verify that checked-out files are not indirectly evaluated, built, or published.',
    evidence: {
      label: 'Suspicious Checkout',
      value: `Untrusted checkout in job "${firstCheckout.jobId}" (step ${firstCheckout.stepIndex}${firstCheckout.line ? `, line ${firstCheckout.line}` : ''}) without direct subsequent run: step`,
      sourcePath: effectiveFilePath,
      line: firstCheckout.line,
      column: firstCheckout.column,
    },
    sourceLocation: {
      filePath: effectiveFilePath,
      line: firstCheckout.line,
      column: firstCheckout.column,
    },
    recommendation: 'Ensure that checked-out pull request contents are not evaluated by downstream actions or third-party tools in a privileged context.',
  };
}

// ============================================================================
// Workflow Security Assessment Aggregators
// ============================================================================

/**
 * Evaluates all four workflow-security rules against a parsed workflow structure.
 * Handles parser failure containment: if parsing failed, emits conservative 'unknown'
 * findings for all 4 rules, never confident conclusions from unavailable data.
 */
export function analyzeWorkflowSecurity(
  parseResult: WorkflowParseResult,
  filePath?: string
): WorkflowFileSecurityAssessment {
  const effectiveFilePath = filePath || (parseResult.success ? parseResult.workflow.filePath : undefined) || 'unknown.yml';

  // Parser failure containment
  if (!parseResult.success) {
    const error = parseResult.error;
    const ruleIds: WorkflowRuleId[] = ['WFL-01', 'WFL-02', 'WFL-03', 'WFL-04'];
    const ruleNames: Record<WorkflowRuleId, string> = {
      'WFL-01': 'Workflow Permissions',
      'WFL-02': 'Action Reference Pinning',
      'WFL-03': 'Script Injection',
      'WFL-04': 'Risky pull_request_target',
    };

    const findings: WorkflowRuleFinding[] = ruleIds.map((ruleId) => ({
      id: `${ruleId}-unknown-parse-error`,
      ruleId,
      title: `${ruleNames[ruleId]} Indeterminate (Parse Failure)`,
      status: 'unknown',
      severity: 'info',
      explanation: `Workflow file could not be parsed structurally due to ${error.code}: ${error.message}. Static security analysis could not be completed.`,
      evidence: {
        label: 'Parser Error',
        value: `${error.code}: ${error.message}`,
        sourcePath: effectiveFilePath,
        line: error.line,
        column: error.column,
      },
      sourceLocation: {
        filePath: effectiveFilePath,
        line: error.line,
        column: error.column,
      },
      recommendation: 'Fix workflow YAML syntax or structural issues to enable automated security analysis.',
    }));

    return {
      filePath: effectiveFilePath,
      parseSuccess: false,
      parseError: error,
      findings,
      summary: {
        passCount: 0,
        warningCount: 0,
        issueCount: 0,
        unknownCount: 4,
        notApplicableCount: 0,
      },
    };
  }

  const workflow = parseResult.workflow;
  const findings: WorkflowRuleFinding[] = [
    analyzeWorkflowPermissions(workflow, effectiveFilePath),
    analyzeActionPinning(workflow, effectiveFilePath),
    analyzeScriptInjection(workflow, effectiveFilePath),
    analyzePullRequestTarget(workflow, effectiveFilePath),
  ];

  const summary = {
    passCount: findings.filter((f) => f.status === 'pass').length,
    warningCount: findings.filter((f) => f.status === 'warning').length,
    issueCount: findings.filter((f) => f.status === 'issue').length,
    unknownCount: findings.filter((f) => f.status === 'unknown').length,
    notApplicableCount: findings.filter((f) => f.status === 'not_applicable').length,
  };

  return {
    filePath: effectiveFilePath,
    workflowName: workflow.name,
    parseSuccess: true,
    findings,
    summary,
  };
}

/**
 * Parses raw YAML content using the safe workflow parser and evaluates all four security rules.
 */
export function analyzeWorkflowYamlSecurity(
  content: string,
  filePath?: string
): WorkflowFileSecurityAssessment {
  const parseResult = parseWorkflowYaml(content, filePath);
  return analyzeWorkflowSecurity(parseResult, filePath);
}
