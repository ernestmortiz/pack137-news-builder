import { afterEach, describe, expect, it } from 'vitest';
import type { AnnouncementForm } from '../../src/core/forms';
import { buildCardView } from '../../src/ui/card-view';
import type { FormContext } from '../../src/ui/form-kit';
import type { KeyValueStore } from '../../src/ui/storage';
import { createViewPref, createViewSwitch, EDIT_VIEW_KEY } from '../../src/ui/view-pref';

const ctx: FormContext = {
  checks: () => [],
  suggestions: () => [],
  warnings: () => [],
  typed() {},
  begin() {},
  step() {},
  history() {},
  swapped() {},
  removed() {},
  apply() {},
};
const options = { openInForm() {}, width: 600, onWidth() {} };
const run = (text: string) => [{ kind: 'text' as const, text, marks: [] }];

afterEach(() => document.body.replaceChildren());

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('edit view preference', () => {
  it('defaults to the card and remembers the form', () => {
    const mem = memory();
    const pref = createViewPref(() => mem);
    expect(pref.get()).toBe('card');
    pref.set('form');
    expect(mem.data.get(EDIT_VIEW_KEY)).toBe('form');
    expect(createViewPref(() => mem).get()).toBe('form');
    pref.set('card');
    expect(mem.data.has(EDIT_VIEW_KEY)).toBe(false);
  });
  it('survives storage that throws', () => {
    const bad: KeyValueStore = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    const pref = createViewPref(() => bad);
    expect(pref.get()).toBe('card');
    pref.set('form');
    expect(pref.get()).toBe('form');
    expect(createViewPref(() => undefined).get()).toBe('card');
  });
  it('the switch shows which way is on', () => {
    const seen: string[] = [];
    const sw = createViewSwitch('card', (v) => seen.push(v));
    document.body.append(sw.element);
    const [a, b] = [...sw.element.querySelectorAll('button')];
    expect(a?.getAttribute('aria-pressed')).toBe('true');
    b?.click();
    expect(seen).toEqual(['form']);
    sw.show('form');
    expect(b?.getAttribute('aria-pressed')).toBe('true');
    expect(a?.getAttribute('aria-pressed')).toBe('false');
  });
});

const forms: AnnouncementForm[] = [
  { layout: 'message', label: '', title: '', paragraphs: [run('Hello')], boxed: [true] },
  {
    layout: 'call-to-action',
    label: 'News',
    title: 'T',
    paragraph: run('Do it'),
    button: { text: 'Go', url: 'https://example.org' },
  },
  {
    layout: 'link-list',
    label: '',
    title: '',
    intro: [],
    items: [{ text: 'A', url: '', note: '' }],
  },
  {
    layout: 'date-list',
    label: '',
    title: '',
    sections: [
      {
        name: 'S',
        style: 'quiet',
        subtitle: '',
        rows: [
          {
            date: { start: { year: 2026, month: 12, day: 6 } },
            event: 'Den',
            url: '',
            tags: [{ text: 'Virtual', strength: 'quiet' }],
            note: [],
          },
        ],
      },
    ],
  },
  {
    layout: 'help-wanted',
    label: '',
    title: '',
    intro: [],
    ask: { badge: '', title: '', paragraphs: [[]], button: { text: '', url: '' } },
    outro: [],
  },
];

describe('card view', () => {
  for (const form of forms) {
    it(`${form.layout}: every editable piece is named and placeholders stay out of the form`, () => {
      const before = JSON.stringify(form);
      const view = buildCardView(structuredClone(form), ctx, options);
      document.body.append(view.element);
      const editable = [...view.element.querySelectorAll('textarea, [role=textbox]')];
      expect(editable.length).toBeGreaterThan(2);
      for (const node of editable) {
        expect(node.getAttribute('aria-label') ?? '').not.toBe('');
      }
      const title = view.element.querySelector<HTMLTextAreaElement>('[aria-label="Title"]');
      expect(title?.placeholder).toBe('Add a title');
      expect(title?.value).toBe(form.title);
      expect(view.fieldText(['title'])).toBe(form.title);
      expect(view.element.querySelector('.form')).toBeNull();
      expect(JSON.stringify(form)).toBe(before);
    });
  }

  it('typing on the card edits the form and undo can write back without a redraw', () => {
    const form = structuredClone(forms[3]) as Extract<AnnouncementForm, { layout: 'date-list' }>;
    const view = buildCardView(form, ctx, options);
    document.body.append(view.element);
    const event = view.fieldControl(['sections', 0, 'rows', 0, 'event']) as HTMLTextAreaElement;
    event.value = 'New name';
    event.dispatchEvent(new Event('input', { bubbles: true }));
    expect(form.sections[0]?.rows[0]?.event).toBe('New name');
    view.setField(['sections', 0, 'rows', 0, 'event'], 'Den', [0, 0]);
    expect(event.value).toBe('Den');
    expect(form.sections[0]?.rows[0]?.event).toBe('Den');
    expect(view.focusPath(['sections', 0, 'rows', 0, 'event'])).toBe(true);
  });
});
