/** Small pure decisions for the Finish photos step. */

/** The most the paste box takes. A letter is far smaller; this only stops a runaway paste. */
export const MAX_PASTE_BYTES = 2 * 1024 * 1024;

export const PASTE_TOO_BIG =
  "That is too much to read here. Copy only the letter from TroopTrack's code view and paste again.";

export function pasteTooBig(text: string): boolean {
  // Characters are at least one byte each, so a short string can skip the exact count.
  if (text.length > MAX_PASTE_BYTES) return true;
  if (text.length * 3 <= MAX_PASTE_BYTES) return false;
  return new TextEncoder().encode(text).length > MAX_PASTE_BYTES;
}

export const FINISH_STEPS: readonly string[] = [
  'Paste the letter into TroopTrack.',
  'Replace each Insert photo here box with the photo.',
  "Open TroopTrack's code view, select all, and copy.",
  'Paste it in the box below.',
  "Copy the finished code back into TroopTrack's code view and save.",
];
