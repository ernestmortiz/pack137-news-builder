import type { HelpWantedForm } from '../../core/forms';
import { color } from '../../config/tokens';
import { badge, button, esc, isEmptyRich, lines, panel, paragraph, spacer } from '../components';

function askPanel(form: HelpWantedForm): string {
  const { ask } = form;
  const paragraphs = ask.paragraphs.filter((p) => !isEmptyRich(p));
  const cta = button(ask.button, 'primary');
  const last = paragraphs.length - 1;
  const hasTitle = ask.title.trim() !== '';
  const hasBadge = ask.badge.trim() !== '';
  if (!hasTitle && !hasBadge && paragraphs.length === 0 && cta === '') return '';
  return panel(
    'goldPale',
    lines(
      hasBadge && badge(ask.badge, 'navy'),
      hasTitle &&
        `<p style="margin:10px 0 6px 0;color:${color.navy};font-size:18px;font-weight:700;line-height:1.3;">${esc(ask.title)}</p>`,
      ...paragraphs.map((runs, i) =>
        paragraph(
          runs,
          i < last ? '0 0 10px 0' : cta === '' ? '0' : '0 0 14px 0',
          `color:${color.ink};`,
        ),
      ),
      cta,
    ),
  );
}

/** Help wanted: intro, the highlighted ask, an outro line and a secondary button. */
export function helpWantedBody(form: HelpWantedForm): string {
  const secondary = button(form.secondary, 'secondary');
  const ask = askPanel(form);
  const hasOutro = !isEmptyRich(form.outro);
  const hasIntro = !isEmptyRich(form.intro);
  const before = hasIntro || ask !== '';
  return lines(
    hasIntro && paragraph(form.intro, '0 0 14px 0'),
    ask,
    hasOutro && paragraph(form.outro, secondary === '' ? '18px 0 0 0' : '18px 0 12px 0'),
    // With no outro line the button needs its own gap below the panel.
    !hasOutro && secondary !== '' && before && spacer(),
    secondary,
  );
}
