/**
 * Deterministic Offline Workflow Fixtures (Phase 2.1B.1)
 *
 * Provides a comprehensive test battery of valid, edge-case, and adversarial
 * GitHub Actions workflow files for safe structural parsing and limits verification.
 */

// 1. Minimal valid workflow
export const MINIMAL_VALID_WORKFLOW = `name: Minimal
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "hello world"
`;

// 2. Multiple jobs and steps with IDs, names, uses, run, with, env
export const MULTI_JOB_MULTI_STEP_WORKFLOW = `name: CI Pipeline
on:
  push:
    branches: [main]
  pull_request:
jobs:
  lint:
    name: Lint Code
    runs-on: ubuntu-latest
    steps:
      - id: checkout
        name: Checkout Repo
        uses: actions/checkout@v4
      - id: run-linter
        name: Run ESLint
        run: npm run lint
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Vitest
        run: npm test
        env:
          CI: 'true'
          NODE_ENV: test
`;

// 3. Workflow-level and job-level permissions
export const WORKFLOW_AND_JOB_PERMISSIONS_WORKFLOW = `name: Permissions Demo
on: push
permissions:
  contents: read
  issues: read
jobs:
  read_all_job:
    permissions: read-all
    runs-on: ubuntu-latest
    steps:
      - run: echo "read-all"
  write_all_job:
    permissions: write-all
    runs-on: ubuntu-latest
    steps:
      - run: echo "write-all"
  empty_perms_job:
    permissions: {}
    runs-on: ubuntu-latest
    steps:
      - run: echo "empty"
  granular_perms_job:
    permissions:
      id-token: write
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - run: echo "granular"
  inherited_perms_job:
    runs-on: ubuntu-latest
    steps:
      - run: echo "inherited"
`;

// 4. uses actions and reusable workflow references
export const USES_AND_REUSABLE_WORKFLOW = `name: Uses and Reusable
on: workflow_dispatch
jobs:
  action_steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
  reusable_call:
    uses: octocat/example-repo/.github/workflows/reusable.yml@v1
    with:
      environment: production
    secrets: inherit
`;

// 5. Single-line and multiline run scripts
export const RUN_SCRIPTS_WORKFLOW = `name: Run Scripts
on: push
jobs:
  scripts:
    runs-on: ubuntu-latest
    steps:
      - name: Single line
        run: echo "Hello single line"
      - name: Multiline literal
        run: |
          echo "Starting multiline script"
          npm run build
          echo "Finished build"
      - name: Multiline folded
        run: >
          echo "Folded script line"
          && exit 0
`;

// 6. Environment mappings
export const ENV_MAPPINGS_WORKFLOW = `name: Env Mappings
on: push
env:
  GLOBAL_VAR: "global-value"
  API_URL: "https://api.example.com"
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      JOB_VAR: "job-value"
    steps:
      - name: Run with step env
        run: echo "$STEP_VAR"
        env:
          STEP_VAR: "step-value"
          SECRET_REF: "ref"
`;

// 7. Valid anchors and aliases
export const VALID_ANCHORS_AND_ALIASES_WORKFLOW = `name: Anchors and Aliases
on: push

anchors:
  shared_env: &shared_env
    NODE_ENV: production
    REGION: us-east-1

jobs:
  job_a:
    runs-on: ubuntu-latest
    env: *shared_env
    steps:
      - run: echo "job a"
  job_b:
    runs-on: ubuntu-latest
    env: *shared_env
    steps:
      - run: echo "job b"
`;

// 8. Aliased step sequences
export const ALIASED_STEPS_WORKFLOW = `name: Aliased Steps
on: push

shared_steps: &common_steps
  - name: Checkout
    uses: actions/checkout@v4
  - name: Setup Node
    uses: actions/setup-node@v4
    with:
      node-version: '20'

jobs:
  build:
    runs-on: ubuntu-latest
    steps: *common_steps
  test:
    runs-on: ubuntu-latest
    steps: *common_steps
`;

// 9. Aliased job or permission mappings
export const ALIASED_JOB_OR_PERMS_WORKFLOW = `name: Aliased Job and Perms
on: push

anchors:
  ro_perms: &ro_perms
    contents: read
    pull-requests: read
  job_template: &job_template
    runs-on: ubuntu-latest
    permissions: *ro_perms
    steps:
      - run: echo "template"

jobs:
  alpha: *job_template
  beta:
    runs-on: ubuntu-latest
    permissions: *ro_perms
    steps:
      - run: echo "beta"
`;

