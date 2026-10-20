# RepoHealth

**Tagline:** *Evaluate code. Verify evidence. Make better hiring decisions.*  
**GitHub Repository:** `repo-health`  
**Product Version:** `1.1.0 (Phase 1.1 Correctness & Report Export Update)`  
**License:** [MIT](LICENSE)

---

## 1. Project Purpose

RepoHealth is a professional GitHub repository health and developer evidence analyzer. It helps companies, technical recruiters, hiring managers, and engineering teams assess public GitHub repositories using verifiable evidence.

Rather than relying on popularity metrics (such as GitHub stars, forks, or superficial follower counts) or assuming that code is high quality simply because a repository has a README, RepoHealth performs deterministic analysis across:

- **Documentation Depth:** Detects real architectural overview, setup commands, usage code blocks, testing instructions, and live deployment links via an ATX heading parser stripping leading numbering and punctuation without false warnings.
- **License Compliance:** Identifies standard SPDX licenses, standalone root license documents, and enterprise distribution clarity.
- **CI/CD Automation:** Verifies GitHub Actions workflow configurations, triggers, and recent run execution health (passing vs. failing).
- **Testing Evidence:** Discovers test infrastructure and tracked test files recursively via GitHub's Git Trees API (`test/`, `tests/`, `src/test/`, `*.test.ts`, `*.spec.ts`, `*_test.go`, etc.), recognizing nested and co-located test structures without requiring a root folder.
- **Release Cadence:** Distinguishes official GitHub releases with changelogs from raw Git tags.
- **Repository Metadata:** Evaluates description clarity, topic discovery, default branch hygiene, and maintenance recency, cross-validating `size: 0 KB` with active content to eliminate false empty-repository warnings.
- **Technology Stack Detection:** Discovers frameworks and runtimes with evidence confidence levels (`strongly_evidenced`, `detected`, `config_or_dependency_only`, `inferred`).
- **Defensible Provenance Signals:** Samples public contributor distribution, bot activity (Dependabot, Renovate), and explicit AI tooling artifacts (`.cursorrules`, Copilot instructions) without unvalidated AI-authorship claims.

RepoHealth values demonstrable engineering practices. Scores are transparent, reproducible, and explainable.

---

## 2. Key Features

- **Zero-Authentication Public Scans:** Evaluates public repositories immediately without requiring GitHub login, server-side database, or private credentials.
- **Real-Time Step-by-Step Progress:** Visual progress tracker representing genuine network stages (Metadata → Documentation → CI/CD → Tests → Releases → Technology Synthesis).
- **Independent Scoring Engine:** Decoupled pure calculation logic with 6 assessment categories and stable rule identifiers.
- **Three Dynamic Assessment Perspectives:**
  - **Balanced Repository Quality:** Standard holistic evaluation across all 6 core categories (base 100 points).
  - **Engineering Evidence:** Prioritizes testing and CI/CD pipelines (60% weight allocated to automated testing and CI).
  - **Presentation & Professionalism:** Prioritizes external onboarding, comprehensive documentation, and open-source licensing clarity (70% weight).
- **Transparent Denominator Normalization:** When a category is marked not applicable, the denominator adjusts fairly without penalizing the repository.
- **Comprehensive Finding Status Accounting:** Displays all 5 finding statuses (Pass, Warning, Issue, Not Detected, Unknown) reconciling exactly with total evaluated rules.
- **Data Coverage Separation:** Explicitly distinguishes endpoint query accounting (e.g. `10/10 responses`) from repository tree coverage completeness and absent optional resources (e.g. no releases or workflows).
- **Prioritized Recommendations:** Actionable remediation items categorized by severity (High, Medium, Low) with direct rationale.
- **Export & Sharing Options:**
  - **JSON Export:** Download full versioned report schema (`RepoHealthReport_v1.1`).
  - **One-Click Markdown Summary:** Copies a formatted summary directly to the clipboard.
  - **Dedicated Print & PDF Export:** Custom clean layout outputting exclusively the structured report (all interactive elements, search inputs, and duplicate UI elements hidden in `@media print`).
