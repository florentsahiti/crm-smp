"use client";

import { useRef, useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { createEmployee } from "@/lib/actions/employees";
import { parseBirthday } from "@/lib/birthday";
import { useT } from "@/lib/i18n/client";
import { ROLES, ROLE_LABELS, SKILL_CODES, SKILL_COLORS, SKILL_LABELS, type Role, type SkillCode } from "@/lib/constants";

const EMPTY = { name: "", username: "", shortCode: "", role: "employee" as Role, groupNumber: "", birthday: "", password: "" };

export function AddEmployeeForm() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const t = useT();
  const [form, setForm] = useState(EMPTY);
  const [skills, setSkills] = useState<SkillCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  function close() {
    dialogRef.current?.close();
    setError(null);
  }

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => dialogRef.current?.showModal()}>
        <UserPlus className="h-4 w-4" />
        {t("Mitarbeitende hinzufügen")}
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-900/40 backdrop:backdrop-blur-[2px]"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const birthday = parseBirthday(form.birthday);
            if (birthday === "invalid") return setError(t("Ungültiger Geburtstag – bitte als TT.MM eingeben, z. B. 13.10."));
            startTransition(async () => {
              const result = await createEmployee({
                name: form.name,
                username: form.username,
                shortCode: form.shortCode,
                role: form.role,
                skills,
                groupNumber: form.groupNumber ? Number(form.groupNumber) : null,
                birthDay: birthday?.day ?? null,
                birthMonth: birthday?.month ?? null,
                password: form.password,
              });
              if (result.ok) {
                setForm(EMPTY);
                setSkills([]);
                close();
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">{t("Mitarbeitende hinzufügen")}</h2>
              <p className="text-sm text-zinc-500">{t("Die Person kann sich sofort mit dem von Ihnen gesetzten Passwort anmelden.")}</p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={close} aria-label={t("Schliessen")}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="label">{t("Vor- und Nachname")}</span>
              <input required className="input" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">{t("Benutzername")}</span>
              <input required className="input" value={form.username} onChange={(e) => update("username", e.target.value)} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">{t("Kürzel")}</span>
              <input
                required
                className="input uppercase"
                maxLength={5}
                value={form.shortCode}
                onChange={(e) => update("shortCode", e.target.value)}
                placeholder={t("z. B. ARZ")}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">{t("Rolle")}</span>
              <select className="input" value={form.role} onChange={(e) => update("role", e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE_LABELS[r])}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">{t("Gruppe (optional)")}</span>
              <input
                type="number"
                min={1}
                max={9}
                className="input"
                value={form.groupNumber}
                onChange={(e) => update("groupNumber", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">{t("Geburtstag (optional)")}</span>
              <input
                className="input"
                inputMode="decimal"
                maxLength={6}
                value={form.birthday}
                onChange={(e) => update("birthday", e.target.value)}
                placeholder={t("TT.MM, z. B. 13.10")}
              />
              <span className="text-xs text-zinc-400">{t("Nur Tag und Monat – das Jahr wird nicht gespeichert.")}</span>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="label mb-1.5">{t("Sprachen")}</legend>
              <div className="flex flex-wrap gap-2">
                {SKILL_CODES.map((code) => {
                  const on = skills.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSkills((s) => (on ? s.filter((x) => x !== code) : [...s, code]))}
                      className={`badge cursor-pointer border px-3 py-1 text-sm ${
                        on ? `border-transparent ${SKILL_COLORS[code]}` : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {t(SKILL_LABELS[code])}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="label">{t("Anfangspasswort")}</span>
              <input
                required
                type="password"
                minLength={8}
                className="input"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                autoComplete="new-password"
              />
              <span className="text-xs text-zinc-400">{t("Mindestens 8 Zeichen. Teilen Sie es der Person direkt mit.")}</span>
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>
              {t("Abbrechen")}
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? t("Wird hinzugefügt…") : t("Mitarbeitende hinzufügen")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
