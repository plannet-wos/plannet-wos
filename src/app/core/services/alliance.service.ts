import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Alliance, allianceId } from '../models/alliance.model';

@Injectable({ providedIn: 'root' })
export class AllianceService {
  private firestore = inject(Firestore);

  listForState$(stateId: string): Observable<Alliance[]> {
    const q = query(collection(this.firestore, 'alliances'), where('stateId', '==', stateId));
    return collectionData(q) as Observable<Alliance[]>;
  }

  async get(stateId: string, slug: string): Promise<Alliance | null> {
    const snap = await getDoc(doc(this.firestore, `alliances/${allianceId(stateId, slug)}`));
    return snap.exists() ? (snap.data() as Alliance) : null;
  }

  /** Slug uniqueness is only checked within the state — see the plan's note on why that's sufficient once alliance IDs are state-composite. */
  async create(stateId: string, slug: string, name: string): Promise<void> {
    const id = allianceId(stateId, slug);
    const existing = await getDoc(doc(this.firestore, `alliances/${id}`));
    if (existing.exists()) throw new Error(`Alliance "${slug}" already exists in this state`);
    await setDoc(doc(this.firestore, `alliances/${id}`), {
      id,
      stateId,
      slug,
      name,
      createdAt: serverTimestamp(),
    });
  }

  async remove(stateId: string, slug: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `alliances/${allianceId(stateId, slug)}`));
  }
}
