/**
 * Versioned Report Generator
 */

import { AnalysisOutcome } from '../types/analysis';
import { RepoHealthReport } from '../types/report';
import { AssessmentCategoryKey, ScoringPerspectiveKey } from '../types/scoring';
import { calculateAssessmentScore } from './scoringEngine';
import { generateRecommendations } from './recommendations';

export const ANALYZER_VERSION = '1.1.0';
export const REPORT_SCHEMA_VERSION = 'https://repohealth.dev/schemas/v1.1/report.json';

export function generateReport(
  outcome: AnalysisOutcome,
  activePerspective: ScoringPerspectiveKey = 'balanced',
  categoryApplicability?: Partial<Record<AssessmentCategoryKey, boolean>>
): RepoHealthReport {
  const repo = outcome.raw.repo;
  const assessment = calculateAssessmentScore(
    outcome.findings,
    activePerspective,
    { categoryApplicability }
  );

  const recommendations = generateRecommendations(outcome.findings);

  return {
    version: ANALYZER_VERSION,
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    analyzerVersion: ANALYZER_VERSION,
    repository: {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      defaultBranch: repo.default_branch,
      isArchived: repo.archived,
      isFork: repo.fork,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      primaryLanguage: repo.language,
      languages: outcome.raw.languages,
      metrics: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        watchers: repo.watchers_count,
        sizeKb: repo.size,
      },
      license: repo.license
        ? {
            spdxId: repo.license.spdx_id,
            name: repo.license.name,
            url: repo.license.url,
          }
        : null,
      homepage: repo.homepage,
      topics: repo.topics || [],
    },
    scoring: {
      activePerspective,
      assessment,
    },
    findings: outcome.findings,
    technologies: outcome.technologies,
    provenance: outcome.provenance,
    dataCoverage: {
      ...outcome.coverage,
      limitations: Array.from(new Set([...outcome.limitations, ...assessment.limitations])),
    },
    recommendations,
    notice: {
      disclaimer:
        'RepoHealth assessments are evidence-based automated indicators derived exclusively from public GitHub metadata. They do not constitute a formal code security audit, hiring guarantee, or certification of developer skill.',
      assessmentPhilosophy:
        'RepoHealth values demonstrable engineering practices over popularity metrics. Star counts, fork counts, and mere presence of stub files do not inflate scores.',
    },
  };
}
