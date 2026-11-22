import type { CallToActionForm } from '../../core/forms';
import { boxedParagraphs, button, lines } from '../components';

/** Call to action: one paragraph (16px below, or in a yellow box with a 14px gap) and one button. */
export function callToActionBody(form: CallToActionForm): string {
  const cta = button(form.button, 'primary');
  return lines(
    ...boxedParagraphs([{ runs: form.paragraph, boxed: form.boxed === true }], cta !== ''),
    cta,
  );
}
