// Serialises work across browser tabs using the Web Locks API, so two tabs
// never call refresh at the same moment. Every tab shares one refresh cookie,
// and each refresh rotates it. Where Web Locks is unavailable the task runs
// directly, and the rotation retry in the session manager is the fallback.

export type RunExclusive = <T>(
  name: string,
  task: () => Promise<T>,
) => Promise<T>;

export type LockManagerLike = {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
};

const runDirectly: RunExclusive = (_name, task) => task();

export function createCrossTabLock(
  locks?: LockManagerLike | null,
): RunExclusive {
  if (!locks) return runDirectly;
  return (name, task) => locks.request(name, task);
}

/** The browser's lock manager, or null where it does not exist. */
export function browserLockManager(): LockManagerLike | null {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as { locks?: unknown }).locks;
  return locks ? (locks as LockManagerLike) : null;
}
