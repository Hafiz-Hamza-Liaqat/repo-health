/**
 * Analyzer Aggregator
 */

import { AnalysisOutcome, RawAnalysisData } from '../types/analysis';
import { analyzeReadme } from './readmeAnalyzer';
import { analyzeLicense } from './licenseAnalyzer';
import { analyzeWorkflows } from './workflowAnalyzer';
import { analyzeTestingEvidence } from './testingAnalyzer';
import { analyzeReleases } from './releasesAnalyzer';
import { analyzeMetadata } from './metadataAnalyzer';
import { detectTechnologies } from './technologyDetector';
import { analyzeProvenance } from './provenanceAnalyzer';

export function runAllAnalyzers(raw: RawAnalysisData): AnalysisOutcome {
  const repo = raw.repo;
  const rootFiles = raw.rootFiles || [];
  const readmeContent = raw.readme?.decodedContent || '';

  // 1. Run each category analyzer
  const docFindings = analyzeReadme(raw.readme, repo);
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

  // 4. Calculate coverage and limitations
  const totalEndpoints = 9; // metadata, languages, readme, license, workflows, runs, releases, tags, contents
  const endpointsFailed = raw.apiErrors.length;
  const endpointsSucceeded = Math.max(0, totalEndpoints - endpointsFailed);
  const coveragePercentage = Math.round((endpointsSucceeded / totalEndpoints) * 100);

  const limitations: string[] = [];
  if (endpointsFailed > 0) {
    limitations.push(
      `Partial API coverage: ${endpointsFailed} secondary endpoint(s) failed or were rate-limited. Results reflect available public data.`
    );
  }
  if (repo.fork) {
    limitations.push('This repository is a fork. Score reflects current repository state, which may include upstream commits.');
  }
  if (repo.size === 0) {
    limitations.push('Repository appears empty or has zero recorded bytes in GitHub metadata.');
  }

  return {
    raw,
    findings: allFindings,
    technologies,
    provenance,
    limitations,
    coverage: {
      endpointsTotal: totalEndpoints,
      endpointsSucceeded,
      endpointsFailed,
      percentage: coveragePercentage,
    },
  };
}
