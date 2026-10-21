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
  ruleId: string; // e.g. 'SEC-POL-01', 'SEC-POL-02', 'SEC-SEC-01', 'SEC-SC-01'
  title: string;
  status: SecurityFindingStatus;
  severity: SecurityFindingSeverity;
  explanation: string;
  evidence?: {
    label: string;
    value: string;
    sourcePath?: string;
    sourceUrl?: string;
  };
  recommendation?: string;
}

export interface SecurityHygieneAssessment {
  findings: SecurityFinding[];
  summary: {
    passCount: number;
    warningCount: number;
    issueCount: number;
    notDetectedCount: number;
    unknownCount: number;
  };
  coverage: {
    treeStatus: 'complete' | 'truncated' | 'unavailable';
    inspectedPathsCount: number;
    notes: string[];
  };
}
