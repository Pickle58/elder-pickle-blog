/** Max recorded attempts before a GitHub .mdoc delete stops retrying. */
export const GITHUB_DELETE_MAX_ATTEMPTS = 8;

/** Delay before the next retry of a transient GitHub / missing-token failure. */
export const GITHUB_DELETE_RETRY_MS = 60_000;

/** Upper bound on random jitter added to the exponential retry delay. */
export const GITHUB_DELETE_RETRY_JITTER_MS = 15_000;

/** Stop missing-token retries once the tombstone is this old. */
export const GITHUB_DELETE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Extra wait after expected backoff before a cron may resume a lost job. */
export const GITHUB_DELETE_STALE_BUFFER_MS = 60_000;

export function githubDeleteBackoffMs(attempts: number): number {
  const shift = Math.max(0, Math.min(attempts - 1, 10));
  return GITHUB_DELETE_RETRY_MS * 2 ** shift;
}

export function githubDeleteRetryDelayMs(attempts: number): number {
  const base = githubDeleteBackoffMs(attempts);
  const jitterCap = Math.min(GITHUB_DELETE_RETRY_JITTER_MS, base);
  const jitter = Math.floor(Math.random() * (jitterCap + 1));
  return base + jitter;
}

export function isGithubDeleteStale(args: {
  attempts: number;
  createdAt: number;
  lastAttemptAt?: number;
  now: number;
}): boolean {
  if (args.attempts >= GITHUB_DELETE_MAX_ATTEMPTS) {
    return false;
  }
  const last = args.lastAttemptAt ?? args.createdAt;
  const wait =
    githubDeleteBackoffMs(args.attempts) +
    GITHUB_DELETE_RETRY_JITTER_MS +
    GITHUB_DELETE_STALE_BUFFER_MS;
  return args.now - last >= wait;
}
