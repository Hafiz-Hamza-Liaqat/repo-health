import {
  GitHubCommit,
  GitHubContributor,
  GitHubLicense,
  GitHubReadme,
  GitHubRelease,
  GitHubRepo,
  GitHubTag,
  GitHubTreeItem,
  GitHubWorkflow,
  GitHubWorkflowRun,
} from './github';
import { Finding } from './scoring';
import { DetectedTechnology } from './technology';

export type ScanStatus =
  | 'idle'
  | 'validating'
  | 'fetching_meta'
  | 'fetching_contents'
  | 'fetching_docs'
  | 'fetching_ci'
  | 'fetching_releases'
  | 'fetching_history'
  | 'analyzing'
  | 'complete'
  | 'error';

export interface ScanProgressStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  detail?: string;
}

export type ApiErrorType =
  | 'rate_limit_primary'
  | 'rate_limit_secondary'
  | 'bad_credentials'
  | 'forbidden'
  | 'not_found'
  | 'server_error'
  | 'network_error'
  | 'general';

export interface ApiFetchError {
  endpoint: string;
  status: number;
  message: string;
  errorType?: ApiErrorType;
  isRateLimit?: boolean;
  isSecondaryRateLimit?: boolean;
  rateLimitReset?: number;
  retryAfter?: number;
}

export interface ProvenanceSignals {
  totalContributorsSampled: number;
  commitAuthorConsistency: 'single_author' | 'small_team' | 'distributed_team' | 'unknown';
  topContributors: Array<{ login: string; contributions: number; avatarUrl: string }>;
  recentCommitDate?: string;
  botActivityDetected: boolean;
  botDetails?: string[];
  aiToolingDetected: boolean;
  aiToolingEvidence?: string[];
  disclaimer: string;
}

export interface PackageJsonManifest {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface GitTreeData {
  items: GitHubTreeItem[];
  isTruncated: boolean;
  totalItemsCount: number;
}

export type TreeCoverageStatus = 'complete' | 'truncated' | 'unavailable';

export interface DataCoverage {
  endpointsTotal: number;
  endpointsSucceeded: number;
  endpointsFailed: number;
  failedEndpoints: string[];
  endpointResponseLabel: string;
  treeStatus: TreeCoverageStatus;
  treeItemsCount: number;
  treeCoverageNote: string;
  absentOptionalResources: string[];
  limitations: string[];
}

export interface RawAnalysisData {
  repo: GitHubRepo;
  languages: Record<string, number>;
  readme: GitHubReadme | null;
  license: GitHubLicense | null;
  workflows: GitHubWorkflow[];
  workflowRuns: GitHubWorkflowRun[];
  releases: GitHubRelease[];
  tags: GitHubTag[];
  commits: GitHubCommit[];
  contributors: GitHubContributor[];
  rootFiles: string[];
  tree: GitTreeData | null;
  manifestContents: {
    packageJson?: PackageJsonManifest;
    pyprojectToml?: string;
    cargoToml?: string;
    goMod?: string;
    dockerfile?: string;
  };
  apiErrors: ApiFetchError[];
}

export interface AnalysisOutcome {
  raw: RawAnalysisData;
  findings: Finding[];
  technologies: DetectedTechnology[];
  provenance: ProvenanceSignals;
  limitations: string[];
  coverage: DataCoverage;
}
