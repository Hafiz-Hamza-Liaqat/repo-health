import { AssessmentScoreResult, Finding, ScoringPerspectiveKey } from './scoring';
import { DetectedTechnology } from './technology';
import { DataCoverage, ProvenanceSignals } from './analysis';
import { SecurityHygieneAssessment } from './security';

export interface RepoHealthReport {
  version: '1.1.0' | '1.0.0';
  schemaVersion: string;
  generatedAt: string;
  analyzerVersion: string;
  repository: {
    owner: string;
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    isArchived: boolean;
    isFork: boolean;
    createdAt: string;
    updatedAt: string;
    pushedAt: string;
    primaryLanguage: string | null;
    languages: Record<string, number>;
    metrics: {
      stars: number;
      forks: number;
      openIssues: number;
      watchers: number;
      sizeKb: number;
    };
    license: {
      spdxId: string | null;
      name: string | null;
      url: string | null;
    } | null;
    homepage: string | null;
    topics: string[];
  };
  scoring: {
    activePerspective: ScoringPerspectiveKey;
    assessment: AssessmentScoreResult;
  };
  findings: Finding[];
  technologies: DetectedTechnology[];
  provenance: ProvenanceSignals;
  dataCoverage: DataCoverage;
  recommendations: Array<{
    id: string;
    category: string;
    priority: 'high' | 'medium' | 'low';
    title: string;
    action: string;
    rationale: string;
  }>;
  notice: {
    disclaimer: string;
    assessmentPhilosophy: string;
  };
  securityHygiene?: SecurityHygieneAssessment;
}
