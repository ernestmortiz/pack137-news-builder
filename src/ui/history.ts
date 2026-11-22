/**
 * Undo and redo for the converter. No DOM here.
 *
 * Two kinds of step:
 *  - patch: one typed change in one field. Small. Undo and redo apply it to the live screen.
 *  - snapshot: a structural change (add, remove, move, layout switch, suggestion, paste refill,
 *    start over). Holds a full copy of the state before and after.
 * Every step has a short plain-words label such as "removed a row".
 */

export const MAX_STEPS = 2000;
/** Stored text kept across all steps, in characters (about bytes). The oldest steps go first. */
export const MAX_BYTES = 50 * 1024 * 1024;

export interface HistoryOptions<P> {
  /** Most steps kept. */
  limit?: number;
  /** Most stored text kept. */
  maxBytes?: number;
  /** Stored size of one patch. Defaults to its JSON length. */
  patchBytes?: (patch: P) => number;
}

export type HistoryMove<T, P> =
  | { kind: 'snapshot'; state: T; label: string }
  | { kind: 'patch'; patch: P; direction: 'undo' | 'redo'; label: string };

export interface History<T, P> {
  /** A structural change. `before` and `after` are the whole state either side of it. */
  recordSnapshot(before: T, after: T, label: string): void;
  /** A small change, such as one typed character. */
  recordPatch(patch: P, label: string): void;
  undo(): HistoryMove<T, P> | undefined;
  redo(): HistoryMove<T, P> | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Number of steps that can be undone. */
  size(): number;
  /** Stored size of all steps, in characters. */
  bytes(): number;
}

type Entry<T, P> =
  | { kind: 'snapshot'; before: T; after: T; label: string; bytes: number; afterBytes: number }
  | { kind: 'patch'; patch: P; label: string; bytes: number };

const jsonBytes = (value: unknown): number => JSON.stringify(value)?.length ?? 0;

/**
 * At most `limit` steps and `maxBytes` of stored text are kept. The oldest are dropped first, but
 * the newest step always stays. Anything stored is a deep copy.
 */
export function createHistory<T, P>(options: HistoryOptions<P> | number = {}): History<T, P> {
  const o = typeof options === 'number' ? { limit: options } : options;
  const limit = o.limit ?? MAX_STEPS;
  const maxBytes = o.maxBytes ?? MAX_BYTES;
  const patchBytes = o.patchBytes ?? jsonBytes;
  let entries: Entry<T, P>[] = [];
  let total = 0;
  // Number of entries currently applied. Entries from here on are redo steps.
  let applied = 0;

  function push(entry: Entry<T, P>): void {
    for (const gone of entries.slice(applied)) total -= gone.bytes;
    entries = entries.slice(0, applied);
    entries.push(entry);
    total += entry.bytes;
    let drop = Math.max(0, entries.length - limit);
    for (let k = 0; k < drop; k++) total -= entries[k]?.bytes ?? 0;
    while (total > maxBytes && drop < entries.length - 1) {
      total -= entries[drop]?.bytes ?? 0;
      drop++;
    }
    entries = entries.slice(drop);
    applied = entries.length;
  }

  return {
    recordSnapshot(before, after, label) {
      const last = entries.slice(0, applied).at(-1);
      // Straight after another snapshot step the state is already stored, so share it.
      const shared = last?.kind === 'snapshot';
      const start = shared ? last.after : structuredClone(before);
      const afterBytes = jsonBytes(after);
      // A shared "before" is counted again, so the budget is never too low.
      const beforeBytes = shared ? last.afterBytes : jsonBytes(start);
      push({
        kind: 'snapshot',
        before: start,
        after: structuredClone(after),
        label,
        bytes: afterBytes + beforeBytes,
        afterBytes,
      });
    },
    recordPatch(patch, label) {
      push({ kind: 'patch', patch: structuredClone(patch), label, bytes: patchBytes(patch) });
    },
    undo() {
      if (applied === 0) return undefined;
      applied -= 1;
      const entry = entries[applied];
      if (!entry) return undefined;
      if (entry.kind === 'patch') {
        return {
          kind: 'patch',
          patch: structuredClone(entry.patch),
          direction: 'undo',
          label: entry.label,
        };
      }
      return { kind: 'snapshot', state: structuredClone(entry.before), label: entry.label };
    },
    redo() {
      const entry = entries[applied];
      if (!entry) return undefined;
      applied += 1;
      if (entry.kind === 'patch') {
        return {
          kind: 'patch',
          patch: structuredClone(entry.patch),
          direction: 'redo',
          label: entry.label,
        };
      }
      return { kind: 'snapshot', state: structuredClone(entry.after), label: entry.label };
    },
    canUndo: () => applied > 0,
    canRedo: () => applied < entries.length,
    size: () => applied,
    bytes: () => total,
  };
}
