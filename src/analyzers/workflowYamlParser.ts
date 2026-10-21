/**
 * Safe GitHub Actions Workflow YAML Parser (Phase 2.1B.1)
 *
 * Provides a bounded, structural, inert AST extraction layer for GitHub Actions workflow files.
 * Uses official `yaml` v2 APIs with YAML 1.2 Core schema and merge keys enabled.
 *
 * Security & Reliability Guarantees:
 * - Pre-parse file size limit: 256 KiB
 * - Traversal nesting depth limit: 15
 * - Traversal node / pair budget: 2,000
 * - Expression count limit: 200
 * - Cycle-aware alias resolution with active traversal tracking
 * - Dangling alias detection (never converted to empty mappings)
 * - Sanitized, deterministic error categories (no raw stack traces or source leakage)
 * - Purely structural: never executes shell scripts, expressions, or commands
 */

import * as YAML from 'yaml';

// ============================================================================
// Error Codes & Interfaces
// ============================================================================

export type WorkflowParserErrorCode =
  | 'FILE_OVERSIZED'
  | 'YAML_SYNTAX_ERROR'
  | 'YAML_SHAPE_ERROR'
  | 'YAML_ALIAS_DANGLING'
  | 'YAML_ALIAS_CYCLE'
  | 'YAML_UNRESOLVED_MERGE'
  | 'YAML_TRAVERSAL_LIMIT'
  | 'YAML_EXPRESSION_LIMIT';

export interface WorkflowParseError {
  code: WorkflowParserErrorCode;
  message: string;
  line?: number;
  column?: number;
}

// ============================================================================
// Parsed Workflow Structure Types
// ============================================================================

export type PermissionScopeMode =
  | 'read-all'
  | 'write-all'
  | 'granular'
  | 'empty'
  | 'unknown';

export interface ParsedPermissions {
  mode: PermissionScopeMode;
  scopes?: Record<string, string>;
  raw?: unknown;
  line?: number;
  column?: number;
}

export interface ParsedWorkflowTriggers {
  events: string[];
  raw?: unknown;
  line?: number;
  column?: number;
}

export interface ParsedWorkflowStep {
  index: number;
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  line?: number;
  column?: number;
}

export interface ParsedWorkflowJob {
  id: string;
  name?: string;
  permissions?: ParsedPermissions;
  runsOn?: string | string[];
  steps: ParsedWorkflowStep[];
  uses?: string;
  with?: Record<string, unknown>;
  secrets?: Record<string, unknown> | string;
  env?: Record<string, string>;
  line?: number;
  column?: number;
}

export interface ParsedWorkflowStructure {
  name?: string;
  filePath?: string;
  triggers: ParsedWorkflowTriggers;
  permissions?: ParsedPermissions;
  jobs: Record<string, ParsedWorkflowJob>;
  env?: Record<string, string>;
  lineCount: number;
}

export interface WorkflowParseStats {
  nodeCount: number;
  maxDepthReached: number;
  expressionCount: number;
}

export type WorkflowParseResult =
  | {
      success: true;
      workflow: ParsedWorkflowStructure;
      error?: never;
      stats: WorkflowParseStats;
    }
  | {
      success: false;
      workflow?: never;
      error: WorkflowParseError;
      stats: WorkflowParseStats;
    };

// ============================================================================
// Parser Configuration & Limits
// ============================================================================

export interface WorkflowParserOptions {
  filePath?: string;
  maxSizeBytes?: number;
  maxDepth?: number;
  maxNodeBudget?: number;
  maxExpressions?: number;
}

export const WORKFLOW_PARSER_DEFAULTS = {
  MAX_SIZE_BYTES: 256 * 1024, // 256 KiB
  MAX_DEPTH: 15,
  MAX_NODE_BUDGET: 2000,
  MAX_EXPRESSIONS: 200,
} as const;

/**
 * Shared TextEncoder instance for browser-portable UTF-8 byte length calculation.
 */
const textEncoder = new TextEncoder();

/**
 * Calculates the exact UTF-8 byte length of a string in a browser-portable manner
 * using the standard Web TextEncoder API without any Node.js Buffer dependency.
 */
export function getUtf8ByteLength(str: string): number {
  return textEncoder.encode(str).length;
}

/**
 * Official GitHub Actions permission scopes and supported access levels.
 * Ref: GitHub Actions workflow syntax for permissions.
 */
