// Runs at most one task per key at a time. Concurrent callers with the same
// key share the one in-flight promise and its outcome. Once the promise
// settles the key is cleared, so a later call starts a fresh task.
//
// Used to serialise token refreshes. It never retries: a failed refresh
// rejects every waiter and is not attempted again by this helper.

export function createSingleFlight<T>() {
  const inFlight = new Map<string, Promise<T>>();

  return function run(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = (async () => task())().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  };
}
