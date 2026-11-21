import type { CallToActionForm } from '../../core/forms';
import { button, isEmptyRich, lines, paragraph } from '../components';

/** Call to action: one paragraph (16px below) and one button. */
export function callToActionBody(form: CallToActionForm): string {
  const cta = button(form.button, 'primary');
  return lines(
    !isEmptyRich(form.paragraph) && paragraph(form.paragraph, cta === '' ? '0' : '0 0 16px 0'),
    cta,
  );
}