// 10. Merge-key mappings and merge sequences
export const MERGE_KEY_MAPPINGS_AND_SEQUENCES_WORKFLOW = `name: Merge Keys
on: push

base_job1: &base_job1
  runs-on: ubuntu-latest
  env:
    BUILD_TYPE: release

base_job2: &base_job2
  timeout-minutes: 15

jobs:
  direct_merge:
    <<: *base_job1
    steps:
      - run: echo "single merge"

  sequence_merge:
    <<: [*base_job1, *base_job2]
    steps:
      - run: echo "sequence merge"
`;

// 11. Overridden merged keys
export const OVERRIDDEN_MERGED_KEYS_WORKFLOW = `name: Overridden Keys
on: push

base_job: &base_job
  runs-on: ubuntu-latest
  timeout-minutes: 30
  env:
    TARGET: x86_64

jobs:
  override_job:
    <<: *base_job
    runs-on: macos-latest
    timeout-minutes: 10
    steps:
      - run: echo "overridden"
`;

// 12. Undefined aliases (dangling alias)
export const UNDEFINED_ALIAS_WORKFLOW = `name: Undefined Alias
on: push
jobs:
  broken:
    runs-on: ubuntu-latest
    steps: *non_existent_steps
`;

// 13. Cyclic aliases
// 13a. Self-referential merge cycle
export const CYCLIC_ALIAS_SELF_MERGE_WORKFLOW = `name: Cyclic Alias
on: push
jobs:
  cycle_job: &self_ref
    runs-on: ubuntu-latest
    <<: *self_ref
    steps:
      - run: echo "cycle"
`;

// 13b. Mutual cyclic alias
export const CYCLIC_ALIAS_MUTUAL_WORKFLOW = `name: Mutual Cycle
on: push
anchors:
  node_a: &node_a
    next: &node_b
      cycle: *node_a
jobs:
  job1:
    runs-on: ubuntu-latest
    env: *node_a
    steps:
      - run: echo "mutual cycle"
`;

// 13c. Cyclic sequence
export const CYCLIC_ALIAS_SEQUENCE_WORKFLOW = `name: Cyclic Sequence
on: push
anchors:
  seq: &seq_anchor
    - *seq_anchor
jobs:
  job1:
    runs-on: ubuntu-latest
    steps: *seq_anchor
`;

// 14. Deeply nested YAML beyond depth bound (15)
export function createDeeplyNestedWorkflow(depth = 18): string {
  let content = `name: Deep Nesting
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "deep"
        with:
`;
  let indent = '          ';
  for (let i = 0; i < depth; i++) {
    content += `${indent}level_${i}:\n`;
    indent += '  ';
  }
  content += `${indent}leaf: "value"\n`;
  return content;
}

// 15. Documents exceeding node/pair budget (2,000)
export function createNodeBudgetExceededWorkflow(stepCount = 1100): string {
  let content = `name: High Node Count
on: push
jobs:
  heavy:
    runs-on: ubuntu-latest
    steps:
`;
  for (let i = 0; i < stepCount; i++) {
    content += `      - id: step_${i}\n        run: echo "${i}"\n`;
  }
  return content;
}

// 16. More than 200 expressions
export function createExpressionLimitExceededWorkflow(exprCount = 205): string {
  let content = `name: High Expression Count
on: push
jobs:
  expr_heavy:
    runs-on: ubuntu-latest
    steps:
`;
  for (let i = 0; i < exprCount; i++) {
    content += `      - run: echo "\${{ github.actor_${i} }}"\n`;
  }
  return content;
}

// 17. Malformed YAML
export const MALFORMED_YAML_WORKFLOW = `name: Malformed
on: [push,
jobs:
  broken:
    runs-on: ubuntu-latest
`;

// 18. Non-mapping root
export const NON_MAPPING_ROOT_WORKFLOW = `- name: Step 1
  run: echo "not a map at root"
- name: Step 2
  run: echo "invalid root"
`;

// 19. Oversized input (> 256 KiB)
export function createOversizedWorkflow(sizeBytes = 256 * 1024 + 1024): string {
  const header = `name: Oversized Workflow\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "`;
  const footer = `"\n`;
  const padSize = sizeBytes - header.length - footer.length;
  return header + 'A'.repeat(Math.max(padSize, 0)) + footer;
}

// 19b. Content at exact byte limit (256 KiB = 262,144 bytes)
export function createExactSizeWorkflow(targetBytes = 256 * 1024): string {
  const header = `name: Exact Size Workflow\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "`;
  const footer = `"\n`;
  const padSize = targetBytes - header.length - footer.length;
  return header + 'A'.repeat(Math.max(padSize, 0)) + footer;
}

