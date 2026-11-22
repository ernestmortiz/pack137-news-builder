/**
 * Monthly letter renderer (build spec, sections 6, 6.1 and 8.2): a pure function from a LetterForm
 * to the "Pack 137 Stories" email HTML. Section order is fixed by spec 8.2; optional sections are
 * left out when switched off.
 */
import { color } from '../config/tokens';
import { esc, isEmptyRich, lines, richText } from '../templates/components';
import { bodyText, isPhotoSpot, row } from '../templates/letter/layout';
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
import { defaultSettings, type PackSettings } from './settings';

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

/**
 * `settings` supplies the logo, footer links, pack emails and year-at-a-glance link (spec 9). It
 * should come from validateSettings or defaultSettings; the renderer still refuses unsafe URLs and
 * any email that is not a bare address (the link is left out).
 */
export function renderLetter(
  letter: LetterForm,
  settings: PackSettings = defaultSettings(),
): string {
  const summary = summaryText(letter);
  const rows = lines(
    mastheadRow(letter.issue, settings),
    row('8px 24px 0 24px', esc(summary), bodyText('1.5', color.muted, 14)),
    introRow(letter),
    storyRows(letter.story),
    closingRows(letter.closing),
    photoAskRows(letter.photoAsk),
    aroundRows(letter.around),
    comingUpRows(letter.comingUp),
    horizonRows(letter.horizon, settings),
    feedbackRows(letter.feedback, settings),
    signOffRows(letter.signOff),
    footerRows(settings),
  );
  return letterShell(summary, rows);
}

/**
 * Every photo the letter shows as a spot (no usable address), in order, for the editor's warnings.
 * Photo blocks are numbered among photo blocks ("Photo 2"); a sidebar photo names its block
 * ("Sidebar photo in block 5", counting every story block from 1).
 */
export function photoSpots(letter: LetterForm): { where: string; alt: string }[] {
  const out: { where: string; alt: string }[] = [];
  let photoNo = 0;
  letter.story.blocks.forEach((block, i) => {
    if (block.kind === 'photo') {
      photoNo += 1;
      if (isPhotoSpot(block.photo))
        out.push({ where: `Photo ${photoNo}`, alt: block.photo.alt.trim() });
    } else if (block.kind === 'sidebar' && block.photo !== undefined && isPhotoSpot(block.photo)) {
      out.push({ where: `Sidebar photo in block ${i + 1}`, alt: block.photo.alt.trim() });
    }
  });
  return out;
}
