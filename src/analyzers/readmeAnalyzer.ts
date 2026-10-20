/**
 * README and Documentation Analyzer
 */

import { GitHubReadme, GitHubRepo } from '../types/github';
import { PackageJsonManifest } from '../types/analysis';
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

/**
 * Retrieves the markdown content for a specific heading section,
 * bounded by the next heading of equal or higher level (or end of document).
 */
export function getSectionContent(
  heading: MarkdownHeading,
  allHeadings: MarkdownHeading[],
  rawContent: string
): string {
  if (!rawContent) return '';
  const lines = rawContent.split('\n');

  const currentIdx = allHeadings.findIndex(
    (h) => h.lineNumber === heading.lineNumber && h.rawText === heading.rawText
  );

  let endLineNumber = lines.length + 1; // 1-indexed, exclusive boundary

  if (currentIdx !== -1) {
    for (let i = currentIdx + 1; i < allHeadings.length; i++) {
      if (allHeadings[i].level <= heading.level) {
        endLineNumber = allHeadings[i].lineNumber;
        break;
      }
    }
  }

  const startLineIdx = heading.lineNumber; // 1-indexed heading.lineNumber is index in 0-indexed lines
  const endLineIdx = endLineNumber - 1;

  if (startLineIdx >= lines.length) return '';
  return lines.slice(startLineIdx, Math.max(startLineIdx, endLineIdx)).join('\n');
}

/**
 * Extracts all fenced code blocks from markdown text.
 */
