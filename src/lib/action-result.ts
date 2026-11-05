/**
 * Expected errors from server actions (a rule says no: break limit reached, swap not possible …).
 *
 * In production Next.js hides the message of any error thrown inside a server action — the user
 * would only see a generic "Minified React error". So actions throw `UserError` for things the
 * user should read, `guard()` turns it into a returned `{ ok: false, error }`, and the client calls
 * `unwrap()` to get the value or a normal Error with the readable message. Anything else (real
 * bugs, redirects) is not caught and behaves as before.
 */

export class UserError extends Error {}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Server side: run the action, turning a UserError into a returned message. */
export async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof UserError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Client side: the action's value, or an Error carrying the readable message. */
export async function unwrap<T>(result: Promise<Result<T>>): Promise<T> {
  const r = await result;
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
