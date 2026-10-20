export interface ExampleRepo {
  owner: string;
  repo: string;
  label: string;
  description: string;
  category: string;
}

export const EXAMPLE_REPOSITORIES: ExampleRepo[] = [
  {
    owner: 'expressjs',
    repo: 'express',
    label: 'expressjs/express',
    description: 'Fast, unopinionated, minimalist web framework for Node.js',
    category: 'Backend / Node',
  },
  {
    owner: 'pallets',
    repo: 'flask',
    label: 'pallets/flask',
    description: 'The Python micro framework for building web applications',
    category: 'Backend / Python',
  },
  {
    owner: 'tailwindlabs',
    repo: 'tailwindcss',
    label: 'tailwindlabs/tailwindcss',
    description: 'A utility-first CSS framework for rapid UI development',
    category: 'Frontend / Tooling',
  },
  {
    owner: 'astral-sh',
    repo: 'uv',
    label: 'astral-sh/uv',
    description: 'An extremely fast Python package and project manager, written in Rust',
    category: 'Systems / Rust',
  },
];
