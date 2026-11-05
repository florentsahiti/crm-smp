import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, translate, type Locale, type Params } from "./index";

/** The viewer's language, from the cookie set by the DE | EN switch. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export async function getT() {
  return makeT(await getLocale());
}

/** Translates one message for the current viewer — for errors returned or thrown by server actions. */
export async function tr(key: string, params?: Params): Promise<string> {
  return translate(await getLocale(), key, params);
}
