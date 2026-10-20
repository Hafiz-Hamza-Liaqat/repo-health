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

  // Check test frameworks
  const detectedFrameworks: string[] = [];

  // Node packages
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
    // Go has built-in testing package
    detectedFrameworks.push('Go testing');
  }

  // Check config files in root
  const testConfigFiles = rootFiles.filter((f) =>
    /^(?:vitest\.config|jest\.config|playwright\.config|cypress\.config|\.mocharc|pytest\.ini|setup\.cfg|tox\.ini)/i.test(f)
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

  // TST-03: Dedicated test directory or test files
  const testDirectory = rootFiles.find((f) =>
    /^(?:tests?|__tests__|spec|specs)$/i.test(f)
  );
  const testFilesInRoot = rootFiles.filter((f) =>
    /\.(?:test|spec)\.[a-zA-Z0-9]+$/i.test(f)
  );

  if (testDirectory || testFilesInRoot.length > 0) {
    const target = testDirectory ? `directory "${testDirectory}/"` : `root spec file "${testFilesInRoot[0]}"`;
    findings.push({
      id: 'TST-03-pass',
      ruleId: 'TST-03',
      category: 'testing',
      title: `Dedicated Test Directory Found (${testDirectory || 'specs'})`,
      status: 'pass',
      severity: 'info',
      scoreEffect: tst03Rule.basePoints,
      maxEffect: tst03Rule.basePoints,
      explanation: `Identified test suite container: ${target}.`,
      evidence: {
        label: 'Test Structure',
        value: testDirectory ? `/${testDirectory}` : testFilesInRoot.join(', '),
        sourcePath: testDirectory || testFilesInRoot[0],
      },
    });
  } else {
    findings.push({
      id: 'TST-03-not-detected',
      ruleId: 'TST-03',
      category: 'testing',
      title: 'No Dedicated Test Directory Detected in Root',
      status: 'warning',
      severity: 'medium',
      scoreEffect: 1,
      maxEffect: tst03Rule.basePoints,
      explanation: 'No top-level "test/", "tests/", "__tests__/", or "spec/" directory was found in the repository root.',
      recommendation: 'Group automated tests inside a structured "test/" or "tests/" directory or co-locate *.test.ts files.',
    });
  }

  // TST-04: Test execution in CI
  // Check if any workflow mentions test/vitest/jest/pytest/cargo test
  const workflows: GitHubWorkflow[] = raw.workflows || [];
  const testWorkflows = workflows.filter((w) =>
    /(?:test|ci|check|build|qa|verify)/i.test(w.name)
  );

  if (testWorkflows.length > 0 && detectedFrameworks.length > 0) {
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
