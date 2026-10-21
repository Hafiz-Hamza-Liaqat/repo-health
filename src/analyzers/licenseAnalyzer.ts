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
  const hasLicenseFile = !!(licenseFileInRoot || license);
  const licenseFileName = licenseFileInRoot || license?.path || 'LICENSE';

  const spdxId = repo.license?.spdx_id || license?.license?.spdx_id;
  const licenseName = repo.license?.name || license?.license?.name || license?.name;
  const isRecognizedSpdx = Boolean(spdxId && spdxId !== 'NOASSERTION');

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
        value: spdxId!,
        sourceUrl: repo.license?.url || `${repo.html_url}/blob/${repo.default_branch}/${licenseFileName}`,
      },
    });
  } else if (licenseName && licenseName !== 'Other' && licenseName !== 'NOASSERTION') {
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
  } else if (hasLicenseFile) {
    // Root license file exists, but metadata is NOASSERTION, Other, or unrecognized (e.g. Strideto)
    findings.push({
      id: 'LIC-01-warning',
      ruleId: 'LIC-01',
      category: 'license',
      title: 'Unrecognized or Unverified License Metadata',
      status: 'warning',
      severity: 'medium',
      scoreEffect: Math.floor(lic01Rule.basePoints / 2),
      maxEffect: lic01Rule.basePoints,
      explanation: `A standalone license document exists at "${licenseFileName}", but GitHub license metadata is ${spdxId === 'NOASSERTION' ? 'NOASSERTION' : 'unrecognized'} and could not be independently mapped to a standard SPDX identifier. The repository is not unlicensed, but evaluators must review "${licenseFileName}" manually to determine legal terms.`,
      evidence: {
        label: 'License File & Metadata',
        value: `File "${licenseFileName}" present; metadata: ${spdxId || licenseName || 'unrecognized'}`,
        sourcePath: licenseFileName,
        sourceUrl: `${repo.html_url}/blob/${repo.default_branch}/${licenseFileName}`,
      },
      recommendation: `Review "${licenseFileName}" to ensure it matches standard SPDX text if an open-source or permissive license was intended, enabling automated license classification.`,
    });
  } else {
    // True missing-license case (e.g. Ecommerce Furniture Store)
    findings.push({
      id: 'LIC-01-issue',
      ruleId: 'LIC-01',
      category: 'license',
      title: 'No Recognized License Detected',
      status: 'issue',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: lic01Rule.basePoints,
      explanation: 'Neither a dedicated root license file nor recognized license metadata was detected on GitHub. Under standard copyright law, unlicensed public repositories remain under default exclusive copyright, limiting how evaluators and clients can test, evaluate, or adopt the code.',
      recommendation: 'Add a dedicated LICENSE file to the repository root declaring an open-source or commercial license that reflects how you intend others to use and evaluate your work.',
    });
  }

  // LIC-02: Dedicated Physical License File
  if (hasLicenseFile) {
    findings.push({
      id: 'LIC-02-pass',
      ruleId: 'LIC-02',
      category: 'license',
      title: `Dedicated License File Present (${licenseFileName})`,
      status: 'pass',
      severity: 'info',
      scoreEffect: lic02Rule.basePoints,
      maxEffect: lic02Rule.basePoints,
      explanation: `A standalone license document exists in the repository root at "${licenseFileName}".`,
      evidence: {
        label: 'File Path',
        value: licenseFileName,
        sourcePath: licenseFileName,
        sourceUrl: `${repo.html_url}/blob/${repo.default_branch}/${licenseFileName}`,
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
  if (isRecognizedSpdx && hasLicenseFile) {
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
  } else if (hasLicenseFile && !isRecognizedSpdx) {
    findings.push({
      id: 'LIC-03-warning',
      ruleId: 'LIC-03',
      category: 'license',
      title: 'License Terms Unverified in Repository Metadata',
      status: 'warning',
      severity: 'medium',
      scoreEffect: 1,
      maxEffect: lic03Rule.basePoints,
      explanation: `A dedicated license file exists at "${licenseFileName}", but repository metadata lacks an independently confirmed SPDX license identifier (${spdxId === 'NOASSERTION' ? 'detected as NOASSERTION' : 'unrecognized metadata'}). Enterprise evaluators cannot automatically verify legal distribution terms.`,
      evidence: {
        label: 'Terms Alignment',
        value: `Root license file present (${licenseFileName}), but SPDX metadata is ${spdxId || 'unrecognized'}`,
      },
      recommendation: `Align the contents of "${licenseFileName}" with standard SPDX text so GitHub metadata and automated compliance tools can verify distribution terms without manual review.`,
    });
  } else if (!hasLicenseFile && isRecognizedSpdx) {
    findings.push({
      id: 'LIC-03-warning',
      ruleId: 'LIC-03',
      category: 'license',
      title: 'Physical License Document Missing Despite Declared Metadata',
      status: 'warning',
      severity: 'medium',
      scoreEffect: 1,
      maxEffect: lic03Rule.basePoints,
      explanation: `Repository metadata indicates a ${spdxId} license, but no physical LICENSE or COPYING file was identified in the repository root.`,
      evidence: {
        label: 'Terms Alignment',
        value: `SPDX metadata declared (${spdxId}), but physical root license file is missing`,
      },
      recommendation: `Add a physical LICENSE file in the repository root matching the declared ${spdxId} terms.`,
    });
  } else {
    // Neither physical license file nor recognized SPDX metadata exists
    findings.push({
      id: 'LIC-03-issue',
      ruleId: 'LIC-03',
      category: 'license',
      title: 'No Licensing or Distribution Terms Established',
      status: 'issue',
      severity: 'high',
      scoreEffect: 0,
      maxEffect: lic03Rule.basePoints,
      explanation: 'Neither a dedicated root license file nor recognized SPDX license metadata was detected, leaving licensing and commercial evaluation terms undefined.',
      evidence: {
        label: 'Terms Alignment',
        value: 'Both physical license file and SPDX metadata are missing',
      },
      recommendation: 'Add a standard LICENSE file to the root of the repository to establish clear distribution and evaluation terms.',
    });
  }

  return findings;
}
