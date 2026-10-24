import { Rank, Role } from '../constants/roles';

/** A game server / "state" — the top-level scope everything else (alliances, accounts) lives under. */
export interface StateDoc {
  id: string;        // the state number as a string, e.g. "3038" — also the Firestore doc ID
  name?: string;
  createdAt: number;
}

/**
 * Shape of a document in `accounts/{uid}` — doc ID is the Firebase Auth uid, not a username
 * (see this repo's plan notes on why: Firestore Rules need `request.auth.uid` to trust an
 * identity across requests, which a username-keyed doc never gave them).
 */
export interface Account {
  uid: string;
  email: string;
  role: Role;
  rank: Rank;
  /** Set for state_admin, and denormalized onto r5/r4 too (from their alliance) so rules never need a second get(). */
  stateId?: string;
  /**
   * Always set for r5/r4. Optionally set on state_admin too, when the same person also
   * personally leads that one alliance as its R5 — see roles.ts's header comment and
   * firestore.rules' sameScope() for what this does and doesn't grant beyond plain
   * state_admin: R4 account-management and alliance-admin tooling for THIS alliance only,
   * never any other alliance in the state (state-wide R5 approval is unaffected either way).
   */
  allianceId?: string;
  /**
   * Self-chosen display name — profile.ts's self-service field. Every view that would
   * otherwise show this account's email to OTHER users (admin tables, NAP ballots, the
   * dashboard's own menu) shows `displayName()`'s "[TAG] nickname" instead — see that util's
   * doc comment. Never required and never validated for uniqueness; an empty/missing nickname
   * just falls back to "Unnamed" there. The real email stays visible on this account's OWN
   * profile page (managing your own login is the point, not a leak), and — deliberately, per
   * live feedback — on the manager-edit form a superadmin/state_admin/R5 sees when editing THAT
   * subordinate's role/alliance/nickname (superadmin.html/state-admin.html's edit card
   * subtitle): an eligible manager already has read access to this account's real email
   * through the exact same rules that let them edit it, this only surfaces what they could
   * already see, and knowing who they're emailing/DMing while managing someone isn't the
   * public exposure nicknames exist to prevent. Every OTHER admin-table/list view stays
   * nickname-only.
   */
  nickname?: string;
  status: 'pending' | 'active' | 'suspended';
  mfaEnrolled: boolean;
  requestedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  lastLoginAt?: number;
}

/** Fields a candidate supplies when requesting a rank for themselves — the rest (status, mfaEnrolled, requestedAt) are set by the service. */
export type AccountRequest = Pick<Account, 'uid' | 'email' | 'role' | 'rank' | 'stateId' | 'allianceId'>;

/**
 * Shape of a document in `approver_directory/{uid}` — a public, nickname-only mirror of one
 * active state_admin's or R5's own account (the two ranks a signup candidate can be waiting
 * on), so a still-pending candidate can see WHO to go ping in-game for approval. The accounts
 * collection itself can't serve that: a pending candidate can't read anyone else's account
 * doc (and opening that up would expose emails — Firestore rules are per-document, never
 * per-field). Written only by the account owner themselves, on every account snapshot (see
 * AuthService.syncApproverDirectory()), and firestore.rules requires every field to match
 * their real account exactly, so the mirror can't claim a rank/scope its owner doesn't hold.
 * A revoked/re-ranked/renamed approver's stale entry is deletable by anyone (rules re-check it
 * against the live account) — AccountsService.revoke()/updateRole() do exactly that.
 */
export type ApproverEntry = Pick<Account, 'uid' | 'rank' | 'stateId' | 'allianceId' | 'nickname'>;