export const GITHUB_ACTIONS_PERMISSION_SCOPES = {
  actions: ['read', 'write', 'none'],
  attestations: ['read', 'write', 'none'],
  checks: ['read', 'write', 'none'],
  contents: ['read', 'write', 'none'],
  deployments: ['read', 'write', 'none'],
  discussions: ['read', 'write', 'none'],
  issues: ['read', 'write', 'none'],
  models: ['read', 'write', 'none'],
  packages: ['read', 'write', 'none'],
  pages: ['read', 'write', 'none'],
  'pull-requests': ['read', 'write', 'none'],
  'repository-projects': ['read', 'write', 'none'],
  'security-events': ['read', 'write', 'none'],
  statuses: ['read', 'write', 'none'],
  // Asymmetric scopes
  'copilot-requests': ['write', 'none'],
  'id-token': ['write', 'none'],
  'vulnerability-alerts': ['read', 'none'],
} as const;

// ============================================================================
// Internal AST Walker Implementation
// ============================================================================

class WalkError extends Error {
  constructor(public readonly parseError: WorkflowParseError) {
    super(parseError.message);
    this.name = 'WalkError';
  }
}

function getNodeLocation(
  node: unknown,
  lineCounter?: YAML.LineCounter
): { line?: number; column?: number } {
  if (!node || !lineCounter) return {};
  let range: [number, number, number?] | undefined;

  if (YAML.isNode(node) && node.range) {
    range = node.range as [number, number, number?];
  } else if (YAML.isPair(node)) {
    if (YAML.isNode(node.key) && node.key.range) {
      range = node.key.range as [number, number, number?];
    } else if (YAML.isNode(node.value) && node.value.range) {
      range = node.value.range as [number, number, number?];
    }
  }

  if (range && range[0] !== undefined) {
    const pos = lineCounter.linePos(range[0]);
    if (pos && typeof pos.line === 'number') {
      return { line: pos.line, column: pos.col };
    }
  }
  return {};
}

function isMergePair(pair: unknown): boolean {
  if (!YAML.isPair(pair)) return false;
  const key = pair.key;
  if (!key) return false;
  if (YAML.isScalar(key)) {
    return key.source === '<<' || key.value === '<<' || typeof key.value === 'symbol';
  }
  return false;
}

class TraversalContext {
  public maxDepthReached = 0;
  public nodesVisited = 0;
  public expressionsFound = 0;
  public readonly activePath = new Set<unknown>();

  constructor(
    public readonly doc: YAML.Document,
    public readonly lineCounter: YAML.LineCounter,
    public readonly maxDepth: number,
    public nodeBudgetRemaining: number,
    public expressionBudgetRemaining: number
  ) {}

  public recordStep(node?: unknown): void {
    this.nodesVisited++;
    this.nodeBudgetRemaining--;
    if (this.nodeBudgetRemaining < 0) {
      const loc = getNodeLocation(node, this.lineCounter);
      throw new WalkError({
        code: 'YAML_TRAVERSAL_LIMIT',
        message: 'Workflow exceeds maximum traversal node/pair budget (2000)',
        line: loc.line,
        column: loc.column,
      });
    }
  }

  public checkDepth(depth: number, node?: unknown): void {
    if (depth > this.maxDepthReached) {
      this.maxDepthReached = depth;
    }
    if (depth > this.maxDepth) {
      const loc = getNodeLocation(node, this.lineCounter);
      throw new WalkError({
        code: 'YAML_TRAVERSAL_LIMIT',
        message: 'Workflow exceeds maximum nesting depth (15)',
        line: loc.line,
        column: loc.column,
      });
    }
  }

  public countExpressionsInString(str: string, node?: unknown): void {
    if (typeof str !== 'string') return;
    const matches = str.match(/\$\{\{[\s\S]*?\}\}/g);
    if (!matches) return;

    for (let i = 0; i < matches.length; i++) {
      this.expressionsFound++;
      this.expressionBudgetRemaining--;
      if (this.expressionBudgetRemaining < 0) {
        const loc = getNodeLocation(node, this.lineCounter);
        throw new WalkError({
          code: 'YAML_EXPRESSION_LIMIT',
          message: 'Workflow exceeds maximum inspected expression count (200)',
          line: loc.line,
          column: loc.column,
        });
      }
    }
  }
}

/**
 * Resolves an AST node, following YAML aliases with cycle detection and depth/step limits.
 */
