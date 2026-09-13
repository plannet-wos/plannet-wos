import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, query, setDoc, deleteDoc, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FortressHolding, FortressKind, fortressHoldingId } from '../models/fortress-holding.model';

@Injectable({ providedIn: 'root' })
export class FortressService {
  private firestore = inject(Firestore);

  /** Every holding doc for a state — unclaimed buildings simply have no doc yet, see fortress.ts's boardFor(). */
  listForState$(stateId: string): Observable<FortressHolding[]> {
    const q = query(collection(this.firestore, 'fortress_holdings'), where('stateId', '==', stateId));
    return collectionData(q, { idField: 'id' }) as Observable<FortressHolding[]>;
  }

  /** Assigns (or reassigns) a building to an alliance. Pass `null` to mark it unclaimed rather than deleting the doc, so "who last touched this" (updatedBy/updatedAt) survives a clear. */
  async setHolder(stateId: string, kind: FortressKind, number: number, allianceId: string | null, updatedBy: string): Promise<void> {
    const id = fortressHoldingId(stateId, kind, number);
    await setDoc(doc(this.firestore, `fortress_holdings/${id}`), {
      stateId,
      kind,
      number,
      allianceId,
      updatedAt: Date.now(),
      updatedBy,
    } satisfies Omit<FortressHolding, 'id'>);
  }

  async remove(stateId: string, kind: FortressKind, number: number): Promise<void> {
    await deleteDoc(doc(this.firestore, `fortress_holdings/${fortressHoldingId(stateId, kind, number)}`));
  }
}
