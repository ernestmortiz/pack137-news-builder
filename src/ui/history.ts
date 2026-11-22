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
}

type Entry<T, P> =
  | { kind: 'snapshot'; before: T; after: T; label: string }
  | { kind: 'patch'; patch: P; label: string };

/** At most `limit` steps are kept. The oldest are dropped first. Anything stored is a deep copy. */
export function createHistory<T, P>(limit: number = MAX_STEPS): History<T, P> {
  let entries: Entry<T, P>[] = [];
  // Number of entries currently applied. Entries from here on are redo steps.
  let applied = 0;

  function push(entry: Entry<T, P>): void {
    entries = entries.slice(0, applied);
    entries.push(entry);
    if (entries.length > limit) entries = entries.slice(entries.length - limit);
    applied = entries.length;
  }

  return {
    recordSnapshot(before, after, label) {
      const last = entries.slice(0, applied).at(-1);
      // Straight after another snapshot step the state is already stored, so share it.
      const start = last?.kind === 'snapshot' ? last.after : structuredClone(before);
      push({ kind: 'snapshot', before: start, after: structuredClone(after), label });
    },
    recordPatch(patch, label) {
      push({ kind: 'patch', patch: structuredClone(patch), label });
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
  };
}
