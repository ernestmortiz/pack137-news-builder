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
  /** Approved by the owner 2026-11-21 for the monthly photo wrappers. Only 3.17:1 on white: never use it for real text. */
  mutedLight: '#8A90A6',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof color;

export const fontStack = 'Inter,Arial,Helvetica,sans-serif';

export const radius = { panel: 12, control: 8 } as const;

export const space = { card: 14, panel: 14 } as const;

/** Widths every preview and screenshot test must cover. 250 is a card nested in TroopTrack on a small phone. */
export const previewWidths = [250, 375, 600] as const;

export const maxEmailWidth = 600;
