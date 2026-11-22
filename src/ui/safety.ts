/**
 * A place for screens to say "bring what I hold up to date". The tab switch and the error handler
 * call every one of them, so text typed a moment ago is in the form (and in the saved draft)
 * before anything else happens. No DOM here.
 */
const flushers = new Set<() => void>();

/** Adds a function that settles pending work. Returns a function that removes it. */
export function registerFlush(fn: () => void): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

/** Runs every registered function. One that throws never stops the others. */
export function flushAll(): void {
  for (const fn of [...flushers]) {
    try {
      fn();
    } catch {
      // Flushing is a best effort. The caller is already handling something else.
    }
  }
}
