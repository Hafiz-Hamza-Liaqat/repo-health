import { describe, it, expect } from 'vitest';
import {
  analyzeWorkflowPermissions,
  analyzeActionPinning,
  analyzeScriptInjection,
  analyzePullRequestTarget,
  analyzeWorkflowSecurity,
  analyzeWorkflowYamlSecurity,
  classifyActionReference,
  inspectScriptForInjection,
} from './workflowSecurityAnalyzer';
import { parseWorkflowYaml } from './workflowYamlParser';
import {
  PERMISSIONS_MISSING_WORKFLOW,
  PERMISSIONS_WRITE_ALL_WORKFLOW,
  PERMISSIONS_READ_ALL_WORKFLOW,
  PERMISSIONS_EMPTY_WORKFLOW,
  PERMISSIONS_GRANULAR_WORKFLOW,
  PERMISSIONS_JOB_OVERRIDE_WRITE_WORKFLOW,
  PERMISSIONS_ALL_JOBS_OVERRIDE_WORKFLOW,
  PERMISSIONS_UNKNOWN_SCOPE_WORKFLOW,
  PERMISSIONS_ASYMMETRIC_INVALID_WORKFLOW,
  PINNED_SHA_WORKFLOW,
  MUTABLE_TAG_WORKFLOW,
  MUTABLE_BRANCH_WORKFLOW,
  SHORT_SHA_WORKFLOW,
  PINNED_REUSABLE_WORKFLOW,
  UNPINNED_REUSABLE_WORKFLOW,
  LOCAL_ACTION_ONLY_WORKFLOW,
  DOCKER_ACTION_WORKFLOW,
  MALFORMED_ACTION_REF_WORKFLOW,
  MIXED_ACTIONS_WORKFLOW,
  SCRIPT_INJECTION_SINGLE_LINE_WORKFLOW,
  SCRIPT_INJECTION_MULTILINE_WORKFLOW,
  SCRIPT_INJECTION_QUOTED_WORKFLOW,
  SCRIPT_INJECTION_ENV_INDIRECTION_WORKFLOW,
  SCRIPT_INJECTION_SAFE_EXPRESSIONS_WORKFLOW,
  SCRIPT_INJECTION_MULTIPLE_STEPS_WORKFLOW,
  NO_RUN_STEPS_WORKFLOW,
  PRT_HARMLESS_LABELER_WORKFLOW,
  PRT_BASE_CHECKOUT_WORKFLOW,
  PRT_UNTRUSTED_CHECKOUT_WITH_RUN_WORKFLOW,
  PRT_FORK_REPO_CHECKOUT_WITH_RUN_WORKFLOW,
  PRT_UNTRUSTED_CHECKOUT_WITH_LOCAL_ACTION_WORKFLOW,
  PRT_UNTRUSTED_CHECKOUT_WITHOUT_EXECUTION_WORKFLOW,
  PRT_UNSAFE_CHECKOUT_OPT_OUT_WORKFLOW,
  MALFORMED_YAML_WORKFLOW,
  CYCLIC_ALIAS_MUTUAL_WORKFLOW,
  createOversizedWorkflow,
  createNodeBudgetExceededWorkflow,
} from '../test/fixtures/workflowFixtures';

