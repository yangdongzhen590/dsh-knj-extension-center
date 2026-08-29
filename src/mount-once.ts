// Host single-instance guard shared by the plugin family. Port of the
// skill-explorer plugin's src/mount-once.ts.
//
// The family bundle and a standalone install of the same package can coexist
// in one profile; without this guard the second instance would still
// re-register the same webserver routes and fail the boot. mountOnce makes
// the second host apply a no-op for the lifetime of the first instance.
//
// The registry rides a global symbol so two module instances of the same
// package (npm copy vs repository link) still share one verdict. cordis
// `ctx.effect` runs its callback immediately and treats the callback's
// return value as the fiber disposer, so the unmarker is returned, not run.

const MOUNTED = Symbol.for('dsh-web.mounted-plugins');

function mountedSet(): Set<string> {
  const registry = globalThis as { [MOUNTED]?: Set<string> };
  return (registry[MOUNTED] ??= new Set());
}

/**
 * Wrap a cordis plugin apply so the package runs at most once per process.
 * The first mount registers normally and unmarks when its fiber disposes;
 * any later mount of the same package name is a no-op.
 * @param packageName - npm package identity shared by every install source.
 * @param fn - the original plugin apply.
 * @returns an apply of the same shape.
 */
export function mountOnce<T extends (...args: any[]) => unknown>(
  packageName: string,
  fn: T,
): T {
  return ((...args: any[]) => {
    const mounted = mountedSet();
    if (mounted.has(packageName)) return;
    mounted.add(packageName);
    const ctx = args[0] as { effect?: (callback: () => unknown, label?: string) => unknown } | undefined;
    ctx?.effect?.(() => () => {
      mounted.delete(packageName);
    });
    return fn(...args);
  }) as T;
}
