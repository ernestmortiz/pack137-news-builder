import type { MessageForm } from '../../core/forms';
import { button, isEmptyRich, lines, paragraph } from '../components';

/**
 * Message: a short note with an optional button. No approved output exists; it follows Call to
 * action (ADR 0005): each paragraph 14px below, the last 16px below when a button follows and no
 * margin when it does not.
 */
export function messageBody(form: MessageForm): string {
  const paragraphs = form.paragraphs.filter((p) => !isEmptyRich(p));
  const cta = button(form.button, 'primary');
  const last = paragraphs.length - 1;
  return lines(
    ...paragraphs.map((runs, i) =>
      paragraph(runs, i < last ? '0 0 14px 0' : cta === '' ? '0' : '0 0 16px 0'),
    ),
    cta,
  );
}