describe('Phase 2.1B.2: Workflow Security Rules Engine', () => {
  // ==========================================================================
  // 1. WFL-01: Workflow Permissions Analysis
  // ==========================================================================
  describe('1. WFL-01: Workflow Permissions Analysis', () => {
    it('should flag undeclared permissions as warning (repository policy default)', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_MISSING_WORKFLOW, '.github/workflows/missing.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('warning');
      expect(finding.severity).toBe('medium');
      expect(finding.title).toContain('Undeclared');
      expect(finding.evidence?.value).toContain('build');
      expect(finding.sourceLocation?.line).toBeDefined();
    });

    it('should flag explicit top-level write-all as high severity issue', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_WRITE_ALL_WORKFLOW, '.github/workflows/write_all.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('issue');
      expect(finding.severity).toBe('high');
      expect(finding.title).toContain('write-all');
      expect(finding.sourceLocation?.line).toBe(3);
    });

    it('should flag job-level write-all as high severity issue', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_JOB_OVERRIDE_WRITE_WORKFLOW, '.github/workflows/override_write.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('issue');
      expect(finding.severity).toBe('high');
      expect(finding.evidence?.value).toContain('elevated_job');
      expect(finding.sourceLocation?.line).toBe(11);
    });

    it('should downgrade top-level write-all to low severity warning when completely overridden by all jobs', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_ALL_JOBS_OVERRIDE_WORKFLOW, '.github/workflows/all_overridden.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('warning');
      expect(finding.severity).toBe('low');
      expect(finding.title).toContain('Overridden by All Jobs');
    });

    it('should pass for explicit read-all at workflow level', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_READ_ALL_WORKFLOW, '.github/workflows/read_all.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('pass');
      expect(finding.severity).toBe('info');
      expect(finding.title).toContain('Least Privilege');
    });

    it('should pass for explicit empty permissions mapping {}', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_EMPTY_WORKFLOW, '.github/workflows/empty.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('pass');
      expect(finding.severity).toBe('info');
    });

    it('should pass for granular least-privilege permissions', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_GRANULAR_WORKFLOW, '.github/workflows/granular.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('pass');
      expect(finding.severity).toBe('info');
    });

    it('should pass for granular write permissions with accurate scope notation', () => {
      const yaml = `name: Release
on: push
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: echo "release"
`;
      const parsed = parseWorkflowYaml(yaml, '.github/workflows/release.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('pass');
      expect(finding.explanation).toContain('contents');
    });

    it('should return unknown for unrecognized permission scope', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_UNKNOWN_SCOPE_WORKFLOW, '.github/workflows/unknown_scope.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('unknown');
      expect(finding.severity).toBe('low');
      expect(finding.title).toContain('Unknown or Unsupported');
      expect(finding.evidence?.value).toContain('super-admin');
    });

    it('should return unknown for invalid access level on asymmetric scope (vulnerability-alerts: write)', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_ASYMMETRIC_INVALID_WORKFLOW, '.github/workflows/asymmetric.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-01');
      expect(finding.status).toBe('unknown');
      expect(finding.title).toContain('Unknown or Unsupported');
      expect(finding.evidence?.value).toContain('vulnerability-alerts');
    });

    it('should return unknown for unrecognized scalar permission mode', () => {
      const yaml = `name: Invalid Mode
on: push
permissions: admin
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "bad mode"
`;
      const parsed = parseWorkflowYaml(yaml);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeWorkflowPermissions(parsed.workflow);
      expect(finding.status).toBe('unknown');
      expect(finding.title).toContain('Unrecognized or Malformed');
    });
  });

  // ==========================================================================
  // 2. WFL-02: Action and Reusable-Workflow Reference Pinning
  // ==========================================================================
  describe('2. WFL-02: Action Reference Pinning', () => {
    it('should correctly classify reference types with helper function', () => {
      expect(classifyActionReference('./local/action', 'build').type).toBe('local');
      expect(classifyActionReference('../shared', 'build').type).toBe('local');
      expect(classifyActionReference('docker://alpine:3.18', 'build').type).toBe('docker');
      expect(classifyActionReference('actions/checkout', 'build').type).toBe('malformed');
      expect(classifyActionReference('actions/checkout@v4', 'build').type).toBe('mutable-ref');
      expect(classifyActionReference('actions/checkout@main', 'build').type).toBe('mutable-ref');
      expect(classifyActionReference('actions/checkout@a81bbbf', 'build').type).toBe('mutable-ref');
      expect(
        classifyActionReference('actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675', 'build').type
      ).toBe('pinned-sha');
    });

    it('should pass when all external actions are pinned to 40-character commit SHA', () => {
      const parsed = parseWorkflowYaml(PINNED_SHA_WORKFLOW, '.github/workflows/pinned.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('pass');
      expect(finding.severity).toBe('info');
      expect(finding.title).toContain('Pinned to Full Commit SHA');
      expect(finding.explanation).toContain('mitigates tag mutability');
      expect(finding.explanation).toContain('does not guarantee');
      expect(finding.sourceLocation?.line).toBe(7);
    });

    it('should warn when action references use mutable tags (@v4)', () => {
      const parsed = parseWorkflowYaml(MUTABLE_TAG_WORKFLOW, '.github/workflows/tag.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('warning');
      expect(finding.severity).toBe('medium');
      expect(finding.evidence?.value).toContain('actions/checkout@v4');
      expect(finding.evidence?.value).toContain('actions/setup-node@v4');
    });

    it('should warn when action references use mutable branch names (@main)', () => {
      const parsed = parseWorkflowYaml(MUTABLE_BRANCH_WORKFLOW, '.github/workflows/branch.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('warning');
      expect(finding.severity).toBe('medium');
      expect(finding.evidence?.value).toContain('actions/checkout@main');
    });

    it('should warn when action references use short commit SHAs (not 40 chars)', () => {
      const parsed = parseWorkflowYaml(SHORT_SHA_WORKFLOW, '.github/workflows/short_sha.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('warning');
      expect(finding.evidence?.value).toContain('actions/checkout@a81bbbf');
    });

    it('should pass for reusable workflow pinned to full commit SHA', () => {
      const parsed = parseWorkflowYaml(PINNED_REUSABLE_WORKFLOW, '.github/workflows/caller.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('pass');
    });

    it('should warn for reusable workflow with mutable tag', () => {
      const parsed = parseWorkflowYaml(UNPINNED_REUSABLE_WORKFLOW, '.github/workflows/caller.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('warning');
      expect(finding.evidence?.value).toContain('reusable.yml@v1');
    });

    it('should return not_applicable when only local actions are referenced', () => {
      const parsed = parseWorkflowYaml(LOCAL_ACTION_ONLY_WORKFLOW, '.github/workflows/local.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('not_applicable');
    });

    it('should return not_applicable when only container actions are referenced', () => {
      const parsed = parseWorkflowYaml(DOCKER_ACTION_WORKFLOW, '.github/workflows/docker.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('not_applicable');
    });

    it('should return unknown for malformed action reference without @', () => {
      const parsed = parseWorkflowYaml(MALFORMED_ACTION_REF_WORKFLOW, '.github/workflows/malformed.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('unknown');
      expect(finding.title).toContain('Malformed');
    });

    it('should deduplicate multiple occurrences of identical mutable action references', () => {
      const parsed = parseWorkflowYaml(MIXED_ACTIONS_WORKFLOW, '.github/workflows/mixed.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('warning');
      // actions/setup-node@v4 appears in job1 and job2, must be aggregated with occurrence count
      expect(finding.evidence?.value).toContain('actions/setup-node@v4 (2x');
    });

    it('should return not_applicable when workflow has no uses references at all', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_MISSING_WORKFLOW, '.github/workflows/nourl.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeActionPinning(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-02');
      expect(finding.status).toBe('not_applicable');
    });
  });

  // ==========================================================================
  // 3. WFL-03: Potential Script-Expression Injection in run: Scripts
  // ==========================================================================
  describe('3. WFL-03: Script Injection in run:', () => {
    it('should detect untrusted context interpolation with inspectScriptForInjection helper', () => {
      const occurrences = inspectScriptForInjection(
        'echo "PR title: ${{ github.event.pull_request.title }}"',
        'build',
        0,
        'Print Title',
        10,
        5
      );
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].matchedContext).toBe('github.event.pull_request.title');
      expect(occurrences[0].expression).toContain('github.event.pull_request.title');
      expect(occurrences[0].line).toBe(10);
    });

    it('should flag direct single-line script injection as high severity issue', () => {
      const parsed = parseWorkflowYaml(SCRIPT_INJECTION_SINGLE_LINE_WORKFLOW, '.github/workflows/inj1.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeScriptInjection(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-03');
      expect(finding.status).toBe('issue');
      expect(finding.severity).toBe('high');
      expect(finding.title).toContain('Script Injection');
      expect(finding.evidence?.value).toContain('github.event.issue.title');
    });

    it('should flag multiline script injection', () => {
      const parsed = parseWorkflowYaml(SCRIPT_INJECTION_MULTILINE_WORKFLOW, '.github/workflows/inj2.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeScriptInjection(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-03');
      expect(finding.status).toBe('issue');
      expect(finding.evidence?.value).toContain('github.head_ref');
    });

    it('should flag quoted interpolation (quotes do not prevent command breakout)', () => {
      const parsed = parseWorkflowYaml(SCRIPT_INJECTION_QUOTED_WORKFLOW, '.github/workflows/inj3.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeScriptInjection(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-03');
      expect(finding.status).toBe('issue');
      expect(finding.evidence?.value).toContain('github.event.comment.body');
    });

    it('should pass for environment-variable indirection mitigation pattern', () => {
      const parsed = parseWorkflowYaml(SCRIPT_INJECTION_ENV_INDIRECTION_WORKFLOW, '.github/workflows/safe_env.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeScriptInjection(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-03');
      expect(finding.status).toBe('pass');
      expect(finding.severity).toBe('info');
      expect(finding.title).toContain('No Direct Untrusted Context');
    });

    it('should pass for safe expressions in run: (github.sha, github.run_id, matrix.*)', () => {
      const parsed = parseWorkflowYaml(SCRIPT_INJECTION_SAFE_EXPRESSIONS_WORKFLOW, '.github/workflows/safe_expr.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeScriptInjection(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-03');
      expect(finding.status).toBe('pass');
    });

    it('should aggregate multiple injections across jobs into a single finding with complete evidence', () => {
      const parsed = parseWorkflowYaml(SCRIPT_INJECTION_MULTIPLE_STEPS_WORKFLOW, '.github/workflows/multi_inj.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeScriptInjection(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-03');
      expect(finding.status).toBe('issue');
      expect(finding.title).toContain('(3)');
      expect(finding.evidence?.value).toContain('github.event.pull_request.title');
      expect(finding.evidence?.value).toContain('github.event.pull_request.body');
      expect(finding.evidence?.value).toContain('github.head_ref');
    });

    it('should return not_applicable when workflow contains no run: script steps', () => {
      const parsed = parseWorkflowYaml(NO_RUN_STEPS_WORKFLOW, '.github/workflows/norun.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzeScriptInjection(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-03');
      expect(finding.status).toBe('not_applicable');
    });
  });

  // ==========================================================================
  // 4. WFL-04: Risky pull_request_target Patterns
  // ==========================================================================
  describe('4. WFL-04: Risky pull_request_target Patterns', () => {
    it('should return not_applicable when pull_request_target is not in trigger events', () => {
      const parsed = parseWorkflowYaml(PERMISSIONS_MISSING_WORKFLOW, '.github/workflows/push.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('not_applicable');
      expect(finding.title).toContain('Not Configured');
    });

    it('should pass for harmless labeler workflow triggered by pull_request_target', () => {
      const parsed = parseWorkflowYaml(PRT_HARMLESS_LABELER_WORKFLOW, '.github/workflows/prt_labeler.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('pass');
      expect(finding.severity).toBe('info');
      expect(finding.title).toContain('Without Detected Untrusted Checkout');
    });

    it('should pass for base repository checkout under pull_request_target', () => {
      const parsed = parseWorkflowYaml(PRT_BASE_CHECKOUT_WORKFLOW, '.github/workflows/prt_base.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('pass');
    });

    it('should flag untrusted PR head checkout followed by run: as high severity issue', () => {
      const parsed = parseWorkflowYaml(PRT_UNTRUSTED_CHECKOUT_WITH_RUN_WORKFLOW, '.github/workflows/prt_vuln1.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('issue');
      expect(finding.severity).toBe('high');
      expect(finding.title).toContain('Untrusted PR Code Checkout Followed by Execution');
      expect(finding.evidence?.value).toContain('npm test');
      expect(finding.sourceLocation?.line).toBe(8);
    });

    it('should flag untrusted fork repository checkout followed by build command', () => {
      const parsed = parseWorkflowYaml(PRT_FORK_REPO_CHECKOUT_WITH_RUN_WORKFLOW, '.github/workflows/prt_vuln2.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('issue');
      expect(finding.severity).toBe('high');
      expect(finding.evidence?.value).toContain('make build');
    });

    it('should flag untrusted checkout followed by local action execution', () => {
      const parsed = parseWorkflowYaml(PRT_UNTRUSTED_CHECKOUT_WITH_LOCAL_ACTION_WORKFLOW, '.github/workflows/prt_vuln3.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('issue');
      expect(finding.severity).toBe('high');
      expect(finding.evidence?.value).toContain('local action execution');
    });

    it('should warn when untrusted checkout is detected without subsequent code execution', () => {
      const parsed = parseWorkflowYaml(PRT_UNTRUSTED_CHECKOUT_WITHOUT_EXECUTION_WORKFLOW, '.github/workflows/prt_warn.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('warning');
      expect(finding.severity).toBe('medium');
      expect(finding.title).toContain('Execution Not Established');
    });

    it('should emit low severity warning when allow-unsafe-pr-checkout is explicitly opted-in', () => {
      const parsed = parseWorkflowYaml(PRT_UNSAFE_CHECKOUT_OPT_OUT_WORKFLOW, '.github/workflows/prt_optout.yml');
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const finding = analyzePullRequestTarget(parsed.workflow);
      expect(finding.ruleId).toBe('WFL-04');
      expect(finding.status).toBe('warning');
      expect(finding.severity).toBe('low');
      expect(finding.title).toContain('Explicitly Opted-In');
    });
  });

  // ==========================================================================
  // 5. Assessment Aggregation & Parser Failure Containment
  // ==========================================================================
  describe('5. Assessment Aggregation & Parser Failure Containment', () => {
    it('should aggregate all four rules on a valid workflow file', () => {
      const assessment = analyzeWorkflowYamlSecurity(
        PINNED_SHA_WORKFLOW,
        '.github/workflows/pinned.yml'
      );

      expect(assessment.parseSuccess).toBe(true);
      expect(assessment.filePath).toBe('.github/workflows/pinned.yml');
      expect(assessment.workflowName).toBe('Pinned SHA Actions');
      expect(assessment.findings).toHaveLength(4);

      const ruleIds = assessment.findings.map((f) => f.ruleId);
      expect(ruleIds).toEqual(['WFL-01', 'WFL-02', 'WFL-03', 'WFL-04']);

      // WFL-01: missing permissions -> warning
      // WFL-02: pinned -> pass
      // WFL-03: no run steps -> not_applicable
      // WFL-04: push trigger -> not_applicable
      expect(assessment.summary.passCount).toBe(1);
      expect(assessment.summary.warningCount).toBe(1);
      expect(assessment.summary.issueCount).toBe(0);
      expect(assessment.summary.unknownCount).toBe(0);
      expect(assessment.summary.notApplicableCount).toBe(2);
    });

    it('should evaluate parsed workflow result directly using analyzeWorkflowSecurity', () => {
      const parsed = parseWorkflowYaml(PINNED_SHA_WORKFLOW, '.github/workflows/direct.yml');
      const assessment = analyzeWorkflowSecurity(parsed, '.github/workflows/direct.yml');
      expect(assessment.parseSuccess).toBe(true);
      expect(assessment.findings).toHaveLength(4);
      expect(assessment.summary.passCount).toBe(1);
    });

    it('should contain syntax errors by emitting 4 unknown findings and zero confident conclusions', () => {
      const assessment = analyzeWorkflowYamlSecurity(
        MALFORMED_YAML_WORKFLOW,
        '.github/workflows/bad.yml'
      );

      expect(assessment.parseSuccess).toBe(false);
      expect(assessment.parseError?.code).toBe('YAML_SYNTAX_ERROR');
      expect(assessment.summary.unknownCount).toBe(4);
      expect(assessment.summary.passCount).toBe(0);
      expect(assessment.summary.issueCount).toBe(0);
      expect(assessment.summary.warningCount).toBe(0);

      for (const finding of assessment.findings) {
        expect(finding.status).toBe('unknown');
        expect(finding.title).toContain('Indeterminate');
        expect(finding.explanation).toContain('YAML_SYNTAX_ERROR');
      }
    });

    it('should contain cyclic alias errors and report unknown status across all rules', () => {
      const assessment = analyzeWorkflowYamlSecurity(
        CYCLIC_ALIAS_MUTUAL_WORKFLOW,
        '.github/workflows/cycle.yml'
      );

      expect(assessment.parseSuccess).toBe(false);
      expect(assessment.parseError?.code).toBe('YAML_ALIAS_CYCLE');
      expect(assessment.summary.unknownCount).toBe(4);
    });

    it('should contain oversized inputs and report FILE_OVERSIZED', () => {
      const oversized = createOversizedWorkflow();
      const assessment = analyzeWorkflowYamlSecurity(
        oversized,
        '.github/workflows/huge.yml'
      );

      expect(assessment.parseSuccess).toBe(false);
      expect(assessment.parseError?.code).toBe('FILE_OVERSIZED');
      expect(assessment.summary.unknownCount).toBe(4);
    });

    it('should contain node budget limit violations and report YAML_TRAVERSAL_LIMIT', () => {
      const heavy = createNodeBudgetExceededWorkflow(1100);
      const assessment = analyzeWorkflowYamlSecurity(
        heavy,
        '.github/workflows/heavy.yml'
      );

      expect(assessment.parseSuccess).toBe(false);
      expect(assessment.parseError?.code).toBe('YAML_TRAVERSAL_LIMIT');
      expect(assessment.summary.unknownCount).toBe(4);
    });
  });
});
