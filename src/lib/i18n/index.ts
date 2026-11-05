/**
 * Minimal two-language support. German (Swiss Standard German) is the source language: every
 * UI string is written in German and used as its own key. English lives in ./en.ts as a
 * German → English map; anything missing there simply falls back to German.
 *
 * Placeholders use {name}: t("{n} aktive Personen", { n: 7 }).
 * Shared by server and client code — the locale itself comes from ./server or ./client.
 */
import { EN } from "./en";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "lang";

/** Locale for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { de: "de-CH", en: "en-GB" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export type Params = Record<string, string | number>;
export type T = (key: string, params?: Params) => string;

export function translate(locale: Locale, key: string, params?: Params): string {
  const text = locale === "en" ? (EN[key] ?? key) : key;
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : text;
}

export const makeT =
  (locale: Locale): T =>
  (key, params) =>
    translate(locale, key, params);
