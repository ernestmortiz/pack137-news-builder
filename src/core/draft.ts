/**
 * Draft files (build spec, section 8.3). A draft is how a letter moves between people or devices,
 * and how last month's issue becomes this month's starting point. It carries the letter and the
 * settings it was written with, and a schema version so older files can be migrated.
 *
 * A draft file is untrusted input (ADR 0004, Settings): `readDraft` parses it as data only,
 * validates every field against the current shapes, migrates older versions, and never throws.
 *
 * Contract owned by the orchestrator (Phase 5). The bodies are stand-ins; parser-engineer
 * replaces them.
 */
import type { MonthOfYear } from './dates';
import type { LetterForm } from './letter';
import type { PackSettings } from './settings';

/** Marks a file as a Pack 137 letter draft, so other JSON files are refused with a clear message. */
export const DRAFT_KIND = 'pack137-letter-draft';
/** The current draft schema version. Bump it, and add a migration, when LetterForm or PackSettings change shape. */
export const DRAFT_VERSION = 1;
/** Draft files larger than this are refused before parsing. */
export const MAX_DRAFT_BYTES = 5 * 1024 * 1024;

export interface DraftFile {
  kind: typeof DRAFT_KIND;
  version: number;
  /** ISO 8601 time the draft was written, for display only. */
  savedAt: string;
  letter: LetterForm;
  settings: PackSettings;
}

export type DraftReadResult =
  | {
      ok: true;
      draft: DraftFile;
      /** True when an older version was upgraded. */
      migrated: boolean;
      /** Fields that were missing or invalid and were replaced, in plain words, at most 20. */
      notes: string[];
    }
  | { ok: false; message: string };

/** The JSON text of a draft file, pretty printed, ending in a newline. */
export function writeDraft(letter: LetterForm, settings: PackSettings, savedAt: Date): string {
  const draft: DraftFile = {
    kind: DRAFT_KIND,
    version: DRAFT_VERSION,
    savedAt: savedAt.toISOString(),
    letter,
    settings,
  };
  return JSON.stringify(draft, null, 2) + '\n';
}

/**
 * Reads draft file text from a file or from device storage. Refuses text over MAX_DRAFT_BYTES,
 * text that is not JSON, JSON that is not a Pack 137 draft, and versions newer than DRAFT_VERSION,
 * each with a plain message. Migrates older versions. Validates the letter field by field
 * (replacing bad values with empty ones and saying so in `notes`) and the settings with
 * validateSettings.
 * Stand-in: refuses everything. Replaced in Phase 5 by parser-engineer.
 */
export function readDraft(text: string): DraftReadResult {
  void text;
  return { ok: false, message: 'Opening drafts is not ready yet.' };
}

/**
 * Starts this month's issue from last month's (spec 8.1 step 1): a copy of the letter for the given
 * issue month, keeping the structure, standing text and recurring sections, with dated items that
 * are already past removed.
 * Stand-in: copies the letter and sets the month. Replaced in Phase 5 by parser-engineer.
 */
export function nextIssueFrom(letter: LetterForm, issue: MonthOfYear): LetterForm {
  return { ...structuredClone(letter), issue };
}
