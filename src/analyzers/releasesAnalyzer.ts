/**
 * Releases and Git Tags Analyzer
 */

import { GitHubRelease, GitHubRepo, GitHubTag } from '../types/github';
import { Finding } from '../types/scoring';
import { SCORING_RULES } from '../config/scoringRules';

export function analyzeReleases(
  releases: GitHubRelease[],
  tags: GitHubTag[],
  repo: GitHubRepo
): Finding[] {
  const findings: Finding[] = [];

  const rel01Rule = SCORING_RULES['REL-01'];
  const rel02Rule = SCORING_RULES['REL-02'];
  const rel03Rule = SCORING_RULES['REL-03'];

  const hasReleases = releases.length > 0;
  const hasTags = tags.length > 0;

  // REL-01: Published GitHub Releases with Notes
  if (hasReleases) {
    const latestRelease = releases[0];
    const hasReleaseNotes = !!(latestRelease.body && latestRelease.body.trim().length > 20);
    const dateFormatted = new Date(latestRelease.published_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    findings.push({
      id: 'REL-01-pass',
      ruleId: 'REL-01',
      category: 'releases',
      title: `Published GitHub Releases Found (Latest: ${latestRelease.tag_name})`,
      status: 'pass',
      severity: 'info',
      scoreEffect: rel01Rule.basePoints,
      maxEffect: rel01Rule.basePoints,
      explanation: `Repository publishes formal GitHub releases. Latest release "${latestRelease.name || latestRelease.tag_name}" was published on ${dateFormatted}${hasReleaseNotes ? ' with structured release notes.' : '.'} Note: Release existence indicates packaging milestones, not necessarily production readiness.`,
      evidence: {
        label: 'Latest Release',
        value: `${latestRelease.tag_name} (${dateFormatted})`,
        sourceUrl: latestRelease.html_url,
      },
    });
  } else {
    findings.push({
      id: 'REL-01-not-detected',
      ruleId: 'REL-01',
      category: 'releases',
      title: 'No Published GitHub Releases Found',
      status: 'not_detected',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: rel01Rule.basePoints,
      explanation: 'No official releases have been published via the GitHub Releases mechanism.',
      recommendation: 'Publish formal GitHub releases with release notes when cutting major or minor versions.',
      evidence: {
        label: 'GitHub Releases',
        value: '0 releases detected',
        sourceUrl: `${repo.html_url}/releases`,
      },
    });
  }

  // REL-02: Git Tags & Semantic Versioning
  if (hasTags) {
    const latestTag = tags[0];
    const isSemver = /^v?[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[a-zA-Z0-9.]+)?$/.test(latestTag.name);

    findings.push({
      id: 'REL-02-pass',
      ruleId: 'REL-02',
      category: 'releases',
      title: `Git Version Tags Detected (Latest: ${latestTag.name})`,
      status: 'pass',
      severity: 'info',
      scoreEffect: rel02Rule.basePoints,
      maxEffect: rel02Rule.basePoints,
      explanation: `Found Git version tags tracking repository milestones. Latest tag "${latestTag.name}" ${isSemver ? 'follows semantic versioning conventions' : 'uses custom tag notation'}.`,
      evidence: {
        label: 'Latest Tag',
        value: `${latestTag.name} (commit: ${latestTag.commit.sha.slice(0, 7)})`,
        sourceUrl: `${repo.html_url}/tags`,
      },
    });
  } else {
    findings.push({
      id: 'REL-02-not-detected',
      ruleId: 'REL-02',
      category: 'releases',
      title: 'No Git Tags Detected',
      status: 'not_detected',
      severity: 'low',
      scoreEffect: 0,
      maxEffect: rel02Rule.basePoints,
      explanation: 'No Git tags were found. Version milestones are not recorded in Git history.',
      recommendation: 'Tag important release commits using semantic versioning (e.g. git tag v1.0.0).',
    });
  }

  // REL-03: Release Recency & Packaging
  if (hasReleases) {
    const latestRelease = releases[0];
    const releaseAgeMs = Date.now() - new Date(latestRelease.published_at).getTime();
    const releaseAgeDays = Math.floor(releaseAgeMs / (1000 * 60 * 60 * 24));

    if (releaseAgeDays <= 180) {
      findings.push({
        id: 'REL-03-pass',
        ruleId: 'REL-03',
        category: 'releases',
        title: `Recent Release Activity (${releaseAgeDays} days ago)`,
        status: 'pass',
        severity: 'info',
        scoreEffect: rel03Rule.basePoints,
        maxEffect: rel03Rule.basePoints,
        explanation: `Latest release was published within the past 6 months (${releaseAgeDays} days ago), showing active distribution cadence.`,
        evidence: {
          label: 'Release Age',
          value: `${releaseAgeDays} days ago`,
          sourceUrl: latestRelease.html_url,
        },
      });
    } else {
      findings.push({
        id: 'REL-03-warning',
        ruleId: 'REL-03',
        category: 'releases',
        title: `Release History Inactive (> ${releaseAgeDays} days ago)`,
        status: 'warning',
        severity: 'low',
        scoreEffect: 1,
        maxEffect: rel03Rule.basePoints,
        explanation: `Latest release was published ${releaseAgeDays} days ago. Evaluators should check whether recent code commits on default branch are unreleased.`,
        evidence: {
          label: 'Release Age',
          value: `${releaseAgeDays} days ago`,
          sourceUrl: latestRelease.html_url,
        },
      });
    }
  } else if (hasTags) {
    findings.push({
      id: 'REL-03-partial',
      ruleId: 'REL-03',
      category: 'releases',
      title: 'Git Tags Exist Without Formal Packaging',
      status: 'warning',
      severity: 'low',
      scoreEffect: 1,
      maxEffect: rel03Rule.basePoints,
      explanation: 'Repository has Git tags, but no packaged GitHub releases with binary assets or changelogs.',
    });
  } else {
    findings.push({
      id: 'REL-03-not-detected',
      ruleId: 'REL-03',
      category: 'releases',
      title: 'No Release Packaging History',
      status: 'not_detected',
      severity: 'low',
      scoreEffect: 0,
      maxEffect: rel03Rule.basePoints,
      explanation: 'No release packaging or version history is documented on GitHub.',
    });
  }

  return findings;
}
