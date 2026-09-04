import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Account } from '../models/account.model';
import { Rank, ROLE_BY_RANK, Scope, SCOPE_BY_RANK, approverRank } from '../constants/roles';

export interface RequestRoleParams {
  uid: string;
  email: string;
  rank: Rank;
  stateId?: string;
  allianceId?: string;
}

@Injectable({ providedIn: 'root' })
export class AccountsService {
  private firestore = inject(Firestore);

  private ref(uid: string) {
    return doc(this.firestore, `accounts/${uid}`);
  }

  async getAccount(uid: string): Promise<Account | null> {
    const snap = await getDoc(this.ref(uid));
    return snap.exists() ? (snap.data() as Account) : null;
  }

  /**
   * Candidate creates their own pending request. Never for RANK.SUPERADMIN — see
   * REQUESTABLE_RANKS. stateId/allianceId are omitted entirely (not set to `undefined`) when
   * not applicable to the requested rank — the Firestore client SDK rejects a plain `undefined`
   * field value at the setDoc() call itself, before the write ever reaches the network. That
   * used to orphan the just-created Firebase Auth user (a state_admin request has no
   * allianceId): signup would throw here, leaving no accounts/{uid} doc behind, so the
   * candidate could still log in — Auth doesn't know anything went wrong — but had no rank
   * anywhere and no pending request for anyone to approve, and retrying signUp() failed with
   * auth/email-already-in-use since the Auth user really was created the first time.
   */
  async requestRole(params: RequestRoleParams): Promise<void> {
    const account: Account = {
      uid: params.uid,
      email: params.email,
      role: ROLE_BY_RANK[params.rank],
      rank: params.rank,
      status: 'pending',
      mfaEnrolled: false,
      requestedAt: Date.now(),
      ...(params.stateId !== undefined ? { stateId: params.stateId } : {}),
      ...(params.allianceId !== undefined ? { allianceId: params.allianceId } : {}),
    };
    await setDoc(this.ref(params.uid), account);
  }

  /** Candidate flips their own mfaEnrolled flag once TOTP enrollment succeeds — the only field they may touch while pending. */
  async markMfaEnrolled(uid: string): Promise<void> {
    await updateDoc(this.ref(uid), { mfaEnrolled: true });
  }

  /** Pending requests an approver (identified by their own scope) is eligible to act on — one rank below them, same scope. */
  pendingForApprover$(approver: Pick<Account, 'rank' | 'stateId' | 'allianceId'>): Observable<Account[]> {
    const targetRank = (approver.rank + 1) as Rank;
    const scope: Scope = SCOPE_BY_RANK[targetRank];
    const clauses = [where('rank', '==', targetRank), where('status', '==', 'pending')];
    if (scope === 'state' && approver.stateId) clauses.push(where('stateId', '==', approver.stateId));
    if (scope === 'alliance' && approver.allianceId) clauses.push(where('allianceId', '==', approver.allianceId));
    const q = query(collection(this.firestore, 'accounts'), ...clauses);
    return collectionData(q) as Observable<Account[]>;
  }

  /** Active accounts an approver manages (for a revoke list), same scope rule as above. */
  activeManagedBy$(approver: Pick<Account, 'rank' | 'stateId' | 'allianceId'>): Observable<Account[]> {
    const targetRank = (approver.rank + 1) as Rank;
    const scope: Scope = SCOPE_BY_RANK[targetRank];
    const clauses = [where('rank', '==', targetRank), where('status', '==', 'active')];
    if (scope === 'state' && approver.stateId) clauses.push(where('stateId', '==', approver.stateId));
    if (scope === 'alliance' && approver.allianceId) clauses.push(where('allianceId', '==', approver.allianceId));
    const q = query(collection(this.firestore, 'accounts'), ...clauses);
    return collectionData(q) as Observable<Account[]>;
  }

  /**
   * All active accounts (any rank) scoped to one state — used by superadmin's state-
   * management drill-down, which needs the full picture (the state_admin AND every alliance's
   * R5/R4 in that state), not just the next-rank-down view pendingForApprover$/
   * activeManagedBy$ give. Relies on superadmin's blanket read access (sameScope() returns
   * true for rank 0 against any target) — not usable by a state_admin/R5 caller, who can only
   * read strictly-lower ranks in their own scope.
   */
  activeForState$(stateId: string): Observable<Account[]> {
    const q = query(
      collection(this.firestore, 'accounts'),
      where('stateId', '==', stateId),
      where('status', '==', 'active'),
    );
    return collectionData(q) as Observable<Account[]>;
  }

  /**
   * Self-service "I also personally lead this alliance" tag — profile.ts's version of the
   * allianceId field a manager can already set via updateRole(). Omitting allianceId clears
   * the tag. See firestore.rules' accounts update rule for the actual constraints (superadmin:
   * any alliance, purely a display tag; state_admin: only one in their own state; not
   * available at all to r5/r4, whose allianceId is their real permission-defining scope).
   */
  async setOwnAllianceTag(uid: string, allianceId?: string): Promise<void> {
    await updateDoc(this.ref(uid), { allianceId: allianceId !== undefined ? allianceId : deleteField() });
  }

  /**
   * Approve a pending request. Rules enforce the rank/scope match; mfaEnrolled is NOT
   * required here — an approver may knowingly approve a candidate who hasn't set up TOTP
   * yet, accepting that risk for their own state/alliance (see firestore.rules' accounts
   * update rule). The UI still shows TOTP status so this is an informed choice.
   */
  async approve(target: Account, approverUid: string): Promise<void> {
    await updateDoc(this.ref(target.uid), {
      status: 'active',
      approvedBy: approverUid,
      approvedAt: Date.now(),
    });
  }

  async revoke(target: Account): Promise<void> {
    await updateDoc(this.ref(target.uid), { status: 'suspended' });
  }

  /**
   * Reassign an already-active subordinate's rank and/or alliance — e.g. a state_admin
   * moving one of their R5s to a different alliance, or demoting one to R4 of an alliance
   * the state_admin themselves leads; a superadmin granting/revoking a state_admin's own
   * alliance leadership, or reassigning them to R5/R4 outright. `newAllianceId` omitted
   * clears any existing allianceId (e.g. a state_admin who no longer also leads an
   * alliance); pass it whenever the new rank needs one (always for r5/r4, optionally for
   * state_admin). Rules enforce the same manager/scope hierarchy as approve() — see
   * firestore.rules' accounts update rule — on both the target's OLD and NEW rank/scope, so
   * this can only move someone within the caller's own authority, never out of it.
   */
  async updateRole(target: Account, newRank: Rank, newAllianceId?: string): Promise<void> {
    await updateDoc(this.ref(target.uid), {
      role: ROLE_BY_RANK[newRank],
      rank: newRank,
      allianceId: newAllianceId !== undefined ? newAllianceId : deleteField(),
    });
  }

  /** Rank that would approve/revoke `rank` — undefined for superadmin. Re-exported here so components don't need to import roles.ts directly for this one thing. */
  approverRankFor(rank: Rank): Rank | undefined {
    return approverRank(rank);
  }
}
