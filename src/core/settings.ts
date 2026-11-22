/**
 * Settings (build spec, section 9). One settings screen, stored on the device and included in
 * draft files. The defaults come from pack.config.ts so a future maintainer changes one file.
 *
 * Settings are untrusted once they can be edited or opened from a draft file (ADR 0004, Settings):
 * every value goes through `validateSettings` before the renderer or the UI uses it.
 *
 * Contract owned by the orchestrator (Phase 5).
 */
import { packConfig } from '../config/pack.config';
import { safeWebUrl } from '../templates/components';

export interface StandingLink {
  label: string;
  url: string;
}

export interface PackSettings {
  /** Logo image address (https only). */
  logoUrl: string;
  /** Footer links in order. */
  standingLinks: StandingLink[];
  /** Bare email addresses only, no `mailto:` and no `?` parameters. */
  email: { contact: string; volunteer: string; feedback: string };
  photoFormUrl: string;
  yearAtAGlanceUrl: string;
  /** 1 = January. Used by the date helper (ADR 0002, 0003). */
  programYearStartMonth: number;
}

/** One problem with one setting, worded for the settings screen. */
export interface SettingsProblem {
  /** Which setting, as a path such as ['email', 'feedback'] or ['standingLinks', 2, 'url']. */
  path: (string | number)[];
  /** One plain sentence. No em dashes. */
  message: string;
}

export interface SettingsResult {
  /** Always usable: every bad or missing value is replaced by its default. */
  settings: PackSettings;
  /** Empty when everything given was valid. */
  problems: SettingsProblem[];
}

/** The Pack 137 defaults from pack.config.ts (spec 9). A fresh copy every call. */
export function defaultSettings(): PackSettings {
  return {
    logoUrl: packConfig.logoUrl,
    standingLinks: packConfig.standingLinks.map((l) => ({ label: l.label, url: l.url })),
    email: { ...packConfig.email },
    photoFormUrl: packConfig.photoFormUrl,
    yearAtAGlanceUrl: packConfig.yearAtAGlanceUrl,
    programYearStartMonth: packConfig.programYearStartMonth,
  };
}

/* ---------- reading untrusted values ---------- */

const hasOwn = Object.prototype.hasOwnProperty;

/** A plain data object: not null and not a list. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads one named field, and only when the object itself holds it. Nothing is ever read through
 * the prototype chain, and the validator never asks for `__proto__`, `constructor` or `prototype`,
 * so those keys in a file are simply never looked at.
 */
function own(record: Record<string, unknown>, key: string): unknown {
  return hasOwn.call(record, key) ? record[key] : undefined;
}

/* ---------- rules ---------- */

/** Standing links kept at most (ADR 0004, Settings). */
export const MAX_STANDING_LINKS = 12;
/** Longest standing link label, after trimming. */
export const MAX_LINK_LABEL_LENGTH = 60;
/** Longest email address (the limit in the mail standards). */
export const MAX_EMAIL_LENGTH = 254;
/** Longest web address a setting may hold. Far above any real link, far below a draft's size. */
export const MAX_URL_LENGTH = 2048;

/**
 * One bare address: name@host.tld. Only the characters the renderer's mailto encoder leaves as
 * they are (letters, digits and . _ + ~ -), so what is checked here is exactly what reaches the
 * link. That rules out `mailto:`, `?`, `&`, `,`, `;`, `<`, `>`, quotes, spaces, control characters,
 * `%` escapes and a second `@`, each of which could add a hidden recipient or a second address.
 */
const BARE_EMAIL = /^[A-Za-z0-9._+~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

function bareEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_EMAIL_LENGTH + 64) return null;
  const address = value.trim();
  if (address.length > MAX_EMAIL_LENGTH || !BARE_EMAIL.test(address)) return null;
  return address;
}

/**
 * A web address that the renderer's allow-list (safeWebUrl) accepts, trimmed and otherwise as
 * typed. The renderer encodes and escapes it at output time, as it does for every other link.
 */
function webUrl(value: unknown, httpsOnly: boolean): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH + 64) return null;
  const url = value.trim();
  if (url.length > MAX_URL_LENGTH || safeWebUrl(url) === null) return null;
  if (httpsOnly && !/^https:\/\//i.test(url)) return null;
  return url;
}

const WEB_ADDRESS = 'a full web address that starts with https:// or http://';

const EMAIL_NAMES = { contact: 'contact', volunteer: 'volunteer', feedback: 'feedback' } as const;

function checkEmails(raw: unknown, problems: SettingsProblem[]): PackSettings['email'] {
  const defaults = defaultSettings().email;
  if (!isRecord(raw)) {
    problems.push({
      path: ['email'],
      message: 'The pack email addresses were missing, so the usual ones are used.',
    });
    return defaults;
  }
  const one = (key: keyof typeof EMAIL_NAMES): string => {
    const address = bareEmail(own(raw, key));
    if (address !== null) return address;
    problems.push({
      path: ['email', key],
      message: `The ${EMAIL_NAMES[key]} email must be one plain address, such as name@example.org, with nothing added to it. The usual address is used instead.`,
    });
    return defaults[key];
  };
  return { contact: one('contact'), volunteer: one('volunteer'), feedback: one('feedback') };
}

