import { ROLE_BY_RANK, ROLE_LABEL, Rank } from '../constants/roles';

/**
 * Shape both Account and NapBallot satisfy — the two places a person's identity needs
 * displaying without ever falling back to their email. `rank` (not `role`) is the common field:
 * NapBallot only ever stored rank, and re-deriving role from it via ROLE_BY_RANK keeps this
 * working for both without a second overload.
 */
export interface Nameable {
  nickname?: string;
  allianceId?: string;
  rank: Rank;
}

/**
 * "[TAG] nickname" — the display name used EVERYWHERE another person's identity is shown
 * (admin tables, NAP ballots, the dashboard's own menu), replacing raw emails outright. Emails
 * are personal information with no reason to be visible admin-console-wide just because
 * approving/managing accounts needs to reference them somehow; a self-chosen nickname doesn't
 * have that problem.
 *
 * TAG is the account's alliance slug, uppercased, taken directly off the composite
 * "{stateId}-{slug}" allianceId (stateId is always a plain numeric string — see StateDoc's doc
 * comment — so stripping a leading run of digits and a dash always leaves exactly the slug,
 * even one containing dashes itself). An account with no alliance (a plain state_admin or
 * superadmin) has no such tag to show, so its role label stands in instead ("STATE ADMIN",
 * "SUPERADMIN") — still a real, informative tag, never blank.
 *
 * The name itself is the nickname, trimmed; "Unnamed" for anyone who hasn't set one yet. Never
 * derived from email (e.g. its local part) — that would just be the same leak one step removed.
 */
export function displayName(person: Nameable | null | undefined): string {
  if (!person) return '';
  const tag = person.allianceId
    ? person.allianceId.replace(/^\d+-/, '').toUpperCase()
    : ROLE_LABEL[ROLE_BY_RANK[person.rank]].toUpperCase();
  const name = person.nickname?.trim() || 'Unnamed';
  return `[${tag}] ${name}`;
}
