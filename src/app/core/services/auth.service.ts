import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, onSnapshot, setDoc } from '@angular/fire/firestore';
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  signOut,
  onAuthStateChanged,
  multiFactor,
  getMultiFactorResolver,
  MultiFactorResolver,
  MultiFactorError,
  TotpMultiFactorGenerator,
  TotpSecret,
  updatePassword,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
    // A straight `return this.settledPromise` has a second failure mode, distinct from the
    // hang: applyUser() resolves the *previous* gate as soon as a new auth transition starts
    // (so nothing hangs — see its own doc comment), but that means a promise this function
    // captured can resolve *before* the account doc has actually loaded, not just before the
    // "true" settle. A guard awaiting that would see isActive()/rank() still reflecting the
    // stale (usually null) account — on a fresh page load this is the common case, not a rare
    // race, since a guard's first `await` always captures the constructor's initial gate.
    // Looping fixes it: only return once the promise we just awaited is still the CURRENT
    // gate — if a fresher one has since replaced it, that means we were woken early by a
    // *newer* transition superseding ours, so go around and wait on that one instead.
    let promise = this.settledPromise;
    while (true) {
      await promise;
      if (promise === this.settledPromise) return;
      promise = this.settledPromise;
    }
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

    // Resolve whatever gate was already pending BEFORE replacing the resolver — a guard's
    // `await whenReady()` from just before this call captured the *old* promise; overwriting
    // `settledResolve` without firing it first orphans that promise forever, since nothing
    // else holds a reference to its resolver. That's a permanent hang, not just a stale read:
    // exactly what turned "navigate to /enroll-totp while the persisted session is still
    // restoring" into a blank page that never finishes loading. Letting that old awaiter
    // proceed here is safe — it just re-reads the (fresher) signals being set above, same as
    // if it had awaited the new gate instead.
    const previousResolve = this.settledResolve;
    this.settledPromise = new Promise((resolve) => { this.settledResolve = resolve; });
    previousResolve();

    if (user) {
      this.unsubAccount = onSnapshot(doc(this.firestore, `accounts/${user.uid}`), (snap) => {
        const account = snap.exists() ? (snap.data() as Account) : null;
        const isActiveNow = account?.status === 'active';
        // Force a real sign-out the moment an ACTIVE session becomes not-active (revoked,
        // suspended, or the account doc itself vanished) — not just a route guard catching it
        // on the next navigation. A guard only re-checks isActive() when the user navigates;
        // someone sitting on an already-open page (e.g. an admin dashboard) would otherwise
        // keep whatever that page lets them do, indefinitely, until they happen to move.
        // Deliberately keyed off a real active->inactive TRANSITION (this.wasActive), not
        // "isActiveNow is false" on its own — a still-pending candidate (never active yet)
        // must stay signed in to finish TOTP enrollment; signing them out here would break
        // that flow on their very first account-doc snapshot.
        if (this.wasActive && !isActiveNow) {
          this._account.set(account);
          this.settledResolve();
          signOut(this.auth);
          return;
        }
        this.wasActive = isActiveNow;
        this._account.set(account);
        this.settledResolve();
      });
    } else {
      this.wasActive = false;
      this.settledResolve();
    }
  }

  private wasActive = false;

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

  /**
   * Sends Firebase's own managed "reset your password" email. Doesn't require the candidate
   * to be signed in. Depending on the project's email-enumeration-protection setting this
   * either silently no-ops or throws auth/user-not-found for an email with no account — the
   * caller should show the same "check your inbox" message either way rather than surfacing
   * that error, so this can't be used to probe which addresses have accounts.
   */
  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  /**
   * Firebase Auth requires a verified email before it'll allow enrolling a second factor at
   * all (multiFactor(user).getSession() throws auth/unverified-email otherwise) — this isn't
   * something our own rules or UI choose to require, it's enforced Firebase-side. Reloads the
   * user first since emailVerified on the cached User object only updates on reload() or a
   * fresh sign-in, not just because the candidate clicked the link in another tab.
   */
  async checkEmailVerified(): Promise<boolean> {
    const user = this.mustUser();
    await reload(user);
    return user.emailVerified;
  }

  async resendVerificationEmail(): Promise<void> {
    await sendEmailVerification(this.mustUser());
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

  /** Whether the signed-in user already has a TOTP factor enrolled — profile.ts uses this to offer "change" vs "set up" wording, and to unenroll the old one before enrolling a replacement (Firebase only allows one at a time per factor type here). */
  hasTotpEnrolled(): boolean {
    return multiFactor(this.mustUser()).enrolledFactors
      .some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  }

  /** Removes the currently-enrolled TOTP factor, if any — call before re-running startTotpEnrollment()/confirmTotpEnrollment() to replace it. A no-op if nothing's enrolled. */
  async unenrollTotp(): Promise<void> {
    const user = this.mustUser();
    const factor = multiFactor(user).enrolledFactors.find((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (factor) await multiFactor(user).unenroll(factor);
  }

  // --- profile: self-service email/password/TOTP changes for an already-active account ---

  /**
   * Firebase requires a recent sign-in for sensitive changes (email, password, MFA unenroll)
   * — an attempt without one throws auth/requires-recent-login, not something we can avoid,
   * only handle. profile.ts catches that specific error and calls this (prompting for the
   * current password) before retrying the original action.
   */
  async reauthenticate(password: string): Promise<void> {
    const user = this.mustUser();
    if (!user.email) throw new Error('This account has no password to reauthenticate with');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }

  /**
   * Sends a confirmation link to the NEW address — user.email (and the ID token's email
   * claim, which firestore.rules checks) only actually changes once that link is clicked,
   * not immediately. See syncEmailAfterVerification() for the other half of this.
   */
  async changeEmailRequest(newEmail: string): Promise<void> {
    await verifyBeforeUpdateEmail(this.mustUser(), newEmail);
  }

  /**
   * Call after the candidate says they've clicked the confirmation link (possibly in another
   * tab/device) — reloads the user AND force-refreshes the ID token (getIdToken(true); a
   * plain reload() updates user.email but NOT the cached token's email claim, and
   * firestore.rules' self-email-sync clause checks request.auth.token.email specifically, so
   * without this the Firestore write below would be evaluated against the OLD claim and
   * fail). Returns whether user.email actually changed and, if so, mirrors it onto
   * accounts/{uid}.email so the rest of the app (which reads the Firestore doc, not the Auth
   * user) sees the new address too. False just means "not confirmed yet", not an error — a
   * candidate who hasn't clicked the link yet should see a friendly retry, not a failure.
   */
  async syncEmailAfterVerification(): Promise<boolean> {
    const user = this.mustUser();
    const before = this._account()?.email;
    await reload(user);
    await user.getIdToken(true);
    if (!user.email || user.email === before) return false;
    await setDoc(doc(this.firestore, `accounts/${user.uid}`), { email: user.email }, { merge: true });
    return true;
  }

  async changePassword(newPassword: string): Promise<void> {
    await updatePassword(this.mustUser(), newPassword);
  }

  private mustUser(): User {
    const user = this._user();
    if (!user) throw new Error('Not signed in');
    return user;
  }
}
