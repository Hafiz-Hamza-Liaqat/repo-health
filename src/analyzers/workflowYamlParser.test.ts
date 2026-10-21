import { describe, it, expect } from 'vitest';
import {
  parseWorkflowYaml,
  getUtf8ByteLength,
  GITHUB_ACTIONS_PERMISSION_SCOPES,
  WORKFLOW_PARSER_DEFAULTS,
} from './workflowYamlParser';
import {
  MINIMAL_VALID_WORKFLOW,
  MULTI_JOB_MULTI_STEP_WORKFLOW,
  WORKFLOW_AND_JOB_PERMISSIONS_WORKFLOW,
  USES_AND_REUSABLE_WORKFLOW,
  RUN_SCRIPTS_WORKFLOW,
  ENV_MAPPINGS_WORKFLOW,
  VALID_ANCHORS_AND_ALIASES_WORKFLOW,
  ALIASED_STEPS_WORKFLOW,
  ALIASED_JOB_OR_PERMS_WORKFLOW,
  MERGE_KEY_MAPPINGS_AND_SEQUENCES_WORKFLOW,
  OVERRIDDEN_MERGED_KEYS_WORKFLOW,
  UNDEFINED_ALIAS_WORKFLOW,
  CYCLIC_ALIAS_SELF_MERGE_WORKFLOW,
  CYCLIC_ALIAS_MUTUAL_WORKFLOW,
  CYCLIC_ALIAS_SEQUENCE_WORKFLOW,
  createDeeplyNestedWorkflow,
  createNodeBudgetExceededWorkflow,
  createExpressionLimitExceededWorkflow,
  MALFORMED_YAML_WORKFLOW,
  NON_MAPPING_ROOT_WORKFLOW,
  createOversizedWorkflow,
  createExactSizeWorkflow,
  createMultibyteOversizedWorkflow,
  UNSUPPORTED_MERGE_VALUE_WORKFLOW,
} from '../test/fixtures/workflowFixtures';

