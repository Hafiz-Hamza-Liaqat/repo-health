import { describe, it, expect } from 'vitest';
import { parseAndValidateGitHubUrl } from './urlParser';

describe('urlParser', () => {
  it('should parse standard HTTPS GitHub URLs', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/facebook/react');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('facebook');
    expect(res.repo).toBe('react');
    expect(res.fullName).toBe('facebook/react');
    expect(res.canonicalUrl).toBe('https://github.com/facebook/react');
  });

  it('should handle trailing slash', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/torvalds/linux/');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('torvalds');
    expect(res.repo).toBe('linux');
    expect(res.canonicalUrl).toBe('https://github.com/torvalds/linux');
  });

  it('should handle shorthand "owner/repo" input', () => {
    const res = parseAndValidateGitHubUrl('pallets/flask');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('pallets');
    expect(res.repo).toBe('flask');
    expect(res.canonicalUrl).toBe('https://github.com/pallets/flask');
  });

  it('should strip .git suffix', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/astral-sh/uv.git');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('astral-sh');
    expect(res.repo).toBe('uv');
    expect(res.canonicalUrl).toBe('https://github.com/astral-sh/uv');
  });

  it('should handle URLs without protocol (e.g. github.com/owner/repo)', () => {
    const res = parseAndValidateGitHubUrl('github.com/tailwindlabs/tailwindcss');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('tailwindlabs');
    expect(res.repo).toBe('tailwindcss');
  });

  it('should handle repository names with punctuation, dots, hyphens, and underscores', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/isocpp/CppCoreGuidelines');
    expect(res.isValid).toBe(true);
    expect(res.owner).toBe('isocpp');
    expect(res.repo).toBe('CppCoreGuidelines');

    const res2 = parseAndValidateGitHubUrl('https://github.com/my-org/service_v1.2.0');
    expect(res2.isValid).toBe(true);
    expect(res2.owner).toBe('my-org');
    expect(res2.repo).toBe('service_v1.2.0');
  });

  it('should reject non-GitHub hosts', () => {
    const res1 = parseAndValidateGitHubUrl('https://gitlab.com/owner/repo');
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain('Unsupported host');

    const res2 = parseAndValidateGitHubUrl('https://bitbucket.org/owner/repo');
    expect(res2.isValid).toBe(false);

    const res3 = parseAndValidateGitHubUrl('https://google.com');
    expect(res3.isValid).toBe(false);
  });

  it('should reject empty or whitespace inputs', () => {
    const res1 = parseAndValidateGitHubUrl('');
    expect(res1.isValid).toBe(false);

    const res2 = parseAndValidateGitHubUrl('   ');
    expect(res2.isValid).toBe(false);
  });

  it('should reject URLs missing repository name', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/facebook');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('must contain both owner and repository');
  });

  it('should reject malformed usernames with invalid characters', () => {
    const res = parseAndValidateGitHubUrl('https://github.com/-invalid_user/repo');
    expect(res.isValid).toBe(false);
  });
});