- **Memory-Only Token Option:** Store an optional GitHub Personal Access Token strictly in JavaScript memory (never written to `localStorage` or `sessionStorage`) to increase the hourly limit from 60 to 5,000 requests/hr during intense evaluation sessions.
- **Session Caching:** In-memory request cache with 15-minute TTL eliminates redundant requests.

---

## 3. Technology Stack

- **Frontend:** React 18 with TypeScript (strict mode enabled: `noUnusedLocals`, `noUnusedParameters`, `strict: true`)
- **Build Tool:** Vite
- **Styling:** Tailwind CSS with responsive dark palette and custom print media styles
- **Icons:** Lucide React
- **API Client:** GitHub REST API v3 with rate-limit tracking and session caching
- **Testing:**
  - Vitest & React Testing Library (41 unit and component tests)
  - Playwright (End-to-End browser workflow tests)
- **Code Quality:** ESLint (`@typescript-eslint`), Prettier, TypeScript compiler (`tsc --noEmit`)

---

## 4. Architecture Overview

```
src/
├── types/                # Domain schemas (GitHub, Scoring, Technology, Analysis, Report)
├── config/               # Centralized scoring profiles, stable rule definitions, example repos
├── services/             # GitHub REST API client, session cache, rate-limit tracker
├── analyzers/            # Modular analyzers
│   ├── urlParser.ts      # Validates full URLs, shorthand owner/repo, rejects foreign domains
│   ├── readmeAnalyzer.ts # Evaluates purpose, setup, usage snippets, testing, demo links
│   ├── licenseAnalyzer.ts# Evaluates SPDX identifiers, root file presence, distribution clarity
│   ├── workflowAnalyzer.ts # Evaluates GitHub Actions, triggers, and execution status
│   ├── testingAnalyzer.ts# Evaluates test runner configs, scripts, directories, CI integration
│   ├── releasesAnalyzer.ts # Distinguishes releases with changelogs from raw Git tags
│   ├── metadataAnalyzer.ts # Evaluates description, topics, default branch, maintenance recency
│   ├── technologyDetector.ts # Modular tech rules (Languages, Frontend, Backend, DevOps, etc.)
│   └── provenanceAnalyzer.ts # Contributor distribution, bot activity, explicit AI tooling
├── engine/               # Independent business logic
│   ├── scoringEngine.ts  # Deterministic score calculator, denominator normalization
│   ├── recommendations.ts# Synthesizes issues and warnings into prioritized action items
│   └── reportGenerator.ts# Assembles the typed, exportable RepoHealthReport
├── utils/                # Sanitization (safe base64 decoding), date/number formatters, export
└── components/           # UI presentation layer
    ├── layout/           # Header, Footer, ApiSettingsModal
    ├── scanner/          # ScanForm, ScanProgress, ExamplePicker
    ├── dashboard/        # DashboardHeader, ScoreOverview, PerspectiveSelector, CategoryCards,
    │                     # TechnologyBadges, ProvenanceOverview, RecommendationsList, LimitationsNotice
    ├── common/           # Badge, ScoreGauge
    └── print/            # Dedicated print report stylesheet
```

---

## 5. Scoring Methodology

The baseline assessment engine is structured around **six assessment categories** totaling 100 points:

| Category | Base Weight | Stable Rule IDs | Key Evidence Evaluated |
| :--- | :--- | :--- | :--- |
| **README & Documentation** | 20 pts | `DOC-01` to `DOC-06` | README presence, architecture overview, setup commands, code examples, testing instructions, demo links. |
| **License Compliance** | 15 pts | `LIC-01` to `LIC-03` | Recognized SPDX identifier, physical root `LICENSE` file, unambiguous commercial distribution rights. |
| **CI/CD Workflows** | 20 pts | `CI-01` to `CI-03` | GitHub Actions definitions in `.github/workflows`, automated triggers, verified passing recent runs. |
| **Testing Evidence** | 20 pts | `TST-01` to `TST-04` | Recognized test runner (Vitest, Jest, Playwright, pytest, etc.), manifest test scripts, test directories. |
| **Releases & Version Tags** | 10 pts | `REL-01` to `REL-03` | Formal published GitHub releases with release notes, Git semver tags, release recency. |
| **Repository Metadata** | 15 pts | `META-01` to `META-05` | Repository description, topics tags, default branch hygiene, homepage link, maintenance recency. |

