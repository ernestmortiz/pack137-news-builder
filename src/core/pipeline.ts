/**
 * The converter pipeline up to the form (build spec, section 7.3):
 * pasted string -> sanitize -> normalize -> extract -> classify.
 * Rendering is a separate pure function (Phase 2). Nothing here touches the live page.
 */
import { classify, type Classification } from './classify';
import { extract } from './extract';
import type { ContentModel, Issue } from './model';
import { normalize } from './normalize';
import { sanitize } from './sanitize';

export interface ParseResult {
  model: ContentModel;
  issues: Issue[];
  suggestion: Classification;
}

export function parse(pasted: string): ParseResult {
  const { root, issues } = sanitize(pasted);
  const model = extract(normalize(root));
  return { model, issues, suggestion: classify(model) };
}
