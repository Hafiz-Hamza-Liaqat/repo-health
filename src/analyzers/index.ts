/**
 * Analyzer Aggregator
 */

import { AnalysisOutcome, DataCoverage, RawAnalysisData, TreeCoverageStatus } from '../types/analysis';
import { analyzeReadme } from './readmeAnalyzer';
import { analyzeLicense } from './licenseAnalyzer';
import { analyzeWorkflows } from './workflowAnalyzer';
import { analyzeTestingEvidence } from './testingAnalyzer';
import { analyzeReleases } from './releasesAnalyzer';
import { analyzeMetadata } from './metadataAnalyzer';
import { detectTechnologies } from './technologyDetector';
import { analyzeProvenance } from './provenanceAnalyzer';
import { analyzeSecurityHygiene } from './securityHygieneAnalyzer';

export function runAllAnalyzers(raw: RawAnalysisData): AnalysisOutcome {
  const repo = raw.repo;
  const rootFiles = raw.rootFiles || [];
  const readmeContent = raw.readme?.decodedContent || '';
  const treeItems = raw.tree?.items || [];
  const allPaths = treeItems.length > 0 ? treeItems.map((i) => i.path) : rootFiles;

  // 1. Run each category analyzer
  const docFindings = analyzeReadme(
    raw.readme,
    repo,
    allPaths,
    raw.manifestContents?.packageJson
  );
  const licenseFindings = analyzeLicense(raw.license, repo, rootFiles);
  const workflowFindings = analyzeWorkflows(raw.workflows, raw.workflowRuns, repo, raw.apiErrors);
  const testingFindings = analyzeTestingEvidence(raw, repo);
  const releasesFindings = analyzeReleases(raw.releases, raw.tags, repo);
  const metadataFindings = analyzeMetadata(repo);

  const allFindings = [
    ...docFindings,
    ...licenseFindings,
    ...workflowFindings,
    ...testingFindings,
    ...releasesFindings,
    ...metadataFindings,
  ];

  // 2. Detect technologies
  const technologies = detectTechnologies(raw);

  // 3. Provenance signals
  const provenance = analyzeProvenance(
    raw.commits,
    raw.contributors,
    rootFiles,
    readmeContent,
    repo
  );

  // 4. Security Hygiene indicators & Workflow Security (Phase 2.1)
  const securityHygiene = analyzeSecurityHygiene(raw.tree, rootFiles, raw.workflowSecurityReport);

  // 5. Calculate API endpoint responses and repository tree coverage
  const totalEndpoints = 10; // repo, languages, readme, license, workflows, runs, releases, tags, contents, tree
  const failedEndpoints = raw.apiErrors.map((e) => e.endpoint);
  const endpointsFailed = raw.apiErrors.length;
  const endpointsSucceeded = Math.max(0, totalEndpoints - endpointsFailed);

  let treeStatus: TreeCoverageStatus = 'unavailable';
  let treeCoverageNote = 'Repository tree endpoint unavailable; inspection limited to root contents.';
  let treeItemsCount = 0;

  if (raw.tree) {
    treeItemsCount = raw.tree.totalItemsCount;
    if (raw.tree.isTruncated) {
      treeStatus = 'truncated';
      treeCoverageNote = `Tree response truncated (>100,000 items). Inspected ${treeItemsCount} tracked files.`;
    } else {
      treeStatus = 'complete';
      treeCoverageNote = `Complete repository tree inspected (${treeItemsCount} tracked paths).`;
    }
  }

  // Identify absent optional resources (not failures)
  const absentOptionalResources: string[] = [];
  if (raw.workflows.length === 0 && !failedEndpoints.some((e) => e.includes('/actions/workflows'))) {
    absentOptionalResources.push('No GitHub Actions workflows configured');
  }
  if (raw.releases.length === 0 && !failedEndpoints.some((e) => e.includes('/releases'))) {
    absentOptionalResources.push('No published GitHub releases');
  }
  if (raw.tags.length === 0 && !failedEndpoints.some((e) => e.includes('/tags'))) {
    absentOptionalResources.push('No Git version tags detected');
  }

  // Cross-validate repository size and content
  const limitations: string[] = [];
  const hasAccessibleContent =
    (raw.tree && raw.tree.items.length > 0) ||
    rootFiles.length > 0 ||
    (raw.readme && raw.readme.content.length > 0) ||
    raw.commits.length > 0;

  if (repo.size === 0) {
    if (hasAccessibleContent) {
      limitations.push(
        'Repository metadata reports a size of 0 KB, though active files were successfully retrieved from repository contents.'
      );
    } else if (endpointsFailed === 0) {
      limitations.push(
        'Repository is confirmed empty (0 KB size and 0 tracked files found across repository).'
      );
    } else {
      limitations.push(
        'Repository size reported as 0 KB, but content inspection was incomplete due to API endpoint failures.'
      );
    }
  }

  if (endpointsFailed > 0) {
    limitations.push(
      `Endpoint coverage notice: ${endpointsFailed} secondary endpoint(s) returned errors or were rate-limited (${failedEndpoints.join(', ')}). Results reflect available public data.`
    );
  }

  if (repo.fork) {
    limitations.push(
      'This repository is a fork. Score reflects current repository state, which may include upstream commits.'
    );
  }

  const coverage: DataCoverage = {
    endpointsTotal: totalEndpoints,
    endpointsSucceeded,
    endpointsFailed,
    failedEndpoints,
    endpointResponseLabel: `${endpointsSucceeded}/${totalEndpoints}`,
    treeStatus,
    treeItemsCount,
    treeCoverageNote,
    absentOptionalResources,
    limitations,
  };

  return {
    raw,
    findings: allFindings,
    technologies,
    provenance,
    limitations,
    coverage,
    securityHygiene,
  };
}