// 19c. Content where character count is within limit, but multibyte UTF-8 byte length exceeds limit
export function createMultibyteOversizedWorkflow(): string {
  // Each '🚀' is 2 UTF-16 code units (char length 2), but 4 bytes in UTF-8
  // 70,000 emoji = 140,000 chars (< 262,144 chars), but 280,000 bytes (> 262,144 bytes)
  const header = `name: Multibyte Oversized\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "`;
  const footer = `"\n`;
  return header + '🚀'.repeat(70000) + footer;
}

// 20. Unsupported merge key value (scalar in <<)
export const UNSUPPORTED_MERGE_VALUE_WORKFLOW = `name: Unsupported Merge
on: push
jobs:
  invalid_merge:
    <<: "invalid_scalar_merge_value"
    runs-on: ubuntu-latest
    steps:
      - run: echo "invalid merge"
`;

// ============================================================================
// Phase 2.1B.2 Deterministic Static Security Rule Fixtures
// ============================================================================

// ----------------------------------------------------------------------------
// Section 21: WFL-01 Permissions Analysis Fixtures
// ----------------------------------------------------------------------------

export const PERMISSIONS_MISSING_WORKFLOW = `name: Permissions Missing
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "no permissions declared"
`;

export const PERMISSIONS_WRITE_ALL_WORKFLOW = `name: Permissions Write All
on: push
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "write-all at workflow level"
`;

export const PERMISSIONS_READ_ALL_WORKFLOW = `name: Permissions Read All
on: push
permissions: read-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "read-all at workflow level"
`;

export const PERMISSIONS_EMPTY_WORKFLOW = `name: Permissions Empty Mapping
on: push
permissions: {}
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "empty permissions mapping"
`;

export const PERMISSIONS_GRANULAR_WORKFLOW = `name: Permissions Granular
on: push
permissions:
  contents: read
  issues: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "granular read-only scopes"
`;

export const PERMISSIONS_JOB_OVERRIDE_WRITE_WORKFLOW = `name: Permissions Job Override Write
on: push
permissions: read-all
jobs:
  safe_job:
    runs-on: ubuntu-latest
    steps:
      - run: echo "safe inherited job"
  elevated_job:
    runs-on: ubuntu-latest
    permissions: write-all
    steps:
      - run: echo "elevated job with write-all"
`;

export const PERMISSIONS_ALL_JOBS_OVERRIDE_WORKFLOW = `name: Permissions Top Level Write Overridden
on: push
permissions: write-all
jobs:
  job_a:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - run: echo "job a overridden to read"
  job_b:
    runs-on: ubuntu-latest
    permissions: read-all
    steps:
      - run: echo "job b overridden to read-all"
`;

export const PERMISSIONS_UNKNOWN_SCOPE_WORKFLOW = `name: Permissions Unknown Scope
on: push
permissions:
  super-admin: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "unknown scope"
`;

export const PERMISSIONS_ASYMMETRIC_INVALID_WORKFLOW = `name: Permissions Asymmetric Invalid
on: push
permissions:
  vulnerability-alerts: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "invalid asymmetric level"
`;

// ----------------------------------------------------------------------------
// Section 22: WFL-02 Action and Reusable-Workflow Reference Pinning Fixtures
// ----------------------------------------------------------------------------

export const PINNED_SHA_WORKFLOW = `name: Pinned SHA Actions
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
      - uses: actions/setup-node@2a70425a17de58a8a65f90ba04ceefec8e7b99c8
`;

export const MUTABLE_TAG_WORKFLOW = `name: Mutable Tag Actions
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;

export const MUTABLE_BRANCH_WORKFLOW = `name: Mutable Branch Actions
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
`;

export const SHORT_SHA_WORKFLOW = `name: Short SHA Actions
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf
`;

export const PINNED_REUSABLE_WORKFLOW = `name: Pinned Reusable Workflow
on: push
jobs:
  call_reusable:
    uses: octocat/example-repo/.github/workflows/reusable.yml@a81bbbf8298c0fa03ea29cdc473d45769f953675
`;

export const UNPINNED_REUSABLE_WORKFLOW = `name: Unpinned Reusable Workflow
on: push
jobs:
  call_reusable:
    uses: octocat/example-repo/.github/workflows/reusable.yml@v1
`;

export const LOCAL_ACTION_ONLY_WORKFLOW = `name: Local Action Only
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/custom-setup
`;

export const DOCKER_ACTION_WORKFLOW = `name: Docker Action
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: docker://alpine:3.18
`;

export const MALFORMED_ACTION_REF_WORKFLOW = `name: Malformed Action Ref
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout
`;

export const MIXED_ACTIONS_WORKFLOW = `name: Mixed Actions
on: push
jobs:
  job1:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
      - uses: actions/setup-node@v4
      - uses: ./.github/actions/local
  job2:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
