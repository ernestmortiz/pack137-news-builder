/**
 * Monthly letter renderer (build spec, sections 6, 6.1 and 8.2): a pure function from a LetterForm
 * to the "Pack 137 Stories" email HTML. Section order is fixed by spec 8.2; optional sections are
 * left out when switched off.
 */
import { color } from '../config/tokens';
import { esc, isEmptyRich, lines, richText } from '../templates/components';
import { bodyText, row } from '../templates/letter/layout';
import {
  aroundRows,
  closingRows,
  comingUpRows,
  feedbackRows,
  footerRows,
  horizonRows,
  photoAskRows,
  signOffRows,
} from '../templates/letter/sections';
import { letterShell, mastheadRow } from '../templates/letter/shell';
import { storyRows } from '../templates/letter/story';
import { letterWords, readTimeText, type LetterForm } from './letter';

/** The summary with the read time appended, used for the summary line and the preview text. */
function summaryText(letter: LetterForm): string {
  return [letter.summary.trim(), readTimeText(letterWords(letter))]
    .filter((p) => p !== '')
    .join(' ');
}

function introRow(letter: LetterForm): string {
  const greeting = letter.greeting.trim();
  const hasIntro = !isEmptyRich(letter.intro);
  if (greeting === '' && !hasIntro) return '';
  return row(
    '16px 24px 0 24px',
    lines(
      greeting !== '' && `<p style="margin:0${hasIntro ? ' 0 12px 0' : ''};">${esc(greeting)}</p>`,
      hasIntro && `<p style="margin:0;">${richText(letter.intro)}</p>`,
    ),
    bodyText('1.5'),
  );
}

export function renderLetter(letter: LetterForm): string {
  const summary = summaryText(letter);
  const rows = lines(
    mastheadRow(letter.issue),
    row('8px 24px 0 24px', esc(summary), bodyText('1.5', color.muted, 14)),
    introRow(letter),
    storyRows(letter.story),
    closingRows(letter.closing),
    photoAskRows(letter.photoAsk),
    aroundRows(letter.around),
    comingUpRows(letter.comingUp),
    horizonRows(letter.horizon),
    feedbackRows(letter.feedback),
    signOffRows(letter.signOff),
    footerRows(),
  );
  return letterShell(summary, rows);
}