export function extractFencedCodeBlocks(markdownText: string): string[] {
  const blockRegex = /```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(markdownText)) !== null) {
    if (match[1].trim().length > 0) {
      blocks.push(match[1].trim());
    }
  }
  return blocks;
}

/**
 * Detects if a shell line is purely an installation, build, or test execution command.
 */
export function isSetupOrTestCommandLine(rawLine: string): boolean {
  const line = rawLine.trim().replace(/^[$#>]\s*/, '');
  if (!line || line.startsWith('#') || line.startsWith('//')) return false;

  return /^(?:git\s+clone\b|cd\b|npm\s+(?:install|i|ci|add|build|run\s+build|test|run\s+test|run\s+test:[^\s]+|run\s+lint|run\s+typecheck|run\s+check)|yarn\s+(?:install|add|build|test|lint)|pnpm\s+(?:install|add|build|test|lint|i)|pip[0-9]*\s+install\b|poetry\s+(?:install|build)|cargo\s+(?:build|install|test)|go\s+(?:get|build|install|test)|vitest\b|jest\b|pytest\b|playwright\s+test\b|python(?:3)?\s+-m\s+(?:pytest|unittest)|mvn\s+(?:clean|install|test)|gradle\s+(?:build|test)|tsc\s+--noEmit)/i.test(line);
}

/**
 * Checks whether code within a fenced code block represents meaningful usage examples,
 * rather than strictly setup, build, or test commands.
 */
export function isMeaningfulUsageCode(codeText: string): boolean {
  const lines = codeText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length === 0) return false;

  const allSetupOrTest = lines.every((l) => isSetupOrTestCommandLine(l));
  return !allSetupOrTest;
}

/**
 * Extracts a real external deployment or demo URL from repo metadata or README content.
 */
export function findLiveDemoUrl(repoHomepage?: string | null, readmeContent?: string): string | null {
  if (repoHomepage && typeof repoHomepage === 'string') {
    const trimmed = repoHomepage.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      // Exclude if it merely points back to the GitHub repository itself
      if (!/github\.com\/[^/]+\/[^/]+(?:\/)?$/i.test(trimmed)) {
        return trimmed;
      }
    }
  }

  if (readmeContent) {
    // Check explicit markdown link labeled as demo or live preview
    const explicitDemoLink = readmeContent.match(
      /\[(?:live\s+demo|demo|live\s+preview|live\s+app|deployment|live\s+deployment|preview)\]\((https?:\/\/[^\s)]+)\)/i
    );
    if (explicitDemoLink && explicitDemoLink[1]) {
      return explicitDemoLink[1].trim();
    }

    // Check standard production/preview deployment hosting domains
    const hostingDomainMatch = readmeContent.match(
      /(https?:\/\/[a-zA-Z0-9_-]+\.(?:vercel\.app|netlify\.app|github\.io|pages\.dev|fly\.dev|herokuapp\.com|onrender\.com|railway\.app|surge\.sh)(?:\/[^\s)]*)?)/i
    );
    if (hostingDomainMatch && hostingDomainMatch[1]) {
      return hostingDomainMatch[1].trim();
    }
  }

  return null;
}

/**
 * Identifies likely web application projects through repository evidence:
 * frontend framework dependencies, HTML entry points, and frontend source/configs.
 */
export function isLikelyWebApplication(
  filePaths: string[] = [],
  packageJson?: PackageJsonManifest | null
): boolean {
  if (packageJson) {
    const deps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };
    const hasFrontendFramework = [
      'react',
      'react-dom',
      'vue',
      'svelte',
      '@angular/core',
      'next',
      'nuxt',
      'remix',
      'astro',
      'solid-js',
      'vite',
    ].some((pkg) => pkg in deps);
    if (hasFrontendFramework) return true;
  }

  const normalized = filePaths.map((p) => p.replace(/\\/g, '/'));
  const hasHtmlEntry = normalized.some((p) => /(?:^|\/)index\.html$/i.test(p));
  const hasFrontendConfig = normalized.some((p) =>
    /(?:^|\/)(?:vite\.config|next\.config|nuxt\.config|webpack\.config|tailwind\.config|postcss\.config)\.[a-z0-9]+$/i.test(p)
  );
  const hasFrontendSource = normalized.some((p) =>
    /(?:^|\/)src\/(?:App|main|index)\.(?:tsx|jsx|vue|svelte|html)$/i.test(p)
  );

  return (hasHtmlEntry && (hasFrontendConfig || hasFrontendSource)) || (hasFrontendConfig && hasFrontendSource);
}

/**
 * Extracts relative image references from Markdown or HTML image tags.
 */
export function extractImageReferences(markdownText: string): string[] {
  if (!markdownText) return [];
  const images: string[] = [];
  const mdImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = mdImageRegex.exec(markdownText)) !== null) {
    images.push(match[2].trim());
  }
  while ((match = htmlImageRegex.exec(markdownText)) !== null) {
    images.push(match[1].trim());
  }
  return images;
}

/**
 * Verifies whether a referenced repository image file exists in the scanned repository tree.
 */
export function verifyRepositoryImagePath(imageRef: string, filePaths: string[]): string | null {
  if (/^https?:\/\//i.test(imageRef)) {
    return null;
  }
  const clean = imageRef
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .split(/[?#]/)[0]
    .toLowerCase();

  const normalizedPaths = filePaths.map((p) => p.replace(/\\/g, '/'));
  const matched = normalizedPaths.find((p) => {
    const pLower = p.toLowerCase();
    return pLower === clean || pLower.endsWith('/' + clean);
  });

  return matched || null;
}

/**
 * Extracts substantive user workflow steps from a section (filtering out code blocks and setup/test commands).
 */
export function extractWorkflowSteps(sectionText: string): string[] {
  if (!sectionText) return [];
  const lines = sectionText.split('\n');
  const steps: string[] = [];
  let inCode = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```') || line.startsWith('~~~')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    // Numbered item (1. ...) or bullet list item (- ..., * ...)
    const stepMatch = line.match(/^(?:(?:\d+\.|\*|-)\s+)(.+)$/);
    if (stepMatch) {
      const stepText = stepMatch[1].trim();
      // Exclude setup/test commands formatted as list items (e.g. "1. npm install", "- npm test")
      if (stepText.length >= 10 && !isSetupOrTestCommandLine(stepText)) {
        steps.push(stepText);
      }
    }
  }

  return steps;
}

