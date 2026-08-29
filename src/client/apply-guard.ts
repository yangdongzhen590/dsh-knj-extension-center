// Wrap a client-plugin apply body so an unexpected failure degrades to a
// console warning instead of crashing the host GUI: an external plugin must
// never take down the shell it runs inside. Mirrors the task-board client's
// apply-guard contract (task-board's copy lives in its own plugin repo).

/**
 * Run `fn` inside try/catch and return its result (typically a disposer),
 * or `undefined` when it throws. Failures are logged with `console.warn`
 * and never re-thrown.
 */
export function applyGuard<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    console.warn('[dsh-skill-center] client apply failed:', error);
    return undefined;
  }
}
