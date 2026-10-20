/**
 * Provenance & Contribution Signals Analyzer (Initial Scope)
 * Independent of quality scores. Focuses on verifiable public activity and tooling artifacts.
 */

import { GitHubCommit, GitHubContributor, GitHubRepo } from '../types/github';
import { ProvenanceSignals } from '../types/analysis';

export function analyzeProvenance(
  commits: GitHubCommit[],
  contributors: GitHubContributor[],
  rootFiles: string[],
  readmeContent: string,
  repo: GitHubRepo
): ProvenanceSignals {
  // 1. Contributor distribution
  const topContributors = contributors.slice(0, 5).map((c) => ({
    login: c.login,
    contributions: c.contributions,
    avatarUrl: c.avatar_url,
  }));

  let consistency: ProvenanceSignals['commitAuthorConsistency'] = 'unknown';
  if (contributors.length === 1) {
    consistency = 'single_author';
  } else if (contributors.length >= 2 && contributors.length <= 5) {
    consistency = 'small_team';
  } else if (contributors.length > 5) {
    consistency = 'distributed_team';
  }

  // 2. Bot activity detection
  const botDetails: string[] = [];
  const knownBots = ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]', 'greenkeeper[bot]', 'snyk-bot'];

  commits.forEach((c) => {
    const authorLogin = c.author?.login || '';
    const authorName = c.commit.author.name.toLowerCase();
    const isBot =
      knownBots.includes(authorLogin) ||
      authorLogin.includes('[bot]') ||
      authorName.includes('[bot]') ||
      authorName.includes('dependabot') ||
      authorName.includes('renovate');

    if (isBot && !botDetails.some((b) => b.includes(authorLogin || authorName))) {
      botDetails.push(`Automated bot activity detected from "${authorLogin || authorName}" in recent commits.`);
    }
  });

  // Check if root files contain bot configs
  if (rootFiles.includes('.dependabot') || rootFiles.includes('.github/dependabot.yml')) {
    botDetails.push('Automated dependency maintenance configured via Dependabot.');
  }
  if (rootFiles.includes('renovate.json') || rootFiles.includes('.renovaterc.json')) {
    botDetails.push('Automated dependency maintenance configured via Renovate.');
  }

  // 3. AI Tooling Artifacts (Defensible, explicit files only)
  const aiToolingEvidence: string[] = [];

  // Check for configuration artifacts
  const aiFiles = rootFiles.filter((f) =>
    /^(?:\.cursorrules|\.cursorignore|\.copilot-instructions\.md|\.aidev|\.windsurfrules)$/i.test(f)
  );
  aiFiles.forEach((file) => {
    aiToolingEvidence.push(
      `Observed developer AI assistant configuration file in root: "${file}".`
    );
  });

  // Check for explicit disclosure in README
  if (
    readmeContent.toLowerCase().includes('built with github copilot') ||
    readmeContent.toLowerCase().includes('generated with chatgpt') ||
    readmeContent.toLowerCase().includes('ai assistance') ||
    readmeContent.toLowerCase().includes('claude code')
  ) {
    aiToolingEvidence.push('Explicit AI tooling assistance acknowledged by maintainers in README documentation.');
  }

  const aiToolingDetected = aiToolingEvidence.length > 0;

  const recentCommit = commits.length > 0 ? commits[0].commit.author.date : repo.pushed_at;

  return {
    totalContributorsSampled: contributors.length,
    commitAuthorConsistency: consistency,
    topContributors,
    recentCommitDate: recentCommit,
    botActivityDetected: botDetails.length > 0,
    botDetails: botDetails.length > 0 ? botDetails : undefined,
    aiToolingDetected,
    aiToolingEvidence: aiToolingDetected ? aiToolingEvidence : undefined,
    disclaimer:
      'Provenance signals are descriptive indicators from public GitHub activity. They do NOT calculate an AI-generated code percentage, verify human identity, or assess individual developer skill. This module is strictly separated from repository quality scores.',
  };
}