export function analyzeReadme(
  readme: GitHubReadme | null,
  repo: GitHubRepo,
  filePaths: string[] = [],
  packageJson?: PackageJsonManifest | null
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

  // DOC-04: Usage Examples / Quick Start (Libraries & Web Applications)
  const doc04Rule = SCORING_RULES['DOC-04'];
  const usagePatterns: (string | RegExp)[] = [
    'usage',
    'how to use',
    'examples',
    'example',
    'cli usage',
    'api usage',
    'quick start',
    'getting started',
    'basic usage',
    'usage guide',
    'usage examples',
    'code examples',
    'sample usage',
    'sample code',
  ];

  const matchedUsageHeadings = headings.filter((h) =>
    matchesHeadingPattern(h, usagePatterns)
  );

  const isWebApp = isLikelyWebApplication(filePaths, packageJson);

  let hasValidUsageSectionWithCode = false;
  let matchedUsageWithCodeHeading: MarkdownHeading | null = null;
  let usageSectionHasOnlySetupOrTest = false;

  let hasValidWebAppWorkflow = false;
  let matchedWebAppHeading: MarkdownHeading | null = null;
  let matchedWorkflowStepsCount = 0;
  let verifiedWebAppImages: string[] = [];
  let hasUnverifiedScreenshotRef = false;
  let unverifiedHeading: MarkdownHeading | null = null;

  const allImages = extractImageReferences(content);
  const verifiedAllImages = allImages
    .map((img) => verifyRepositoryImagePath(img, filePaths))
    .filter((p): p is string => p !== null);

  for (const h of matchedUsageHeadings) {
    const sectionText = getSectionContent(h, headings, content);
    const codeBlocks = extractFencedCodeBlocks(sectionText);

    // 1. Check code-based usage (libraries, APIs, CLI tools)
    if (codeBlocks.length > 0) {
      const hasMeaningful = codeBlocks.some((b) => isMeaningfulUsageCode(b));
      if (hasMeaningful) {
        hasValidUsageSectionWithCode = true;
        matchedUsageWithCodeHeading = h;
      } else {
        usageSectionHasOnlySetupOrTest = true;
      }
    }

    // 2. Check web-application workflow documentation
    if (isWebApp) {
      const workflowSteps = extractWorkflowSteps(sectionText);
      const sectionImages = extractImageReferences(sectionText);
      const verifiedSectionImages = sectionImages
        .map((img) => verifyRepositoryImagePath(img, filePaths))
        .filter((p): p is string => p !== null);

      const hasAnyUnverifiedImageRef = sectionImages.length > 0 && verifiedSectionImages.length === 0;

      if (workflowSteps.length >= 3) {
        if (verifiedSectionImages.length > 0) {
          hasValidWebAppWorkflow = true;
          matchedWebAppHeading = h;
          matchedWorkflowStepsCount = workflowSteps.length;
          verifiedWebAppImages = verifiedSectionImages;
        } else if (verifiedAllImages.length > 0) {
          hasValidWebAppWorkflow = true;
          matchedWebAppHeading = h;
          matchedWorkflowStepsCount = workflowSteps.length;
          verifiedWebAppImages = verifiedAllImages;
        } else if (hasAnyUnverifiedImageRef || (allImages.length > 0 && verifiedAllImages.length === 0)) {
          hasUnverifiedScreenshotRef = true;
          unverifiedHeading = h;
        }
      } else if (hasAnyUnverifiedImageRef || (sectionImages.length > 0 && verifiedSectionImages.length === 0)) {
        hasUnverifiedScreenshotRef = true;
        unverifiedHeading = h;
      }
    }
  }

  if (hasValidUsageSectionWithCode && matchedUsageWithCodeHeading) {
    findings.push({
      id: 'DOC-04-pass',
      ruleId: 'DOC-04',
      category: 'documentation',
      title: 'Usage Examples & Code Snippets Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc04Rule.basePoints,
      maxEffect: doc04Rule.basePoints,
      explanation: `README provides dedicated usage instructions under section "${matchedUsageWithCodeHeading.rawText}" supported by relevant executable code examples.`,
      evidence: {
        label: 'Usage Section',
        value: `"${matchedUsageWithCodeHeading.rawText}" with executable code examples`,
        sourceUrl: readmeUrl,
      },
    });
  } else if (hasValidWebAppWorkflow && matchedWebAppHeading) {
    const imgSample = verifiedWebAppImages.slice(0, 3).join(', ');
    findings.push({
      id: 'DOC-04-pass',
      ruleId: 'DOC-04',
      category: 'documentation',
      title: 'Usage Workflow & UI Examples Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc04Rule.basePoints,
      maxEffect: doc04Rule.basePoints,
      explanation: `README documents web-application user workflow under section "${matchedWebAppHeading.rawText}" (${matchedWorkflowStepsCount} actionable steps) supported by verified repository screenshots (${imgSample}).`,
      evidence: {
        label: 'Usage Workflow',
        value: `"${matchedWebAppHeading.rawText}" with ${matchedWorkflowStepsCount} workflow steps and verified screenshots (${imgSample})`,
        sourceUrl: readmeUrl,
      },
    });
  } else if (matchedUsageHeadings.length > 0) {
    const firstUsageHeading = unverifiedHeading || matchedUsageHeadings[0];

    if (hasUnverifiedScreenshotRef) {
      findings.push({
        id: 'DOC-04-warning',
        ruleId: 'DOC-04',
        category: 'documentation',
        title: 'Partial Usage Guide Detected (Unverified Screenshot References)',
        status: 'warning',
        severity: 'low',
        scoreEffect: 1,
        maxEffect: doc04Rule.basePoints,
        explanation: `Usage guide was detected under "${firstUsageHeading.rawText}", but referenced screenshot image(s) could not be verified in the repository tree.`,
        recommendation: 'Ensure referenced screenshot images exist in the repository tree (e.g. under docs/screenshots/).',
        evidence: {
          label: 'Observation',
          value: 'Referenced screenshot image(s) not found in repository tree',
          sourceUrl: readmeUrl,
        },
      });
    } else if (usageSectionHasOnlySetupOrTest) {
      findings.push({
        id: 'DOC-04-warning',
        ruleId: 'DOC-04',
        category: 'documentation',
        title: 'Partial Usage Examples Detected',
        status: 'warning',
        severity: 'low',
        scoreEffect: 1,
        maxEffect: doc04Rule.basePoints,
        explanation: `Usage section "${firstUsageHeading.rawText}" is present in the README, but contains setup or test commands rather than concrete usage examples.`,
        recommendation: 'Include practical usage examples or a documented user workflow showing how to use the project.',
        evidence: {
          label: 'Observation',
          value: `Usage section "${firstUsageHeading.rawText}" contains setup or test commands rather than usage examples`,
          sourceUrl: readmeUrl,
        },
      });
    } else {
      findings.push({
        id: 'DOC-04-warning',
        ruleId: 'DOC-04',
        category: 'documentation',
        title: 'Partial Usage Examples Detected',
        status: 'warning',
        severity: 'low',
        scoreEffect: 1,
        maxEffect: doc04Rule.basePoints,
        explanation: `Usage section "${firstUsageHeading.rawText}" is present in the README, but lacks executable code blocks, runnable examples, or documented user workflow steps.`,
        recommendation: 'Include practical usage examples or numbered workflow steps showing how to use the project.',
        evidence: {
          label: 'Observation',
          value: `Usage section "${firstUsageHeading.rawText}" lacks executable usage examples or verified workflow steps`,
          sourceUrl: readmeUrl,
        },
      });
    }
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
      explanation: 'No dedicated usage section (e.g., "Usage", "How to Use", "Examples", "CLI Usage", "Quick Start") was found in the README.',
      recommendation: 'Add a "Usage" or "How to Use" section demonstrating the project with concise examples or workflow steps.',
      evidence: {
        label: 'Observation',
        value: 'No dedicated usage section or code examples found in README',
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
  const contribPatterns: (string | RegExp)[] = [
    'contributing',
    'contribution',
    'contribution guidelines',
    'contributions',
    'how to contribute',
    'contributing guide',
    'code of conduct',
    'community guidelines',
  ];

  const matchedContribHeading = headings.find((h) =>
    matchesHeadingPattern(h, contribPatterns)
  );

  // Inspect the repository tree to find actual contribution files
  const contribFileRegex = /(?:^|\/|\.github\/)contributing\.(?:md|markdown|rst|txt)$/i;
  const matchedContribFile = filePaths.find((p) => contribFileRegex.test(p));

  // Find real live demo / deployment URL
  const demoUrl = findLiveDemoUrl(repo.homepage, content);

  if (matchedContribHeading || matchedContribFile || demoUrl) {
    const signals: string[] = [];
    const evidenceDetails: string[] = [];

    if (matchedContribHeading) {
      signals.push(`Contributing section in README ("${matchedContribHeading.rawText}")`);
      evidenceDetails.push(`Section "${matchedContribHeading.rawText}"`);
    }
    if (matchedContribFile) {
      signals.push(`Repository contribution file ("${matchedContribFile}")`);
      evidenceDetails.push(`File "${matchedContribFile}"`);
    }
    if (demoUrl) {
      signals.push(`Live deployment URL ("${demoUrl}")`);
      evidenceDetails.push(`Live demo "${demoUrl}"`);
    }

    findings.push({
      id: 'DOC-06-pass',
      ruleId: 'DOC-06',
      category: 'documentation',
      title: 'Contribution Guide or Live Demo Detected',
      status: 'pass',
      severity: 'info',
      scoreEffect: doc06Rule.basePoints,
      maxEffect: doc06Rule.basePoints,
      explanation: `Repository provides developer contribution guidance or live demo: ${signals.join('; ')}.`,
      evidence: {
        label: 'Contribution / Demo Evidence',
        value: evidenceDetails.join(' and '),
        sourcePath: matchedContribFile || (readme?.path || 'README.md'),
        sourceUrl: demoUrl || readmeUrl,
      },
    });
  } else {
    const textMentionsContribFile = /contributing\.md/i.test(content);
    const hasDevSetupHeading = headings.some((h) =>
      /(?:setup|development|dev commands|development commands)/i.test(h.normalizedText)
    );
    let observationText = 'No dedicated contribution section, CONTRIBUTING.md file, or live demo URL found';
    let explanationText = 'README does not provide contribution guidelines (e.g., "Contributing" section or CONTRIBUTING.md) or a live deployment link.';

    if (textMentionsContribFile) {
      observationText = 'README references CONTRIBUTING.md but no corresponding file exists in the repository tree';
      explanationText = 'README text mentions CONTRIBUTING.md, but no actual CONTRIBUTING.md or .github/CONTRIBUTING.md file was found in the repository tree, and no dedicated contribution section or live demo URL was detected.';
    } else if (hasDevSetupHeading) {
      observationText = 'Generic development/setup commands detected, but no formal contribution guidelines found';
      explanationText = 'README contains development setup commands, but lacks formal contribution guidelines (e.g., "Contributing" section or CONTRIBUTING.md) and live deployment links.';
    }

    findings.push({
      id: 'DOC-06-warning',
      ruleId: 'DOC-06',
      category: 'documentation',
      title: 'No Contributing Guide or Live Deployment Found in README',
      status: 'warning',
      severity: 'low',
      scoreEffect: 0,
      maxEffect: doc06Rule.basePoints,
      explanation: explanationText,
      recommendation: 'Include a link to a live deployed demo or a CONTRIBUTING.md guide.',
      evidence: {
        label: 'Observation',
        value: observationText,
        sourceUrl: readmeUrl,
      },
    });
  }

  return findings;
}
