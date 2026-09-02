/**
 * Canonical role/rank table for the whole plannet-wos suite.
 *
 * This file is the single source of truth for what ranks exist and their order — it must
 * stay byte-for-byte identical wherever another repo needs to reason about rank numbers for
 * its own feature gating (same duplication discipline this codebase already uses for
 * password.util.ts). The actual *enforcement* of the hierarchy lives in firestore.rules
 * (owned solely by this repo, see its README) — this file just gives app code and rules a
 * shared vocabulary for rank comparisons.
 *
 * Adding or renaming a role is a code change made here (and in every mirrored copy, and in
 * firestore.rules), never a runtime "create role" screen — see the plan this was built
 * against for why.
 *
 * Ranks are plain integers, lower = more powerful. Rank alone governs the
 * accounts-management hierarchy (a rank may only ever edit a STRICTLY lower-ranked account,
 * within its own scope — see `canManage` below). It does NOT by itself decide in-app
 * feature access: R4 and R5 have identical feature permissions ("full alliance admin") even
 * though they're different ranks — each app's own code picks whatever rank threshold its
 * own features need (typically `rank <= RANK.R4` to mean "any alliance admin").
 */

export const RANK = {
  SUPERADMIN: 0,
  STATE_ADMIN: 1,
  R5: 2,
  R4: 3,
} as const;

export type Rank = (typeof RANK)[keyof typeof RANK];

export type Role = 'superadmin' | 'state_admin' | 'r5' | 'r4';

export const ROLE_BY_RANK: Record<Rank, Role> = {
  [RANK.SUPERADMIN]: 'superadmin',
  [RANK.STATE_ADMIN]: 'state_admin',
  [RANK.R5]: 'r5',
  [RANK.R4]: 'r4',
};

export const RANK_BY_ROLE: Record<Role, Rank> = {
  superadmin: RANK.SUPERADMIN,
  state_admin: RANK.STATE_ADMIN,
  r5: RANK.R5,
  r4: RANK.R4,
};

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Superadmin',
  state_admin: 'State Admin',
  r5: 'R5',
  r4: 'R4',
};

/** Scope each role is bound to — what field on the Account doc constrains who it can act on. */
export type Scope = 'global' | 'state' | 'alliance';

export const SCOPE_BY_RANK: Record<Rank, Scope> = {
  [RANK.SUPERADMIN]: 'global',
  [RANK.STATE_ADMIN]: 'state',
  [RANK.R5]: 'alliance',
  [RANK.R4]: 'alliance',
};

/** Every rank below superadmin must enroll TOTP before the rank above it can approve them. */
export function requiresTotp(rank: Rank): boolean {
  return rank !== RANK.SUPERADMIN;
}

/** The rank that approves/revokes a given rank. `undefined` for superadmin (bootstrapped manually). */
export function approverRank(rank: Rank): Rank | undefined {
  return rank === RANK.SUPERADMIN ? undefined : ((rank - 1) as Rank);
}

/**
 * Ranks a signup screen may let someone request for themselves. Never superadmin — that
 * account is hand-provisioned, there being no one above it to approve a self-request.
 */
export const REQUESTABLE_RANKS: Rank[] = [RANK.STATE_ADMIN, RANK.R5, RANK.R4];
