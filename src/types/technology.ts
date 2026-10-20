/**
 * Technology Detection Types
 */

export type TechConfidence =
  | 'strongly_evidenced'
  | 'detected'
  | 'config_or_dependency_only'
  | 'inferred'
  | 'not_detected'
  | 'unable_to_determine';

export type TechCategory =
  | 'language'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'testing'
  | 'devops'
  | 'build_tool'
  | 'blockchain'
  | 'ai_tooling';

export interface TechEvidence {
  type: 'manifest_dep' | 'config_file' | 'source_pattern' | 'github_language' | 'workflow';
  file?: string;
  detail: string;
}

export interface DetectedTechnology {
  id: string;
  name: string;
  category: TechCategory;
  confidence: TechConfidence;
  version?: string;
  evidence: TechEvidence[];
  icon?: string;
  description: string;
  disclaimer?: string;
}
