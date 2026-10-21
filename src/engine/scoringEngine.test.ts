import { describe, it, expect } from 'vitest';
import { calculateAssessmentScore } from './scoringEngine';
import { SCORING_PERSPECTIVES } from '../config/scoringProfiles';
import { Finding } from '../types/scoring';

describe('Scoring Engine', () => {
  it('should ensure all three perspective weights sum exactly to 100', () => {
    Object.values(SCORING_PERSPECTIVES).forEach((p) => {
      const sum = Object.values(p.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });
  });

  it('should maintain exact v2.0.0 baseline weights for all three perspectives', () => {
    expect(SCORING_PERSPECTIVES.balanced.weights).toEqual({
      documentation: 20,
      license: 15,
      ci_cd: 20,
      testing: 20,
      releases: 10,
      metadata: 15,
    });

    expect(SCORING_PERSPECTIVES.engineering.weights).toEqual({
      documentation: 10,
      license: 10,
      ci_cd: 30,
      testing: 30,
      releases: 10,
      metadata: 10,
    });

    expect(SCORING_PERSPECTIVES.presentation.weights).toEqual({
      documentation: 30,
      license: 25,
      ci_cd: 10,
      testing: 10,
      releases: 10,
      metadata: 15,
    });
  });

  it('should produce 100 score and A+ grade when all category findings pass', () => {
    const perfectFindings: Finding[] = [
      { id: '1', ruleId: 'DOC-01', category: 'documentation', title: 'Doc', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '2', ruleId: 'LIC-01', category: 'license', title: 'Lic', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '3', ruleId: 'CI-01', category: 'ci_cd', title: 'CI', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '4', ruleId: 'TST-01', category: 'testing', title: 'Test', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '5', ruleId: 'REL-01', category: 'releases', title: 'Rel', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '6', ruleId: 'META-01', category: 'metadata', title: 'Meta', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
    ];

    const result = calculateAssessmentScore(perfectFindings, 'balanced');
    expect(result.totalScore).toBe(100);
    expect(result.grade).toBe('A+');
    expect(result.summary.passCount).toBe(6);
    expect(result.summary.issueCount).toBe(0);
  });

  it('should recalculate score appropriately across different perspectives from same findings', () => {
    // Repository with strong CI and Testing (100%), but weak Documentation and License (0%)
    const findings: Finding[] = [
      { id: '1', ruleId: 'DOC-01', category: 'documentation', title: 'Doc', status: 'issue', severity: 'high', scoreEffect: 0, maxEffect: 10, explanation: '' },
      { id: '2', ruleId: 'LIC-01', category: 'license', title: 'Lic', status: 'issue', severity: 'high', scoreEffect: 0, maxEffect: 10, explanation: '' },
      { id: '3', ruleId: 'CI-01', category: 'ci_cd', title: 'CI', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '4', ruleId: 'TST-01', category: 'testing', title: 'Test', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '5', ruleId: 'REL-01', category: 'releases', title: 'Rel', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '6', ruleId: 'META-01', category: 'metadata', title: 'Meta', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
    ];

    const balanced = calculateAssessmentScore(findings, 'balanced');
    const engineering = calculateAssessmentScore(findings, 'engineering');
    const presentation = calculateAssessmentScore(findings, 'presentation');

    // In engineering perspective, testing and CI have 60% weight, so engineering score should be significantly higher
    expect(engineering.totalScore).toBeGreaterThan(balanced.totalScore);
    expect(balanced.totalScore).toBeGreaterThan(presentation.totalScore);

    // Underlying findings must be identical
    expect(balanced.findings).toEqual(engineering.findings);
  });

  it('should adjust denominator fairly when a category is marked not applicable', () => {
    const findings: Finding[] = [
      { id: '1', ruleId: 'DOC-01', category: 'documentation', title: 'Doc', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '2', ruleId: 'LIC-01', category: 'license', title: 'Lic', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '3', ruleId: 'CI-01', category: 'ci_cd', title: 'CI', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '4', ruleId: 'TST-01', category: 'testing', title: 'Test', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
      { id: '5', ruleId: 'REL-01', category: 'releases', title: 'Rel', status: 'pass', severity: 'info', scoreEffect: 0, maxEffect: 10, explanation: '' },
      { id: '6', ruleId: 'META-01', category: 'metadata', title: 'Meta', status: 'pass', severity: 'info', scoreEffect: 10, maxEffect: 10, explanation: '' },
    ];

    // Mark releases as N/A
    const result = calculateAssessmentScore(findings, 'balanced', {
      categoryApplicability: { releases: false },
    });

    // Releases has 10 pts weight in balanced, so maxTotal should be 90
    expect(result.maxTotal).toBe(90);
    expect(result.categoryScores.releases.isApplicable).toBe(false);
    expect(result.limitations.length).toBeGreaterThan(0);
    // Since all other categories passed, score normalized to 100 should be 100
    expect(result.totalScore).toBe(100);
  });

  it('should be deterministic for identical inputs', () => {
    const findings: Finding[] = [
      { id: '1', ruleId: 'DOC-01', category: 'documentation', title: 'Doc', status: 'warning', severity: 'medium', scoreEffect: 5, maxEffect: 10, explanation: '' },
    ];

    const run1 = calculateAssessmentScore(findings, 'balanced');
    const run2 = calculateAssessmentScore(findings, 'balanced');
    expect(run1).toEqual(run2);
  });
});
