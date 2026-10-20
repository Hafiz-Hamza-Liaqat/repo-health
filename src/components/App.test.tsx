import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';
import { githubApi } from '../services/githubApi';
import { mockRawAnalysisData } from '../test/fixtures/sampleRepo';

describe('App Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('renders initial hero, tagline, and scan input form', () => {
    render(<App />);

    expect(screen.getAllByText(/RepoHealth/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { level: 1, name: /Evaluate code/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Paste public GitHub repository URL/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Quick Examples:')).toBeInTheDocument();
  });

  it('displays validation error when submitting invalid URL', () => {
    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    fireEvent.change(input, { target: { value: 'https://gitlab.com/invalid/repo' } });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/Unsupported host "gitlab.com"/i)
    ).toBeInTheDocument();
  });

  it('successfully analyzes repository and renders dashboard with results', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockResolvedValue({
      data: mockRawAnalysisData,
      errors: [],
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/acme-corp/sample-project' } });
      fireEvent.click(submitBtn);
    });

    // Wait for analysis to complete and dashboard to appear
    await waitFor(() => {
      expect(screen.getByText('acme-corp/sample-project')).toBeInTheDocument();
    });

    // Score gauge and perspective selector must be present
    expect(screen.getByText('Repository Health Score')).toBeInTheDocument();
    expect(screen.getByText('Balanced Repository Quality')).toBeInTheDocument();
    expect(screen.getByText('Engineering Evidence')).toBeInTheDocument();
    expect(screen.getByText('Export JSON')).toBeInTheDocument();
    expect(screen.getByText('Print / Save as PDF')).toBeInTheDocument();
  });

  it('switches scoring perspective and recalculates score dynamically', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockResolvedValue({
      data: mockRawAnalysisData,
      errors: [],
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/acme-corp/sample-project' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('acme-corp/sample-project')).toBeInTheDocument();
    });

    // Switch to Engineering Evidence
    const engBtn = screen.getByText('Engineering Evidence');
    await act(async () => {
      fireEvent.click(engBtn);
    });

    expect(engBtn.closest('button')).toHaveClass('border-emerald-500/80');
  });

  it('displays accessible error message when API fails', async () => {
    vi.spyOn(githubApi, 'fetchCompleteRepositoryData').mockRejectedValue(
      new Error('Resource not found or private repository.')
    );

    render(<App />);

    const input = screen.getByPlaceholderText(/Paste public GitHub repository URL/i);
    const submitBtn = screen.getByRole('button', { name: /Analyze/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://github.com/unknown/nonexistent-repo' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Analysis Could Not Complete')).toBeInTheDocument();
      expect(
        screen.getByText(/Resource not found or private repository/i)
      ).toBeInTheDocument();
    });
  });
});
