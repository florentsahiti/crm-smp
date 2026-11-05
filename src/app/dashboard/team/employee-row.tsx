"use client";

import { useState, useTransition } from "react";
import { Cake, Check, KeyRound, Pencil, X } from "lucide-react";
import { resetEmployeePassword, updateEmployee } from "@/lib/actions/employees";
import { formatBirthday, parseBirthday } from "@/lib/birthday";
import { useT } from "@/lib/i18n/client";
import { ROLES, ROLE_LABELS, SKILL_CODES, SKILL_COLORS, SKILL_LABELS, type Role, type SkillCode } from "@/lib/constants";
import { LanguageBadges } from "@/components/language-badge";

const ROLE_STYLES: Record<Role, string> = {
  manager: "bg-brand-100 text-brand-800",
  employee: "bg-zinc-100 text-zinc-700",
};

export function EmployeeRow({
  id,
  name,
  username,
  shortCode,
  role,
  skills,
  groupNumber,
  sortOrder,
  birthDay,
  birthMonth,
  active,
  isSelf,
  canManage,
}: {
  id: string;
  name: string;
  username: string;
  shortCode: string;
  role: Role;
  skills: string[];
  groupNumber: number | null;
  sortOrder: number;
  birthDay: number | null;
  birthMonth: number | null;
  active: boolean;
  isSelf: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const t = useT();
  const [mode, setMode] = useState<"view" | "edit" | "password">("view");
  const [draftRole, setDraftRole] = useState<Role>(role);
  const [draftSkills, setDraftSkills] = useState<SkillCode[]>(skills as SkillCode[]);
  const [draftGroup, setDraftGroup] = useState(groupNumber?.toString() ?? "");
  const [draftOrder, setDraftOrder] = useState(sortOrder.toString());
  const [draftActive, setDraftActive] = useState(active);
  const birthday = birthDay != null && birthMonth != null ? formatBirthday(birthDay, birthMonth) : "";
  const [draftBirthday, setDraftBirthday] = useState(birthday.replace(/\.$/, ""));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  const editing = mode === "edit";

  return (
    <tr className={active ? "" : "bg-zinc-50/70 text-zinc-400"}>
      <td className="px-4 py-3 tabular-nums text-xs text-zinc-500">
        {editing ? (
          <input
            type="number"
            min={0}
            max={9999}
            className="input w-20 py-1 text-xs"
            value={draftOrder}
            onChange={(e) => setDraftOrder(e.target.value)}
            title={t("Position im Einsatzplan (kleinere Zahl = weiter oben)")}
          />
        ) : (
          sortOrder
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{shortCode}</td>
      <td className="px-4 py-3">
        <p className="font-medium text-zinc-900">
          {name} {isSelf && <span className="ml-1 text-xs font-normal text-zinc-400">({t("Sie")})</span>}
        </p>
        <p className="text-xs text-zinc-400">@{username}</p>
        {editing ? (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
            <Cake className="h-3.5 w-3.5" />
            <input
              className="input w-20 py-0.5 text-xs"
              maxLength={6}
              value={draftBirthday}
              onChange={(e) => setDraftBirthday(e.target.value)}
              placeholder={t("TT.MM")}
              title={t("Geburtstag (nur Tag und Monat)")}
            />
          </label>
        ) : (
          birthday && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500" title={t("Geburtstag")}>
              <Cake className="h-3.5 w-3.5 text-pink-500" /> {birthday}
            </p>
          )
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {notice && <p className="mt-1 text-xs text-green-700">{notice}</p>}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <select
            className="input w-auto py-1 text-xs"
            value={draftRole}
            disabled={isSelf}
            onChange={(e) => setDraftRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(ROLE_LABELS[r])}
              </option>
            ))}
          </select>
        ) : (
          <span className={`badge ${ROLE_STYLES[role]}`}>{t(ROLE_LABELS[role])}</span>
        )}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <div className="flex gap-1">
            {SKILL_CODES.map((code) => {
              const on = draftSkills.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraftSkills((s) => (on ? s.filter((x) => x !== code) : [...s, code]))}
                  className={`badge cursor-pointer border ${on ? `border-transparent ${SKILL_COLORS[code]}` : "border-zinc-200 bg-white text-zinc-400"}`}
                  title={t(SKILL_LABELS[code])}
                >
                  {code}
                </button>
              );
            })}
          </div>
        ) : skills.length ? (
          <LanguageBadges codes={skills} className="gap-1" />
        ) : (
          "—"
        )}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <input
            type="number"
            min={1}
            max={9}
            className="input w-16 py-1 text-xs"
            value={draftGroup}
            onChange={(e) => setDraftGroup(e.target.value)}
          />
        ) : (
          (groupNumber ?? "—")
        )}
      </td>

      {canManage && (
        <td className="px-4 py-3">
          {editing ? (
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={draftActive}
                disabled={isSelf}
                onChange={(e) => setDraftActive(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand-700)]"
              />
              {t("Aktiv")}
            </label>
          ) : (
            <span className={`badge ${active ? "bg-green-100 text-green-700" : "bg-zinc-200 text-zinc-500"}`}>
              {active ? t("Aktiv") : t("Inaktiv")}
            </span>
          )}
        </td>
      )}

      {canManage && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1.5">
            {mode === "view" && (
              <>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setMode("edit")}>
                  <Pencil className="h-3.5 w-3.5" /> {t("Bearbeiten")}
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("password")} title={t("Passwort zurücksetzen")}>
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {editing && (
              <>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={pending}
                  onClick={() => {
                    const parsedBirthday = parseBirthday(draftBirthday);
                    if (parsedBirthday === "invalid") return setError(t("Ungültiger Geburtstag – bitte als TT.MM eingeben, z. B. 13.10."));
                    run(
                      () =>
                        updateEmployee({
                          id,
                          birthDay: parsedBirthday?.day ?? null,
                          birthMonth: parsedBirthday?.month ?? null,
                          role: draftRole,
                          skills: draftSkills,
                          groupNumber: draftGroup ? Number(draftGroup) : null,
                          sortOrder: Number(draftOrder) || 0,
                          active: draftActive,
                        }),
                      () => setMode("view")
                    );
                  }}
                >
                  <Check className="h-3.5 w-3.5" /> {t("Speichern")}
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("view")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {mode === "password" && (
              <>
                <input
                  type="password"
                  minLength={8}
                  placeholder={t("Neues Passwort")}
                  className="input w-36 py-1 text-xs"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={pending || password.length < 8}
                  onClick={() =>
                    run(
                      () => resetEmployeePassword({ id, password }),
                      () => {
                        setPassword("");
                        setMode("view");
                        setNotice(t("Passwort aktualisiert."));
                        setTimeout(() => setNotice(null), 4000);
                      }
                    )
                  }
                >
                  {t("Setzen")}
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("view")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