function resolveValueNode(
  node: unknown,
  depth: number,
  ctx: TraversalContext
): unknown {
  ctx.checkDepth(depth, node);
  ctx.recordStep(node);

  if (!node) return node;

  if (YAML.isAlias(node)) {
    if (ctx.activePath.has(node)) {
      const loc = getNodeLocation(node, ctx.lineCounter);
      throw new WalkError({
        code: 'YAML_ALIAS_CYCLE',
        message: 'Cyclic YAML alias detected in workflow structure',
        line: loc.line,
        column: loc.column,
      });
    }

    ctx.activePath.add(node);
    try {
      const target = node.resolve(ctx.doc);
      if (!target) {
        const loc = getNodeLocation(node, ctx.lineCounter);
        throw new WalkError({
          code: 'YAML_ALIAS_DANGLING',
          message: 'Unresolved or undefined YAML alias reference',
          line: loc.line,
          column: loc.column,
        });
      }

      if (ctx.activePath.has(target)) {
        const loc = getNodeLocation(node, ctx.lineCounter);
        throw new WalkError({
          code: 'YAML_ALIAS_CYCLE',
          message: 'Cyclic YAML alias detected in workflow structure',
          line: loc.line,
          column: loc.column,
        });
      }

      return resolveValueNode(target, depth + 1, ctx);
    } finally {
      ctx.activePath.delete(node);
    }
  }

  return node;
}

interface MapEntryRecord {
  valueNode: unknown;
  pair: YAML.Pair;
}

/**
 * Resolves all entries in a YAML mapping, recursively resolving merge keys (`<<`)
 * and merge sequences with correct YAML precedence (direct keys override merged keys).
 */
function resolveMapEntries(
  mapNode: unknown,
  depth: number,
  ctx: TraversalContext
): Map<string, MapEntryRecord> {
  ctx.checkDepth(depth, mapNode);
  ctx.recordStep(mapNode);

  const resolvedMap = resolveValueNode(mapNode, depth, ctx);
  if (!YAML.isMap(resolvedMap)) {
    const loc = getNodeLocation(mapNode, ctx.lineCounter);
    throw new WalkError({
      code: 'YAML_SHAPE_ERROR',
      message: 'Expected a YAML mapping',
      line: loc.line,
      column: loc.column,
    });
  }

  const entries = new Map<string, MapEntryRecord>();
  const mergePairs: YAML.Pair[] = [];

  // First pass: direct pairs on this map take precedence
  for (const item of resolvedMap.items) {
    ctx.recordStep(item);
    if (isMergePair(item)) {
      mergePairs.push(item as YAML.Pair);
    } else if (YAML.isPair(item)) {
      const keyNode = resolveValueNode(item.key, depth + 1, ctx);
      let keyStr: string;
      if (YAML.isScalar(keyNode)) {
        keyStr = String(keyNode.value);
        ctx.countExpressionsInString(keyStr, keyNode);
      } else {
        keyStr = String(keyNode);
      }
      entries.set(keyStr, { valueNode: item.value, pair: item });
    }
  }

  // Second pass: merge pairs in order (first merge key has precedence over subsequent)
  for (const mergePair of mergePairs) {
    ctx.recordStep(mergePair);
    processMergeValue(mergePair.value, depth + 1, ctx, entries);
  }

  return entries;
}

/**
 * Recursively processes a merge key value (Alias, Seq, or Map) into the target entries map.
 */
function processMergeValue(
  valueNode: unknown,
  depth: number,
  ctx: TraversalContext,
  entries: Map<string, MapEntryRecord>
): void {
  ctx.checkDepth(depth, valueNode);
  ctx.recordStep(valueNode);

  if (YAML.isAlias(valueNode)) {
    if (ctx.activePath.has(valueNode)) {
      const loc = getNodeLocation(valueNode, ctx.lineCounter);
      throw new WalkError({
        code: 'YAML_ALIAS_CYCLE',
        message: 'Cyclic YAML alias detected in workflow structure',
        line: loc.line,
        column: loc.column,
      });
    }

    ctx.activePath.add(valueNode);
    try {
      const resolved = valueNode.resolve(ctx.doc);
      if (!resolved) {
        const loc = getNodeLocation(valueNode, ctx.lineCounter);
        throw new WalkError({
          code: 'YAML_ALIAS_DANGLING',
          message: 'Unresolved or undefined YAML alias reference',
          line: loc.line,
          column: loc.column,
        });
      }
      processMergeValue(resolved, depth + 1, ctx, entries);
    } finally {
      ctx.activePath.delete(valueNode);
    }
    return;
  }

  if (YAML.isSeq(valueNode)) {
    if (ctx.activePath.has(valueNode)) {
      const loc = getNodeLocation(valueNode, ctx.lineCounter);
      throw new WalkError({
        code: 'YAML_ALIAS_CYCLE',
        message: 'Cyclic YAML alias detected in workflow structure',
        line: loc.line,
        column: loc.column,
      });
    }

    ctx.activePath.add(valueNode);
    try {
      for (const item of valueNode.items) {
        processMergeValue(item, depth + 1, ctx, entries);
      }
    } finally {
      ctx.activePath.delete(valueNode);
    }
    return;
  }

  if (YAML.isMap(valueNode)) {
    if (ctx.activePath.has(valueNode)) {
      const loc = getNodeLocation(valueNode, ctx.lineCounter);
      throw new WalkError({
        code: 'YAML_ALIAS_CYCLE',
        message: 'Cyclic YAML alias detected in workflow structure',
        line: loc.line,
        column: loc.column,
      });
    }

    ctx.activePath.add(valueNode);
    try {
      const mergedEntries = resolveMapEntries(valueNode, depth + 1, ctx);
      for (const [k, v] of mergedEntries.entries()) {
        if (!entries.has(k)) {
          entries.set(k, v);
        }
      }
    } finally {
      ctx.activePath.delete(valueNode);
    }
    return;
  }

  const loc = getNodeLocation(valueNode, ctx.lineCounter);
  throw new WalkError({
    code: 'YAML_UNRESOLVED_MERGE',
    message: 'Unsupported merge key value: expected mapping or sequence of mappings',
    line: loc.line,
    column: loc.column,
  });
}

