import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  updateDoc,
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

  /** Approve a pending request. Rules also enforce mfaEnrolled==true was already set and the rank/scope match — this is the client-side mirror of that. */
  async approve(target: Account, approverUid: string): Promise<void> {
    if (!target.mfaEnrolled) throw new Error('Candidate has not enrolled TOTP yet');
    await updateDoc(this.ref(target.uid), {
      status: 'active',
      approvedBy: approverUid,
      approvedAt: Date.now(),
    });
  }

  async revoke(target: Account): Promise<void> {
    await updateDoc(this.ref(target.uid), { status: 'suspended' });
  }

  /** Rank that would approve/revoke `rank` — undefined for superadmin. Re-exported here so components don't need to import roles.ts directly for this one thing. */
  approverRankFor(rank: Rank): Rank | undefined {
    return approverRank(rank);
  }
}
