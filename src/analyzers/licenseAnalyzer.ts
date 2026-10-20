/**
 * License & Open Source Compliance Analyzer
 */

import { GitHubLicense, GitHubRepo } from '../types/github';
import { Finding } from '../types/scoring';
import { SCORING_RULES } from '../config/scoringRules';

export function analyzeLicense(
  license: GitHubLicense | null,
  repo: GitHubRepo,
  rootFiles: string[]
): Finding[] {
  const findings: Finding[] = [];

  const lic01Rule = SCORING_RULES['LIC-01'];
  const lic02Rule = SCORING_RULES['LIC-02'];
  const lic03Rule = SCORING_RULES['LIC-03'];

  // Check physical file in root
  const licenseFileInRoot = rootFiles.find((f) =>
    /^(?:license|licence|copying)(?:\.(?:md|txt|markdown))?$/i.test(f)
  );

  const spdxId = repo.license?.spdx_id || license?.license?.spdx_id;
  const licenseName = repo.license?.name || license?.license?.name || license?.name;
  const isRecognizedSpdx = spdxId && spdxId !== 'NOASSERTION';

  // LIC-01: Recognized Open Source License
  if (isRecognizedSpdx) {
    findings.push({
      id: 'LIC-01-pass',
      ruleId: 'LIC-01',
      category: 'license',
      title: `Recognized License Detected: ${spdxId}`,
      status: 'pass',
      severity: 'info',
      scoreEffect: lic01Rule.basePoints,
      maxEffect: lic01Rule.basePoints,
      explanation: `Project specifies a standard SPDX-recognized license (${spdxId} - "${licenseName}"). This provides explicit legal terms for use, modification, and evaluation.`,
      evidence: {
        label: 'SPDX Identifier',
        value: spdxId,
        sourceUrl: repo.license?.url || `${repo.html_url}/blob/${repo.default_branch}/${licenseFileInRoot || 'LICENSE'}`,
      },
    });
  } else if (licenseName && licenseName !== 'Other') {
    findings.push({
      id: 'LIC-01-warning',
      ruleId: 'LIC-01',
      category: 'license',
      title: 'Custom or Non-SPDX License Detected',
      status: 'warning',
      severity: 'medium',
      scoreEffect: Math.floor(lic01Rule.basePoints / 2),
      maxEffect: lic01Rule.basePoints,
      explanation: `License named "${licenseName}" was detected, but it does not map to a standard SPDX identifier. Evaluators may need legal review to verify distribution terms.`,
      evidence: {
        label: 'License Claim',
        value: licenseName,
      },
      recommendation: 'Choose a standard SPDX license consistent with the project’s intended distribution and commercial or open-source goals.',
    });
  } else {
    findings.push({
      id: 'LIC-01-issue',
      ruleId: 'LIC-01',
      category: 'license',
      title: 'No Recognized License Detected',
      status: 'issue',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: lic01Rule.basePoints,
      explanation: 'No license metadata was detected on GitHub. Under standard copyright law, unlicensed public repositories remain under default exclusive copyright, limiting how evaluators and clients can test or adopt the code.',
      recommendation: 'Add an open-source or commercial license that reflects how you intend others to use and evaluate your work.',
    });
  }

  // LIC-02: Dedicated Physical License File
  if (licenseFileInRoot || license) {
    const filename = licenseFileInRoot || license?.path || 'LICENSE';
    findings.push({
      id: 'LIC-02-pass',
      ruleId: 'LIC-02',
      category: 'license',
      title: `Dedicated License File Present (${filename})`,
      status: 'pass',
      severity: 'info',
      scoreEffect: lic02Rule.basePoints,
      maxEffect: lic02Rule.basePoints,
      explanation: `A standalone license document exists in the repository root at "${filename}".`,
      evidence: {
        label: 'File Path',
        value: filename,
        sourcePath: filename,
        sourceUrl: `${repo.html_url}/blob/${repo.default_branch}/${filename}`,
      },
    });
  } else {
    findings.push({
      id: 'LIC-02-issue',
      ruleId: 'LIC-02',
      category: 'license',
      title: 'Dedicated License File Not Found in Root',
      status: 'issue',
      severity: 'medium',
      scoreEffect: 0,
      maxEffect: lic02Rule.basePoints,
      explanation: 'No standalone LICENSE, COPYING, or LICENSE.md file was found in the repository root.',
      recommendation: 'Place a dedicated LICENSE or LICENSE.md file in the root directory.',
    });
  }

  // LIC-03: Unambiguous Distribution Rights
  if (isRecognizedSpdx && (licenseFileInRoot || license)) {
    findings.push({
      id: 'LIC-03-pass',
      ruleId: 'LIC-03',
      category: 'license',
      title: 'Unambiguous Licensing & Distribution Terms',
      status: 'pass',
      severity: 'info',
      scoreEffect: lic03Rule.basePoints,
      maxEffect: lic03Rule.basePoints,
      explanation: 'Licensing is clearly aligned between repository metadata and physical repository files.',
      evidence: {
        label: 'Terms Alignment',
        value: `SPDX ${spdxId} verified with root file`,
      },
    });
  } else {
    findings.push({
      id: 'LIC-03-warning',
      ruleId: 'LIC-03',
      category: 'license',
      title: 'Licensing Terms Ambiguous or Incomplete',
      status: 'warning',
      severity: 'medium',
      scoreEffect: 1,
      maxEffect: lic03Rule.basePoints,
      explanation: 'Repository lacks either an SPDX metadata declaration or a dedicated root license file, creating ambiguity for enterprise evaluators.',
      recommendation: 'Ensure both the GitHub repository license selector and a root LICENSE file declare identical license terms.',
    });
  }

  return findings;
}
