/**
 * Settings (build spec, section 9). One settings screen, stored on the device and included in
 * draft files. The defaults come from pack.config.ts so a future maintainer changes one file.
 *
 * Settings are untrusted once they can be edited or opened from a draft file (ADR 0004, Settings):
 * every value goes through `validateSettings` before the renderer or the UI uses it.
 *
 * Contract owned by the orchestrator (Phase 5). The validator body is a stand-in; parser-engineer
 * replaces it.
 */
import { packConfig } from '../config/pack.config';

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

/**
 * Checks settings from any source (the settings screen, device storage, a draft file). Accepts
 * `unknown`, never throws, never trusts keys (no prototype keys, no extra fields kept), and replaces
 * every invalid value with its default while reporting it.
 * Rules (ADR 0004, Settings): emails are bare addresses; URLs pass the same allow-list as links
 * in the output (https or http; the logo https only); the month is an integer from 1 to 12; at most
 * 12 standing links, each with a label and a usable URL.
 * Stand-in: returns the defaults. Replaced in Phase 5 by parser-engineer.
 */
export function validateSettings(raw: unknown): SettingsResult {
  void raw;
  return { settings: defaultSettings(), problems: [] };
}
