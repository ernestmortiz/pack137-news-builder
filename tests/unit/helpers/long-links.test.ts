import { describe, expect, it } from 'vitest';
import {
  hostLabel,
  longAddressIn,
  LONG_LINK_TEXT,
  shortLinkText,
} from '../../../src/core/helpers/long-links';

const GENIUS = 'https://www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael';

describe('hostLabel', () => {
  it('gives the host in lower case without "www." and without a port', () => {
    expect(hostLabel(GENIUS)).toBe('signupgenius.com');
    expect(hostLabel('HTTPS://WWW.Example.ORG:8443/a/b?c=d#e')).toBe('example.org');
    expect(hostLabel('http://docs.google.com')).toBe('docs.google.com');
    expect(hostLabel('https://user:secret@example.org/path')).toBe('example.org');
    expect(hostLabel('https://www2.example.org/')).toBe('www2.example.org');
  });

  it('shows a punycode host as it is', () => {
    expect(hostLabel('https://www.xn--bcher-kva.example/katalog')).toBe('xn--bcher-kva.example');
  });

  it('gives nothing for anything that is not an http or https address with a host', () => {
    for (const url of [
      'mailto:pack@example.org',
      'tel:+19085550100',
      'https://',
      '',
      'example.org',
    ])
      expect(hostLabel(url), url).toBeUndefined();
  });
});

describe('shortLinkText', () => {
  it('offers the host when the text is the address itself', () => {
    expect(shortLinkText(GENIUS, GENIUS)).toBe('signupgenius.com');
  });

  it('offers it when the text is the address without the scheme', () => {
    const bare = 'www.signupgenius.com/go/4090F4CAEAE2AA4F58-61725464-stmichael';
    expect(shortLinkText(bare, GENIUS)).toBe('signupgenius.com');
    expect(shortLinkText(bare.replace('www.', 'WWW.'), GENIUS)).toBe('signupgenius.com');
    expect(
      shortLinkText(
        'docs.google.com/forms/d/e/1FAIpQLSc/viewform',
        'https://docs.google.com/forms/d/e/1FAIpQLSc/viewform',
      ),
    ).toBe('docs.google.com');
  });

  it('reads past spaces around the text and a closing slash', () => {
    expect(shortLinkText(` ${GENIUS} `, GENIUS)).toBe('signupgenius.com');
    expect(
      shortLinkText(
        'https://www.a-very-long-host-name.example.org',
        'https://www.a-very-long-host-name.example.org/',
      ),
    ).toBe('a-very-long-host-name.example.org');
  });

  it('offers nothing for text of 30 characters or fewer', () => {
    const thirty = 'https://example.org/abcdefghij';
    expect(thirty).toHaveLength(LONG_LINK_TEXT);
    expect(shortLinkText(thirty, thirty)).toBeUndefined();
    expect(shortLinkText(`${thirty}k`, `${thirty}k`)).toBe('example.org');
  });

  it('offers nothing when the writer chose the words', () => {
    expect(
      shortLinkText('Sign up for the Scout Sunday mass at St. Michael', GENIUS),
    ).toBeUndefined();
    expect(shortLinkText(`Sign up at ${GENIUS}`, GENIUS)).toBeUndefined();
    expect(shortLinkText('signupgenius.com', GENIUS)).toBeUndefined();
  });

  it('offers nothing when the text is another address', () => {
    expect(shortLinkText(GENIUS, `${GENIUS}-other`)).toBeUndefined();
    expect(shortLinkText(GENIUS, 'https://evil.example/go/4090F4CAEAE2AA4F58')).toBeUndefined();
    expect(shortLinkText(GENIUS, GENIUS.replace('https:', 'http:'))).toBeUndefined();
  });

  it('never offers anything for an email link', () => {
    const mail = 'mailto:cubmaster.of.pack.137@example.org';
    expect(shortLinkText(mail, mail)).toBeUndefined();
    expect(shortLinkText('cubmaster.of.pack.137@example.org', mail)).toBeUndefined();
  });

  it('offers nothing when the host is all there is to show', () => {
    const host = 'a-very-long-host-name-for-a-pack.example.org';
    expect(shortLinkText(host, `https://${host}/`)).toBeUndefined();
  });

  it('is quick on a very long address', () => {
    const long = `https://example.org/${'a'.repeat(1_000_000)}`;
    const start = performance.now();
    expect(shortLinkText(long, long)).toBe('example.org');
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('longAddressIn', () => {
  const found = { from: GENIUS, to: 'signupgenius.com' };

  it('finds the address when it is all the words', () => {
    expect(longAddressIn(GENIUS, GENIUS)).toEqual(found);
    expect(longAddressIn(` ${GENIUS} `, GENIUS)).toEqual(found);
  });

  it('finds the address after other words, without the punctuation around it', () => {
    expect(longAddressIn(`If you are interested, please signup here: ${GENIUS}`, GENIUS)).toEqual(
      found,
    );
    expect(longAddressIn(`Sign up (${GENIUS}).`, GENIUS)).toEqual(found);
    expect(longAddressIn(`Sign up at ${GENIUS}, then come along`, GENIUS)).toEqual(found);
    const bare = GENIUS.replace('https://', '');
    expect(longAddressIn(`Sign up at ${bare}.`, GENIUS)).toEqual({
      from: bare,
      to: 'signupgenius.com',
    });
  });

  it('keeps a full stop that belongs to the address', () => {
    const dotted = 'https://example.org/files/pack-137-year-at-a-glance.';
    expect(longAddressIn(`Read ${dotted}`, dotted)).toEqual({ from: dotted, to: 'example.org' });
  });

  it('finds nothing in words without the address, in a short address or in another address', () => {
    expect(
      longAddressIn('Sign up for the Scout Sunday mass at St. Michael', GENIUS),
    ).toBeUndefined();
    expect(
      longAddressIn('Go to https://example.org/abcdefghij', 'https://example.org/abcdefghij'),
    ).toBeUndefined();
    expect(longAddressIn(`Sign up at ${GENIUS}-other`, GENIUS)).toBeUndefined();
    expect(longAddressIn(`Sign up at ${GENIUS}`, `${GENIUS}-other`)).toBeUndefined();
    expect(longAddressIn('signupgenius.com', GENIUS)).toBeUndefined();
  });

  it('never finds anything for an email link', () => {
    const mail = 'mailto:cubmaster.of.pack.137@example.org';
    expect(longAddressIn(`Write to ${mail}`, mail)).toBeUndefined();
    expect(longAddressIn('Write to cubmaster.of.pack.137@example.org', mail)).toBeUndefined();
  });

  it('is quick on very long words and a very long address', () => {
    const long = `https://example.org/${'a'.repeat(300_000)}`;
    const words = `${`${long}x `.repeat(3)}${'https://example.org/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa '.repeat(20_000)}`;
    const start = performance.now();
    expect(longAddressIn(words, long)).toBeUndefined();
    expect(longAddressIn(`${words}${long}`, long)).toEqual({ from: long, to: 'example.org' });
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