/**
 * Parses and categorizes permissions block (workflow-level or job-level).
 */
function parsePermissionsNode(
  valNode: unknown,
  pairNode: unknown,
  depth: number,
  ctx: TraversalContext
): ParsedPermissions {
  const loc = getNodeLocation(pairNode || valNode, ctx.lineCounter);
  const resolved = resolveValueNode(valNode, depth, ctx);

  if (YAML.isScalar(resolved)) {
    const str = String(resolved.value);
    ctx.countExpressionsInString(str, resolved);
    if (str === 'read-all' || str === 'write-all') {
      return { mode: str, line: loc.line, column: loc.column };
    }
    return { mode: 'unknown', raw: str, line: loc.line, column: loc.column };
  }

  if (YAML.isMap(resolved)) {
    const mapEntries = resolveMapEntries(resolved, depth, ctx);
    if (mapEntries.size === 0) {
      return { mode: 'empty', scopes: {}, line: loc.line, column: loc.column };
    }

    const scopes: Record<string, string> = {};
    for (const [k, v] of mapEntries.entries()) {
      const vResolved = resolveValueNode(v.valueNode, depth + 1, ctx);
      if (YAML.isScalar(vResolved)) {
        const valStr = String(vResolved.value);
        ctx.countExpressionsInString(valStr, vResolved);
        scopes[k] = valStr;
      } else {
        scopes[k] = String(vResolved);
      }
    }
    return { mode: 'granular', scopes, line: loc.line, column: loc.column };
  }

  return { mode: 'unknown', raw: resolved, line: loc.line, column: loc.column };
}

/**
 * Recursively inspects generic value nodes (like `with`, `env`) to enforce depth,
 * node budget, and expression limits.
 */
function recursivelyInspectValue(
  node: unknown,
  depth: number,
  ctx: TraversalContext
): unknown {
  ctx.checkDepth(depth, node);
  ctx.recordStep(node);

  const resolved = resolveValueNode(node, depth, ctx);

  if (YAML.isScalar(resolved)) {
    if (typeof resolved.value === 'string') {
      ctx.countExpressionsInString(resolved.value, resolved);
    }
    return resolved.value;
  }

  if (YAML.isSeq(resolved)) {
    if (ctx.activePath.has(resolved)) {
      const loc = getNodeLocation(resolved, ctx.lineCounter);
      throw new WalkError({
        code: 'YAML_ALIAS_CYCLE',
        message: 'Cyclic YAML alias detected in workflow structure',
        line: loc.line,
        column: loc.column,
      });
    }

    ctx.activePath.add(resolved);
    try {
      return resolved.items.map((item) =>
        recursivelyInspectValue(item, depth + 1, ctx)
      );
    } finally {
      ctx.activePath.delete(resolved);
    }
  }

  if (YAML.isMap(resolved)) {
    const mapEntries = resolveMapEntries(resolved, depth, ctx);
    const obj: Record<string, unknown> = {};
    for (const [k, v] of mapEntries.entries()) {
      obj[k] = recursivelyInspectValue(v.valueNode, depth + 1, ctx);
    }
    return obj;
  }

  return resolved;
}

// ============================================================================
// Public Parser API
// ============================================================================

/**
 * Safely parses and structurally extracts a GitHub Actions workflow YAML document.
 *
 * @param content The raw YAML workflow file content
 * @param options Parser configuration options or file path string
 * @returns Typed parse result (success with structure or failure with categorized error)
 */
