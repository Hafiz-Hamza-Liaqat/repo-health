/**
 * Testing Evidence Analyzer
 */

import { GitHubRepo, GitHubWorkflow } from '../types/github';
import { RawAnalysisData } from '../types/analysis';
import { Finding } from '../types/scoring';
import { SCORING_RULES } from '../config/scoringRules';

export function analyzeTestingEvidence(
  raw: RawAnalysisData,
  repo: GitHubRepo
): Finding[] {
  const findings: Finding[] = [];

  const tst01Rule = SCORING_RULES['TST-01'];
  const tst02Rule = SCORING_RULES['TST-02'];
  const tst03Rule = SCORING_RULES['TST-03'];
  const tst04Rule = SCORING_RULES['TST-04'];

  const pkg = raw.manifestContents?.packageJson;
  const pyproject = raw.manifestContents?.pyprojectToml || '';
  const cargo = raw.manifestContents?.cargoToml || '';
  const goMod = raw.manifestContents?.goMod || '';
  const rootFiles = raw.rootFiles || [];

  // Tracked file paths across repository (from recursive Git Tree or rootFiles fallback)
  const allPaths: string[] = raw.tree && raw.tree.items.length > 0
    ? raw.tree.items.map((i) => i.path)
    : rootFiles;

  const isTreeTruncated = !!raw.tree?.isTruncated;

  // Check test frameworks in dependencies
  const detectedFrameworks: string[] = [];

  if (pkg) {
    const deps: Record<string, string | undefined> = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {}),
    };
    if (deps.vitest) detectedFrameworks.push('Vitest');
    if (deps.jest || deps['@types/jest'] || deps['ts-jest']) detectedFrameworks.push('Jest');
    if (deps['@playwright/test']) detectedFrameworks.push('Playwright');
    if (deps.cypress) detectedFrameworks.push('Cypress');
    if (deps.mocha || deps['@types/mocha']) detectedFrameworks.push('Mocha');
    if (deps.ava) detectedFrameworks.push('AVA');
    if (deps.tape) detectedFrameworks.push('Tape');
    if (deps.jasmine) detectedFrameworks.push('Jasmine');
  }

  // Python manifests
  if (pyproject.includes('pytest') || pyproject.includes('[tool.pytest')) {
    detectedFrameworks.push('pytest');
  }

  // Rust
  if (cargo.includes('[dev-dependencies]')) {
    detectedFrameworks.push('Cargo Test');
  }

  // Go
  if (goMod.length > 0 || repo.language === 'Go') {
    detectedFrameworks.push('Go testing');
  }

  // Check config files across tracked paths (root or nested)
  const testConfigFiles = allPaths.filter((path) =>
    /(?:^|\/)(?:vitest\.config|jest\.config|playwright\.config|cypress\.config|\.mocharc|pytest\.ini|setup\.cfg|tox\.ini)(?:\.[a-zA-Z0-9]+)?$/i.test(path)
  );

  // TST-01: Framework detection
  if (detectedFrameworks.length > 0 || testConfigFiles.length > 0) {
    const evidenceList = [
      ...detectedFrameworks.map((f) => `Framework: ${f}`),
      ...testConfigFiles.map((c) => `Config: ${c}`),
    ];
    findings.push({
      id: 'TST-01-pass',
      ruleId: 'TST-01',
      category: 'testing',
      title: `Testing Framework Detected (${detectedFrameworks.join(', ') || testConfigFiles.join(', ')})`,
      status: 'pass',
      severity: 'info',
      scoreEffect: tst01Rule.basePoints,
      maxEffect: tst01Rule.basePoints,
      explanation: `Configured test framework infrastructure identified: ${detectedFrameworks.join(', ') || testConfigFiles.join(', ')}. Note: Test framework presence confirms infrastructure, not that tests pass or achieve high coverage.`,
      evidence: {
        label: 'Framework Evidence',
        value: evidenceList.join('; '),
        sourcePath: testConfigFiles[0] || 'package.json',
      },
    });
  } else {
    findings.push({
      id: 'TST-01-not-detected',
      ruleId: 'TST-01',
      category: 'testing',
      title: 'No Recognized Testing Framework Found in Manifests',
      status: 'not_detected',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: tst01Rule.basePoints,
      explanation: 'No standard testing libraries (Vitest, Jest, Playwright, Pytest, etc.) were identified in package manifests or root configs.',
      recommendation: 'Configure an automated testing framework suitable for your language stack (e.g., Vitest for TS/JS, pytest for Python).',
    });
  }

  // TST-02: Executable test script
  let hasTestScript = false;
  let testScriptCommand = '';

  if (pkg && pkg.scripts) {
    const scripts = pkg.scripts as Record<string, string>;
    const testKeys = Object.keys(scripts).filter((k) =>
      /^test(?:[:_-].+)?$/.test(k)
    );
    if (testKeys.length > 0) {
      hasTestScript = true;
      testScriptCommand = `npm run ${testKeys[0]} -> "${scripts[testKeys[0]]}"`;
    }
  }

  if (pyproject.includes('test') || cargo.includes('test') || goMod.length > 0) {
    if (!hasTestScript) {
      hasTestScript = true;
      testScriptCommand = 'Native toolchain test command (pytest / cargo test / go test)';
    }
  }

  if (hasTestScript) {
    findings.push({
      id: 'TST-02-pass',
      ruleId: 'TST-02',
      category: 'testing',
      title: 'Executable Test Script Declared in Manifest',
      status: 'pass',
      severity: 'info',
      scoreEffect: tst02Rule.basePoints,
      maxEffect: tst02Rule.basePoints,
      explanation: `Project exposes executable test entry point: ${testScriptCommand}.`,
      evidence: {
        label: 'Test Script',
        value: testScriptCommand,
        sourcePath: pkg ? 'package.json' : 'manifest',
      },
    });
  } else {
    findings.push({
      id: 'TST-02-not-detected',
      ruleId: 'TST-02',
      category: 'testing',
      title: 'No Executable Test Script Found in Project Manifest',
      status: 'not_detected',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: tst02Rule.basePoints,
      explanation: 'Package manifest does not define a standard "test" script entrypoint.',
      recommendation: 'Add a "test" script to your manifest so tests can be run consistently via CLI and CI.',
    });
  }

  // TST-03: Recursive Test Files & Test Directory Discovery
  // Recognize test files across the entire directory tree
  const testFileRegex = /(?:^|\/)[^/]+\.(?:test|spec)\.[a-zA-Z0-9]+$/i;
  const pyTestRegex = /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/i;
  const goTestRegex = /(?:^|\/)[^/]+_test\.go$/i;
  const javaTestRegex = /(?:^|\/)[^/]+(?:Test|Tests|TestCase)\.java$/i;
  const rustTestRegex = /(?:^|\/)tests\/[^/]+\.rs$/i;

  const testFiles = allPaths.filter((path) =>
    testFileRegex.test(path) ||
    pyTestRegex.test(path) ||
    goTestRegex.test(path) ||
    javaTestRegex.test(path) ||
    rustTestRegex.test(path)
  );

  // Recognize test directories at any depth (e.g. "tests", "src/test", "e2e", "spec")
  const testDirectoryPatterns = /(?:^|\/)(?:tests?|__tests__|spec|specs|e2e)(?:\/|$)/i;
  const testDirectories = Array.from(
    new Set(
      allPaths
        .filter((path) => testDirectoryPatterns.test(path))
        .map((path) => {
          const parts = path.split('/');
          const idx = parts.findIndex((p) => /^(?:tests?|__tests__|spec|specs|e2e)$/i.test(p));
          return parts.slice(0, idx + 1).join('/');
        })
    )
  );

  const hasRootTestDirectory = rootFiles.some((f) =>
    /^(?:tests?|__tests__|spec|specs|e2e)$/i.test(f)
  );

  if (testFiles.length > 0 || testDirectories.length > 0) {
    const sampleFiles = testFiles.slice(0, 3).join(', ');
    const directoryNote = testDirectories.length > 0
      ? `in director${testDirectories.length > 1 ? 'ies' : 'y'} [${testDirectories.slice(0, 3).join(', ')}]`
      : 'co-located in source tree';

    findings.push({
      id: 'TST-03-pass',
      ruleId: 'TST-03',
      category: 'testing',
      title: `Test Suite Structure & Spec Files Detected (${testFiles.length} file${testFiles.length === 1 ? '' : 's'})`,
      status: 'pass',
      severity: 'info',
      scoreEffect: tst03Rule.basePoints,
      maxEffect: tst03Rule.basePoints,
      explanation: `Identified ${testFiles.length} automated test spec file(s) ${directoryNote}.${!hasRootTestDirectory && testDirectories.length > 0 ? ' (Structured in nested/subsystem directories).' : ''}`,
      evidence: {
        label: 'Test Files',
        value: sampleFiles || testDirectories.join(', '),
        sourcePath: testFiles[0] || testDirectories[0],
      },
    });
  } else if (isTreeTruncated) {
    // Tree response was truncated by GitHub API (>100,000 items)
    findings.push({
      id: 'TST-03-truncated',
      ruleId: 'TST-03',
      category: 'testing',
      title: 'Test Files Indeterminate (Truncated Git Tree)',
      status: 'unknown',
      severity: 'medium',
      scoreEffect: 2,
      maxEffect: tst03Rule.basePoints,
      explanation: 'GitHub Git Trees API response was truncated due to repository size (>100,000 tracked files). Test files could not be confirmed within the returned tree window.',
      recommendation: 'Ensure test runner configuration and test directories are documented in README.',
    });
  } else {
    // Verified complete tree without any test files
    findings.push({
      id: 'TST-03-not-detected',
      ruleId: 'TST-03',
      category: 'testing',
      title: 'No Automated Test Files or Test Directories Detected',
      status: 'not_detected',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: tst03Rule.basePoints,
      explanation: 'No test spec files (*.test.ts, test_*.py, etc.) or test directories (test/, __tests__/, spec/) were found across repository tree.',
      recommendation: 'Add automated tests organized in a test directory or co-located with source files (e.g. *.test.ts).',
    });
  }

  // TST-04: Test execution in CI
  const workflows: GitHubWorkflow[] = raw.workflows || [];
  const testWorkflows = workflows.filter((w) =>
    /(?:test|ci|check|build|qa|verify)/i.test(w.name)
  );

  if (testWorkflows.length > 0 && (detectedFrameworks.length > 0 || testFiles.length > 0)) {
    findings.push({
      id: 'TST-04-pass',
      ruleId: 'TST-04',
      category: 'testing',
      title: 'Automated Test Verification Linked with CI',
      status: 'pass',
      severity: 'info',
      scoreEffect: tst04Rule.basePoints,
      maxEffect: tst04Rule.basePoints,
      explanation: `Test pipeline is integrated into continuous integration workflow(s): ${testWorkflows.map((w) => `"${w.name}"`).join(', ')}.`,
      evidence: {
        label: 'CI Test Integration',
        value: testWorkflows.map((w) => w.name).join(', '),
        sourceUrl: `${repo.html_url}/actions`,
      },
    });
  } else if (testWorkflows.length > 0) {
    findings.push({
      id: 'TST-04-warning',
      ruleId: 'TST-04',
      category: 'testing',
      title: 'CI Workflows Present Without Confirmed Test Runner',
      status: 'warning',
      severity: 'low',
      scoreEffect: 1,
      maxEffect: tst04Rule.basePoints,
      explanation: 'CI workflows exist, but manifest evidence of a test framework was not conclusively verified.',
      recommendation: 'Ensure your CI workflow explicitly executes test suites on pull requests.',
    });
  } else {
    findings.push({
      id: 'TST-04-not-detected',
      ruleId: 'TST-04',
      category: 'testing',
      title: 'No CI Workflow Linked to Automated Testing',
      status: 'not_detected',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: tst04Rule.basePoints,
      explanation: 'Automated test suite is not executed inside continuous integration workflows.',
      recommendation: 'Connect test commands to GitHub Actions so every PR runs automated tests before merging.',
    });
  }

  return findings;
}
