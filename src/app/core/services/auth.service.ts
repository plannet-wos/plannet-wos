import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  multiFactor,
  getMultiFactorResolver,
  MultiFactorResolver,
  MultiFactorError,
  TotpMultiFactorGenerator,
  TotpSecret,
} from 'firebase/auth';
import { Account } from '../models/account.model';
import { Rank } from '../constants/roles';

/** Thrown by login() when the account has TOTP enrolled — caller must prompt for a code and call completeMfaSignIn(). */
export class MfaRequiredError extends Error {
  constructor(public resolver: MultiFactorResolver) {
    super('mfa-required');
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  private readonly _user = signal<User | null>(null);
  private readonly _account = signal<Account | null>(null);
  private unsubAccount: (() => void) | null = null;

  readonly user = this._user.asReadonly();
  readonly account = this._account.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isActive = computed(() => this._account()?.status === 'active');
  readonly rank = computed<Rank | null>(() => this._account()?.rank ?? null);

  /**
   * Resolves once the CURRENT Firebase Auth state — and, if someone's signed in, the first
   * read of their accounts/{uid} doc — are both known. Route guards await this before
   * checking isAuthenticated()/isActive()/rank(): those signals read as "signed out, no
   * account" for a beat after every auth-state change (a fresh page load restoring a
   * persisted session is itself async; signing in kicks off a new onSnapshot that hasn't
   * fired yet either), and a guard reading them synchronously in that window wrongly bounces
   * a real, signed-in user back to /login — e.g. navigating straight to /enroll-totp right
   * after logging in, or on a reload. See rank.guard.ts, which awaits this before evaluating
   * anything. Safe to call from anywhere, any number of times — each call just awaits
   * whichever settle-gate is current.
   */
  private settledResolve!: () => void;
  private settledPromise = new Promise<void>((resolve) => { this.settledResolve = resolve; });

  constructor() {
    onAuthStateChanged(this.auth, (user) => this.applyUser(user));
  }

  async whenReady(): Promise<void> {
    return this.settledPromise;
  }

  /**
   * Updates `_user` and (re-)subscribes to the account doc. Called both by onAuthStateChanged
   * and directly from signUp()/login()/completeMfaSignIn() — that listener fires
   * asynchronously, so code that runs right after those resolve (e.g. signup.ts/login.ts
   * navigating to the next screen) could otherwise still see a stale, signed-out `_user` for
   * a moment. The uid check makes calling it twice for the same user (the direct call, then
   * onAuthStateChanged catching up moments later) a no-op instead of tearing down the account
   * subscription before its first snapshot has even fired — which would otherwise leave
   * whenReady() awaiting a settle-gate that never resolves.
   */
  private applyUser(user: User | null): void {
    // Only the "same real user applied twice" case is a no-op — never skip a transition to
    // or from signed-out, or the very first call (cold boot with no persisted session) would
    // wrongly match the signal's own null default and never resolve settledPromise at all.
    if (user !== null && user.uid === this._user()?.uid) return;

    this._user.set(user);
    this.unsubAccount?.();
    this.unsubAccount = null;
    this._account.set(null);
    this.settledPromise = new Promise((resolve) => { this.settledResolve = resolve; });

    if (user) {
      this.unsubAccount = onSnapshot(doc(this.firestore, `accounts/${user.uid}`), (snap) => {
        this._account.set(snap.exists() ? (snap.data() as Account) : null);
        this.settledResolve();
      });
    } else {
      this.settledResolve();
    }
  }

  /** Creates the Firebase Auth user and sends a verification email. Does not touch Firestore — see AccountsService for the pending account doc. */
  async signUp(email: string, password: string): Promise<User> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await sendEmailVerification(cred.user);
    this.applyUser(cred.user);
    return cred.user;
  }

  /** Throws MfaRequiredError if the account has TOTP enrolled — catch it and call completeMfaSignIn() with the user's code. */
  async login(email: string, password: string): Promise<User> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);
      this.applyUser(cred.user);
      return cred.user;
    } catch (err) {
      if ((err as MultiFactorError)?.code === 'auth/multi-factor-auth-required') {
        throw new MfaRequiredError(getMultiFactorResolver(this.auth, err as MultiFactorError));
      }
      throw err;
    }
  }

  async completeMfaSignIn(resolver: MultiFactorResolver, otp: string): Promise<User> {
    const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw new Error('No TOTP factor enrolled on this account');
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, otp);
    const cred = await resolver.resolveSignIn(assertion);
    this.applyUser(cred.user);
    return cred.user;
  }

  logout(): void {
    signOut(this.auth);
  }

  // --- TOTP enrollment (done by an already-signed-in, not-yet-approved candidate) ---

  /** Starts enrollment: returns a secret whose generateQrCodeUrl() the UI renders as a QR code. Call confirmTotpEnrollment() once the user has entered a code from their authenticator app. */
  async startTotpEnrollment(): Promise<TotpSecret> {
    const user = this.mustUser();
    const session = await multiFactor(user).getSession();
    return TotpMultiFactorGenerator.generateSecret(session);
  }

  async confirmTotpEnrollment(secret: TotpSecret, otp: string, displayName = 'Authenticator app'): Promise<void> {
    const user = this.mustUser();
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, otp);
    await multiFactor(user).enroll(assertion, displayName);
  }

  private mustUser(): User {
    const user = this._user();
    if (!user) throw new Error('Not signed in');
    return user;
  }
}
