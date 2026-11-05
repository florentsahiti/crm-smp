"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { useT } from "@/lib/i18n/client";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const t = useT();

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="label">
          {t("Benutzername")}
        </label>
        <input id="username" name="username" type="text" autoComplete="username" required className="input" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="label">
          {t("Passwort")}
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary mt-1 py-2.5">
        {pending ? t("Anmelden…") : t("Anmelden")}
      </button>
    </form>
  );
}
