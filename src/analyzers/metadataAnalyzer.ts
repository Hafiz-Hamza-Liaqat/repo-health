/**
 * Repository Metadata & Hygiene Analyzer
 */

import { GitHubRepo } from '../types/github';
import { Finding } from '../types/scoring';
import { SCORING_RULES } from '../config/scoringRules';

export function analyzeMetadata(repo: GitHubRepo): Finding[] {
  const findings: Finding[] = [];

  const meta01Rule = SCORING_RULES['META-01'];
  const meta02Rule = SCORING_RULES['META-02'];
  const meta03Rule = SCORING_RULES['META-03'];
  const meta04Rule = SCORING_RULES['META-04'];
  const meta05Rule = SCORING_RULES['META-05'];

  // META-01: Repository description
  const description = repo.description?.trim() || '';
  if (description.length >= 15) {
    findings.push({
      id: 'META-01-pass',
      ruleId: 'META-01',
      category: 'metadata',
      title: 'Repository Description Populated',
      status: 'pass',
      severity: 'info',
      scoreEffect: meta01Rule.basePoints,
      maxEffect: meta01Rule.basePoints,
      explanation: `Repository provides an informative overview description in GitHub metadata: "${description}".`,
      evidence: {
        label: 'Description',
        value: description,
        sourceUrl: repo.html_url,
      },
    });
  } else if (description.length > 0) {
    findings.push({
      id: 'META-01-warning',
      ruleId: 'META-01',
      category: 'metadata',
      title: 'Repository Description Is Very Brief',
      status: 'warning',
      severity: 'low',
      scoreEffect: 2,
      maxEffect: meta01Rule.basePoints,
      explanation: `The description is only ${description.length} characters long. A more descriptive summary aids portfolio evaluators.`,
      recommendation: 'Expand repository "About" description to summarize core functionality.',
      evidence: {
        label: 'Description',
        value: description,
        sourceUrl: repo.html_url,
      },
    });
  } else {
    findings.push({
      id: 'META-01-issue',
      ruleId: 'META-01',
      category: 'metadata',
      title: 'Repository Description Missing',
      status: 'issue',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: meta01Rule.basePoints,
      explanation: 'No description is populated in the GitHub "About" metadata box.',
      recommendation: 'Add a concise description explaining what this project is and what problem it solves.',
    });
  }

  // META-02: Topics & Tags
  const topics = repo.topics || [];
  if (topics.length >= 3) {
    findings.push({
      id: 'META-02-pass',
      ruleId: 'META-02',
      category: 'metadata',
      title: `Repository Topics Tagged (${topics.length} topics)`,
      status: 'pass',
      severity: 'info',
      scoreEffect: meta02Rule.basePoints,
      maxEffect: meta02Rule.basePoints,
      explanation: `Repository utilizes GitHub discovery topics: ${topics.slice(0, 5).join(', ')}${topics.length > 5 ? '...' : ''}.`,
      evidence: {
        label: 'Topics',
        value: topics.join(', '),
        sourceUrl: repo.html_url,
      },
    });
  } else if (topics.length > 0) {
    findings.push({
      id: 'META-02-warning',
      ruleId: 'META-02',
      category: 'metadata',
      title: `Limited Topics Tagged (${topics.length} topic)`,
      status: 'warning',
      severity: 'low',
      scoreEffect: 1,
      maxEffect: meta02Rule.basePoints,
      explanation: 'Only 1 or 2 topics are configured on GitHub.',
      recommendation: 'Tag relevant technologies and framework keywords (e.g. typescript, react, vitest) to improve discoverability.',
      evidence: {
        label: 'Topics',
        value: topics.join(', '),
      },
    });
  } else {
    findings.push({
      id: 'META-02-not-detected',
      ruleId: 'META-02',
      category: 'metadata',
      title: 'No Repository Topics Configured',
      status: 'not_detected',
      severity: 'low',
      scoreEffect: 0,
      maxEffect: meta02Rule.basePoints,
      explanation: 'Repository has no topics defined in its GitHub metadata.',
      recommendation: 'Add topic tags to indicate language, framework, and architectural domain.',
    });
  }

  // META-03: Default Branch Hygiene & Lifecycle
  const isArchived = repo.archived;
  const isDisabled = repo.disabled;
  const defaultBranch = repo.default_branch;

  if (isArchived || isDisabled) {
    findings.push({
      id: 'META-03-archived',
      ruleId: 'META-03',
      category: 'metadata',
      title: 'Repository Is Archived or Disabled',
      status: 'warning',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: meta03Rule.basePoints,
      explanation: 'This repository has been marked as archived or read-only by its maintainers.',
      evidence: {
        label: 'State',
        value: isArchived ? 'Archived (Read-Only)' : 'Disabled',
      },
    });
  } else {
    findings.push({
      id: 'META-03-pass',
      ruleId: 'META-03',
      category: 'metadata',
      title: `Active Lifecycle with Default Branch "${defaultBranch}"`,
      status: 'pass',
      severity: 'info',
      scoreEffect: meta03Rule.basePoints,
      maxEffect: meta03Rule.basePoints,
      explanation: `Repository is active (not archived) and standard default branch "${defaultBranch}" is configured.`,
      evidence: {
        label: 'Default Branch',
        value: defaultBranch,
      },
    });
  }

  // META-04: Live Homepage / Demo Link
  const homepage = repo.homepage?.trim() || '';
  if (homepage.length > 0 && /^https?:\/\//i.test(homepage)) {
    findings.push({
      id: 'META-04-pass',
      ruleId: 'META-04',
      category: 'metadata',
      title: 'Live Homepage or Documentation URL Linked',
      status: 'pass',
      severity: 'info',
      scoreEffect: meta04Rule.basePoints,
      maxEffect: meta04Rule.basePoints,
      explanation: `Direct external URL provided in GitHub metadata: "${homepage}".`,
      evidence: {
        label: 'Homepage URL',
        value: homepage,
        sourceUrl: homepage,
      },
    });
  } else {
    findings.push({
      id: 'META-04-not-detected',
      ruleId: 'META-04',
      category: 'metadata',
      title: 'No Live Homepage / Demo Linked in Metadata',
      status: 'not_detected',
      severity: 'low',
      scoreEffect: 0,
      maxEffect: meta04Rule.basePoints,
      explanation: 'Repository metadata does not link to a live demonstration or documentation website.',
      recommendation: 'Add your live preview or documentation website URL to the GitHub "Website" field.',
    });
  }

  // META-05: Maintenance Recency
  const lastPushMs = Date.now() - new Date(repo.pushed_at).getTime();
  const lastPushDays = Math.floor(lastPushMs / (1000 * 60 * 60 * 24));
  const pushDateFormatted = new Date(repo.pushed_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (lastPushDays <= 180) {
    findings.push({
      id: 'META-05-pass',
      ruleId: 'META-05',
      category: 'metadata',
      title: `Recent Maintenance Activity (${lastPushDays} days ago)`,
      status: 'pass',
      severity: 'info',
      scoreEffect: meta05Rule.basePoints,
      maxEffect: meta05Rule.basePoints,
      explanation: `Latest commit push occurred on ${pushDateFormatted} (${lastPushDays} days ago), evidencing active development.`,
      evidence: {
        label: 'Last Push Date',
        value: `${pushDateFormatted} (${lastPushDays} days ago)`,
      },
    });
  } else if (lastPushDays <= 365) {
    findings.push({
      id: 'META-05-warning',
      ruleId: 'META-05',
      category: 'metadata',
      title: `Moderate Development Inactivity (${lastPushDays} days ago)`,
      status: 'warning',
      severity: 'low',
      scoreEffect: 1,
      maxEffect: meta05Rule.basePoints,
      explanation: `No commits pushed in the last ${lastPushDays} days (latest: ${pushDateFormatted}).`,
      evidence: {
        label: 'Last Push Date',
        value: `${pushDateFormatted} (${lastPushDays} days ago)`,
      },
    });
  } else {
    findings.push({
      id: 'META-05-inactive',
      ruleId: 'META-05',
      category: 'metadata',
      title: `Dormant Repository (> 1 year without updates)`,
      status: 'issue',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: meta05Rule.basePoints,
      explanation: `Last commit push was ${lastPushDays} days ago (${pushDateFormatted}). Evaluators should note dependencies and security patches may be outdated.`,
      evidence: {
        label: 'Last Push Date',
        value: `${pushDateFormatted} (${lastPushDays} days ago)`,
      },
    });
  }

  return findings;
}