### Three Assessment Perspectives

Users can switch assessment perspectives instantly to recalculate the score without changing underlying findings:

1. **Balanced Repository Quality:** Base weights `[20, 15, 20, 20, 10, 15]` = 100 pts.
2. **Engineering Evidence:** Emphasizes testing rigor and automated delivery:
   - Testing Evidence: **30 pts**
   - CI/CD Workflows: **30 pts**
   - Releases & Tags: **10 pts**
   - Documentation: **10 pts**
   - License: **10 pts**
   - Metadata: **10 pts**
   - *Total: 100 pts*
3. **Presentation & Professionalism:** Emphasizes open-source clarity, portfolio UX, and onboarding:
   - Documentation: **30 pts**
   - License: **25 pts**
   - Repository Metadata: **15 pts**
   - CI/CD Workflows: **10 pts**
   - Testing Evidence: **10 pts**
   - Releases & Tags: **10 pts**
   - *Total: 100 pts*

### Letter Grades
- **A+:** 95–100 points
- **A:** 85–94 points
- **B:** 70–84 points
- **C:** 50–69 points
- **D:** 35–49 points
- **F:** < 35 points

---

## 6. Setup and Development Commands

### Prerequisites
- Node.js `v18+` or `v20+` (tested on Node `v22.21.1`)
- npm `v9+` or `v10+`

### Installation
```bash
# Clone the repository
git clone https://github.com/Hafiz-Hamza-Liaqat/repo-health.git
cd repo-health

# Install dependencies
npm install
```

### Development
```bash
# Start local development server (with HMR)
npm run dev
```
Open `http://localhost:5173` in your browser.

### Verification and Quality Commands
```bash
# Type check TypeScript codebase
npm run typecheck

# Lint TypeScript and React code
npm run lint

# Run all unit and integration tests (Vitest)
npm run test

# Run Vitest in watch mode
npm run test:watch

# Run end-to-end browser tests (Playwright)
npm run test:e2e

# Compile production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 7. API Limitations & Rate Limits

- **Public Unauthenticated Limit:** GitHub REST API permits **60 requests per hour** per IP address.
- **Memory Token Upgrade:** Users can click the key icon in the navigation bar to provide an optional Personal Access Token (held strictly in JavaScript memory during the active session), which immediately upgrades their rate limit to **5,000 requests per hour**.
- **Graceful Partial Results:** If secondary endpoints fail (e.g., GitHub Actions runs endpoint returns 403 or 404), RepoHealth does not crash; it logs the reduced coverage and calculates the score with clear limitation notes.

---

## 8. Privacy & Security Considerations

- **Untrusted Content Safety:** All text extracted from repositories and README files is treated as untrusted data and sanitized to prevent script injection.
- **No Code Execution:** Repository code is analyzed strictly via metadata and file contents. No repository code is downloaded or executed locally.
- **Credential Safety:** RepoHealth contains no hardcoded tokens, client secrets, or private keys. Optional user-provided tokens are held solely in JavaScript memory for the current browser session (never written to `localStorage` or `sessionStorage`) and are discarded on tab close or page reload.

---

## 9. Current Limitations (Phase 1)

- **Public Repositories Only:** Phase 1 exclusively analyzes public GitHub repositories.
- **Static Inspection Only:** Does not execute test suites or measure runtime test coverage percentages. Test framework indicators confirm infrastructure, not passing coverage.
- **Defensible AI Signals:** AI provenance indicators report only explicit configuration files (`.cursorrules`, Copilot instructions) or documentation acknowledgments. Does not attempt to guess an unvalidated AI-generated percentage.

---

## 10. Roadmap

- **Phase 2:** Secure backend gateway and GitHub App integration for private repositories and organization workspaces.
- **Phase 3:** Deep commit history, pull-request review velocity, and contributor collaboration graphs.
- **Phase 4:** Candidate skill evidence matrices and technical interview question generation.
- **Phase 5:** Multi-repository side-by-side comparison and historical health tracking.
