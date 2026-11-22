/**
 * Randomized tests for draft files. Each seed damages a valid draft (the November 2026 letter) in
 * a few random places and reads it. Everything is deterministic: a failure names its seed.
 *
 *   FUZZ_RUNS=5000 npm test -- fuzz-draft     a longer run (seeds 1 to 5000)
 *   FUZZ_SEED=1234 npm test -- fuzz-draft     replay one seed
 *
 * Properties: a readDraft never throws and always answers in plain words; b what it accepts is a
 * clean draft (writing it and reading it again gives the same letter and settings, no notes);
 * c nothing leaks onto Object.prototype; d validateSettings never throws on the damaged settings.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDraft, writeDraft } from '../../src/core/draft';
import type { LetterForm } from '../../src/core/letter';
import { defaultSettings, validateSettings } from '../../src/core/settings';
import { mulberry32 } from '../fuzz/generate';

const here = dirname(fileURLToPath(import.meta.url));
const letter = JSON.parse(
  readFileSync(join(here, '..', 'fixtures', 'monthly', '2026-11.draft.json'), 'utf8'),
) as LetterForm;
const SAVED = new Date('2026-11-22T15:04:05.000Z');
const EM_DASH = String.fromCharCode(0x2014);

const RUNS = Number(process.env.FUZZ_RUNS ?? 300);
const ONE_SEED = process.env.FUZZ_SEED === undefined ? undefined : Number(process.env.FUZZ_SEED);
const SEEDS: number[] =
  ONE_SEED !== undefined && Number.isFinite(ONE_SEED)
    ? [ONE_SEED]
    : Array.from({ length: Number.isFinite(RUNS) && RUNS > 0 ? RUNS : 300 }, (_, i) => i + 1);

/** Values to put where another value was. The file stays JSON; the field changes type or meaning. */
const VALUES = [
  'null',
  'true',
  '-1',
  '0',
  '13',
  '1e999',
  '0.5',
  '""',
  '[]',
  '{}',
  '[[]]',
  '[null]',
  '"javascript:alert(1)"',
  '"pack@x.org?bcc=evil@x.org"',
  '"\\u0000"',
  '"\\ud800"',
  '"\u2028"',
];

/** Fields to put at the start of an object. A repeated key replaces the real one that follows or not. */
const KEYS = [
  '"__proto__":{"polluted":"yes"},',
  '"constructor":{"prototype":{"polluted":"yes"}},',
  '"prototype":{"polluted":"yes"},',
  '"kind":"video",',
  '"version":2,',
  '"enabled":"no",',
  '"extra":[1,2,3],',
];

/** Loose pieces dropped anywhere. These usually break the JSON. */
const BREAKERS = [',', ':', '"', '{', '}', '[', ']', '\u0000', '\ud83c'];

function pick(list: readonly string[], rand: () => number): string {
  return list[Math.floor(rand() * list.length)] ?? '';
}

/** The UTF-8 bytes of the draft with a few of them changed, removed, added or repeated. */
function mutateBytes(bytes: Uint8Array, rand: () => number): string {
  let out = Array.from(bytes);
  const edits = 1 + Math.floor(rand() * 8);
  for (let e = 0; e < edits; e++) {
    const at = Math.floor(rand() * out.length);
    const roll = rand();
    if (roll < 0.35) out[at] = Math.floor(rand() * 256);
    else if (roll < 0.5) out[at] = (out[at] ?? 0) ^ (1 << Math.floor(rand() * 8));
    else if (roll < 0.65) out.splice(at, 1 + Math.floor(rand() * 40));
    else if (roll < 0.8) out.splice(at, 0, Math.floor(rand() * 256));
    else if (roll < 0.9) out = out.slice(0, at);
    else out.splice(at, 0, ...out.slice(at, at + Math.floor(rand() * 200)));
  }
  return new TextDecoder().decode(Uint8Array.from(out));
}

