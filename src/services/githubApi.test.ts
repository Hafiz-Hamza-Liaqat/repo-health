import { describe, it, expect, beforeEach } from 'vitest';
import { githubApi } from './githubApi';

describe('GitHub API Service Token & Memory Storage', () => {
  beforeEach(() => {
    githubApi.setCustomToken(null);
    sessionStorage.clear();
    localStorage.clear();
  });

  it('stores and retrieves personal access token strictly in JavaScript memory', () => {
    expect(githubApi.hasCustomToken()).toBe(false);
    expect(githubApi.getCustomToken()).toBeNull();

    const sampleToken = 'ghp_testToken1234567890abcdef';
    githubApi.setCustomToken(sampleToken);

    expect(githubApi.hasCustomToken()).toBe(true);
    expect(githubApi.getCustomToken()).toBe(sampleToken);

    // Verify neither sessionStorage nor localStorage is written to
    expect(sessionStorage.getItem('repohealth_github_pat')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('repohealth_github_pat')).toBeNull();
    expect(localStorage.length).toBe(0);

    // Clearing token removes from memory
    githubApi.setCustomToken(null);
    expect(githubApi.hasCustomToken()).toBe(false);
    expect(githubApi.getCustomToken()).toBeNull();
  });

  it('strips extra whitespace from custom token on set', () => {
    githubApi.setCustomToken('  ghp_spacedToken  ');
    expect(githubApi.getCustomToken()).toBe('ghp_spacedToken');
    githubApi.setCustomToken('');
    expect(githubApi.hasCustomToken()).toBe(false);
  });
});
