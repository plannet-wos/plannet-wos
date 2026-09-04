import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ChoiceMode, NapBallot, NapVote, NapVoteOption, VoteScope } from '../models/nap-vote.model';

export interface CreateNapVoteInput {
  stateId: string;
  question: string;
  optionTexts: string[];
  choiceMode: ChoiceMode;
  voteScope: VoteScope;
  deadline: number;
  createdBy: string;
  createdByEmail: string;
}

function ballotId(voteId: string, uid: string): string {
  return `${voteId}_${uid}`;
}

@Injectable({ providedIn: 'root' })
export class NapService {
  private firestore = inject(Firestore);

  /** Every vote for a state — hidden ones included; callers filter by `.hidden` and `.deadline` per view (active/archive/hidden), same "fetch once, split client-side" style as state-admin's queue lists (avoids needing a composite index for an inequality-plus-equality query). */
  listForState$(stateId: string): Observable<NapVote[]> {
    const q = query(collection(this.firestore, 'nap_votes'), where('stateId', '==', stateId));
    return collectionData(q, { idField: 'id' }) as Observable<NapVote[]>;
  }

  async create(input: CreateNapVoteInput): Promise<string> {
    const options: NapVoteOption[] = input.optionTexts.map((text) => ({
      id: crypto.randomUUID(),
      text,
    }));
    const ref = doc(collection(this.firestore, 'nap_votes'));
    await setDoc(ref, {
      stateId: input.stateId,
      question: input.question,
      options,
      optionIds: options.map((o) => o.id),
      choiceMode: input.choiceMode,
      voteScope: input.voteScope,
      deadline: input.deadline,
      createdBy: input.createdBy,
      createdByEmail: input.createdByEmail,
      createdAt: Date.now(),
      hidden: false,
    } satisfies Omit<NapVote, 'id'>);
    return ref.id;
  }

  async setHidden(voteId: string, hidden: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, `nap_votes/${voteId}`), { hidden });
  }

  /**
   * Deletes every ballot for this vote first, then the vote doc itself — in that order, not
   * concurrently. firestore.rules' ballot-delete clause looks up the parent vote doc to check
   * the deleter's scope; deleting the vote first would make that lookup 404 for any ballot
   * delete still in flight. Mirrors AllianceService.remove()'s cascade-delete shape.
   */
  async remove(voteId: string): Promise<void> {
    const ballotsSnap = await getDocs(query(collection(this.firestore, 'nap_ballots'), where('voteId', '==', voteId)));
    await Promise.all(ballotsSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(this.firestore, `nap_votes/${voteId}`));
  }

  listBallots$(voteId: string): Observable<NapBallot[]> {
    const q = query(collection(this.firestore, 'nap_ballots'), where('voteId', '==', voteId));
    return collectionData(q) as Observable<NapBallot[]>;
  }

  myBallot$(voteId: string, uid: string): Observable<NapBallot | undefined> {
    return docData(doc(this.firestore, `nap_ballots/${ballotId(voteId, uid)}`)) as Observable<NapBallot | undefined>;
  }

  async castBallot(ballot: NapBallot): Promise<void> {
    await setDoc(doc(this.firestore, `nap_ballots/${ballotId(ballot.voteId, ballot.uid)}`), ballot);
  }
}