function checkStandingLinks(raw: unknown, problems: SettingsProblem[]): StandingLink[] {
  if (!Array.isArray(raw)) {
    problems.push({
      path: ['standingLinks'],
      message: 'The standing links were missing, so the usual links are used.',
    });
    return defaultSettings().standingLinks;
  }
  const list: unknown[] = raw;
  if (list.length > MAX_STANDING_LINKS) {
    problems.push({
      path: ['standingLinks'],
      message: `Only the first ${MAX_STANDING_LINKS} standing links are looked at. The rest were removed.`,
    });
  }
  const kept: StandingLink[] = [];
  const count = Math.min(list.length, MAX_STANDING_LINKS);
  for (let i = 0; i < count; i++) {
    const item = list[i];
    if (!isRecord(item)) {
      problems.push({
        path: ['standingLinks', i],
        message: `Standing link ${i + 1} could not be read and was removed.`,
      });
      continue;
    }
    const rawLabel = own(item, 'label');
    const label =
      typeof rawLabel === 'string' && rawLabel.length <= MAX_LINK_LABEL_LENGTH * 4
        ? rawLabel.trim()
        : '';
    if (label === '' || label.length > MAX_LINK_LABEL_LENGTH) {
      problems.push({
        path: ['standingLinks', i, 'label'],
        message: `Standing link ${i + 1} needs a label of 1 to ${MAX_LINK_LABEL_LENGTH} characters. It was removed.`,
      });
      continue;
    }
    const url = webUrl(own(item, 'url'), false);
    if (url === null) {
      problems.push({
        path: ['standingLinks', i, 'url'],
        message: `Standing link ${i + 1} needs ${WEB_ADDRESS}. It was removed.`,
      });
      continue;
    }
    kept.push({ label, url });
  }
  if (kept.length > 0) return kept;
  problems.push({
    path: ['standingLinks'],
    message: 'No usable standing links were left, so the usual links are used.',
  });
  return defaultSettings().standingLinks;
}

function check(raw: unknown): SettingsResult {
  const defaults = defaultSettings();
  if (!isRecord(raw)) {
    return {
      settings: defaults,
      problems: [
        {
          path: [],
          message: 'The settings could not be read, so the usual Pack 137 settings are used.',
        },
      ],
    };
  }
  const problems: SettingsProblem[] = [];

  let logoUrl = webUrl(own(raw, 'logoUrl'), true);
  if (logoUrl === null) {
    logoUrl = defaults.logoUrl;
    problems.push({
      path: ['logoUrl'],
      message:
        'The logo address must be a full web address that starts with https://. The usual logo is used instead.',
    });
  }

  const standingLinks = checkStandingLinks(own(raw, 'standingLinks'), problems);
  const email = checkEmails(own(raw, 'email'), problems);

  let photoFormUrl = webUrl(own(raw, 'photoFormUrl'), false);
  if (photoFormUrl === null) {
    photoFormUrl = defaults.photoFormUrl;
    problems.push({
      path: ['photoFormUrl'],
      message: `The photo form link must be ${WEB_ADDRESS}. The usual link is used instead.`,
    });
  }

  let yearAtAGlanceUrl = webUrl(own(raw, 'yearAtAGlanceUrl'), false);
  if (yearAtAGlanceUrl === null) {
    yearAtAGlanceUrl = defaults.yearAtAGlanceUrl;
    problems.push({
      path: ['yearAtAGlanceUrl'],
      message: `The year at a glance link must be ${WEB_ADDRESS}. The usual link is used instead.`,
    });
  }

  const rawMonth = own(raw, 'programYearStartMonth');
  let programYearStartMonth = defaults.programYearStartMonth;
  if (
    typeof rawMonth === 'number' &&
    Number.isInteger(rawMonth) &&
    rawMonth >= 1 &&
    rawMonth <= 12
  ) {
    programYearStartMonth = rawMonth;
  } else {
    problems.push({
      path: ['programYearStartMonth'],
      message:
        'The program year start month must be a whole number from 1 to 12. The usual month is used instead.',
    });
  }

  // A new object with exactly the six settings. Nothing is copied over from `raw` wholesale, so
  // extra fields and odd keys cannot ride along.
  return {
    settings: {
      logoUrl,
      standingLinks,
      email,
      photoFormUrl,
      yearAtAGlanceUrl,
      programYearStartMonth,
    },
    problems,
  };
}

/**
 * Checks settings from any source (the settings screen, device storage, a draft file). Accepts
 * `unknown`, never throws, never trusts keys (no prototype keys, no extra fields kept), and replaces
 * every invalid or missing value with its default while reporting it.
 * Rules (ADR 0004, Settings): emails are bare addresses; URLs pass the same allow-list as links
 * in the output (https or http; the logo https only); the month is an integer from 1 to 12; at most
 * 12 standing links, each with a label and a usable URL. Bad standing links are dropped and the
 * good ones kept in order; when none are left the default links come back.
 * Surrounding spaces are trimmed without a problem. Values are otherwise kept as typed.
 */
export function validateSettings(raw: unknown): SettingsResult {
  try {
    return check(raw);
  } catch {
    // Only reachable with an object whose fields throw when read (never with parsed JSON).
    return {
      settings: defaultSettings(),
      problems: [
        {
          path: [],
          message: 'The settings could not be read, so the usual Pack 137 settings are used.',
        },
      ],
    };
  }
}
