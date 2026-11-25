/** Pack 137 design tokens. The only file where hex values may appear (build spec, section 6). */
export const color = {
  navy: '#151B4D',
  navyMasthead: '#0D1431',
  gold: '#F7A823',
  goldLight: '#F9B93E',
  goldPale: '#FFE9B8',
  lavender: '#E3E6F5',
  greyPage: '#EEF1F6',
  ink: '#1B1F2E',
  muted: '#5B6275',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof color;

export const fontStack = 'Inter,Arial,Helvetica,sans-serif';

export const radius = { panel: 12, control: 8 } as const;

export const space = { card: 14, panel: 14 } as const;

/**
 * Widths every preview and screenshot test must cover: the most popular phone widths and a
 * desktop. 360 is the most common Android width and 390 the most common recent iPhone width
 * (owner decision, 2026-11-25; it replaced 250 and 375).
 */
export const previewWidths = [360, 390, 600] as const;

export const maxEmailWidth = 600;
