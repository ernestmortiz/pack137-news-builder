import { afterEach, describe, expect, it } from 'vitest';
import type { RichText } from '../../src/core/forms';
import type { Mark } from '../../src/core/model';
import {
  getOffsets,
  readRuns,
  runsFromHtml,
  runsFromText,
  setOffsets,
  writeRuns,
} from '../../src/ui/rich-box-dom';

const t = (text: string, marks: Mark[] = [], href?: string): RichText[number] => ({
  kind: 'text',
  text,
  marks,
  ...(href === undefined ? {} : { href }),
});
const br = (): RichText[number] => ({ kind: 'break' });

function box(html = ''): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  // Test fixture only: the app itself never sets innerHTML.
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

afterEach(() => document.body.replaceChildren());

describe('writeRuns and readRuns', () => {
  const samples: [string, RichText][] = [
    ['plain', [t('hello world')]],
    [
      'every mark',
      [t('a', ['strong']), t('b', ['em']), t('c', ['strike']), t('d', ['em', 'strong'])],
    ],
    ['a link', [t('see '), t('here', [], 'https://example.org/x'), t(' now')]],
    [
      'marks in a link',
      [t('go ', [], 'https://example.org'), t('now', ['strong'], 'https://example.org')],
    ],
    ['breaks', [t('a'), br(), t('b'), br(), br(), t('c')]],
    ['a break at the end', [t('a'), br()]],
    ['a break at the start', [br(), t('a')]],
    ['only a break', [br()]],
    ['nothing', []],
    ['a mailto link', [t('mail', [], 'mailto:den@example.org')]],
  ];
  for (const [name, runs] of samples) {
    it(`round trips ${name}`, () => {
      const el = box();
      writeRuns(el, runs);
      expect(readRuns(el)).toEqual(runs);
    });
  }

  it('shows a link with its address in the title and not as innerHTML', () => {
    const el = box();
    writeRuns(el, [t('x<b>y', [], 'https://example.org')]);
    const a = el.querySelector('a');
    expect(a?.getAttribute('title')).toBe('https://example.org');
    expect(a?.textContent).toBe('x<b>y');
    expect(el.querySelector('b')).toBeNull();
  });

  it('gives a trailing break an extra line to show', () => {
    const el = box();
    writeRuns(el, [t('a'), br()]);
    expect(el.querySelectorAll('br')).toHaveLength(2);
  });
});

describe('readRuns of whatever the browser leaves', () => {
  it('reads b, i and strike elements as marks', () => {
    const el = box('<b>a</b><i>b</i><strike>c</strike><del>d</del>');
    expect(readRuns(el)).toEqual([t('a', ['strong']), t('b', ['em']), t('cd', ['strike'])]);
  });

  it('treats a div or span as its text, a div as a new line', () => {
    expect(readRuns(box('one<div>two</div><div>three</div>'))).toEqual([
      t('one'),
      br(),
      t('two'),
      br(),
      t('three'),
    ]);
    expect(readRuns(box('a<span style="color:red">b</span>'))).toEqual([t('ab')]);
  });

  it('counts an empty div line and ignores a br that only holds a div open', () => {
    expect(readRuns(box('a<div><br></div><div>b</div>'))).toEqual([t('a'), br(), br(), t('b')]);
    expect(readRuns(box('<div>a<br></div><div>b</div>'))).toEqual([t('a'), br(), t('b')]);
  });

  it('does not count the browser placeholder br at the end', () => {
    expect(readRuns(box('abc<br>'))).toEqual([t('abc')]);
    expect(readRuns(box('<br>'))).toEqual([]);
  });

  it('turns non-breaking spaces into spaces and newlines into breaks', () => {
    expect(readRuns(box('a&nbsp;b\nc'))).toEqual([t('a b'), br(), t('c')]);
  });
});

describe('hostile content', () => {
  it('drops script and style and keeps no element', () => {
    const el = box('hi<script>alert(1)</script><style>p{}</style>there');
    expect(readRuns(el)).toEqual([t('hithere')]);
  });

  it('ignores an image and its handler', () => {
    expect(readRuns(box('a<img src=x onerror="alert(1)">b'))).toEqual([t('ab')]);
  });

  it('drops a javascript: address but keeps the words', () => {
    const el = box('<a href="javascript:alert(1)">click</a>');
    expect(readRuns(el)).toEqual([t('click')]);
  });

  it('drops data: and relative addresses, and userinfo tricks', () => {
    expect(readRuns(box('<a href="data:text/html,x">a</a>'))).toEqual([t('a')]);
    expect(readRuns(box('<a href="/local">a</a>'))).toEqual([t('a')]);
    expect(readRuns(box('<a href="https://good.example@evil.example/">a</a>'))).toEqual([t('a')]);
  });

  it('keeps a safe address, cleaned by the renderer rule', () => {
    expect(readRuns(box('<a href=" https://example.org/a b ">a</a>'))).toEqual([
      t('a', [], 'https://example.org/a%20b'),
    ]);
  });

  it('never keeps attributes or elements it does not know', () => {
    const runs = readRuns(box('<p onclick="x()"><font color=red><u>a</u></font></p>'));
    expect(runs).toEqual([t('a')]);
  });
});

describe('offsets', () => {
  it('reads and sets the selection in plain text offsets', () => {
    const el = box();
    writeRuns(el, [t('ab'), br(), t('cd', ['strong']), t('ef', [], 'https://example.org')]);
    setOffsets(el, 1, 4);
    expect(getOffsets(el)).toEqual([1, 4]);
    setOffsets(el, 3, 3);
    expect(getOffsets(el)).toEqual([3, 3]);
    setOffsets(el, 0, 7);
    expect(getOffsets(el)).toEqual([0, 7]);
  });

  it('puts a caret after a trailing break on the extra line', () => {
    const el = box();
    writeRuns(el, [t('a'), br()]);
    setOffsets(el, 2, 2);
    expect(getOffsets(el)).toEqual([2, 2]);
  });

  it('is null when the selection is elsewhere', () => {
    const el = box('abc');
    const other = document.createElement('p');
    other.textContent = 'x';
    document.body.append(other);
    const range = document.createRange();
    range.selectNodeContents(other);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    expect(getOffsets(el)).toBeNull();
  });
});

describe('paste', () => {
  it('turns plain text lines into breaks', () => {
    expect(runsFromText('a\r\nb\n\nc')).toEqual([t('a'), br(), t('b'), br(), br(), t('c')]);
    expect(runsFromText('a\tb')).toEqual([t('a b')]);
  });

  it('takes the text runs of pasted HTML, joined with breaks', () => {
    const runs = runsFromHtml(
      '<p>Den Meeting on Dec 16th - <a href="https://pack137.trooptrack.com/plan/events/1847519">Fun On The Run</a></p><p>A <b>second</b> one</p>',
    );
    expect(runs).toEqual([
      t('Den Meeting on Dec 16th - '),
      t('Fun On The Run', [], 'https://pack137.trooptrack.com/plan/events/1847519'),
      br(),
      t('A '),
      t('second', ['strong']),
      t(' one'),
    ]);
  });

  it('keeps nothing dangerous from pasted HTML', () => {
    const runs = runsFromHtml(
      '<p>safe</p><script>alert(1)</script><img src=x onerror=alert(1)><p><a href="javascript:alert(1)">bad</a></p>',
    );
    const json = JSON.stringify(runs);
    expect(json).not.toContain('alert');
    expect(json).not.toContain('javascript');
    expect(json).toContain('safe');
    expect(json).toContain('bad');
  });
});
