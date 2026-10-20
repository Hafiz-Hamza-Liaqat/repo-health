import { ScoringPerspective, ScoringPerspectiveKey } from '../types/scoring';

export const SCORING_PERSPECTIVES: Record<ScoringPerspectiveKey, ScoringPerspective> = {
  balanced: {
    key: 'balanced',
    name: 'Balanced Repository Quality',
    tagline: 'Standard holistic evaluation across all 6 core categories',
    description:
      'Provides an even, production-oriented distribution across documentation, licensing, automated testing, continuous integration, versioning releases, and healthy repository metadata.',
    weights: {
      documentation: 20,
      license: 15,
      ci_cd: 20,
      testing: 20,
      releases: 10,
      metadata: 15,
    },
  },
  engineering: {
    key: 'engineering',
    name: 'Engineering Evidence',
    tagline: 'Emphasizes rigor in testing, CI/CD automation, and release practices',
    description:
      'Prioritizes verifiable technical practices. Allocates 60% of the evaluation to automated testing infrastructure and CI/CD pipelines, treating developer execution quality as paramount.',
    weights: {
      documentation: 10,
      license: 10,
      ci_cd: 30,
      testing: 30,
      releases: 10,
      metadata: 10,
    },
  },
  presentation: {
    key: 'presentation',
    name: 'Presentation & Professionalism',
    tagline: 'Focuses on clarity, open-source compliance, and onboarding UX',
    description:
      'Emphasizes external readability, comprehensive developer onboarding, legal clarity, and discoverability. Ideal for open-source portfolio pieces and client-facing libraries.',
    weights: {
      documentation: 30,
      license: 25,
      ci_cd: 10,
      testing: 10,
      releases: 10,
      metadata: 15,
    },
  },
};
