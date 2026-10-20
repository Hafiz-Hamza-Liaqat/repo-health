/**
 * Scoring and Assessment Types for RepoHealth
 */

export type AssessmentCategoryKey =
  | 'documentation'
  | 'license'
  | 'ci_cd'
  | 'testing'
  | 'releases'
  | 'metadata';

export type ScoringPerspectiveKey =
  | 'balanced'
  | 'engineering'
  | 'presentation';

export type FindingStatus =
  | 'pass'
  | 'warning'
  | 'issue'
  | 'unknown'
  | 'not_detected'
  | 'not_applicable';

export type FindingSeverity = 'high' | 'medium' | 'low' | 'info';

export interface ScoringRule {
  id: string;
  category: AssessmentCategoryKey;
  title: string;
  description: string;
  basePoints: number; // default contribution within the category
}

export interface Finding {
  id: string;
  ruleId: string;
  category: AssessmentCategoryKey;
  title: string;
  status: FindingStatus;
  severity: FindingSeverity;
  scoreEffect: number; // earned points from this check
  maxEffect: number; // maximum possible points for this check
  explanation: string;
  evidence?: {
    label: string;
    value: string;
    sourcePath?: string;
    sourceUrl?: string;
  };
  recommendation?: string;
}

export interface CategoryScore {
  category: AssessmentCategoryKey;
  label: string;
  weight: number; // configured weight in current perspective
  earnedPoints: number; // calculated earned score
  maxPoints: number; // category max points (equals weight)
  percentage: number; // 0-100%
  findings: Finding[];
  isApplicable: boolean;
  coverageNote?: string;
}

export interface ScoringPerspective {
  key: ScoringPerspectiveKey;
  name: string;
  tagline: string;
  description: string;
  weights: Record<AssessmentCategoryKey, number>; // Must sum to 100
}

export interface AssessmentScoreResult {
  perspective: ScoringPerspective;
  totalScore: number; // 0-100 (or adjusted denominator)
  earnedTotal: number;
  maxTotal: number; // adjusted denominator if categories are N/A
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  coveragePercentage: number;
  categoryScores: Record<AssessmentCategoryKey, CategoryScore>;
  findings: Finding[];
  summary: {
    passCount: number;
    warningCount: number;
    issueCount: number;
    notDetectedCount: number;
    unknownCount: number;
  };
  limitations: string[];
}
