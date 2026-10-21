/**
 * Security & Supply-Chain Hygiene Analyzer (Phase 2.1A)
 *
 * Deterministic, offline path-level analysis using existing Git tree data.
 * Zero additional GitHub API requests are made.
 */

import { GitTreeData } from '../types/analysis';
import { SecurityFinding, SecurityHygieneAssessment } from '../types/security';

// 1. Security policy locations
const SECURITY_POLICY_PATTERNS = [
  /^security\.md$/i,
  /^\.github\/security\.md$/i,
  /^docs\/security\.md$/i,
];

// 2. Automated dependency update configuration locations
const DEPENDABOT_PATTERNS = [
  /^\.github\/dependabot\.ya?ml$/i,
];

const RENOVATE_PATTERNS = [
  /^renovate\.json5?$/i,
  /^\.renovaterc(\.json5?)?$/i,
  /^\.github\/renovate\.json5?$/i,
  /^\.github\/\.renovaterc(\.json5?)?$/i,
];

// Ambiguous context directory segments (test, mock, fixture, sample, example, docs)
const AMBIGUOUS_DIR_SEGMENTS = new Set([
  'test',
  'tests',
  '__tests__',
  '__test__',
  'fixture',
  'fixtures',
  'mock',
  'mocks',
  'sample',
  'samples',
  'example',
  'examples',
  'spec',
  'specs',
  'docs',
  'documentation',
]);

// Basename exclusions for clear template / placeholder .env files
const CLEAR_ENV_PLACEHOLDER_SUFFIXES = [
  '.example',
  '.sample',
  '.template',
  '.dist',
  '.defaults',
  '.default',
];

// 4. SBOM filename patterns
const CYCLONEDX_PATTERNS = [
  /^bom\.(json|xml)$/i,
  /^bom\.cdx\.(json|xml)$/i,
  /(^|\.)cdx\.(json|xml)$/i,
  /^sbom(\.cdx)?\.(json|xml)$/i,
];

const SPDX_PATTERNS = [
  /(^|\.)spdx$/i,
  /(^|\.)spdx\.json$/i,
  /(^|\.)spdx\.ya?ml$/i,
  /(^|\.)spdx\.rdf\.xml$/i,
  /(^|\.)spdx\.rdf$/i,
];

/**
 * Checks if a path is located inside test, fixture, mock, sample, example, or docs directory
 */
export function isPathInAmbiguousContext(path: string): boolean {
  const segments = path.toLowerCase().split(/[\\/]/);
  return segments.some((segment) => AMBIGUOUS_DIR_SEGMENTS.has(segment));
}

export interface SensitivePathEvaluation {
  isSensitive: boolean;
  confidence: 'high' | 'low';
  category?: 'env' | 'private_key' | 'credentials';
  reason?: string;
}

/**
 * Evaluates whether a tracked path is a potential sensitive file,
 * distinguishing active paths (high confidence) from ambiguous contexts (low confidence)
 * while continuing to exclude explicit placeholders, templates, and public keys.
 */
