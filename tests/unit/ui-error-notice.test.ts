import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThrottle } from '../../src/ui/announce';
import { ERROR_MESSAGE, installErrorNotice } from '../../src/ui/error-notice';
import { flushAll, registerFlush } from '../../src/ui/safety';

describe('global error notice', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows one plain notice with a Reload button, never a stack trace', () => {
    const reload = vi.fn();
    installErrorNotice(window, reload);
    const err = new Error('boom at secret.ts:12');
    window.dispatchEvent(new ErrorEvent('error', { message: err.message, error: err }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'again', error: err }));
    const rejection = new Event('unhandledrejection');
    window.dispatchEvent(rejection);
    const notes = document.querySelectorAll('.error-notice');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.getAttribute('role')).toBe('alert');
    expect(notes[0]?.textContent).toContain(ERROR_MESSAGE);
    expect(notes[0]?.textContent).not.toContain('boom');
    expect(notes[0]?.textContent).not.toContain('secret.ts');
    notes[0]?.querySelector('button')?.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('flushes pending saves first, even if a flusher throws', () => {
    const ran: string[] = [];
    registerFlush(() => {
      throw new Error('bad');
    });
    registerFlush(() => ran.push('saved'));
    flushAll();
    expect(ran).toEqual(['saved']);
  });
});

describe('announcement throttle', () => {
  it('lets a message through once per gap', () => {
    const ok = createThrottle(1000);
    expect(ok('saved', 0)).toBe(true);
    expect(ok('saved', 500)).toBe(false);
    expect(ok('other', 500)).toBe(true);
    expect(ok('saved', 1000)).toBe(true);
  });
});
