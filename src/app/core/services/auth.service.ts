import { Injectable, inject, signal, computed } from '@angular/core';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { AdminSession } from '../models/account.model';

const SESSION_KEY = 'plannet_session';
const SUPERADMIN_USERNAME = 'superadmin';
const SUPERADMIN_PASSWORD = '3038';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private firestore = inject(Firestore);
  private readonly _session = signal<AdminSession | null>(this.ingestToken() ?? this.loadSession());

  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly isSuperAdmin = computed(() => this._session()?.role === 'superadmin');
  readonly allianceId = computed(() => this._session()?.allianceId ?? null);

  async login(username: string, password: string): Promise<'superadmin' | 'admin' | null> {
    if (username === SUPERADMIN_USERNAME && password === SUPERADMIN_PASSWORD) {
      this.setSession({ role: 'superadmin', username });
      return 'superadmin';
    }

    const q = query(
      collection(this.firestore, 'accounts'),
      where('username', '==', username),
      where('password', '==', password)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      this.setSession({ role: 'admin', username, allianceId: data['allianceId'] });
      return 'admin';
    }

    return null;
  }

  private setSession(session: AdminSession): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this._session.set(session);
  }

  private ingestToken(): AdminSession | null {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return null;
    try {
      const session = JSON.parse(atob(token)) as AdminSession;
      if (session.role && session.username) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url.toString());
        return session;
      }
    } catch { /* ignore invalid tokens */ }
    return null;
  }

  private loadSession(): AdminSession | null {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AdminSession; } catch { return null; }
  }

  logout(): void {
    sessionStorage.removeItem(SESSION_KEY);
    this._session.set(null);
  }
}