export function evaluateSensitivePath(path: string): SensitivePathEvaluation {
  const normalized = path.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() || '';
  const lowerBase = basename.toLowerCase();
  const inAmbiguousDir = isPathInAmbiguousContext(normalized);

  // 1. Explicit public key files are never sensitive
  if (lowerBase.endsWith('.pub') || lowerBase.includes('public') || /^pub\.key$/i.test(lowerBase)) {
    return { isSensitive: false, confidence: 'high' };
  }

  // 2. Clear placeholder and template filenames are never sensitive
  if (
    lowerBase.endsWith('.example') ||
    lowerBase.endsWith('.sample') ||
    lowerBase.endsWith('.template') ||
    lowerBase.endsWith('.dist') ||
    lowerBase.endsWith('.defaults') ||
    lowerBase.endsWith('.default') ||
    /^client[-_]secret[-_.]example\.json$/i.test(lowerBase) ||
    /^service[-_]account[-_.]example\.json$/i.test(lowerBase) ||
    /^credentials[-_.]example\.json$/i.test(lowerBase) ||
    /^client[-_]secret[-_.]template\.json$/i.test(lowerBase) ||
    /^service[-_]account[-_.]template\.json$/i.test(lowerBase)
  ) {
    return { isSensitive: false, confidence: 'high' };
  }

  // Determine whether this filename has ambiguous test/sample/dummy/mock naming
  const hasAmbiguousNaming =
    lowerBase.includes('test') ||
    lowerBase.includes('spec') ||
    lowerBase.includes('sample') ||
    lowerBase.includes('dummy') ||
    lowerBase.includes('mock') ||
    lowerBase.includes('fake') ||
    lowerBase.includes('fixture');

  const isAmbiguousContext = inAmbiguousDir || hasAmbiguousNaming;
  const confidence: 'high' | 'low' = isAmbiguousContext ? 'low' : 'high';

  // 3. Environment files (.env, .env.local, .env.production, .env.test, .env.spec, etc.)
  if (lowerBase.startsWith('.env')) {
    const isClearPlaceholder = CLEAR_ENV_PLACEHOLDER_SUFFIXES.some((suffix) => lowerBase.endsWith(suffix));
    if (isClearPlaceholder) {
      return { isSensitive: false, confidence: 'high' };
    }

    return {
      isSensitive: true,
      confidence,
      category: 'env',
      reason: isAmbiguousContext
        ? 'Environment file in test, documentation, or fixture context'
        : 'Active environment file tracked in repository',
    };
  }

  // 4. SSH private keys (id_rsa, id_dsa, id_ecdsa, id_ed25519)
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/i.test(lowerBase)) {
    return {
      isSensitive: true,
      confidence,
      category: 'private_key',
      reason: isAmbiguousContext
        ? 'SSH private key filename in test, documentation, or fixture context'
        : 'SSH private key tracked in repository',
    };
  }

  // 5. Explicit private key and certificate files (*.key, *.pem, *.pkcs12, *.p12, *.pfx)
  if (/\.(key|pem|pkcs12|p12|pfx)$/i.test(lowerBase)) {
    // Exclude if filename specifies public certificate authority or known public cert
    if (/^(ca|cacert|cert|certificate)\.pem$/i.test(lowerBase)) {
      return { isSensitive: false, confidence: 'high' };
    }

    const isSuspiciousKey =
      lowerBase.includes('private') ||
      lowerBase.includes('priv') ||
      lowerBase.includes('secret') ||
      /^server\.key$/i.test(lowerBase) ||
      /^client\.key$/i.test(lowerBase) ||
      /^privkey\.pem$/i.test(lowerBase) ||
      /^[a-z0-9_-]+\.key$/i.test(lowerBase) ||
      /^[a-z0-9_-]+\.pem$/i.test(lowerBase);

    if (isSuspiciousKey) {
      return {
        isSensitive: true,
        confidence,
        category: 'private_key',
        reason: isAmbiguousContext
          ? 'Private key filename pattern in test, documentation, or fixture context'
          : 'Private key file tracked in repository',
      };
    }
  }

  // 6. Cloud credentials and token files
  if (
    /^credentials\.json$/i.test(lowerBase) ||
    /^service[-_]account\.json$/i.test(lowerBase) ||
    /^client[-_]secret\.json$/i.test(lowerBase) ||
    /^token\.json$/i.test(lowerBase)
  ) {
    return {
      isSensitive: true,
      confidence,
      category: 'credentials',
      reason: isAmbiguousContext
        ? 'Credential store filename in test, documentation, or fixture context'
        : 'Credential store file tracked in repository',
    };
  }

  return { isSensitive: false, confidence: 'high' };
}

/**
 * Legacy boolean helper for backwards compatibility with tests and callers
 */
export function isPotentiallySensitivePath(path: string): boolean {
  return evaluateSensitivePath(path).isSensitive;
}

/**
 * Checks if a path matches supported SBOM filename conventions
 */
export function isSbomCandidatePath(path: string): boolean {
  // Avoid treating test fixtures as the repository's published SBOM
  if (isPathInAmbiguousContext(path)) {
    return false;
  }

  const normalized = path.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() || '';

  const isCycloneDx = CYCLONEDX_PATTERNS.some((p) => p.test(basename));
  const isSpdx = SPDX_PATTERNS.some((p) => p.test(basename));

  return isCycloneDx || isSpdx;
}

/**
 * Main Security Hygiene Analyzer (Phase 2.1A)
 */