export function parseWorkflowYaml(
  content: string,
  options?: WorkflowParserOptions | string
): WorkflowParseResult {
  const opts: WorkflowParserOptions =
    typeof options === 'string' ? { filePath: options } : options || {};

  const maxSizeBytes = opts.maxSizeBytes ?? WORKFLOW_PARSER_DEFAULTS.MAX_SIZE_BYTES;
  const maxDepth = opts.maxDepth ?? WORKFLOW_PARSER_DEFAULTS.MAX_DEPTH;
  const maxNodeBudget = opts.maxNodeBudget ?? WORKFLOW_PARSER_DEFAULTS.MAX_NODE_BUDGET;
  const maxExpressions = opts.maxExpressions ?? WORKFLOW_PARSER_DEFAULTS.MAX_EXPRESSIONS;

  // 1. Pre-parse input size bounds check
  // Fast path: In UTF-8, byte length is always >= UTF-16 code-unit length (content.length).
  // If character count already exceeds maxSizeBytes, byte length is guaranteed to exceed it.
  if (content.length > maxSizeBytes) {
    return {
      success: false,
      error: {
        code: 'FILE_OVERSIZED',
        message: `Workflow file exceeds maximum size limit of ${Math.round(maxSizeBytes / 1024)} KiB`,
      },
      stats: {
        nodeCount: 0,
        maxDepthReached: 0,
        expressionCount: 0,
      },
    };
  }

  // Exact UTF-8 byte length calculation using browser-compatible TextEncoder
  const byteLength = getUtf8ByteLength(content);
  if (byteLength > maxSizeBytes) {
    return {
      success: false,
      error: {
        code: 'FILE_OVERSIZED',
        message: `Workflow file exceeds maximum size limit of ${Math.round(maxSizeBytes / 1024)} KiB`,
      },
      stats: {
        nodeCount: 0,
        maxDepthReached: 0,
        expressionCount: 0,
      },
    };
  }

  // 2. Parse CST/AST with LineCounter, Core YAML 1.2 schema, and merge keys enabled
  const lineCounter = new YAML.LineCounter();
  let doc: YAML.Document;
  try {
    doc = YAML.parseDocument(content, {
      merge: true,
      schema: 'core',
      lineCounter,
    });
  } catch {
    return {
      success: false,
      error: {
        code: 'YAML_SYNTAX_ERROR',
        message: 'YAML syntax error encountered during parsing',
      },
      stats: {
        nodeCount: 0,
        maxDepthReached: 0,
        expressionCount: 0,
      },
    };
  }

  // Check for library-level syntax errors
  if (doc.errors && doc.errors.length > 0) {
    const firstErr = doc.errors[0];
    let line: number | undefined;
    let column: number | undefined;

    if (firstErr.linePos) {
      const pos = Array.isArray(firstErr.linePos)
        ? firstErr.linePos[0]
        : firstErr.linePos;
      line = pos?.line;
      column = pos?.col;
    }

    return {
      success: false,
      error: {
        code: 'YAML_SYNTAX_ERROR',
        message: 'YAML syntax error encountered during parsing',
        line,
        column,
      },
      stats: {
        nodeCount: 0,
        maxDepthReached: 0,
        expressionCount: 0,
      },
    };
  }

  // 3. Initialize traversal context
  const ctx = new TraversalContext(
    doc,
    lineCounter,
    maxDepth,
    maxNodeBudget,
    maxExpressions
  );

  try {
    // 4. Validate root shape
    if (!doc.contents) {
      return {
        success: false,
        error: {
          code: 'YAML_SHAPE_ERROR',
          message: 'Workflow content is empty or contains no mapping',
          line: 1,
        },
        stats: {
          nodeCount: 0,
          maxDepthReached: 0,
          expressionCount: 0,
        },
      };
    }

    const rootNode = resolveValueNode(doc.contents, 1, ctx);
    if (!YAML.isMap(rootNode)) {
      const loc = getNodeLocation(doc.contents, lineCounter);
      return {
        success: false,
        error: {
          code: 'YAML_SHAPE_ERROR',
          message: 'Workflow root must be a YAML mapping',
          line: loc.line || 1,
          column: loc.column,
        },
        stats: {
          nodeCount: ctx.nodesVisited,
          maxDepthReached: ctx.maxDepthReached,
          expressionCount: ctx.expressionsFound,
        },
      };
    }

    const rootEntries = resolveMapEntries(rootNode, 1, ctx);

    // 5. Extract workflow name
    let wfName: string | undefined;
    const nameEntry = rootEntries.get('name');
    if (nameEntry) {
      const nVal = resolveValueNode(nameEntry.valueNode, 2, ctx);
      if (YAML.isScalar(nVal)) {
        wfName = String(nVal.value);
        ctx.countExpressionsInString(wfName, nVal);
      }
    }

    // 6. Extract triggers (on)
    let triggers: ParsedWorkflowTriggers = { events: [] };
    const onEntry = rootEntries.get('on');
    if (onEntry) {
      const onLoc = getNodeLocation(onEntry.pair, lineCounter);
      const onVal = resolveValueNode(onEntry.valueNode, 2, ctx);

      if (YAML.isScalar(onVal)) {
        const ev = String(onVal.value);
        ctx.countExpressionsInString(ev, onVal);
        triggers = { events: [ev], line: onLoc.line, column: onLoc.column };
      } else if (YAML.isSeq(onVal)) {
        const events: string[] = [];
        for (const item of onVal.items) {
          const itemVal = resolveValueNode(item, 3, ctx);
          if (YAML.isScalar(itemVal)) {
            const ev = String(itemVal.value);
            ctx.countExpressionsInString(ev, itemVal);
            events.push(ev);
          }
        }
        triggers = { events, line: onLoc.line, column: onLoc.column };
      } else if (YAML.isMap(onVal)) {
        const onMap = resolveMapEntries(onVal, 3, ctx);
        const events = Array.from(onMap.keys());
        triggers = { events, line: onLoc.line, column: onLoc.column };
      } else {
        triggers = { events: [], raw: onVal, line: onLoc.line, column: onLoc.column };
      }
    }

    // 7. Extract workflow-level permissions
    let workflowPermissions: ParsedPermissions | undefined;
    const permEntry = rootEntries.get('permissions');
    if (permEntry) {
      workflowPermissions = parsePermissionsNode(
        permEntry.valueNode,
        permEntry.pair,
        2,
        ctx
      );
    }

    // 8. Extract workflow-level env
    let workflowEnv: Record<string, string> | undefined;
    const envEntry = rootEntries.get('env');
    if (envEntry) {
      const envVal = resolveValueNode(envEntry.valueNode, 2, ctx);
      if (YAML.isMap(envVal)) {
        if (ctx.activePath.has(envVal)) {
          const loc = getNodeLocation(envVal, lineCounter);
          throw new WalkError({
            code: 'YAML_ALIAS_CYCLE',
            message: 'Cyclic YAML alias detected in workflow structure',
            line: loc.line,
            column: loc.column,
          });
        }
        ctx.activePath.add(envVal);
        try {
          const envMap = resolveMapEntries(envVal, 2, ctx);
          workflowEnv = {};
          for (const [ek, ev] of envMap.entries()) {
            const valResolved = resolveValueNode(ev.valueNode, 3, ctx);
            if (YAML.isScalar(valResolved)) {
              workflowEnv[ek] = String(valResolved.value);
              ctx.countExpressionsInString(workflowEnv[ek], valResolved);
            } else if (YAML.isMap(valResolved) || YAML.isSeq(valResolved)) {
              recursivelyInspectValue(valResolved, 3, ctx);
            }
          }
        } finally {
          ctx.activePath.delete(envVal);
        }
      }
    }

    // 9. Extract jobs
    const jobsEntry = rootEntries.get('jobs');
    if (!jobsEntry) {
      return {
        success: false,
        error: {
          code: 'YAML_SHAPE_ERROR',
          message: "Workflow must contain a 'jobs' mapping",
          line: 1,
        },
        stats: {
          nodeCount: ctx.nodesVisited,
          maxDepthReached: ctx.maxDepthReached,
          expressionCount: ctx.expressionsFound,
        },
      };
    }

    const jobsVal = resolveValueNode(jobsEntry.valueNode, 2, ctx);
    if (!YAML.isMap(jobsVal)) {
      const loc = getNodeLocation(jobsEntry.pair, lineCounter);
      return {
        success: false,
        error: {
          code: 'YAML_SHAPE_ERROR',
          message: "Workflow 'jobs' field must be a mapping",
          line: loc.line,
          column: loc.column,
        },
        stats: {
          nodeCount: ctx.nodesVisited,
          maxDepthReached: ctx.maxDepthReached,
          expressionCount: ctx.expressionsFound,
        },
      };
    }

    const jobEntries = resolveMapEntries(jobsVal, 2, ctx);
    const jobs: Record<string, ParsedWorkflowJob> = {};

    for (const [jobId, jobData] of jobEntries.entries()) {
      const jobLoc = getNodeLocation(jobData.pair, lineCounter);
      const jobVal = resolveValueNode(jobData.valueNode, 3, ctx);

      if (!YAML.isMap(jobVal)) {
        continue;
      }

      const jobMap = resolveMapEntries(jobVal, 3, ctx);

      // Job permissions
      let jobPerms: ParsedPermissions | undefined;
      const jPermEntry = jobMap.get('permissions');
      if (jPermEntry) {
        jobPerms = parsePermissionsNode(
          jPermEntry.valueNode,
          jPermEntry.pair,
          4,
          ctx
        );
      }

      // Job runs-on
      let runsOn: string | string[] | undefined;
      const runsOnEntry = jobMap.get('runs-on');
      if (runsOnEntry) {
        const roVal = resolveValueNode(runsOnEntry.valueNode, 4, ctx);
        if (YAML.isScalar(roVal)) {
          runsOn = String(roVal.value);
          ctx.countExpressionsInString(runsOn, roVal);
        } else if (YAML.isSeq(roVal)) {
          runsOn = roVal.items.map((it) => {
            const v = resolveValueNode(it, 5, ctx);
            const str = YAML.isScalar(v) ? String(v.value) : String(v);
            ctx.countExpressionsInString(str, v);
            return str;
          });
        }
      }

      // Job name
      let jobName: string | undefined;
      const nameEntry = jobMap.get('name');
      if (nameEntry) {
        const nVal = resolveValueNode(nameEntry.valueNode, 4, ctx);
        if (YAML.isScalar(nVal)) {
          jobName = String(nVal.value);
          ctx.countExpressionsInString(jobName, nVal);
        }
      }

      // Job uses (reusable workflow call)
      let jobUses: string | undefined;
      const usesEntry = jobMap.get('uses');
      if (usesEntry) {
        const uVal = resolveValueNode(usesEntry.valueNode, 4, ctx);
        if (YAML.isScalar(uVal)) {
          jobUses = String(uVal.value);
          ctx.countExpressionsInString(jobUses, uVal);
        }
      }

      // Job with (for reusable workflows)
      let jobWith: Record<string, unknown> | undefined;
      const withEntry = jobMap.get('with');
      if (withEntry) {
        const wVal = resolveValueNode(withEntry.valueNode, 4, ctx);
        if (YAML.isMap(wVal)) {
          jobWith = recursivelyInspectValue(wVal, 4, ctx) as Record<string, unknown>;
        }
      }

      // Job secrets
      let jobSecrets: Record<string, unknown> | string | undefined;
      const secretsEntry = jobMap.get('secrets');
      if (secretsEntry) {
        const sVal = resolveValueNode(secretsEntry.valueNode, 4, ctx);
        if (YAML.isScalar(sVal)) {
          jobSecrets = String(sVal.value);
          ctx.countExpressionsInString(jobSecrets, sVal);
        } else if (YAML.isMap(sVal)) {
          jobSecrets = recursivelyInspectValue(sVal, 4, ctx) as Record<string, unknown>;
        }
      }

      // Job env
      let jobEnv: Record<string, string> | undefined;
      const jEnvEntry = jobMap.get('env');
      if (jEnvEntry) {
        const eVal = resolveValueNode(jEnvEntry.valueNode, 4, ctx);
        if (YAML.isMap(eVal)) {
          if (ctx.activePath.has(eVal)) {
            const loc = getNodeLocation(eVal, lineCounter);
            throw new WalkError({
              code: 'YAML_ALIAS_CYCLE',
              message: 'Cyclic YAML alias detected in workflow structure',
              line: loc.line,
              column: loc.column,
            });
          }
          ctx.activePath.add(eVal);
          try {
            const eMap = resolveMapEntries(eVal, 4, ctx);
            jobEnv = {};
            for (const [ek, ev] of eMap.entries()) {
              const valResolved = resolveValueNode(ev.valueNode, 5, ctx);
              if (YAML.isScalar(valResolved)) {
                jobEnv[ek] = String(valResolved.value);
                ctx.countExpressionsInString(jobEnv[ek], valResolved);
              } else if (YAML.isMap(valResolved) || YAML.isSeq(valResolved)) {
                recursivelyInspectValue(valResolved, 5, ctx);
              }
            }
          } finally {
            ctx.activePath.delete(eVal);
          }
        }
      }

      // Job steps
      const steps: ParsedWorkflowStep[] = [];
      const stepsEntry = jobMap.get('steps');
      if (stepsEntry) {
        const stepsVal = resolveValueNode(stepsEntry.valueNode, 4, ctx);
        if (!YAML.isSeq(stepsVal)) {
          const loc = getNodeLocation(stepsEntry.pair, lineCounter);
          return {
            success: false,
            error: {
              code: 'YAML_SHAPE_ERROR',
              message: "Job 'steps' must be a sequence",
              line: loc.line,
              column: loc.column,
            },
            stats: {
              nodeCount: ctx.nodesVisited,
              maxDepthReached: ctx.maxDepthReached,
              expressionCount: ctx.expressionsFound,
            },
          };
        }

        if (ctx.activePath.has(stepsVal)) {
          const loc = getNodeLocation(stepsVal, lineCounter);
          throw new WalkError({
            code: 'YAML_ALIAS_CYCLE',
            message: 'Cyclic YAML alias detected in workflow structure',
            line: loc.line,
            column: loc.column,
          });
        }

        ctx.activePath.add(stepsVal);
        try {
          let stepIndex = 0;
          for (const stepItem of stepsVal.items) {
            const stepLoc = getNodeLocation(stepItem, lineCounter);
            const stepVal = resolveValueNode(stepItem, 5, ctx);
            if (!YAML.isMap(stepVal)) {
              stepIndex++;
              continue;
            }

            const stepMap = resolveMapEntries(stepVal, 5, ctx);
            const parsedStep: ParsedWorkflowStep = {
              index: stepIndex,
              line: stepLoc.line,
              column: stepLoc.column,
            };

            const sId = stepMap.get('id');
            if (sId) {
              const v = resolveValueNode(sId.valueNode, 6, ctx);
              if (YAML.isScalar(v)) {
                parsedStep.id = String(v.value);
                ctx.countExpressionsInString(parsedStep.id, v);
              }
            }

            const sName = stepMap.get('name');
            if (sName) {
              const v = resolveValueNode(sName.valueNode, 6, ctx);
              if (YAML.isScalar(v)) {
                parsedStep.name = String(v.value);
                ctx.countExpressionsInString(parsedStep.name, v);
              }
            }

            const sUses = stepMap.get('uses');
            if (sUses) {
              const v = resolveValueNode(sUses.valueNode, 6, ctx);
              if (YAML.isScalar(v)) {
                parsedStep.uses = String(v.value);
                ctx.countExpressionsInString(parsedStep.uses, v);
              }
            }

            const sRun = stepMap.get('run');
            if (sRun) {
              const v = resolveValueNode(sRun.valueNode, 6, ctx);
              if (YAML.isScalar(v)) {
                parsedStep.run = String(v.value);
                ctx.countExpressionsInString(parsedStep.run, v);
              }
            }

            const sWith = stepMap.get('with');
            if (sWith) {
              const v = resolveValueNode(sWith.valueNode, 6, ctx);
              if (YAML.isMap(v)) {
                parsedStep.with = recursivelyInspectValue(v, 6, ctx) as Record<string, unknown>;
              }
            }

            const sEnv = stepMap.get('env');
            if (sEnv) {
              const v = resolveValueNode(sEnv.valueNode, 6, ctx);
              if (YAML.isMap(v)) {
                if (ctx.activePath.has(v)) {
                  const loc = getNodeLocation(v, lineCounter);
                  throw new WalkError({
                    code: 'YAML_ALIAS_CYCLE',
                    message: 'Cyclic YAML alias detected in workflow structure',
                    line: loc.line,
                    column: loc.column,
                  });
                }
                ctx.activePath.add(v);
                try {
                  const envMap = resolveMapEntries(v, 6, ctx);
                  const envObj: Record<string, string> = {};
                  for (const [ek, ev] of envMap.entries()) {
                    const valResolved = resolveValueNode(ev.valueNode, 7, ctx);
                    if (YAML.isScalar(valResolved)) {
                      envObj[ek] = String(valResolved.value);
                      ctx.countExpressionsInString(envObj[ek], valResolved);
                    } else if (YAML.isMap(valResolved) || YAML.isSeq(valResolved)) {
                      recursivelyInspectValue(valResolved, 7, ctx);
                    }
                  }
                  parsedStep.env = envObj;
                } finally {
                  ctx.activePath.delete(v);
                }
              }
            }

            steps.push(parsedStep);
            stepIndex++;
          }
        } finally {
          ctx.activePath.delete(stepsVal);
        }
      }

      jobs[jobId] = {
        id: jobId,
        name: jobName,
        permissions: jobPerms,
        runsOn,
        steps,
        uses: jobUses,
        with: jobWith,
        secrets: jobSecrets,
        env: jobEnv,
        line: jobLoc.line,
        column: jobLoc.column,
      };
    }

    const lineCount = lineCounter.linePos(content.length)?.line ?? 1;

    return {
      success: true,
      workflow: {
        name: wfName,
        filePath: opts.filePath,
        triggers,
        permissions: workflowPermissions,
        jobs,
        env: workflowEnv,
        lineCount,
      },
      stats: {
        nodeCount: ctx.nodesVisited,
        maxDepthReached: ctx.maxDepthReached,
        expressionCount: ctx.expressionsFound,
      },
    };
  } catch (err) {
    if (err instanceof WalkError) {
      return {
        success: false,
        error: err.parseError,
        stats: {
          nodeCount: ctx.nodesVisited,
          maxDepthReached: ctx.maxDepthReached,
          expressionCount: ctx.expressionsFound,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'YAML_SYNTAX_ERROR',
        message: 'Unexpected error during workflow parsing',
      },
      stats: {
        nodeCount: ctx.nodesVisited,
        maxDepthReached: ctx.maxDepthReached,
        expressionCount: ctx.expressionsFound,
      },
    };
  }
}
