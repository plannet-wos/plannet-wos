import { Injectable, inject, signal } from '@angular/core';
import { Firestore, collection, collectionData, doc, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { StateDoc } from '../models/account.model';

const SELECTED_STATE_KEY = 'plannet_selected_state';

@Injectable({ providedIn: 'root' })
export class StatesService {
  private firestore = inject(Firestore);

  /** Persisted across visits so returning users skip the picker. Not a security boundary — just a convenience default. */
  readonly selectedStateId = signal<string | null>(localStorage.getItem(SELECTED_STATE_KEY));

  list$(): Observable<StateDoc[]> {
    return collectionData(collection(this.firestore, 'states')) as Observable<StateDoc[]>;
  }

  async get(stateId: string): Promise<StateDoc | null> {
    const snap = await getDoc(doc(this.firestore, `states/${stateId}`));
    return snap.exists() ? (snap.data() as StateDoc) : null;
  }

  /** Registers a new state. In practice this only ever needs to happen once per real game server — superadmin does it when onboarding one. */
  async create(stateId: string, name?: string): Promise<void> {
    await setDoc(doc(this.firestore, `states/${stateId}`), {
      id: stateId,
      name: name ?? null,
      createdAt: serverTimestamp(),
    });
  }

  selectState(stateId: string): void {
    localStorage.setItem(SELECTED_STATE_KEY, stateId);
    this.selectedStateId.set(stateId);
  }

  clearSelection(): void {
    localStorage.removeItem(SELECTED_STATE_KEY);
    this.selectedStateId.set(null);
  }
}
