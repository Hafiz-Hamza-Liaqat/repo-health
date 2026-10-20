/**
 * GitHub Repository URL Validator & Normalizer
 */

export interface ParsedRepoUrl {
  isValid: boolean;
  owner: string;
  repo: string;
  fullName: string;
  canonicalUrl: string;
  error?: string;
}

// GitHub usernames: 1-39 alphanumeric chars or single hyphens (not leading/trailing)
// Repository names: 1-100 alphanumeric chars, hyphens, underscores, dots
const GITHUB_OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;

export function parseAndValidateGitHubUrl(rawInput: string): ParsedRepoUrl {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      owner: '',
      repo: '',
      fullName: '',
      canonicalUrl: '',
      error: 'Please enter a GitHub repository URL or "owner/repository".',
    };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      owner: '',
      repo: '',
      fullName: '',
      canonicalUrl: '',
      error: 'Repository URL cannot be empty.',
    };
  }

  // Handle shorthand "owner/repo"
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    const [owner, rawRepo] = trimmed.split('/');
    const repo = rawRepo.replace(/\.git$/i, '');
    return validateOwnerAndRepo(owner, repo);
  }

  // Handle full or partial URL
  let urlStringToParse = trimmed;
  if (!urlStringToParse.startsWith('http://') && !urlStringToParse.startsWith('https://')) {
    urlStringToParse = `https://${urlStringToParse}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStringToParse);
  } catch {
    return {
      isValid: false,
      owner: '',
      repo: '',
      fullName: '',
      canonicalUrl: '',
      error: 'Invalid URL format. Please provide a valid GitHub repository URL.',
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname !== 'github.com' && hostname !== 'www.github.com') {
    return {
      isValid: false,
      owner: '',
      repo: '',
      fullName: '',
      canonicalUrl: '',
      error: `Unsupported host "${hostname}". RepoHealth currently evaluates public repositories hosted on github.com.`,
    };
  }

  // Path segments
  const segments = parsedUrl.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return {
      isValid: false,
      owner: '',
      repo: '',
      fullName: '',
      canonicalUrl: '',
      error: 'URL must contain both owner and repository name (e.g. https://github.com/owner/repository).',
    };
  }

  const owner = segments[0];
  let repo = segments[1];

  // Strip .git suffix if present
  repo = repo.replace(/\.git$/i, '');

  return validateOwnerAndRepo(owner, repo);
}

function validateOwnerAndRepo(owner: string, repo: string): ParsedRepoUrl {
  if (!GITHUB_OWNER_REGEX.test(owner)) {
    return {
      isValid: false,
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      canonicalUrl: '',
      error: `Invalid GitHub owner "${owner}". Usernames or organization names can only contain alphanumeric characters or hyphens.`,
    };
  }

  if (!GITHUB_REPO_REGEX.test(repo) || repo === '.' || repo === '..') {
    return {
      isValid: false,
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      canonicalUrl: '',
      error: `Invalid repository name "${repo}".`,
    };
  }

  const fullName = `${owner}/${repo}`;
  const canonicalUrl = `https://github.com/${fullName}`;

  return {
    isValid: true,
    owner,
    repo,
    fullName,
    canonicalUrl,
  };
}
