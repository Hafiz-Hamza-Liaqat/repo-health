/**
 * Actionable Recommendations Generator
 */

import { Finding } from '../types/scoring';
import { RepoHealthReport } from '../types/report';

export function generateRecommendations(
  findings: Finding[]
): RepoHealthReport['recommendations'] {
  const recommendations: RepoHealthReport['recommendations'] = [];

  // Sort candidate findings by severity: high first, then medium, then low
  const candidates = findings
    .filter((f) => f.recommendation && (f.status === 'issue' || f.status === 'warning' || f.status === 'not_detected'))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2, info: 3 };
      return priorityOrder[a.severity] - priorityOrder[b.severity];
    });

  candidates.forEach((f, idx) => {
    recommendations.push({
      id: `rec-${idx + 1}-${f.ruleId}`,
      category: f.category,
      priority: f.severity === 'high' ? 'high' : f.severity === 'medium' ? 'medium' : 'low',
      title: f.title,
      action: f.recommendation || '',
      rationale: f.explanation,
    });
  });

  return recommendations;
}