export function analyzeSecurityHygiene(
  tree: GitTreeData | null,
  rootFiles: string[] = []
): SecurityHygieneAssessment {
  const treeItems = tree?.items || [];
  const hasTree = tree !== null && treeItems.length > 0;
  const isTruncated = !!tree?.isTruncated;

  // Tracked paths to inspect: full tree if available, otherwise root files fallback
  const allPaths: string[] = hasTree
    ? treeItems.map((item) => item.path)
    : rootFiles;

  const inspectedCount = allPaths.length;
  const isTreeUnavailable = inspectedCount === 0;

  const notes: string[] = [];
  let treeStatus: 'complete' | 'truncated' | 'unavailable' = 'complete';

  if (isTreeUnavailable) {
    treeStatus = 'unavailable';
    notes.push('Repository tree data unavailable; preliminary security checks could not inspect tracked paths.');
  } else if (isTruncated) {
    treeStatus = 'truncated';
    notes.push(`Repository tree truncated (>100,000 files). Evaluated ${inspectedCount} tracked files within returned tree window.`);
  } else {
    notes.push(`Complete repository tree inspected (${inspectedCount} tracked paths).`);
  }

  const findings: SecurityFinding[] = [];

  // ==========================================
  // Check 1: Security Policy Candidate (SEC-POL-01)
  // ==========================================
  const foundPolicyPath = allPaths.find((path) => {
    const normalized = path.replace(/\\/g, '/');
    return SECURITY_POLICY_PATTERNS.some((pattern) => pattern.test(normalized));
  });

  if (foundPolicyPath) {
    findings.push({
      id: 'SEC-POL-01-pass',
      ruleId: 'SEC-POL-01',
      title: 'Security Policy File Detected',
      status: 'pass',
      severity: 'info',
      explanation: `Candidate security policy file found at ${foundPolicyPath}. Note: Detection indicates file presence only; policy adequacy, contact responsiveness, and scope are not evaluated in this preliminary phase.`,
      evidence: {
        label: 'Policy Location',
        value: foundPolicyPath,
        sourcePath: foundPolicyPath,
      },
    });
  } else if (isTreeUnavailable) {
    findings.push({
      id: 'SEC-POL-01-unknown',
      ruleId: 'SEC-POL-01',
      title: 'Security Policy Indeterminate (Tree Unavailable)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository file tree is unavailable; presence of a SECURITY.md file could not be verified.',
      recommendation: 'Ensure repository contents are publicly accessible to verify security documentation.',
    });
  } else if (isTruncated) {
    findings.push({
      id: 'SEC-POL-01-unknown',
      ruleId: 'SEC-POL-01',
      title: 'Security Policy Indeterminate (Truncated Git Tree)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository tree response was truncated by GitHub API (>100,000 files); presence of a security policy could not be confirmed in the returned window.',
      recommendation: 'Place a SECURITY.md file in the repository root or .github/ directory for automated detection.',
    });
  } else {
    findings.push({
      id: 'SEC-POL-01-not-detected',
      ruleId: 'SEC-POL-01',
      title: 'No Security Policy Detected',
      status: 'not_detected',
      severity: 'info',
      explanation: 'No SECURITY.md file was detected in standard repository locations (root, .github/, or docs/).',
      recommendation: 'Add a SECURITY.md file to define responsible vulnerability disclosure instructions and security contacts.',
    });
  }

  // ==========================================
  // Check 2: Automated Dependency Updates (SEC-POL-02)
  // ==========================================
  let depToolFound: { tool: 'Dependabot' | 'Renovate'; path: string } | null = null;

  for (const path of allPaths) {
    const normalized = path.replace(/\\/g, '/');
    if (DEPENDABOT_PATTERNS.some((p) => p.test(normalized))) {
      depToolFound = { tool: 'Dependabot', path: normalized };
      break;
    }
    if (RENOVATE_PATTERNS.some((p) => p.test(normalized))) {
      depToolFound = { tool: 'Renovate', path: normalized };
      break;
    }
  }

  if (depToolFound) {
    findings.push({
      id: 'SEC-POL-02-pass',
      ruleId: 'SEC-POL-02',
      title: `Automated Dependency Updates Configured (${depToolFound.tool})`,
      status: 'pass',
      severity: 'info',
      explanation: `Automated dependency update configuration (${depToolFound.tool}) identified at ${depToolFound.path}. Note: Detection indicates configuration file presence only; update execution frequency and ecosystem coverage are not evaluated in this preliminary phase.`,
      evidence: {
        label: 'Update Tool',
        value: `${depToolFound.tool} (${depToolFound.path})`,
        sourcePath: depToolFound.path,
      },
    });
  } else if (isTreeUnavailable) {
    findings.push({
      id: 'SEC-POL-02-unknown',
      ruleId: 'SEC-POL-02',
      title: 'Dependency Update Configuration Indeterminate (Tree Unavailable)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository file tree is unavailable; presence of automated dependency update configuration could not be verified.',
    });
  } else if (isTruncated) {
    findings.push({
      id: 'SEC-POL-02-unknown',
      ruleId: 'SEC-POL-02',
      title: 'Dependency Update Configuration Indeterminate (Truncated Git Tree)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository tree response was truncated by GitHub API (>100,000 files); dependency update configuration could not be confirmed in the returned window.',
      recommendation: 'Ensure your Dependabot (.github/dependabot.yml) or Renovate configuration is committed in standard directories.',
    });
  } else {
    findings.push({
      id: 'SEC-POL-02-not-detected',
      ruleId: 'SEC-POL-02',
      title: 'No Automated Dependency Update Configuration Detected',
      status: 'not_detected',
      severity: 'info',
      explanation: 'No Dependabot (.github/dependabot.yml) or Renovate configuration was detected in the repository.',
      recommendation: 'Configure Dependabot or Renovate to automatically create pull requests for dependency updates and security patches.',
    });
  }

  // ==========================================
  // Check 3: Potentially Sensitive Tracked Paths (SEC-SEC-01)
  // ==========================================
  const highConfidencePaths: string[] = [];
  const ambiguousContextPaths: string[] = [];

  for (const path of allPaths) {
    const evaluation = evaluateSensitivePath(path);
    if (evaluation.isSensitive) {
      if (evaluation.confidence === 'high') {
        highConfidencePaths.push(path);
      } else {
        ambiguousContextPaths.push(path);
      }
    }
  }

  const totalFlagged = highConfidencePaths.length + ambiguousContextPaths.length;

  if (highConfidencePaths.length > 0) {
    const sample = highConfidencePaths.slice(0, 3).join(', ');
    const countNote = highConfidencePaths.length > 3 ? ` (and ${highConfidencePaths.length - 3} more)` : '';
    const ambiguousNote =
      ambiguousContextPaths.length > 0
        ? ` Additionally noted ${ambiguousContextPaths.length} candidate path(s) in test, documentation, or fixture contexts (${ambiguousContextPaths.slice(0, 2).join(', ')}).`
        : '';

    findings.push({
      id: 'SEC-SEC-01-warning',
      ruleId: 'SEC-SEC-01',
      title: `Potential Sensitive File Path${totalFlagged > 1 ? 's' : ''} Tracked in Repository (${totalFlagged})`,
      status: 'warning',
      severity: 'medium',
      explanation: `Detected ${highConfidencePaths.length} tracked file path(s) that match sensitive credential or private key conventions: ${sample}${countNote}.${ambiguousNote} Note: This heuristic path check does not inspect file contents or verify if credentials are active; it indicates potential sensitive file exposure only.`,
      evidence: {
        label: 'Flagged File Paths',
        value: `${sample}${countNote}`,
        sourcePath: highConfidencePaths[0],
      },
      recommendation: 'Inspect flagged files to ensure no sensitive credentials, secrets, or private keys are tracked. If sensitive, remove them from Git history, add to .gitignore, and rotate exposed credentials.',
    });
  } else if (ambiguousContextPaths.length > 0) {
    const sample = ambiguousContextPaths.slice(0, 3).join(', ');
    const countNote = ambiguousContextPaths.length > 3 ? ` (and ${ambiguousContextPaths.length - 3} more)` : '';

    findings.push({
      id: 'SEC-SEC-01-warning-ambiguous',
      ruleId: 'SEC-SEC-01',
      title: `Potential Sensitive File Path${ambiguousContextPaths.length > 1 ? 's' : ''} in Test/Documentation Context (${ambiguousContextPaths.length})`,
      status: 'warning',
      severity: 'low',
      explanation: `Detected ${ambiguousContextPaths.length} candidate path(s) in test, documentation, or fixture context matching sensitive filename conventions: ${sample}${countNote}. Note: Context is ambiguous and these may represent mock or test fixture keys; file contents are not inspected. Ensure test fixtures do not contain live credentials.`,
      evidence: {
        label: 'Ambiguous Context Paths',
        value: `${sample}${countNote}`,
        sourcePath: ambiguousContextPaths[0],
      },
      recommendation: 'Verify that files in test, fixture, or documentation contexts contain only synthetic, sanitized mock data and do not embed active private keys or production secrets.',
    });
  } else if (isTreeUnavailable) {
    findings.push({
      id: 'SEC-SEC-01-unknown',
      ruleId: 'SEC-SEC-01',
      title: 'Sensitive File Screening Indeterminate (Tree Unavailable)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository tree unavailable; screening for potentially sensitive tracked file paths could not be completed.',
    });
  } else if (isTruncated) {
    findings.push({
      id: 'SEC-SEC-01-unknown',
      ruleId: 'SEC-SEC-01',
      title: 'Sensitive File Screening Incomplete (Truncated Git Tree)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository tree was truncated (>100,000 files); sensitive file path absence could not be conclusively verified across the entire repository.',
      recommendation: 'Verify repository hygiene and ensure secrets are managed via environment variables or secret managers.',
    });
  } else {
    findings.push({
      id: 'SEC-SEC-01-pass',
      ruleId: 'SEC-SEC-01',
      title: 'No Sensitive File Paths Detected',
      status: 'pass',
      severity: 'info',
      explanation: 'No common private key files (*.pem, id_rsa) or active environment files (.env) were detected in tracked repository paths (known template, example, and public-key files were excluded).',
      evidence: {
        label: 'Path Screening',
        value: `0 potentially sensitive file paths found across ${inspectedCount} tracked files`,
      },
    });
  }

  // ==========================================
  // Check 4: SBOM Filename Candidates (SEC-SC-01)
  // ==========================================
  const foundSbomPath = allPaths.find(isSbomCandidatePath);

  if (foundSbomPath) {
    findings.push({
      id: 'SEC-SC-01-pass',
      ruleId: 'SEC-SC-01',
      title: 'Candidate SBOM Artifact Detected',
      status: 'pass',
      severity: 'info',
      explanation: `Detected candidate Software Bill of Materials (SBOM) file at ${foundSbomPath}. Note: Detection indicates candidate filename presence only; schema validity, component completeness, and currency are not verified in this preliminary phase.`,
      evidence: {
        label: 'Candidate SBOM File',
        value: foundSbomPath,
        sourcePath: foundSbomPath,
      },
    });
  } else if (isTreeUnavailable) {
    findings.push({
      id: 'SEC-SC-01-unknown',
      ruleId: 'SEC-SC-01',
      title: 'SBOM Artifact Indeterminate (Tree Unavailable)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository file tree is unavailable; presence of candidate Software Bill of Materials (SBOM) files could not be evaluated.',
    });
  } else if (isTruncated) {
    findings.push({
      id: 'SEC-SC-01-unknown',
      ruleId: 'SEC-SC-01',
      title: 'SBOM Artifact Indeterminate (Truncated Git Tree)',
      status: 'unknown',
      severity: 'info',
      explanation: 'Repository tree response was truncated by GitHub API (>100,000 files); presence of an SBOM could not be confirmed in the returned window.',
      recommendation: 'Place candidate SBOM files in standard repository locations or commit them with standard extensions (*.spdx, *.spdx.json, bom.json).',
    });
  } else {
    findings.push({
      id: 'SEC-SC-01-not-detected',
      ruleId: 'SEC-SC-01',
      title: 'No SBOM Artifact Detected',
      status: 'not_detected',
      severity: 'info',
      explanation: 'No candidate Software Bill of Materials (SBOM) file (CycloneDX or SPDX format) was detected in repository paths.',
      recommendation: 'Consider generating and publishing an SBOM (e.g. CycloneDX or SPDX) as part of your release workflow to improve supply-chain transparency.',
    });
  }

  const summary = {
    passCount: findings.filter((f) => f.status === 'pass').length,
    warningCount: findings.filter((f) => f.status === 'warning').length,
    issueCount: findings.filter((f) => f.status === 'issue').length,
    notDetectedCount: findings.filter((f) => f.status === 'not_detected').length,
    unknownCount: findings.filter((f) => f.status === 'unknown').length,
  };

  return {
    findings,
    summary,
    coverage: {
      treeStatus,
      inspectedPathsCount: inspectedCount,
      notes,
    },
  };
}
