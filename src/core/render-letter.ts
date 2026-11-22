/**
 * Monthly letter renderer (build spec, sections 6, 6.1 and 8.2): a pure function from a LetterForm
 * to the "Pack 137 Stories" email HTML.
 *
 * Stand-in so the editor can be built in parallel (Phase 4); renderer-engineer replaces the body.
 */
import type { LetterForm } from './letter';

export function renderLetter(letter: LetterForm): string {
  void letter;
  return '';
}