/** The draft text with JSON-shaped pieces put in or swapped at random places. */
function mutateText(text: string, rand: () => number): string {
  let out = text;
  const edits = 1 + Math.floor(rand() * 5);
  for (let e = 0; e < edits; e++) {
    const roll = rand();
    if (roll < 0.55) {
      // Replace one whole value: a number, true, false or a short string.
      const values = [...out.matchAll(/(?<=: )(?:-?\d+|true|false|"[^"\\\n]{0,40}")/g)];
      const hit = values[Math.floor(rand() * values.length)];
      if (hit?.index !== undefined) {
        out = out.slice(0, hit.index) + pick(VALUES, rand) + out.slice(hit.index + hit[0].length);
      }
    } else if (roll < 0.95) {
      // Put a field right after an opening brace.
      const braces = [...out.matchAll(/\{(?=\s*")/g)];
      const hit = braces[Math.floor(rand() * braces.length)];
      if (hit?.index !== undefined) {
        out = out.slice(0, hit.index + 1) + pick(KEYS, rand) + out.slice(hit.index + 1);
      }
    } else {
      const at = Math.floor(rand() * out.length);
      out = out.slice(0, at) + pick(BREAKERS, rand) + out.slice(at);
    }
  }
  return out;
}

function check(seed: number, text: string): 'opened' | 'refused' {
  let result: ReturnType<typeof readDraft>;
  try {
    result = readDraft(text);
  } catch (error) {
    throw new Error(`seed ${seed}: readDraft threw ${String(error)}`, { cause: error });
  }
  if (!result.ok) {
    expect(result.message, `seed ${seed}`).not.toBe('');
    expect(result.message, `seed ${seed}`).not.toContain(EM_DASH);
    return 'refused';
  }
  expect(result.notes.length, `seed ${seed}`).toBeLessThanOrEqual(20);
  for (const note of result.notes) {
    expect(note, `seed ${seed}`).not.toContain(EM_DASH);
    expect(note.length, `seed ${seed}`).toBeLessThan(300);
  }
  // What was accepted is a clean draft.
  const { draft } = result;
  const again = readDraft(writeDraft(draft.letter, draft.settings, SAVED));
  if (!again.ok) throw new Error(`seed ${seed}: the accepted draft did not open again`);
  expect(again.notes, `seed ${seed}`).toEqual([]);
  expect(again.draft.letter, `seed ${seed}`).toEqual(draft.letter);
  expect(again.draft.settings, `seed ${seed}`).toEqual(draft.settings);
  expect(validateSettings(draft.settings).problems, `seed ${seed}`).toEqual([]);
  return 'opened';
}

describe('fuzz: damaged drafts', () => {
  const valid = writeDraft(letter, defaultSettings(), SAVED);
  const validBytes = new TextEncoder().encode(valid);

  it('a: random byte changes never make readDraft throw', () => {
    for (const seed of SEEDS) check(seed, mutateBytes(validBytes, mulberry32(seed)));
  });

  it('b: JSON-shaped changes are refused or repaired, and repairs are clean drafts', () => {
    let openedCount = 0;
    for (const seed of SEEDS) {
      if (check(seed, mutateText(valid, mulberry32(seed + 1_000_000))) === 'opened') {
        openedCount += 1;
      }
    }
    // The mutations must not all be refused, or property b would test nothing.
    if (SEEDS.length >= 100) expect(openedCount).toBeGreaterThan(SEEDS.length / 4);
  });

  it('c: nothing reached Object.prototype', () => {
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('d: validateSettings never throws on damaged settings', () => {
    const settingsText = JSON.stringify(defaultSettings(), null, 2);
    for (const seed of SEEDS) {
      const damaged = mutateText(settingsText, mulberry32(seed + 2_000_000));
      let raw: unknown;
      try {
        raw = JSON.parse(damaged);
      } catch {
        continue;
      }
      const result = validateSettings(raw);
      expect(validateSettings(result.settings).problems, `seed ${seed}`).toEqual([]);
      expect(validateSettings(result.settings).settings, `seed ${seed}`).toEqual(result.settings);
      for (const problem of result.problems) {
        expect(problem.message, `seed ${seed}`).not.toContain(EM_DASH);
      }
    }
  });
});
