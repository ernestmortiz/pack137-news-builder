import type { MessageForm } from '../../core/forms';
import { boxedParagraphs, button, lines } from '../components';

/**
 * Message: a short note with an optional button. No approved output exists; it follows Call to
 * action (ADR 0005): each paragraph 14px below, the last 16px below when a button follows and no
 * margin when it does not. Boxed paragraphs (owner decision 2026-11-22) sit in a yellow panel.
 */
export function messageBody(form: MessageForm): string {
  const cta = button(form.button, 'primary');
  const items = form.paragraphs.map((runs, i) => ({ runs, boxed: form.boxed?.[i] === true }));
  return lines(...boxedParagraphs(items, cta !== ''), cta);
}
