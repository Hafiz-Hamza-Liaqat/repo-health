/**
 * README and Documentation Analyzer
 */

import { GitHubReadme, GitHubRepo } from '../types/github';
import { Finding } from '../types/scoring';
import { SCORING_RULES } from '../config/scoringRules';

export function analyzeReadme(
  readme: GitHubReadme | null,
  repo: GitHubRepo
): Finding[] {
  const findings: Finding[] = [];
  const content = readme?.decodedContent || '';
  const hasReadme = !!readme && content.trim().length > 0;
  const readmeUrl = readme?.html_url || `${repo.html_url}#readme`;

  // DOC-01: README Presence & Non-Trivial Length
  const doc01Rule = SCORING_RULES['DOC-01'];
  if (!hasReadme) {
    findings.push({
      id: 'DOC-01-missing',
      ruleId: 'DOC-01',
      category: 'documentation',
      title: 'README Not Detected',
      status: 'issue',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: doc01Rule.basePoints,
      explanation: 'No README documentation file was found in the repository root.',
      recommendation: 'Add a comprehensive README.md in the root directory to orient developers, users, and hiring evaluators.',
    });
  } else if (content.length < 150) {
    findings.push({
      id: 'DOC-01-stub',
      ruleId: 'DOC-01',
      category: 'documentation',
      title: 'README Is Minimal or Stub Content',
      status: 'warning',
      severity: 'medium',
      scoreEffect: Math.floor(doc01Rule.basePoints / 2),
      maxEffect: doc01Rule.basePoints,
      explanation: `A README file was found, but it contains only ${content.length} characters of text, indicating placeholder or incomplete documentation.`,
      evidence: {
        label: 'README Length',
        value: `${content.length} characters`,
        sourcePath: readme?.path || 'README.md',
        sourceUrl: readmeUrl,
      },
      recommendation: 'Expand the README with project architecture, motivation, and setup instructions.',
    });
  } else {
    findings.push({
      id: 'DOC-01-pass',
      ruleId: 'DOC-01',
      category: 'documentation',
      title: 'Substantive README Present',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc01Rule.basePoints,
      maxEffect: doc01Rule.basePoints,
      explanation: `README file exists (${content.length} characters) and provides project documentation.`,
      evidence: {
        label: 'File Path',
        value: readme?.path || 'README.md',
        sourcePath: readme?.path || 'README.md',
        sourceUrl: readmeUrl,
      },
    });
  }

  // If no README exists, other doc checks are not detected
  if (!hasReadme) {
    ['DOC-02', 'DOC-03', 'DOC-04', 'DOC-05', 'DOC-06'].forEach((ruleId) => {
      const rule = SCORING_RULES[ruleId];
      findings.push({
        id: `${ruleId}-not-detected`,
        ruleId,
        category: 'documentation',
        title: `${rule.title} Not Detected`,
        status: 'not_detected',
        severity: 'medium',
        scoreEffect: 0,
        maxEffect: rule.basePoints,
        explanation: 'Cannot evaluate documentation sections because no README file is present.',
      });
    });
    return findings;
  }

  const lowerContent = content.toLowerCase();

  // DOC-02: Project Purpose & Overview
  const doc02Rule = SCORING_RULES['DOC-02'];
  const hasOverviewHeadings = /(?:#+\s*(?:overview|about|introduction|what is|features|motivation|purpose|background))/i.test(content);
  const repoHasDescriptionInReadme = repo.description && lowerContent.includes(repo.description.toLowerCase().slice(0, 30));
  const hasSubstantialText = content.split('\n').filter((l) => l.trim().length > 30).length >= 3;

  if (hasOverviewHeadings || (repoHasDescriptionInReadme && hasSubstantialText)) {
    findings.push({
      id: 'DOC-02-pass',
      ruleId: 'DOC-02',
      category: 'documentation',
      title: 'Project Purpose & Scope Articulated',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc02Rule.basePoints,
      maxEffect: doc02Rule.basePoints,
      explanation: 'The README contains explicit section headers or descriptive paragraphs explaining project scope and features.',
      evidence: {
        label: 'Overview Signal',
        value: hasOverviewHeadings ? 'Dedicated overview/features header' : 'Substantive introductory summary',
        sourceUrl: readmeUrl,
      },
    });
  } else {
    findings.push({
      id: 'DOC-02-warning',
      ruleId: 'DOC-02',
      category: 'documentation',
      title: 'Project Purpose Unclear from README Structure',
      status: 'warning',
      severity: 'medium',
      scoreEffect: 1,
      maxEffect: doc02Rule.basePoints,
      explanation: 'No clear overview, feature list, or architecture summary section was detected in the README.',
      recommendation: 'Add an "Overview" or "Features" heading near the top explaining the problem the project solves.',
      evidence: {
        label: 'README Structure',
        value: 'Missing standard overview / introduction headings',
        sourceUrl: readmeUrl,
      },
    });
  }

  // DOC-03: Installation & Environment Setup
  const doc03Rule = SCORING_RULES['DOC-03'];
  const hasInstallHeaders = /(?:#+\s*(?:install(?:ation)?|getting started|setup|prerequisites|requirements|quick\s*start))/i.test(content);
  const hasInstallCommands = /(?:npm (?:install|i|ci)|yarn (?:install|add)|pnpm (?:install|add)|pip install|poetry install|cargo build|go get|docker compose up)/i.test(content);

  if (hasInstallHeaders && hasInstallCommands) {
    findings.push({
      id: 'DOC-03-pass',
      ruleId: 'DOC-03',
      category: 'documentation',
      title: 'Installation & Setup Guidance Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc03Rule.basePoints,
      maxEffect: doc03Rule.basePoints,
      explanation: 'README documents installation instructions with dedicated headers and package management commands.',
      evidence: {
        label: 'Setup Evidence',
        value: 'Dedicated installation section with runnable command snippets',
        sourceUrl: readmeUrl,
      },
    });
  } else if (hasInstallHeaders || hasInstallCommands) {
    findings.push({
      id: 'DOC-03-warning',
      ruleId: 'DOC-03',
      category: 'documentation',
      title: 'Partial Setup Instructions Detected',
      status: 'warning',
      severity: 'low',
      scoreEffect: 2,
      maxEffect: doc03Rule.basePoints,
      explanation: 'Detected installation references or commands, but lacking complete step-by-step setup documentation.',
      recommendation: 'Provide explicit prerequisites, installation commands, and environment variable configuration instructions.',
      evidence: {
        label: 'Observation',
        value: hasInstallHeaders ? 'Header found without explicit commands' : 'Commands found without structured header',
        sourceUrl: readmeUrl,
      },
    });
  } else {
    findings.push({
      id: 'DOC-03-not-detected',
      ruleId: 'DOC-03',
      category: 'documentation',
      title: 'Installation Instructions Not Detected',
      status: 'not_detected',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: doc03Rule.basePoints,
      explanation: 'No installation or environment setup instructions were found in the README.',
      recommendation: 'Add an "Installation" section detailing prerequisite tools and setup commands.',
      evidence: {
        label: 'Observation',
        value: 'No installation headers or common package manager commands found',
        sourceUrl: readmeUrl,
      },
    });
  }

  // DOC-04: Usage Examples / Quick Start
  const doc04Rule = SCORING_RULES['DOC-04'];
  const hasUsageHeaders = /(?:#+\s*(?:usage|examples?|how to use|api|quick\s*start|walkthrough))/i.test(content);
  const hasCodeBlocks = /```[a-zA-Z]*\n[\s\S]{10,}\n```/.test(content);

  if (hasUsageHeaders && hasCodeBlocks) {
    findings.push({
      id: 'DOC-04-pass',
      ruleId: 'DOC-04',
      category: 'documentation',
      title: 'Usage Examples & Code Snippets Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc04Rule.basePoints,
      maxEffect: doc04Rule.basePoints,
      explanation: 'README provides dedicated usage instructions supported by formatted code blocks.',
      evidence: {
        label: 'Usage Section',
        value: 'Usage/Examples header with formatted code blocks',
        sourceUrl: readmeUrl,
      },
    });
  } else if (hasCodeBlocks || hasUsageHeaders) {
    findings.push({
      id: 'DOC-04-warning',
      ruleId: 'DOC-04',
      category: 'documentation',
      title: 'Partial Usage Examples Detected',
      status: 'warning',
      severity: 'low',
      scoreEffect: 1,
      maxEffect: doc04Rule.basePoints,
      explanation: 'Found code blocks or usage headers, but examples appear limited in scope.',
      recommendation: 'Include practical, copy-pasteable usage examples showing how to interact with the project.',
      evidence: {
        label: 'Observation',
        value: hasCodeBlocks ? 'Code blocks present without dedicated usage section' : 'Usage header present without code examples',
        sourceUrl: readmeUrl,
      },
    });
  } else {
    findings.push({
      id: 'DOC-04-not-detected',
      ruleId: 'DOC-04',
      category: 'documentation',
      title: 'Usage Examples Not Detected',
      status: 'not_detected',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: doc04Rule.basePoints,
      explanation: 'No dedicated usage instructions or code blocks were found in the README.',
      recommendation: 'Add a "Usage" section demonstrating the project with concise code examples.',
      evidence: {
        label: 'Observation',
        value: 'No usage headers or example code blocks detected',
        sourceUrl: readmeUrl,
      },
    });
  }

  // DOC-05: Testing Guidance in Documentation
  const doc05Rule = SCORING_RULES['DOC-05'];
  const hasTestHeaders = /(?:#+\s*(?:tests?|testing|running tests?|test suite))/i.test(content);
  const hasTestCommands = /(?:npm test|yarn test|pnpm test|vitest|jest|pytest|cargo test|go test|flutter test)/i.test(content);

  if (hasTestHeaders || hasTestCommands) {
    findings.push({
      id: 'DOC-05-pass',
      ruleId: 'DOC-05',
      category: 'documentation',
      title: 'Testing Guidance Documented in README',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc05Rule.basePoints,
      maxEffect: doc05Rule.basePoints,
      explanation: 'README documents how to run automated tests, enabling third-party verification.',
      evidence: {
        label: 'Testing Doc Signal',
        value: hasTestHeaders ? 'Dedicated testing header found' : 'Command "npm test / pytest / cargo test" referenced',
        sourceUrl: readmeUrl,
      },
    });
  } else {
    findings.push({
      id: 'DOC-05-not-detected',
      ruleId: 'DOC-05',
      category: 'documentation',
      title: 'Testing Instructions Not Documented in README',
      status: 'not_detected',
      severity: 'low',
      scoreEffect: 0,
      maxEffect: doc05Rule.basePoints,
      explanation: 'No testing instructions or test runner commands were found in the README.',
      recommendation: 'Add a short "Running Tests" section so evaluators can run and verify the test suite.',
      evidence: {
        label: 'Observation',
        value: 'No test commands or testing headers detected in README',
        sourceUrl: readmeUrl,
      },
    });
  }

  // DOC-06: Contribution Guidance / Live Demo Links
  const doc06Rule = SCORING_RULES['DOC-06'];
  const hasContrib = /(?:#+\s*(?:contribut(?:ing|e)|development|guidelines)|contributing\.md)/i.test(content);
  const hasDemo = /(?:https?:\/\/[^\s)]+(?:vercel\.app|netlify\.app|github\.io|pages\.dev|fly\.dev|herokuapp\.com|onrender\.com))/i.test(content) || !!repo.homepage;

  if (hasContrib || hasDemo) {
    const signals: string[] = [];
    if (hasContrib) signals.push('Contributing guidelines');
    if (hasDemo) signals.push('Live demo / deployment link');

    findings.push({
      id: 'DOC-06-pass',
      ruleId: 'DOC-06',
      category: 'documentation',
      title: 'Contribution Guide or Live Demo Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc06Rule.basePoints,
      maxEffect: doc06Rule.basePoints,
      explanation: `Repository provides additional developer guidance: ${signals.join(', ')}.`,
      evidence: {
        label: 'Detected Signals',
        value: signals.join(' and '),
        sourceUrl: readmeUrl,
      },
    });
  } else {
    findings.push({
      id: 'DOC-06-warning',
      ruleId: 'DOC-06',
      category: 'documentation',
      title: 'No Contributing Guide or Live Deployment Found in README',
      status: 'warning',
      severity: 'low',
      scoreEffect: 0,
      maxEffect: doc06Rule.basePoints,
      explanation: 'README does not reference a live demonstration URL or contributing guidelines.',
      recommendation: 'Include a link to a live deployed demo or a CONTRIBUTING.md guide.',
      evidence: {
        label: 'Observation',
        value: 'Neither contribution headers nor standard demo hosting URLs found',
        sourceUrl: readmeUrl,
      },
    });
  }

  return findings;
}
