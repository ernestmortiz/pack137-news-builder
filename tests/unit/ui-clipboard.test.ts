import { describe, expect, it, vi } from 'vitest';
import { copyText, selectionCoversAll, type ClipboardEnv } from '../../src/ui/clipboard';

function area(): HTMLTextAreaElement {
  const a = document.createElement('textarea');
  a.readOnly = true;
  document.body.append(a);
  return a;
}

describe('selectionCoversAll', () => {
  it('needs the whole text selected in a visible textarea', () => {
    expect(selectionCoversAll(0, 5, 5, true)).toBe(true);
    expect(selectionCoversAll(0, 0, 5, true)).toBe(false);
    expect(selectionCoversAll(1, 5, 5, true)).toBe(false);
    expect(selectionCoversAll(0, 5, 5, false)).toBe(false);
    expect(selectionCoversAll(null, null, 5, true)).toBe(false);
    expect(selectionCoversAll(0, 0, 0, true)).toBe(false);
  });
});

describe('copyText fallback guards', () => {
  it('asks for a manual copy when the textarea is hidden, without running the copy command', async () => {
    const execCopy = vi.fn().mockReturnValue(true);
    const outcome = await copyText('abc', area(), {
      clipboard: undefined,
      execCopy,
      isShown: () => false,
    });
    expect(outcome).toBe('manual');
    expect(execCopy).not.toHaveBeenCalled();
  });

  it('shows the textarea before selecting it', async () => {
    const order: string[] = [];
    await copyText('abc', area(), {
      clipboard: undefined,
      execCopy: () => true,
      beforeSelect: () => order.push('shown'),
      isShown: () => {
        order.push('checked');
        return true;
      },
    });
    expect(order).toEqual(['shown', 'checked']);
  });
});

describe('copyText', () => {
  it('uses the async clipboard when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const env: ClipboardEnv = { clipboard: { writeText }, execCopy: () => false };
    expect(await copyText('hello', area(), env)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to the selected textarea and the copy command when the API is missing', async () => {
    const a = area();
    const execCopy = vi.fn().mockReturnValue(true);
    expect(await copyText('hello', a, { clipboard: undefined, execCopy })).toBe('copied');
    expect(a.value).toBe('hello');
    expect(a.selectionStart).toBe(0);
    expect(a.selectionEnd).toBe(5);
    expect(execCopy).toHaveBeenCalled();
  });

  it('falls back when the API refuses', async () => {
    const a = area();
    const env: ClipboardEnv = {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
      execCopy: () => true,
    };
    expect(await copyText('abc', a, env)).toBe('copied');
    expect(a.value).toBe('abc');
  });

  it('asks for a manual copy when nothing works, with the text selected', async () => {
    const a = area();
    const outcome = await copyText('abc def', a, { clipboard: undefined, execCopy: () => false });
    expect(outcome).toBe('manual');
    expect(a.selectionStart).toBe(0);
    expect(a.selectionEnd).toBe(7);
  });
});
