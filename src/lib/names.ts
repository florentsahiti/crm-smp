/**
 * How people's names are shown in the app: for now first name only — last names are not shown
 * anywhere (client request). Two people with the same first name get the initial of their last
 * name ("Anna M.") so they stay apart. The full name is still stored (and edited on the Team page).
 * To show full names again, make `displayNames` return the name unchanged.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** `all` = the names of everyone who can appear (to spot shared first names). */
export function displayNames(all: string[]): (name: string) => string {
  const count = new Map<string, number>();
  for (const n of new Set(all)) count.set(firstName(n), (count.get(firstName(n)) ?? 0) + 1);
  return (name: string) => {
    const first = firstName(name);
    if ((count.get(first) ?? 0) < 2) return first;
    const rest = name.trim().split(/\s+/).slice(1);
    return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
  };
}

/** The same list with display names instead of full names. */
export function withDisplayNames<P extends { name: string }>(people: P[]): P[] {
  const show = displayNames(people.map((p) => p.name));
  return people.map((p) => ({ ...p, name: show(p.name) }));
}
