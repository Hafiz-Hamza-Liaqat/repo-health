/**
 * GitHub API Rate Limit Tracker
 */

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  used: number;
  lastUpdated: number; // Date.now()
}

class RateLimitTracker {
  private state: RateLimitState = {
    limit: 60,
    remaining: 60,
    resetTime: Math.floor(Date.now() / 1000) + 3600,
    used: 0,
    lastUpdated: Date.now(),
  };

  private listeners: Set<(state: RateLimitState) => void> = new Set();

  public updateFromHeaders(headers: Headers): void {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    const used = headers.get('x-ratelimit-used');

    if (remaining !== null) {
      this.state = {
        limit: limit ? parseInt(limit, 10) : this.state.limit,
        remaining: parseInt(remaining, 10),
        resetTime: reset ? parseInt(reset, 10) : this.state.resetTime,
        used: used ? parseInt(used, 10) : this.state.used,
        lastUpdated: Date.now(),
      };
      this.notify();
    }
  }

  public getState(): RateLimitState {
    return { ...this.state };
  }

  public isRateLimited(): boolean {
    const nowSec = Math.floor(Date.now() / 1000);
    return this.state.remaining <= 0 && this.state.resetTime > nowSec;
  }

  public getSecondsUntilReset(): number {
    const nowSec = Math.floor(Date.now() / 1000);
    return Math.max(0, this.state.resetTime - nowSec);
  }

  public subscribe(callback: (state: RateLimitState) => void): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    const current = this.getState();
    this.listeners.forEach((cb) => cb(current));
  }
}

export const rateLimitTracker = new RateLimitTracker();
