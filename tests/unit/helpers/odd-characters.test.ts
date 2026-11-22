import { describe, expect, it } from 'vitest';
import {
  cleanOddRich,
  cleanOddText,
  oddCharactersMessage,
} from '../../../src/core/helpers/odd-characters';
import type { Inline } from '../../../src/core/model';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const ZWSP = cp(0x200b);
const ZWNJ = cp(0x200c);
const ZWJ = cp(0x200d);
const WJ = cp(0x2060);
const BOM = cp(0xfeff);
const SHY = cp(0xad);
const LRM = cp(0x200e);
const RLM = cp(0x200f);
const LRE = cp(0x202a);
const PDF = cp(0x202c);
const VS16 = cp(0xfe0f);
const EN_DASH = cp(0x2013);
const PARTY = cp(0x1f389);
const TREE = cp(0x1f332);
const FAMILY = cp(0x1f468) + ZWJ + cp(0x1f469) + ZWJ + cp(0x1f467);
const THUMB = cp(0x1f44d, 0x1f3fd);
const FLAG = cp(0x1f1fa, 0x1f1f8);

const SYMBOLS = [
  0x2022, 0x25e6, 0x25aa, 0x25ab, 0x25cf, 0x25cb, 0x25a0, 0x25a1, 0x25ba, 0x25b6, 0x27a4, 0x2794,
  0x2192, 0xbb, 0x203a, 0x2605, 0x2606, 0x2713, 0x2714, 0x2717, 0x2718, 0x2756, 0x25c6, 0x25c7,
].map((c) => cp(c));
const [BULLET = '', , , , , , , , , , , , ARROW = '', RAQUO = '', , STAR = '', , CHECK = ''] =
  SYMBOLS;

const t = (text: string, extra: Partial<Extract<Inline, { kind: 'text' }>> = {}): Inline => ({
  kind: 'text',
  text,
  marks: [],
  ...extra,
});
const br: Inline = { kind: 'break' };

describe('odd characters: plain text', () => {
  it('returns clean text as it is, with nothing removed', () => {
    for (const text of [
      '',
      '   ',
      'Den Meeting | Scouting America',
      `Dec 6 - Hike ${EN_DASH} bring water (and a "snack") & #1 @ 50%`,
      'Café à la carte, 日本語, Русский',
      '=> Sign up * here > now',
    ])
      expect(cleanOddText(text)).toEqual({ text, removed: [] });
  });

  it.each(SYMBOLS)('removes %s when it leads a line', (symbol) => {
    expect(cleanOddText(`${symbol} Pack meeting`)).toEqual({
      text: 'Pack meeting',
      removed: [symbol],
    });
    expect(cleanOddText(`${symbol}Pack meeting`).text).toBe('Pack meeting');
    expect(cleanOddText(`  ${symbol}  Pack meeting`).text).toBe('Pack meeting');
  });

  it.each(SYMBOLS)('removes %s when it is all there is', (symbol) => {
    expect(cleanOddText(symbol)).toEqual({ text: '', removed: [symbol] });
    expect(cleanOddText(` ${symbol} ${symbol} `)).toEqual({ text: '', removed: [symbol] });
  });

  it('removes a symbol that stands alone at the end of a line', () => {
    expect(cleanOddText(`Read more ${ARROW}`)).toEqual({ text: 'Read more', removed: [ARROW] });
    expect(cleanOddText(`${STAR} Big news ${STAR}${STAR} `)).toEqual({
      text: 'Big news',
      removed: [STAR],
    });
  });

  it('keeps a symbol between words, and one that touches the end of a word', () => {
    for (const text of [
      `Camping ${STAR} Hiking ${STAR} Fishing`,
      `Settings ${ARROW} Account`,
      `Home ${RAQUO} Events`,
      `Done${CHECK}`,
    ])
      expect(cleanOddText(text)).toEqual({ text, removed: [] });
  });

  it('lists each removed character once, in the order met', () => {
    expect(cleanOddText(`${BULLET} ${STAR} ${BULLET} Hike ${STAR}`)).toEqual({
      text: 'Hike',
      removed: [BULLET, STAR],
    });
  });

  it('takes the emoji variation mark away with its symbol', () => {
    expect(cleanOddText(`${CHECK}${VS16} Done`)).toEqual({ text: 'Done', removed: [CHECK] });
  });

  it('works line by line', () => {
    expect(cleanOddText(`${BULLET} One\n${BULLET} Two ${STAR}\nThree`)).toEqual({
      text: 'One\nTwo\nThree',
      removed: [BULLET, STAR],
    });
  });

  it('removes an emoji that leads a line, and keeps one inside or after a sentence', () => {
    expect(cleanOddText(`${PARTY} Pack party`)).toEqual({ text: 'Pack party', removed: [PARTY] });
    expect(cleanOddText(`${PARTY}${TREE} Pack party`)).toEqual({
      text: 'Pack party',
      removed: [PARTY, TREE],
    });
    expect(cleanOddText(`${FAMILY} Family night`)).toEqual({
      text: 'Family night',
      removed: [FAMILY],
    });
    expect(cleanOddText(`${THUMB} Thanks`)).toEqual({ text: 'Thanks', removed: [THUMB] });
    expect(cleanOddText(`${FLAG} Flag ceremony`)).toEqual({
      text: 'Flag ceremony',
      removed: [FLAG],
    });
    for (const text of [
      `We had a great time ${PARTY} at the party`,
      `Thanks ${THUMB}`,
      `Family night ${FAMILY} is on`,
      `Camp ${TREE}${VS16}`,
    ])
      expect(cleanOddText(text)).toEqual({ text, removed: [] });
  });

  it('keeps digits, keycaps and legal marks at the start of a line', () => {
    for (const text of ['1. First', `1${VS16}${cp(0x20e3)} First`, '© 2026 Pack 137', '# One'])
      expect(cleanOddText(text)).toEqual({ text, removed: [] });
  });

  it('removes invisible characters anywhere and names them in words', () => {
    expect(cleanOddText(`Pack${ZWSP} meet${ZWSP}ing`)).toEqual({
      text: 'Pack meeting',
      removed: ['an invisible space'],
    });
    expect(cleanOddText(`${BOM}Pack`)).toEqual({ text: 'Pack', removed: ['an invisible space'] });
    expect(cleanOddText(`im${SHY}por${SHY}tant`)).toEqual({
      text: 'important',
      removed: ['a soft hyphen'],
    });
    expect(cleanOddText(`a${ZWNJ}b${ZWJ}c${WJ}d`)).toEqual({
      text: 'abcd',
      removed: ['an invisible joiner'],
    });
    expect(cleanOddText(`${LRE}Pack${PDF} 137${LRM}${RLM}`)).toEqual({
      text: 'Pack 137',
      removed: ['an invisible text direction mark'],
    });
    expect(cleanOddText(`${ZWSP}${BULLET}${ZWSP} Hike${SHY}`)).toEqual({
      text: 'Hike',
      removed: ['an invisible space', BULLET, 'a soft hyphen'],
    });
  });

  it('keeps the joiner inside an emoji and between letters of a script that needs it', () => {
    const persian = `می${ZWNJ}خواهم`;
    const hindi = `क्${ZWJ}ष`;
    for (const text of [`Night ${FAMILY} out`, persian, hindi])
      expect(cleanOddText(text)).toEqual({ text, removed: [] });
  });

  it('with leadOnly, cleans the start of the first line and nothing else', () => {
    expect(cleanOddText(`${BULLET} Dec 6 Hi${ZWSP}ke ${STAR}`, { leadOnly: true })).toEqual({
      text: `Dec 6 Hi${ZWSP}ke ${STAR}`,
      removed: [BULLET],
    });
    expect(cleanOddText(`Dec 6 ${STAR}`, { leadOnly: true })).toEqual({
      text: `Dec 6 ${STAR}`,
      removed: [],
    });
  });
});

