/**
 * Technology Stack Detector
 * Combines GitHub language statistics, manifest dependencies, config files, and workflows.
 */

import { DetectedTechnology, TechEvidence } from '../types/technology';
import { RawAnalysisData } from '../types/analysis';

export function detectTechnologies(raw: RawAnalysisData): DetectedTechnology[] {
  const detections: DetectedTechnology[] = [];

  const pkg = raw.manifestContents?.packageJson;
  const deps: Record<string, string | undefined> = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
    ...(pkg?.peerDependencies || {}),
  };
  const pyproject = (raw.manifestContents?.pyprojectToml || '').toLowerCase();
  const cargo = (raw.manifestContents?.cargoToml || '').toLowerCase();
  const goMod = (raw.manifestContents?.goMod || '').toLowerCase();
  const dockerfile = (raw.manifestContents?.dockerfile || '').toLowerCase();
  const rootFiles = raw.rootFiles || [];
  const languages = raw.languages || {};
  const totalLangBytes = Object.values(languages).reduce((a, b) => a + b, 0);

  // Helper for language percentage
  const getLangPct = (name: string): number => {
    if (totalLangBytes === 0) return 0;
    return ((languages[name] || 0) / totalLangBytes) * 100;
  };

  // Helper to add detection
  const addTech = (tech: DetectedTechnology) => {
    detections.push(tech);
  };

  // 1. TypeScript
  const tsPct = getLangPct('TypeScript');
  const hasTsConfig = rootFiles.some((f) => /^tsconfig(?:\..+)?\.json$/i.test(f));
  const hasTsDep = !!(deps.typescript || deps['@types/node']);

  if (tsPct > 15 || (hasTsConfig && (hasTsDep || tsPct > 0))) {
    const evidence: TechEvidence[] = [];
    if (hasTsConfig) evidence.push({ type: 'config_file', file: 'tsconfig.json', detail: 'TypeScript compiler configuration' });
    if (hasTsDep) evidence.push({ type: 'manifest_dep', file: 'package.json', detail: `typescript ${deps.typescript || ''}` });
    if (tsPct > 0) evidence.push({ type: 'github_language', detail: `${tsPct.toFixed(1)}% of repository codebase` });

    addTech({
      id: 'typescript',
      name: 'TypeScript',
      category: 'language',
      confidence: hasTsConfig && tsPct > 10 ? 'strongly_evidenced' : 'detected',
      evidence,
      description: 'Typed superset of JavaScript providing static type definitions.',
    });
  }

  // 2. JavaScript
  const jsPct = getLangPct('JavaScript');
  if (jsPct > 15 || (pkg && !hasTsConfig && jsPct > 0)) {
    const evidence: TechEvidence[] = [];
    if (jsPct > 0) evidence.push({ type: 'github_language', detail: `${jsPct.toFixed(1)}% of repository codebase` });
    if (pkg) evidence.push({ type: 'manifest_dep', file: 'package.json', detail: 'Node.js / JavaScript project manifest' });

    addTech({
      id: 'javascript',
      name: 'JavaScript',
      category: 'language',
      confidence: jsPct > 20 ? 'strongly_evidenced' : 'detected',
      evidence,
      description: 'Dynamic scripting language for web and server environments.',
    });
  }

  // 3. React
  if (deps.react || deps['react-dom']) {
    const evidence: TechEvidence[] = [
      { type: 'manifest_dep', file: 'package.json', detail: `react: ${deps.react || 'detected'}` },
    ];
    const isNext = !!(deps.next || rootFiles.some((f) => /^next\.config/i.test(f)));
    const isVite = !!(deps.vite || rootFiles.some((f) => /^vite\.config/i.test(f)));

    addTech({
      id: 'react',
      name: 'React',
      category: 'frontend',
      confidence: 'strongly_evidenced',
      version: deps.react,
      evidence,
      description: 'Component-based UI library for web interfaces.',
      disclaimer: 'Declared dependency does not prove implementation breadth or developer proficiency.',
    });

    if (isNext) {
      addTech({
        id: 'nextjs',
        name: 'Next.js',
        category: 'frontend',
        confidence: 'strongly_evidenced',
        version: deps.next,
        evidence: [
          { type: 'manifest_dep', file: 'package.json', detail: `next: ${deps.next || 'detected'}` },
        ],
        description: 'React full-stack framework with SSR and API routes.',
      });
    }

    if (isVite) {
      addTech({
        id: 'vite',
        name: 'Vite',
        category: 'build_tool',
        confidence: 'strongly_evidenced',
        version: deps.vite,
        evidence: [
          { type: 'config_file', file: 'vite.config.ts', detail: 'Vite modern build configuration' },
        ],
        description: 'Fast frontend tooling and development server.',
      });
    }
  }

  // 4. Node.js / Express / Backend
  if (deps.express) {
    addTech({
      id: 'express',
      name: 'Express.js',
      category: 'backend',
      confidence: 'strongly_evidenced',
      version: deps.express,
      evidence: [
        { type: 'manifest_dep', file: 'package.json', detail: `express: ${deps.express}` },
      ],
      description: 'Minimalist web framework for Node.js.',
    });
  }

  if (deps.fastify) {
    addTech({
      id: 'fastify',
      name: 'Fastify',
      category: 'backend',
      confidence: 'strongly_evidenced',
      version: deps.fastify,
      evidence: [
        { type: 'manifest_dep', file: 'package.json', detail: `fastify: ${deps.fastify}` },
      ],
      description: 'Fast and low overhead web framework for Node.js.',
    });
  }

  // 5. Tailwind CSS
  if (deps.tailwindcss || rootFiles.some((f) => /^tailwind\.config/i.test(f))) {
    addTech({
      id: 'tailwindcss',
      name: 'Tailwind CSS',
      category: 'frontend',
      confidence: deps.tailwindcss ? 'strongly_evidenced' : 'detected',
      version: deps.tailwindcss,
      evidence: [
        { type: 'config_file', file: 'tailwind.config.js', detail: 'Tailwind CSS utility configuration' },
      ],
      description: 'Utility-first CSS framework for rapid styling.',
    });
  }

  // 6. Python Stack
  const pyPct = getLangPct('Python');
  const hasPyManifest = pyproject.length > 0 || rootFiles.some((f) => /^(?:setup\.py|requirements\.txt|pipfile)$/i.test(f));
  if (pyPct > 10 || hasPyManifest) {
    const evidence: TechEvidence[] = [];
    if (hasPyManifest) evidence.push({ type: 'config_file', file: 'pyproject.toml', detail: 'Python project packaging' });
    if (pyPct > 0) evidence.push({ type: 'github_language', detail: `${pyPct.toFixed(1)}% of repository codebase` });

    addTech({
      id: 'python',
      name: 'Python',
      category: 'language',
      confidence: pyPct > 15 ? 'strongly_evidenced' : 'detected',
      evidence,
      description: 'High-level programming language widely used in backend, data, and ML.',
    });

    if (pyproject.includes('django') || pyproject.includes('flask') || pyproject.includes('fastapi')) {
      const fw = pyproject.includes('fastapi') ? 'FastAPI' : pyproject.includes('django') ? 'Django' : 'Flask';
      addTech({
        id: fw.toLowerCase(),
        name: fw,
        category: 'backend',
        confidence: 'detected',
        evidence: [{ type: 'manifest_dep', file: 'pyproject.toml', detail: `Declared framework dependency: ${fw}` }],
        description: `${fw} Python web framework.`,
      });
    }
  }

  // 7. Rust Stack
  const rustPct = getLangPct('Rust');
  const hasCargo = cargo.length > 0 || rootFiles.includes('Cargo.toml');
  if (rustPct > 10 || hasCargo) {
    addTech({
      id: 'rust',
      name: 'Rust',
      category: 'language',
      confidence: hasCargo && rustPct > 10 ? 'strongly_evidenced' : 'detected',
      evidence: [
        ...(hasCargo ? [{ type: 'config_file' as const, file: 'Cargo.toml', detail: 'Cargo package manifest' }] : []),
        ...(rustPct > 0 ? [{ type: 'github_language' as const, detail: `${rustPct.toFixed(1)}% Rust code` }] : []),
      ],
      description: 'Fast, memory-efficient systems language with compile-time safety.',
    });
  }

  // 8. Go Stack
  const goPct = getLangPct('Go');
  const hasGoMod = goMod.length > 0 || rootFiles.includes('go.mod');
  if (goPct > 10 || hasGoMod) {
    addTech({
      id: 'go',
      name: 'Go',
      category: 'language',
      confidence: hasGoMod && goPct > 10 ? 'strongly_evidenced' : 'detected',
      evidence: [
        ...(hasGoMod ? [{ type: 'config_file' as const, file: 'go.mod', detail: 'Go module definition' }] : []),
        ...(goPct > 0 ? [{ type: 'github_language' as const, detail: `${goPct.toFixed(1)}% Go code` }] : []),
      ],
      description: 'Open source programming language designed for scalable network services.',
    });
  }

  // 9. Java / Maven / Gradle
  const javaPct = getLangPct('Java') || getLangPct('Kotlin');
  const hasMaven = rootFiles.includes('pom.xml');
  const hasGradle = rootFiles.some((f) => /^build\.gradle(?:\.kts)?$/i.test(f));
  if (javaPct > 10 || hasMaven || hasGradle) {
    addTech({
      id: 'java',
      name: 'Java / JVM',
      category: 'language',
      confidence: (hasMaven || hasGradle) && javaPct > 10 ? 'strongly_evidenced' : 'detected',
      evidence: [
        ...(hasMaven ? [{ type: 'config_file' as const, file: 'pom.xml', detail: 'Maven POM project manifest' }] : []),
        ...(hasGradle ? [{ type: 'config_file' as const, file: 'build.gradle', detail: 'Gradle build configuration' }] : []),
        ...(javaPct > 0 ? [{ type: 'github_language' as const, detail: `${javaPct.toFixed(1)}% JVM codebase` }] : []),
      ],
      description: 'Enterprise object-oriented language and JVM platform.',
    });
  }

  // 10. Solidity / Smart Contracts
  const solPct = getLangPct('Solidity');
  const hasHardhat = rootFiles.some((f) => /^hardhat\.config/i.test(f));
  const hasFoundry = rootFiles.includes('foundry.toml');
  if (solPct > 5 || hasHardhat || hasFoundry) {
    addTech({
      id: 'solidity',
      name: 'Solidity',
      category: 'blockchain',
      confidence: (hasHardhat || hasFoundry) ? 'strongly_evidenced' : 'detected',
      evidence: [
        ...(hasHardhat ? [{ type: 'config_file' as const, file: 'hardhat.config.js', detail: 'Hardhat Ethereum development environment' }] : []),
        ...(hasFoundry ? [{ type: 'config_file' as const, file: 'foundry.toml', detail: 'Foundry smart contract toolchain' }] : []),
        ...(solPct > 0 ? [{ type: 'github_language' as const, detail: `${solPct.toFixed(1)}% Solidity contracts` }] : []),
      ],
      description: 'Smart contract programming language for the Ethereum Virtual Machine (EVM).',
    });
  }

  // 11. Database & Persistence (PostgreSQL, MongoDB, MySQL, Supabase, Prisma)
  if (deps['@prisma/client'] || deps.prisma || rootFiles.some((f) => /^prisma/i.test(f))) {
    addTech({
      id: 'prisma',
      name: 'Prisma ORM',
      category: 'database',
      confidence: 'config_or_dependency_only',
      evidence: [{ type: 'manifest_dep', file: 'package.json', detail: 'Prisma modern database ORM' }],
      description: 'Next-generation ORM for Node.js and TypeScript.',
    });
  }

  if (deps['@supabase/supabase-js']) {
    addTech({
      id: 'supabase',
      name: 'Supabase',
      category: 'database',
      confidence: 'config_or_dependency_only',
      evidence: [{ type: 'manifest_dep', file: 'package.json', detail: 'Supabase client library' }],
      description: 'Open source Firebase alternative built on PostgreSQL.',
    });
  }

  if (deps.pg || deps.postgres || dockerfile.includes('postgres')) {
    addTech({
      id: 'postgresql',
      name: 'PostgreSQL',
      category: 'database',
      confidence: 'detected',
      evidence: [{ type: 'manifest_dep', file: 'package.json / Dockerfile', detail: 'PostgreSQL client driver or container' }],
      description: 'Powerful open-source relational database.',
    });
  }

  if (deps.mongodb || deps.mongoose) {
    addTech({
      id: 'mongodb',
      name: 'MongoDB',
      category: 'database',
      confidence: 'detected',
      evidence: [{ type: 'manifest_dep', file: 'package.json', detail: `MongoDB driver / Mongoose: ${deps.mongoose || deps.mongodb}` }],
      description: 'Document-oriented NoSQL database.',
    });
  }

  // 12. DevOps / Docker / GitHub Actions
  if (dockerfile.length > 0 || rootFiles.includes('Dockerfile') || rootFiles.includes('docker-compose.yml')) {
    addTech({
      id: 'docker',
      name: 'Docker',
      category: 'devops',
      confidence: 'strongly_evidenced',
      evidence: [{ type: 'config_file', file: 'Dockerfile', detail: 'Containerization recipe and runtime configuration' }],
      description: 'Container platform for building and shipping isolated services.',
    });
  }

  if (raw.workflows.length > 0) {
    addTech({
      id: 'github_actions',
      name: 'GitHub Actions',
      category: 'devops',
      confidence: 'strongly_evidenced',
      evidence: [{ type: 'workflow', file: raw.workflows[0].path, detail: `${raw.workflows.length} automated workflow pipeline(s)` }],
      description: 'CI/CD pipeline platform native to GitHub.',
    });
  }

  // 13. Testing Tools
  if (deps.vitest || rootFiles.some((f) => /^vitest\.config/i.test(f))) {
    addTech({
      id: 'vitest',
      name: 'Vitest',
      category: 'testing',
      confidence: 'strongly_evidenced',
      version: deps.vitest,
      evidence: [{ type: 'manifest_dep', file: 'package.json', detail: 'Vite-native testing framework' }],
      description: 'Next generation testing framework with instant HMR and Jest-compatible API.',
    });
  }

  if (deps.jest || rootFiles.some((f) => /^jest\.config/i.test(f))) {
    addTech({
      id: 'jest',
      name: 'Jest',
      category: 'testing',
      confidence: 'strongly_evidenced',
      version: deps.jest,
      evidence: [{ type: 'manifest_dep', file: 'package.json', detail: 'Delightful JavaScript testing framework' }],
      description: 'Standard unit and integration testing framework for JavaScript/TypeScript.',
    });
  }

  if (deps['@playwright/test'] || rootFiles.some((f) => /^playwright\.config/i.test(f))) {
    addTech({
      id: 'playwright',
      name: 'Playwright',
      category: 'testing',
      confidence: 'strongly_evidenced',
      version: deps['@playwright/test'],
      evidence: [{ type: 'manifest_dep', file: 'package.json', detail: 'End-to-end browser automation framework' }],
      description: 'Cross-browser end-to-end testing library for modern web applications.',
    });
  }

  return detections;
}
