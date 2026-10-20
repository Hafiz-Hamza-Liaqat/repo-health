/**
 * README and Documentation Analyzer
 */

import { GitHubReadme, GitHubRepo } from '../types/github';
import { Finding } from '../types/scoring';
import { SCORING_RULES } from '../config/scoringRules';

export interface MarkdownHeading {
  level: number;
  rawText: string;
  cleanText: string;
  normalizedText: string;
  lineNumber: number;
}

/**
 * Extracts and normalizes Markdown ATX headings from markdown content.
 * Ignores code blocks and paragraph text.
 */
export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  if (!content) return [];

  const lines = content.split('\n');
  const headings: MarkdownHeading[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Toggle fenced code blocks
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    // Match ATX headings: # Heading
    const atxMatch = trimmed.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (atxMatch) {
      const level = atxMatch[1].length;
      const rawText = atxMatch[2].trim();

      // Strip markdown formatting (bold, italic, code, links)
      const cleanText = rawText
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link text](url) -> link text
        .replace(/[*_~`]/g, '') // formatting chars
        .trim();

      // Normalize: remove leading numbering like "1.", "1.1", "IV.", "Section 1:", etc.
      const normalized = cleanText
        .toLowerCase()
        .replace(/^(?:(?:section|part|step|chapter)\s+)?(?:[0-9]+(?:\.[0-9]+)*|[ivxlcdm]+)[\s.:)-]+\s*/i, '')
        .replace(/[:\-–—]+$/, '') // trailing punctuation
        .trim();

      headings.push({
        level,
        rawText,
        cleanText,
        normalizedText: normalized,
        lineNumber: i + 1,
      });
    }
  }

  return headings;
}

/**
 * Checks if a normalized heading matches one of the provided pattern terms.
 */
function matchesHeadingPattern(heading: MarkdownHeading, patterns: (string | RegExp)[]): boolean {
  const norm = heading.normalizedText;
  return patterns.some((p) => {
    if (typeof p === 'string') {
      return norm === p || norm.startsWith(`${p} `) || norm.endsWith(` ${p}`) || norm.includes(` ${p} `);
    }
    return p.test(norm);
  });
}

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

  const headings = extractMarkdownHeadings(content);
  const lowerContent = content.toLowerCase();

  // DOC-02: Project Purpose & Overview
  const doc02Rule = SCORING_RULES['DOC-02'];
  const overviewPatterns = [
    'project purpose',
    'purpose',
    'project overview',
    'overview',
    'about',
    'about the project',
    'what is',
    'introduction',
    'intro',
    'motivation',
    'background',
    'key features',
    'core features',
    'features',
    'architecture overview',
    'system overview',
    'architecture',
    'mission',
    'scope',
    'problem statement',
    'why',
  ];

  const matchedOverviewHeading = headings.find((h) =>
    matchesHeadingPattern(h, overviewPatterns)
  );

  // Supplementary: Check for substantive introductory paragraph (non-heading lines with description)
  const repoHasDescriptionInReadme = !!(
    repo.description &&
    repo.description.length > 15 &&
    lowerContent.includes(repo.description.toLowerCase().slice(0, 30))
  );

  // Substantive text in first 25 lines (ignoring headings and blank lines)
  const introLines = content
    .split('\n')
    .slice(0, 25)
    .filter((l) => !l.trim().startsWith('#') && !l.trim().startsWith('```') && l.trim().length > 30);
  const hasSubstantialIntroText = introLines.length >= 2;

  if (matchedOverviewHeading) {
    findings.push({
      id: 'DOC-02-pass',
      ruleId: 'DOC-02',
      category: 'documentation',
      title: 'Project Purpose & Scope Articulated',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc02Rule.basePoints,
      maxEffect: doc02Rule.basePoints,
      explanation: `README articulates project scope and purpose via section heading "${matchedOverviewHeading.rawText}" (line ${matchedOverviewHeading.lineNumber}).`,
      evidence: {
        label: 'Section Heading',
        value: `"${matchedOverviewHeading.rawText}" (line ${matchedOverviewHeading.lineNumber})`,
        sourceUrl: readmeUrl,
      },
    });
  } else if (repoHasDescriptionInReadme && hasSubstantialIntroText) {
    findings.push({
      id: 'DOC-02-pass',
      ruleId: 'DOC-02',
      category: 'documentation',
      title: 'Project Purpose & Scope Articulated',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc02Rule.basePoints,
      maxEffect: doc02Rule.basePoints,
      explanation: 'README articulates project scope and architecture in substantive introductory paragraphs aligned with repository metadata.',
      evidence: {
        label: 'Introductory Text',
        value: 'Substantive overview paragraphs detected in README introduction',
        sourceUrl: readmeUrl,
      },
    });
  } else if (hasSubstantialIntroText) {
    findings.push({
      id: 'DOC-02-partial',
      ruleId: 'DOC-02',
      category: 'documentation',
      title: 'Project Overview Evidenced in Text (No Dedicated Header)',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc02Rule.basePoints,
      maxEffect: doc02Rule.basePoints,
      explanation: 'Introductory paragraphs describe project scope, though lacking an explicit "Project Purpose" or "Overview" ATX heading.',
      evidence: {
        label: 'Introduction Text',
        value: 'Multi-line introduction text found in README',
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
      recommendation: 'Add a "Project Purpose", "Overview", or "Features" heading near the top explaining the problem the project solves.',
      evidence: {
        label: 'README Structure',
        value: 'Missing standard overview, purpose, or architecture headings',
        sourceUrl: readmeUrl,
      },
    });
  }

  // DOC-03: Installation & Environment Setup
  const doc03Rule = SCORING_RULES['DOC-03'];
  const installPatterns = [
    'installation',
    'install',
    'setup',
    'getting started',
    'quick start',
    'prerequisites',
    'requirements',
    'building from source',
    'build and run',
    'how to run',
    'development setup',
    'setup instructions',
    'setup and development commands',
  ];

  const matchedInstallHeading = headings.find((h) =>
    matchesHeadingPattern(h, installPatterns)
  );

  const hasInstallCommands = /(?:npm (?:install|i|ci|run dev)|yarn (?:install|add)|pnpm (?:install|add)|pip install|poetry install|cargo (?:build|run)|go (?:get|run|build)|docker compose up)/i.test(content);

  if (matchedInstallHeading && hasInstallCommands) {
    findings.push({
      id: 'DOC-03-pass',
      ruleId: 'DOC-03',
      category: 'documentation',
      title: 'Installation & Setup Guidance Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc03Rule.basePoints,
      maxEffect: doc03Rule.basePoints,
      explanation: `README documents installation instructions with section "${matchedInstallHeading.rawText}" and executable commands.`,
      evidence: {
        label: 'Setup Section',
        value: `"${matchedInstallHeading.rawText}" with command snippets`,
        sourceUrl: readmeUrl,
      },
    });
  } else if (matchedInstallHeading || hasInstallCommands) {
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
        value: matchedInstallHeading ? `Header "${matchedInstallHeading.rawText}" found without explicit commands` : 'Commands found without structured header',
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
  const usagePatterns = [
    'usage',
    'usage guide',
    'how to use',
    'examples',
    'example',
    'quick start',
    'walkthrough',
    'guide',
    'api',
    'cli usage',
    'commands',
    'development commands',
    'verification commands',
    'scoring methodology',
    'running',
  ];

  const matchedUsageHeading = headings.find((h) =>
    matchesHeadingPattern(h, usagePatterns)
  );

  const hasCodeBlocks = /```[a-zA-Z]*\n[\s\S]{10,}\n```/.test(content);

  if (matchedUsageHeading && hasCodeBlocks) {
    findings.push({
      id: 'DOC-04-pass',
      ruleId: 'DOC-04',
      category: 'documentation',
      title: 'Usage Examples & Code Snippets Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc04Rule.basePoints,
      maxEffect: doc04Rule.basePoints,
      explanation: `README provides dedicated usage instructions under "${matchedUsageHeading.rawText}" supported by formatted code blocks.`,
      evidence: {
        label: 'Usage Section',
        value: `"${matchedUsageHeading.rawText}" with code blocks`,
        sourceUrl: readmeUrl,
      },
    });
  } else if (hasCodeBlocks || matchedUsageHeading) {
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
        value: hasCodeBlocks ? 'Code blocks present without dedicated usage section' : `Usage header "${matchedUsageHeading?.rawText}" present without code examples`,
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
  const testingPatterns = [
    'tests',
    'testing',
    'running tests',
    'run tests',
    'test suite',
    'how to test',
    'verification',
    'verification commands',
    'quality commands',
  ];

  const matchedTestingHeading = headings.find((h) =>
    matchesHeadingPattern(h, testingPatterns)
  );

  const hasTestCommands = /(?:npm (?:test|run test)|yarn test|pnpm test|vitest|jest|pytest|cargo test|go test|flutter test)/i.test(content);

  if (matchedTestingHeading || hasTestCommands) {
    findings.push({
      id: 'DOC-05-pass',
      ruleId: 'DOC-05',
      category: 'documentation',
      title: 'Testing Guidance Documented in README',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc05Rule.basePoints,
      maxEffect: doc05Rule.basePoints,
      explanation: `README documents how to run automated tests (${matchedTestingHeading ? `heading "${matchedTestingHeading.rawText}"` : 'command references'}), enabling third-party verification.`,
      evidence: {
        label: 'Testing Doc Signal',
        value: matchedTestingHeading ? `Heading "${matchedTestingHeading.rawText}"` : 'Test execution commands documented in text',
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
  const contribPatterns = [
    'contributing',
    'contribution',
    'contribute',
    'development',
    'guidelines',
    'developer guide',
  ];

  const matchedContribHeading = headings.find((h) =>
    matchesHeadingPattern(h, contribPatterns)
  );

  const hasContribFile = /contributing\.md/i.test(content);
  const hasDemo = /(?:https?:\/\/[^\s)]+(?:vercel\.app|netlify\.app|github\.io|pages\.dev|fly\.dev|herokuapp\.com|onrender\.com))/i.test(content) || !!repo.homepage;

  if (matchedContribHeading || hasContribFile || hasDemo) {
    const signals: string[] = [];
    if (matchedContribHeading) signals.push(`Contributing section ("${matchedContribHeading.rawText}")`);
    else if (hasContribFile) signals.push('Contributing guide reference');
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
