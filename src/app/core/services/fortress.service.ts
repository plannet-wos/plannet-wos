import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData, query, setDoc, deleteDoc, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FortressHolding, FortressKind, FortressSettings, fortressHoldingId } from '../models/fortress-holding.model';

@Injectable({ providedIn: 'root' })
export class FortressService {
  private firestore = inject(Firestore);

  /** Every holding doc for a state — unclaimed buildings simply have no doc yet, see fortress.ts's buildRow(). */
  listForState$(stateId: string): Observable<FortressHolding[]> {
    const q = query(collection(this.firestore, 'fortress_holdings'), where('stateId', '==', stateId));
    return collectionData(q, { idField: 'id' }) as Observable<FortressHolding[]>;
  }

  /** Sets which alliance a NAP vote assigned this building to (`null` for unclaimed). */
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

  /** This state's phase-1 anchor date — `undefined` until a state admin overrides fortress-rewards.ts's DEFAULT_PHASE1_START_MS, see fortress.ts's fallback. */
  settings$(stateId: string): Observable<FortressSettings | undefined> {
    return docData(doc(this.firestore, `fortress_settings/${stateId}`)) as Observable<FortressSettings | undefined>;
  }

  async setPhase1Start(stateId: string, phase1StartAt: number, updatedBy: string): Promise<void> {
    await setDoc(doc(this.firestore, `fortress_settings/${stateId}`), {
      stateId,
      phase1StartAt,
      updatedAt: Date.now(),
      updatedBy,
    } satisfies FortressSettings);
  }
}
