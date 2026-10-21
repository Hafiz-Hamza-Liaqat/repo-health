/**
 * GitHub API Rate Limit Tracker
 */

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  used: number;
  lastUpdated: number; // Date.now()
  isSecondaryLimit: boolean;
  secondaryRetryAfter: number; // seconds
  rateLimitType: 'none' | 'primary' | 'secondary';
  hasCustomToken: boolean;
}

class RateLimitTracker {
  private state: RateLimitState = {
    limit: 60,
    remaining: 60,
    resetTime: Math.floor(Date.now() / 1000) + 3600,
    used: 0,
    lastUpdated: Date.now(),
    isSecondaryLimit: false,
    secondaryRetryAfter: 0,
    rateLimitType: 'none',
    hasCustomToken: false,
  };

  private listeners: Set<(state: RateLimitState) => void> = new Set();

  public updateFromHeaders(headers: Headers): void {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    const used = headers.get('x-ratelimit-used');
    const retryAfter = headers.get('retry-after');

    const parsedRemaining = remaining !== null ? parseInt(remaining, 10) : this.state.remaining;
    const parsedReset = reset ? parseInt(reset, 10) : this.state.resetTime;
    const parsedLimit = limit ? parseInt(limit, 10) : this.state.limit;
    const parsedUsed = used ? parseInt(used, 10) : this.state.used;

    let isSecondary = this.state.isSecondaryLimit;
    let secondaryRetryAfter = this.state.secondaryRetryAfter;
    let rateLimitType: RateLimitState['rateLimitType'] = 'none';

    if (retryAfter) {
      isSecondary = true;
      secondaryRetryAfter = parseInt(retryAfter, 10) || 60;
      rateLimitType = 'secondary';
    } else if (parsedRemaining <= 0) {
      rateLimitType = 'primary';
    }

    this.state = {
      ...this.state,
      limit: parsedLimit,
      remaining: Math.max(0, parsedRemaining),
      resetTime: parsedReset,
      used: parsedUsed,
      lastUpdated: Date.now(),
      isSecondaryLimit: isSecondary,
      secondaryRetryAfter,
      rateLimitType,
    };

    this.notify();
  }

  public setSecondaryRateLimit(retryAfterSec: number = 60): void {
    this.state = {
      ...this.state,
      isSecondaryLimit: true,
      secondaryRetryAfter: Math.max(1, retryAfterSec),
      rateLimitType: 'secondary',
      lastUpdated: Date.now(),
    };
    this.notify();
  }

  public setExhausted(resetTimeSec?: number, limit?: number): void {
    const fallbackReset = Math.floor(Date.now() / 1000) + 3600;
    this.state = {
      ...this.state,
      remaining: 0,
      limit: limit || this.state.limit,
      resetTime: resetTimeSec || this.state.resetTime || fallbackReset,
      rateLimitType: 'primary',
      lastUpdated: Date.now(),
    };
    this.notify();
  }

  public setHasCustomToken(hasToken: boolean): void {
    const defaultLimit = hasToken ? 5000 : 60;
    this.state = {
      ...this.state,
      hasCustomToken: hasToken,
      limit: this.state.hasCustomToken !== hasToken ? defaultLimit : this.state.limit,
      remaining: this.state.hasCustomToken !== hasToken ? defaultLimit : this.state.remaining,
      lastUpdated: Date.now(),
    };
    this.notify();
  }

  public resetToBaseline(hasToken: boolean): void {
    const baseline = hasToken ? 5000 : 60;
    this.state = {
      limit: baseline,
      remaining: baseline,
      resetTime: Math.floor(Date.now() / 1000) + 3600,
      used: 0,
      lastUpdated: Date.now(),
      isSecondaryLimit: false,
      secondaryRetryAfter: 0,
      rateLimitType: 'none',
      hasCustomToken: hasToken,
    };
    this.notify();
  }

  public getState(): RateLimitState {
    this.checkAutoRecovery();
    return { ...this.state };
  }

  public isRateLimited(): boolean {
    this.checkAutoRecovery();
    if (this.state.isSecondaryLimit) {
      const elapsedSec = (Date.now() - this.state.lastUpdated) / 1000;
      return elapsedSec < this.state.secondaryRetryAfter;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return this.state.remaining <= 0 && this.state.resetTime > nowSec;
  }

  public getSecondsUntilReset(): number {
    this.checkAutoRecovery();
    if (this.state.isSecondaryLimit) {
      const elapsedSec = Math.floor((Date.now() - this.state.lastUpdated) / 1000);
      return Math.max(0, this.state.secondaryRetryAfter - elapsedSec);
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return Math.max(0, this.state.resetTime - nowSec);
  }

  public getMinutesUntilReset(): number {
    return Math.ceil(this.getSecondsUntilReset() / 60);
  }

  public getFormattedResetTime(): string {
    const resetDate = new Date(this.state.resetTime * 1000);
    return resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  public getHumanResetMessage(): string {
    if (this.state.isSecondaryLimit) {
      const sec = this.getSecondsUntilReset();
      return `Secondary rate limit active. Please wait ~${sec}s before retrying.`;
    }
    const min = this.getMinutesUntilReset();
    const timeStr = this.getFormattedResetTime();
    return `Rate limit exhausted. Resets in ~${min} min (at ${timeStr}).`;
  }

  private checkAutoRecovery(): void {
    const nowSec = Math.floor(Date.now() / 1000);
    let changed = false;

    // Check secondary limit expiration
    if (this.state.isSecondaryLimit) {
      const elapsedSec = (Date.now() - this.state.lastUpdated) / 1000;
      if (elapsedSec >= this.state.secondaryRetryAfter) {
        this.state.isSecondaryLimit = false;
        this.state.secondaryRetryAfter = 0;
        if (this.state.rateLimitType === 'secondary') {
          this.state.rateLimitType = 'none';
        }
        changed = true;
      }
    }

    // Check primary limit reset timestamp
    if (this.state.remaining <= 0 && this.state.resetTime <= nowSec) {
      this.state.remaining = this.state.limit;
      this.state.rateLimitType = 'none';
      this.state.resetTime = nowSec + 3600;
      changed = true;
    }

    if (changed) {
      this.state.lastUpdated = Date.now();
      this.notify();
    }
  }

  public subscribe(callback: (state: RateLimitState) => void): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    const current = { ...this.state };
    this.listeners.forEach((cb) => cb(current));
  }
}

export const rateLimitTracker = new RateLimitTracker();