`;

// ----------------------------------------------------------------------------
// Section 23: WFL-03 Script-Expression Injection Fixtures
// ----------------------------------------------------------------------------

export const SCRIPT_INJECTION_SINGLE_LINE_WORKFLOW = `name: Script Injection Single Line
on: issues
jobs:
  handle_issue:
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "Title was: \${{ github.event.issue.title }}"'
`;

export const SCRIPT_INJECTION_MULTILINE_WORKFLOW = `name: Script Injection Multiline
on: pull_request
jobs:
  check_pr:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "Starting check"
          BRANCH="\${{ github.head_ref }}"
          echo "Branch is $BRANCH"
`;

export const SCRIPT_INJECTION_QUOTED_WORKFLOW = `name: Script Injection Quoted
on: issue_comment
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - run: echo '\${{ github.event.comment.body }}'
`;

export const SCRIPT_INJECTION_ENV_INDIRECTION_WORKFLOW = `name: Script Injection Env Indirection
on: issues
jobs:
  safe_issue:
    runs-on: ubuntu-latest
    steps:
      - name: Safe Print
        env:
          ISSUE_TITLE: \${{ github.event.issue.title }}
          ISSUE_BODY: \${{ github.event.issue.body }}
        run: |
          echo "Title: $ISSUE_TITLE"
          echo "Body: $ISSUE_BODY"
`;

export const SCRIPT_INJECTION_SAFE_EXPRESSIONS_WORKFLOW = `name: Script Injection Safe Expressions
on: push
jobs:
  safe_exprs:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Commit SHA \${{ github.sha }} Run \${{ github.run_id }}"
      - run: echo "Runner OS \${{ runner.os }} Matrix \${{ matrix.node }}"
`;

export const SCRIPT_INJECTION_MULTIPLE_STEPS_WORKFLOW = `name: Multiple Injections
on: pull_request
jobs:
  job1:
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "PR Title: \${{ github.event.pull_request.title }}"'
      - run: 'echo "PR Body: \${{ github.event.pull_request.body }}"'
  job2:
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "Head ref: \${{ github.head_ref }}"'
`;

export const NO_RUN_STEPS_WORKFLOW = `name: No Run Steps
on: push
jobs:
  checkout_only:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
`;

// ----------------------------------------------------------------------------
// Section 24: WFL-04 Risky pull_request_target Patterns Fixtures
// ----------------------------------------------------------------------------

export const PRT_HARMLESS_LABELER_WORKFLOW = `name: Pull Request Target Harmless Labeler
on:
  pull_request_target:
    types: [opened, labeled]
jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/labeler@v5
`;

export const PRT_BASE_CHECKOUT_WORKFLOW = `name: Pull Request Target Base Checkout
on:
  pull_request_target:
jobs:
  inspect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
      - run: npm test
`;

export const PRT_UNTRUSTED_CHECKOUT_WITH_RUN_WORKFLOW = `name: Pull Request Target Untrusted Checkout With Run
on:
  pull_request_target:
jobs:
  test_pr:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR Head
        uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - name: Run Tests
        run: npm test
`;

export const PRT_FORK_REPO_CHECKOUT_WITH_RUN_WORKFLOW = `name: Pull Request Target Fork Repo Checkout With Run
on:
  pull_request_target:
jobs:
  build_fork:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Fork
        uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
        with:
          repository: \${{ github.event.pull_request.head.repo.full_name }}
          ref: \${{ github.event.pull_request.head.ref }}
      - name: Build
        run: make build
`;

export const PRT_UNTRUSTED_CHECKOUT_WITH_LOCAL_ACTION_WORKFLOW = `name: Pull Request Target Untrusted Checkout With Local Action
on:
  pull_request_target:
jobs:
  custom_action:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
        with:
          ref: \${{ github.head_ref }}
      - uses: ./.github/actions/custom-test
`;

export const PRT_UNTRUSTED_CHECKOUT_WITHOUT_EXECUTION_WORKFLOW = `name: Pull Request Target Checkout Without Execution
on:
  pull_request_target:
jobs:
  diff_only:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - uses: actions/upload-artifact@v4
        with:
          name: pr-snapshot
          path: .
`;

export const PRT_UNSAFE_CHECKOUT_OPT_OUT_WORKFLOW = `name: Pull Request Target Explicit Opt Out
on:
  pull_request_target:
jobs:
  opt_out_job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          allow-unsafe-pr-checkout: true
      - run: npm test
`;

