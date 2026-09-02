import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
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

  async update(stateId: string, slug: string, updates: Partial<Omit<Alliance, 'id' | 'stateId' | 'slug'>>): Promise<void> {
    await setDoc(doc(this.firestore, `alliances/${allianceId(stateId, slug)}`), updates, { merge: true });
  }

  /**
   * Deletes the alliance doc plus every players/tasks/assignments doc scoped to it — the same
   * cascade foundry-planner's superadmin.ts used to do itself before alliance management moved
   * here. wiki_articles/article_feedback and svs_submissions are deliberately left alone: an
   * alliance's wiki history and SvS records are worth keeping even after the alliance entry
   * itself is retired, the way they already outlive a plain rename.
   */
  async remove(stateId: string, slug: string): Promise<void> {
    const id = allianceId(stateId, slug);
    const collections = ['players', 'tasks', 'assignments'];
    const snapshots = await Promise.all(
      collections.map((c) => getDocs(query(collection(this.firestore, c), where('allianceId', '==', id)))),
    );
    const deletes = snapshots.flatMap((snap) => snap.docs.map((d) => deleteDoc(d.ref)));
    await Promise.all([...deletes, deleteDoc(doc(this.firestore, `alliances/${id}`))]);
  }
}