describe('Phase 2.1B.1: Safe Workflow YAML Parser & Extraction Engine', () => {
  // ==========================================================================
  // 1. Structural Extraction on Valid Workflows
  // ==========================================================================
  describe('1. Structural Extraction on Valid Workflows', () => {
    it('should parse minimal valid workflow successfully', () => {
      const result = parseWorkflowYaml(MINIMAL_VALID_WORKFLOW, '.github/workflows/minimal.yml');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.workflow.name).toBe('Minimal');
      expect(result.workflow.filePath).toBe('.github/workflows/minimal.yml');
      expect(result.workflow.triggers.events).toEqual(['push']);
      expect(result.workflow.triggers.line).toBe(2);

      const job = result.workflow.jobs['build'];
      expect(job).toBeDefined();
      expect(job.id).toBe('build');
      expect(job.runsOn).toBe('ubuntu-latest');
      expect(job.steps).toHaveLength(1);
      expect(job.steps[0].run).toBe('echo "hello world"');
      expect(job.steps[0].index).toBe(0);
      expect(job.steps[0].line).toBe(7);
    });

    it('should extract multiple jobs, steps, ids, uses, run, with, and env', () => {
      const result = parseWorkflowYaml(MULTI_JOB_MULTI_STEP_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.workflow.name).toBe('CI Pipeline');
      expect(result.workflow.triggers.events).toEqual(['push', 'pull_request']);

      // Lint job
      const lintJob = result.workflow.jobs['lint'];
      expect(lintJob).toBeDefined();
      expect(lintJob.name).toBe('Lint Code');
      expect(lintJob.steps).toHaveLength(2);
      expect(lintJob.steps[0].id).toBe('checkout');
      expect(lintJob.steps[0].name).toBe('Checkout Repo');
      expect(lintJob.steps[0].uses).toBe('actions/checkout@v4');
      expect(lintJob.steps[1].id).toBe('run-linter');
      expect(lintJob.steps[1].run).toBe('npm run lint');

      // Test job
      const testJob = result.workflow.jobs['test'];
      expect(testJob).toBeDefined();
      expect(testJob.name).toBe('Run Tests');
      expect(testJob.steps).toHaveLength(3);
      expect(testJob.steps[0].uses).toBe('actions/checkout@v4');
      expect(testJob.steps[1].name).toBe('Setup Node');
      expect(testJob.steps[1].uses).toBe('actions/setup-node@v4');
      expect(testJob.steps[1].with).toEqual({ 'node-version': '20', cache: 'npm' });
      expect(testJob.steps[1].env).toBeUndefined();
      expect(testJob.steps[2].name).toBe('Vitest');
      expect(testJob.steps[2].run).toBe('npm test');
      expect(testJob.steps[2].env).toEqual({ CI: 'true', NODE_ENV: 'test' });
    });

    it('should extract single-line and multiline block scalars accurately', () => {
      const result = parseWorkflowYaml(RUN_SCRIPTS_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const job = result.workflow.jobs['scripts'];
      expect(job.steps).toHaveLength(3);

      expect(job.steps[0].run).toBe('echo "Hello single line"');
      expect(job.steps[1].run).toContain('Starting multiline script');
      expect(job.steps[1].run).toContain('npm run build');
      expect(job.steps[2].run).toContain('Folded script line');
    });

    it('should extract top-level, job-level, and step-level env blocks', () => {
      const result = parseWorkflowYaml(ENV_MAPPINGS_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.workflow.env).toEqual({
        GLOBAL_VAR: 'global-value',
        API_URL: 'https://api.example.com',
      });

      const job = result.workflow.jobs['build'];
      expect(job.env).toEqual({ JOB_VAR: 'job-value' });
      expect(job.steps[0].env).toEqual({
        STEP_VAR: 'step-value',
        SECRET_REF: 'ref',
      });
    });

    it('should extract uses actions and reusable workflow calls', () => {
      const result = parseWorkflowYaml(USES_AND_REUSABLE_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const reusableJob = result.workflow.jobs['reusable_call'];
      expect(reusableJob).toBeDefined();
      expect(reusableJob.uses).toBe(
        'octocat/example-repo/.github/workflows/reusable.yml@v1'
      );
      expect(reusableJob.with).toEqual({ environment: 'production' });
      expect(reusableJob.secrets).toBe('inherit');
    });
  });

  // ==========================================================================
  // 2. Permissions Extraction (Workflow & Job Levels)
  // ==========================================================================
  describe('2. Permissions Extraction (Workflow & Job Levels)', () => {
    it('should model workflow-level and all job-level permission configurations', () => {
      const result = parseWorkflowYaml(WORKFLOW_AND_JOB_PERMISSIONS_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Workflow-level permissions
      expect(result.workflow.permissions).toBeDefined();
      expect(result.workflow.permissions?.mode).toBe('granular');
      expect(result.workflow.permissions?.scopes).toEqual({
        contents: 'read',
        issues: 'read',
      });

      // read-all job
      const readAllJob = result.workflow.jobs['read_all_job'];
      expect(readAllJob.permissions?.mode).toBe('read-all');

      // write-all job
      const writeAllJob = result.workflow.jobs['write_all_job'];
      expect(writeAllJob.permissions?.mode).toBe('write-all');

      // empty permissions job: permissions: {}
      const emptyPermsJob = result.workflow.jobs['empty_perms_job'];
      expect(emptyPermsJob.permissions?.mode).toBe('empty');
      expect(emptyPermsJob.permissions?.scopes).toEqual({});

      // granular permissions job
      const granularJob = result.workflow.jobs['granular_perms_job'];
      expect(granularJob.permissions?.mode).toBe('granular');
      expect(granularJob.permissions?.scopes).toEqual({
        'id-token': 'write',
        contents: 'write',
        'pull-requests': 'write',
      });

      // inherited job (no permissions key)
      const inheritedJob = result.workflow.jobs['inherited_perms_job'];
      expect(inheritedJob.permissions).toBeUndefined();
    });
  });

  // ==========================================================================
  // 3. YAML Anchors & Aliases Handling
  // ==========================================================================
  describe('3. YAML Anchors & Aliases Handling', () => {
    it('should resolve shared environment mappings via aliases', () => {
      const result = parseWorkflowYaml(VALID_ANCHORS_AND_ALIASES_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const jobA = result.workflow.jobs['job_a'];
      const jobB = result.workflow.jobs['job_b'];

      expect(jobA.env).toEqual({
        NODE_ENV: 'production',
        REGION: 'us-east-1',
      });
      expect(jobB.env).toEqual({
        NODE_ENV: 'production',
        REGION: 'us-east-1',
      });
    });

    it('should resolve aliased step sequences across multiple jobs', () => {
      const result = parseWorkflowYaml(ALIASED_STEPS_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const buildJob = result.workflow.jobs['build'];
      const testJob = result.workflow.jobs['test'];

      expect(buildJob.steps).toHaveLength(2);
      expect(testJob.steps).toHaveLength(2);

      expect(buildJob.steps[0].uses).toBe('actions/checkout@v4');
      expect(buildJob.steps[1].uses).toBe('actions/setup-node@v4');

      expect(testJob.steps[0].uses).toBe('actions/checkout@v4');
      expect(testJob.steps[1].uses).toBe('actions/setup-node@v4');
    });

    it('should resolve aliased job templates and permissions mappings', () => {
      const result = parseWorkflowYaml(ALIASED_JOB_OR_PERMS_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const alpha = result.workflow.jobs['alpha'];
      const beta = result.workflow.jobs['beta'];

      expect(alpha.runsOn).toBe('ubuntu-latest');
      expect(alpha.permissions?.mode).toBe('granular');
      expect(alpha.permissions?.scopes).toEqual({
        contents: 'read',
        'pull-requests': 'read',
      });

      expect(beta.permissions?.mode).toBe('granular');
      expect(beta.permissions?.scopes).toEqual({
        contents: 'read',
        'pull-requests': 'read',
      });
    });
  });

  // ==========================================================================
  // 4. Merge Keys & Merge Sequences (<<)
  // ==========================================================================
  describe('4. Merge Keys & Merge Sequences (<<)', () => {
    it('should resolve single merge mapping and sequence of merged mappings', () => {
      const result = parseWorkflowYaml(MERGE_KEY_MAPPINGS_AND_SEQUENCES_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const direct = result.workflow.jobs['direct_merge'];
      expect(direct.runsOn).toBe('ubuntu-latest');
      expect(direct.env).toEqual({ BUILD_TYPE: 'release' });
      expect(direct.steps[0].run).toBe('echo "single merge"');

      const seq = result.workflow.jobs['sequence_merge'];
      expect(seq.runsOn).toBe('ubuntu-latest');
      expect(seq.env).toEqual({ BUILD_TYPE: 'release' });
      expect(seq.steps[0].run).toBe('echo "sequence merge"');
    });

    it('should respect YAML merge precedence: direct keys override merged keys', () => {
      const result = parseWorkflowYaml(OVERRIDDEN_MERGED_KEYS_WORKFLOW);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const job = result.workflow.jobs['override_job'];
      // runs-on is overridden from ubuntu-latest to macos-latest
      expect(job.runsOn).toBe('macos-latest');
      // non-overridden env key is preserved
      expect(job.env).toEqual({ TARGET: 'x86_64' });
    });
  });

  // ==========================================================================
  // 5. Error Categories & Security Bounds
  // ==========================================================================
  describe('5. Error Categories & Security Bounds', () => {
    it('should reject oversized input (> 256 KiB) with FILE_OVERSIZED before parsing', () => {
      const oversized = createOversizedWorkflow();
      const result = parseWorkflowYaml(oversized);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('FILE_OVERSIZED');
      expect(result.error.message).toContain('256 KiB');
      expect(result.stats.nodeCount).toBe(0);
    });

    it('should report YAML_SYNTAX_ERROR with numeric line on malformed syntax', () => {
      const result = parseWorkflowYaml(MALFORMED_YAML_WORKFLOW);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_SYNTAX_ERROR');
      expect(typeof result.error.line).toBe('number');
      expect(result.error.message).toBe('YAML syntax error encountered during parsing');
    });

    it('should report YAML_SHAPE_ERROR when root is not a mapping', () => {
      const result = parseWorkflowYaml(NON_MAPPING_ROOT_WORKFLOW);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_SHAPE_ERROR');
      expect(result.error.message).toBe('Workflow root must be a YAML mapping');
      expect(result.error.line).toBe(1);
    });

    it('should report YAML_SHAPE_ERROR when jobs field is missing', () => {
      const result = parseWorkflowYaml('name: No Jobs\non: push\n');

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_SHAPE_ERROR');
      expect(result.error.message).toBe("Workflow must contain a 'jobs' mapping");
    });

    it('should report YAML_SHAPE_ERROR when job steps is not a sequence', () => {
      const yaml = `name: Invalid Steps
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps: "invalid-string-steps"
`;
      const result = parseWorkflowYaml(yaml);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_SHAPE_ERROR');
      expect(result.error.message).toBe("Job 'steps' must be a sequence");
      expect(typeof result.error.line).toBe('number');
    });

    it('should report YAML_ALIAS_DANGLING on undefined alias reference (never convert to empty)', () => {
      const result = parseWorkflowYaml(UNDEFINED_ALIAS_WORKFLOW);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_ALIAS_DANGLING');
      expect(result.error.message).toBe('Unresolved or undefined YAML alias reference');
      expect(typeof result.error.line).toBe('number');
    });

    it('should detect self-referential merge cycle with YAML_ALIAS_CYCLE', () => {
      const result = parseWorkflowYaml(CYCLIC_ALIAS_SELF_MERGE_WORKFLOW);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_ALIAS_CYCLE');
      expect(result.error.message).toBe('Cyclic YAML alias detected in workflow structure');
      expect(typeof result.error.line).toBe('number');
    });

    it('should detect mutual cyclic aliases with YAML_ALIAS_CYCLE', () => {
      const result = parseWorkflowYaml(CYCLIC_ALIAS_MUTUAL_WORKFLOW);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_ALIAS_CYCLE');
      expect(result.error.message).toBe('Cyclic YAML alias detected in workflow structure');
    });

    it('should detect cyclic sequences with YAML_ALIAS_CYCLE', () => {
      const result = parseWorkflowYaml(CYCLIC_ALIAS_SEQUENCE_WORKFLOW);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_ALIAS_CYCLE');
      expect(result.error.message).toBe('Cyclic YAML alias detected in workflow structure');
    });

    it('should report YAML_UNRESOLVED_MERGE on invalid scalar merge key', () => {
      const result = parseWorkflowYaml(UNSUPPORTED_MERGE_VALUE_WORKFLOW);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_UNRESOLVED_MERGE');
      expect(result.error.message).toContain('Unsupported merge key value');
    });

    it('should enforce traversal nesting depth limit (depth > 15) with YAML_TRAVERSAL_LIMIT', () => {
      const deepYaml = createDeeplyNestedWorkflow(18);
      const result = parseWorkflowYaml(deepYaml);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_TRAVERSAL_LIMIT');
      expect(result.error.message).toContain('nesting depth');
      expect(result.stats.maxDepthReached).toBeGreaterThan(15);
    });

    it('should enforce node/pair budget limit (nodes > 2000) with YAML_TRAVERSAL_LIMIT', () => {
      const heavyYaml = createNodeBudgetExceededWorkflow(1100);
      const result = parseWorkflowYaml(heavyYaml);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_TRAVERSAL_LIMIT');
      expect(result.error.message).toContain('node/pair budget');
      expect(result.stats.nodeCount).toBeGreaterThanOrEqual(2000);
    });

    it('should enforce expression limit (expressions > 200) with YAML_EXPRESSION_LIMIT', () => {
      const exprYaml = createExpressionLimitExceededWorkflow(205);
      const result = parseWorkflowYaml(exprYaml);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('YAML_EXPRESSION_LIMIT');
      expect(result.error.message).toContain('expression count');
      expect(result.stats.expressionCount).toBeGreaterThanOrEqual(201);
    });
  });

  // ==========================================================================
  // 6. Sequential Containment & State Isolation
  // ==========================================================================
  describe('6. Sequential Containment & State Isolation', () => {
    it('should maintain per-parse isolation: valid parse succeeds cleanly immediately after failure', () => {
      // 1. Run a failing cyclic alias bomb
      const fail1 = parseWorkflowYaml(CYCLIC_ALIAS_SELF_MERGE_WORKFLOW);
      expect(fail1.success).toBe(false);

      // 2. Run a valid workflow — must succeed with clean stats
      const pass1 = parseWorkflowYaml(MINIMAL_VALID_WORKFLOW);
      expect(pass1.success).toBe(true);
      if (pass1.success) {
        expect(pass1.stats.nodeCount).toBeLessThan(100);
        expect(pass1.stats.maxDepthReached).toBeLessThan(10);
      }

      // 3. Run a failing traversal limit document
      const fail2 = parseWorkflowYaml(createDeeplyNestedWorkflow(20));
      expect(fail2.success).toBe(false);

      // 4. Run another valid workflow — must succeed cleanly
      const pass2 = parseWorkflowYaml(MULTI_JOB_MULTI_STEP_WORKFLOW);
      expect(pass2.success).toBe(true);
      if (pass2.success) {
        expect(pass2.workflow.jobs['lint']).toBeDefined();
        expect(pass2.workflow.jobs['test']).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // 7. Reference Integrity & Defaults
  // ==========================================================================
  describe('7. Reference Integrity & Defaults', () => {
    it('should define accurate GitHub Actions permission scope constants', () => {
      // Verify asymmetric scopes
      expect(GITHUB_ACTIONS_PERMISSION_SCOPES['copilot-requests']).toEqual(['write', 'none']);
      expect(GITHUB_ACTIONS_PERMISSION_SCOPES['id-token']).toEqual(['write', 'none']);
      expect(GITHUB_ACTIONS_PERMISSION_SCOPES['vulnerability-alerts']).toEqual(['read', 'none']);

      // Verify symmetric standard scopes
      expect(GITHUB_ACTIONS_PERMISSION_SCOPES['contents']).toEqual(['read', 'write', 'none']);
      expect(GITHUB_ACTIONS_PERMISSION_SCOPES['pull-requests']).toEqual(['read', 'write', 'none']);
      expect(GITHUB_ACTIONS_PERMISSION_SCOPES['actions']).toEqual(['read', 'write', 'none']);
    });

    it('should export correct default limits matching architectural specification', () => {
      expect(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES).toBe(256 * 1024);
      expect(WORKFLOW_PARSER_DEFAULTS.MAX_DEPTH).toBe(15);
      expect(WORKFLOW_PARSER_DEFAULTS.MAX_NODE_BUDGET).toBe(2000);
      expect(WORKFLOW_PARSER_DEFAULTS.MAX_EXPRESSIONS).toBe(200);
    });
  });

  // ==========================================================================
  // 8. Browser Portability & UTF-8 Byte Measurement
  // ==========================================================================
  describe('8. Browser Portability & UTF-8 Byte Measurement', () => {
    it('should parse valid workflows when globalThis.Buffer is absent (browser environment)', () => {
      const originalBuffer = globalThis.Buffer;
      try {
        // Simulating browser environment without Node.js Buffer
        delete (globalThis as Record<string, unknown>).Buffer;
        expect(typeof globalThis.Buffer).toBe('undefined');

        const result = parseWorkflowYaml(MINIMAL_VALID_WORKFLOW);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.workflow.name).toBe('Minimal');
        }

        // Verify oversized check also works without Buffer
        const oversized = createOversizedWorkflow();
        const oversizedResult = parseWorkflowYaml(oversized);
        expect(oversizedResult.success).toBe(false);
        if (!oversizedResult.success) {
          expect(oversizedResult.error.code).toBe('FILE_OVERSIZED');
        }
      } finally {
        globalThis.Buffer = originalBuffer;
        expect(globalThis.Buffer).toBeDefined();
      }
    });

    it('should measure UTF-8 byte length accurately for ASCII, multibyte characters, and emoji', () => {
      // 1. ASCII: 1 byte per character
      const ascii = 'hello world';
      expect(getUtf8ByteLength(ascii)).toBe(11);
      expect(ascii.length).toBe(11);

      // 2. Multibyte 2-byte (Latin-1 Supplement / Accented characters)
      const latin = 'café';
      expect(getUtf8ByteLength(latin)).toBe(5); // 'é' is 2 bytes (0xc3, 0xa9)
      expect(latin.length).toBe(4);

      // 3. Multibyte 3-byte (CJK / Japanese Hiragana)
      const hiragana = 'こんにちは';
      expect(getUtf8ByteLength(hiragana)).toBe(15); // 5 chars * 3 bytes
      expect(hiragana.length).toBe(5);

      // 4. Multibyte 4-byte (Emoji / UTF-16 surrogate pairs)
      const emoji = '🚀🎉';
      expect(getUtf8ByteLength(emoji)).toBe(8); // 2 emoji * 4 bytes
      expect(emoji.length).toBe(4); // 2 surrogate pairs = 4 code units

      // 5. Invariant: UTF-8 byte length is always >= UTF-16 code units (content.length)
      const testStrings = [ascii, latin, hiragana, emoji, 'CI/CD pipeline with 🚀 test & café'];
      for (const s of testStrings) {
        expect(getUtf8ByteLength(s)).toBeGreaterThanOrEqual(s.length);
      }
    });

    it('should accept valid YAML content at the exact permitted byte limit (256 KiB = 262,144 bytes)', () => {
      const exactContent = createExactSizeWorkflow(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES);
      const exactByteLength = getUtf8ByteLength(exactContent);

      expect(exactByteLength).toBe(256 * 1024);
      expect(exactByteLength).toBe(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES);

      const result = parseWorkflowYaml(exactContent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.name).toBe('Exact Size Workflow');
        expect(result.workflow.jobs['build']).toBeDefined();
      }
    });

    it('should reject content exceeding 256 KiB before YAML parsing', () => {
      // a. Content exceeding limit by exactly 1 byte (262,145 bytes)
      const oneByteOver = createExactSizeWorkflow(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES + 1);
      expect(getUtf8ByteLength(oneByteOver)).toBe(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES + 1);

      const result1 = parseWorkflowYaml(oneByteOver);
      expect(result1.success).toBe(false);
      if (!result1.success) {
        expect(result1.error.code).toBe('FILE_OVERSIZED');
        expect(result1.error.message).toContain('256 KiB');
      }

      // b. Multibyte input where character length <= 256,144, but UTF-8 byte length > 256 KiB
      const multibyteOversized = createMultibyteOversizedWorkflow();
      expect(multibyteOversized.length).toBeLessThanOrEqual(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES);
      expect(getUtf8ByteLength(multibyteOversized)).toBeGreaterThan(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES);

      const result2 = parseWorkflowYaml(multibyteOversized);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.code).toBe('FILE_OVERSIZED');
        expect(result2.error.message).toContain('256 KiB');
      }

      // c. Fast early-exit: content.length > 256 KiB
      const charCountOversized = createOversizedWorkflow(260 * 1024);
      expect(charCountOversized.length).toBeGreaterThan(WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES);

      const result3 = parseWorkflowYaml(charCountOversized);
      expect(result3.success).toBe(false);
      if (!result3.success) {
        expect(result3.error.code).toBe('FILE_OVERSIZED');
        expect(result3.error.message).toContain('256 KiB');
      }
    });
  });
});
