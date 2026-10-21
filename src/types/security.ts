/**
 * Security & Supply-Chain Domain Types (Phase 2.1)
 */

export type SecurityFindingStatus =
  | 'pass'
  | 'warning'
  | 'issue'
  | 'unknown'
  | 'not_detected'
  | 'not_applicable';

export type SecurityFindingSeverity = 'high' | 'medium' | 'low' | 'info';

export interface SecurityFinding {
  id: string;
  ruleId: string; // e.g. 'SEC-POL-01', 'SEC-SEC-01', 'SEC-SC-01', 'WFL-01', 'WFL-02', etc.
  title: string;
  status: SecurityFindingStatus;
  severity: SecurityFindingSeverity;
  explanation: string;
  evidence?: {
    label: string;
    value: string;
    sourcePath?: string;
    sourceUrl?: string;
    line?: number;
    column?: number;
  };
  recommendation?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface WorkflowFileAnalysisSummary {
  path: string;
  status: string;
  byteLength?: number;
  parseSuccess?: boolean;
  error?: string;
}

export interface WorkflowCoverageSummary {
  status: 'complete' | 'partial' | 'unknown';
  discoveredCount: number;
  retrievedCount: number;
  skippedCount: number;
  failedCount: number;
  totalBytesRetrieved: number;
  notes: string[];
  workflowFiles?: WorkflowFileAnalysisSummary[];
}

export interface SecurityHygieneAssessment {
  findings: SecurityFinding[];
  summary: {
    passCount: number;
    warningCount: number;
    issueCount: number;
    notDetectedCount: number;
    unknownCount: number;
    notApplicableCount: number;
  };
  coverage: {
    treeStatus: 'complete' | 'truncated' | 'unavailable';
    inspectedPathsCount: number;
    notes: string[];
    workflowCoverage?: WorkflowCoverageSummary;
  };
}
