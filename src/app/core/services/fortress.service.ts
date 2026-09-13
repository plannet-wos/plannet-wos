import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, query, setDoc, deleteDoc, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FortressHolding, FortressKind, fortressHoldingId } from '../models/fortress-holding.model';

@Injectable({ providedIn: 'root' })
export class FortressService {
  private firestore = inject(Firestore);

  /** Every holding doc for a state — unclaimed buildings simply have no doc yet, see fortress.ts's buildRow(). */
  listForState$(stateId: string): Observable<FortressHolding[]> {
    const q = query(collection(this.firestore, 'fortress_holdings'), where('stateId', '==', stateId));
    return collectionData(q, { idField: 'id' }) as Observable<FortressHolding[]>;
  }

  /**
   * Sets which alliance a NAP vote assigned this building to (`null` for unclaimed) — merge:true
   * so this never clobbers the building's own `rewardLabel`, which is set independently (see
   * setReward below) and typically changes on a completely different schedule.
   */
  async setHolder(stateId: string, kind: FortressKind, number: number, allianceId: string | null, updatedBy: string): Promise<void> {
    const id = fortressHoldingId(stateId, kind, number);
    await setDoc(
      doc(this.firestore, `fortress_holdings/${id}`),
      { stateId, kind, number, allianceId, updatedAt: Date.now(), updatedBy },
      { merge: true },
    );
  }

  /** Sets the control reward this building currently pays out while held (`null` to clear it). Merge:true, same reasoning as setHolder above but for the other field. */
  async setReward(stateId: string, kind: FortressKind, number: number, rewardLabel: string | null, updatedBy: string): Promise<void> {
    const id = fortressHoldingId(stateId, kind, number);
    await setDoc(
      doc(this.firestore, `fortress_holdings/${id}`),
      { stateId, kind, number, rewardLabel, updatedAt: Date.now(), updatedBy },
      { merge: true },
    );
  }

  async remove(stateId: string, kind: FortressKind, number: number): Promise<void> {
    await deleteDoc(doc(this.firestore, `fortress_holdings/${fortressHoldingId(stateId, kind, number)}`));
  }
}
