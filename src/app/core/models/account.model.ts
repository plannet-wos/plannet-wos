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
  status: 'pending' | 'active' | 'suspended';
  mfaEnrolled: boolean;
  requestedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  lastLoginAt?: number;
}

/** Fields a candidate supplies when requesting a rank for themselves — the rest (status, mfaEnrolled, requestedAt) are set by the service. */
export type AccountRequest = Pick<Account, 'uid' | 'email' | 'role' | 'rank' | 'stateId' | 'allianceId'>;