describe('odd characters: rich text', () => {
  it('returns the same runs when nothing is odd', () => {
    const runs = [t('Bring '), t('water', { marks: ['strong'] }), br, t('and a snack')];
    const out = cleanOddRich(runs);
    expect(out.removed).toEqual([]);
    expect(out.runs).toBe(runs);
  });

  it('cleans each line, across runs, and keeps marks and links', () => {
    const runs = [
      t(BULLET, { marks: ['strong'] }),
      t(' Sign up ', { marks: ['strong'] }),
      t(`here ${ARROW}`, { href: 'https://example.org/' }),
      br,
      t(`${STAR} Bring wa${ZWSP}ter`),
    ];
    const copy = structuredClone(runs);
    expect(cleanOddRich(runs)).toEqual({
      runs: [
        t('Sign up ', { marks: ['strong'] }),
        t('here', { href: 'https://example.org/' }),
        br,
        t('Bring water'),
      ],
      removed: [BULLET, ARROW, STAR, 'an invisible space'],
    });
    expect(runs).toEqual(copy);
  });

  it('drops a line that held only ornaments, with its line break', () => {
    expect(cleanOddRich([t('One'), br, t(`${STAR} ${STAR} ${STAR}`), br, t('Two')])).toEqual({
      runs: [t('One'), br, t('Two')],
      removed: [STAR],
    });
    expect(cleanOddRich([t(`${STAR}${STAR}`)])).toEqual({ runs: [], removed: [STAR] });
    // A blank line that was already there stays.
    expect(cleanOddRich([t(`${BULLET} One`), br, br, t('Two')])).toEqual({
      runs: [t('One'), br, br, t('Two')],
      removed: [BULLET],
    });
  });

  it('never empties a link: a link whose only text is a symbol stays whole', () => {
    const runs = [t('Next '), t(ARROW, { href: 'https://example.org/' })];
    expect(cleanOddRich(runs)).toEqual({ runs, removed: [] });
  });

  it('with leadOnly, cleans only the start', () => {
    expect(
      cleanOddRich([t(`${BULLET} `), t('Dec 6', { marks: ['strike'] }), t(` Hike ${STAR}`)], {
        leadOnly: true,
      }),
    ).toEqual({
      runs: [t('Dec 6', { marks: ['strike'] }), t(` Hike ${STAR}`)],
      removed: [BULLET],
    });
  });
});

describe('odd characters: the message', () => {
  it('lists symbols as they look and invisible ones in words', () => {
    expect(oddCharactersMessage([BULLET, STAR])).toBe(`Removed odd characters: ${BULLET} ${STAR}.`);
    expect(oddCharactersMessage(['an invisible space'])).toBe(
      'Removed odd characters: an invisible space.',
    );
    expect(oddCharactersMessage(['a soft hyphen', BULLET, 'an invisible space', STAR])).toBe(
      `Removed odd characters: ${BULLET} ${STAR}, a soft hyphen, an invisible space.`,
    );
  });
});
