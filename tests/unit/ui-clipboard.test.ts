import { describe, expect, it, vi } from 'vitest';
import { copyText, type ClipboardEnv } from '../../src/ui/clipboard';

function area(): HTMLTextAreaElement {
  const a = document.createElement('textarea');
  a.readOnly = true;
  document.body.append(a);
  return a;
}

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
