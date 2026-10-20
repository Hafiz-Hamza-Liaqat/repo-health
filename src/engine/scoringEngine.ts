/**
 * Reusable, Independent Scoring Engine
 */

import {
  AssessmentCategoryKey,
  AssessmentScoreResult,
  CategoryScore,
  Finding,
  ScoringPerspectiveKey,
} from '../types/scoring';
import { SCORING_PERSPECTIVES } from '../config/scoringProfiles';
import { CATEGORY_LABELS } from '../config/scoringRules';

export function calculateAssessmentScore(
  findings: Finding[],
  perspectiveKey: ScoringPerspectiveKey = 'balanced',
  options: {
    categoryApplicability?: Partial<Record<AssessmentCategoryKey, boolean>>;
  } = {}
): AssessmentScoreResult {
  const perspective = SCORING_PERSPECTIVES[perspectiveKey] || SCORING_PERSPECTIVES.balanced;

  const categories: AssessmentCategoryKey[] = [
    'documentation',
    'license',
    'ci_cd',
    'testing',
    'releases',
    'metadata',
  ];

  const categoryScores = {} as Record<AssessmentCategoryKey, CategoryScore>;

  let totalEarnedNormalized = 0;
  let totalMaxApplicable = 0;

  const limitations: string[] = [];

  categories.forEach((cat) => {
    const isApplicable = options.categoryApplicability?.[cat] ?? true;
    const catWeight = perspective.weights[cat];
    const catFindings = findings.filter((f) => f.category === cat);

    // Sum base points inside this category
    const maxPossibleInCat = catFindings.reduce((sum, f) => sum + f.maxEffect, 0);
    const earnedInCat = catFindings.reduce((sum, f) => sum + f.scoreEffect, 0);

    // Ratio earned (0.0 to 1.0)
    const ratio = maxPossibleInCat > 0 ? earnedInCat / maxPossibleInCat : 0;

    // Scale to the category's weight in the current perspective
    const earnedScaled = isApplicable ? Math.round(ratio * catWeight * 10) / 10 : 0;
    const percentage = maxPossibleInCat > 0 ? Math.round(ratio * 100) : 0;

    let coverageNote: string | undefined;
    if (!isApplicable) {
      coverageNote = `Category marked not applicable. Weight (${catWeight} pts) excluded from score calculation.`;
      limitations.push(`Category "${CATEGORY_LABELS[cat]}" is excluded from scoring.`);
    } else {
      totalEarnedNormalized += earnedScaled;
      totalMaxApplicable += catWeight;
    }

    categoryScores[cat] = {
      category: cat,
      label: CATEGORY_LABELS[cat],
      weight: catWeight,
      earnedPoints: earnedScaled,
      maxPoints: catWeight,
      percentage,
      findings: catFindings,
      isApplicable,
      coverageNote,
    };
  });

  // Calculate final score normalized to 100
  let finalScore = 0;
  if (totalMaxApplicable > 0) {
    // If some category was N/A, normalize fairly to 100
    finalScore = Math.round((totalEarnedNormalized / totalMaxApplicable) * 100);
  }

  // Summary counts
  const summary = {
    passCount: findings.filter((f) => f.status === 'pass').length,
    warningCount: findings.filter((f) => f.status === 'warning').length,
    issueCount: findings.filter((f) => f.status === 'issue').length,
    notDetectedCount: findings.filter((f) => f.status === 'not_detected').length,
    unknownCount: findings.filter((f) => f.status === 'unknown').length,
  };

  // Grade mapping
  let grade: AssessmentScoreResult['grade'] = 'F';
  if (finalScore >= 95) grade = 'A+';
  else if (finalScore >= 85) grade = 'A';
  else if (finalScore >= 70) grade = 'B';
  else if (finalScore >= 50) grade = 'C';
  else if (finalScore >= 35) grade = 'D';
  else grade = 'F';

  return {
    perspective,
    totalScore: finalScore,
    earnedTotal: Math.round(totalEarnedNormalized * 10) / 10,
    maxTotal: totalMaxApplicable,
    grade,
    coveragePercentage: Math.round((totalMaxApplicable / 100) * 100),
    categoryScores,
    findings,
    summary,
    limitations,
  };
}
