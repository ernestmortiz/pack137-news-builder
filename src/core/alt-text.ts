/**
 * Alt text checks. When images are blocked the alt text shows as text, and screen readers read it
 * aloud, so it should describe the photo plainly. Pure: text in, list of problems out.
 */
export type AltProblemCode =
  'missing' | 'redundant-prefix' | 'file-name' | 'repeats-caption' | 'too-long';

export interface AltProblem {
  code: AltProblemCode;
  message: string;
}

export const ALT_MAX_LENGTH = 125;

const PREFIX = /^(?:(?:a|an|the)\s+)?(?:image|photo|picture|graphic|photograph)\s+of\b/i;
const FILE_EXT = /\.(?:jpe?g|png|gif|webp|heic|svg)$/i;
const CAMERA_NAME = /^(?:IMG_?\d+|DSC_?\d+|PXL_\d+)/i;

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s.,;:!?'")\]]+$/u, '')
    .trim();
}

export function altTextProblems(alt: string, caption?: string): AltProblem[] {
  const text = alt.trim();
  if (text === '') {
    return [
      {
        code: 'missing',
        message:
          'Add a short description of the photo, so people using screen readers know what it shows.',
      },
    ];
  }
  const out: AltProblem[] = [];
  if (PREFIX.test(text)) {
    out.push({
      code: 'redundant-prefix',
      message:
        'Describe the photo itself. Screen readers already say it is an image, so leave out "Photo of".',
    });
  }
  if (FILE_EXT.test(text) || CAMERA_NAME.test(text) || text.includes('://')) {
    out.push({
      code: 'file-name',
      message: 'This looks like a file name. Describe what the photo shows instead.',
    });
  }
  if (
    caption !== undefined &&
    normalize(caption) !== '' &&
    normalize(text) === normalize(caption)
  ) {
    out.push({
      code: 'repeats-caption',
      message:
        'This repeats the caption. Describe what the photo shows, since the caption is already read.',
    });
  }
  if (text.length > ALT_MAX_LENGTH) {
    out.push({
      code: 'too-long',
      message: `Shorten this to ${ALT_MAX_LENGTH} characters or fewer, so it is easy to listen to.`,
    });
  }
  return out;
}
