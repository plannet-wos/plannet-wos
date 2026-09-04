import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { TotpSecret } from 'firebase/auth';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { AccountsService } from '../../core/services/accounts.service';
import { RANK, ROLE_LABEL } from '../../core/constants/roles';

/**
 * Self-service account management — any signed-in user (any rank, even still-pending) can
 * reach this to see their own info and change email/password/TOTP. Deliberately built once
 * here rather than per-app: all four apps share the same Firebase Auth project, so a change
 * made here (or its underlying Auth user) is the same account everywhere — there's nothing
 * app-specific about it, and building it four times would just be four copies to keep in
 * sync for no benefit.
 */
@Component({
  selector: 'app-profile',
  imports: [
    FormsModule,
    MatToolbarModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent {
  private auth = inject(AuthService);
  private accounts = inject(AccountsService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  readonly account = this.auth.account;
  readonly user = this.auth.user;
  readonly roleLabel = ROLE_LABEL;

  /** Plain method, not a signal — reads the live Auth user's enrolledFactors list directly, which nothing here tracks reactively; called fresh on every template check instead. */
  hasTotp(): boolean {
    return this.auth.hasTotpEnrolled();
  }

  // --- reauth gate, shared by every sensitive action below (email/password change, TOTP
  // unenroll) — Firebase requires a recent sign-in for all of them and throws
  // auth/requires-recent-login otherwise; this catches that once and retries the same action
  // after the candidate re-enters their password, rather than duplicating the catch/retry
  // logic in each action. ---
  readonly needsReauth = signal(false);
  reauthPassword = '';
  private pendingAction: (() => Promise<void>) | null = null;

  private async withReauth(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/requires-recent-login') {
        this.pendingAction = action;
        this.needsReauth.set(true);
      } else {
        this.snackBar.open((err as Error).message ?? 'Something went wrong', '', { duration: 3500 });
      }
    }
  }

  async confirmReauth(): Promise<void> {
    if (!this.reauthPassword) return;
    try {
      await this.auth.reauthenticate(this.reauthPassword);
      this.reauthPassword = '';
      this.needsReauth.set(false);
      const action = this.pendingAction;
      this.pendingAction = null;
      if (action) await action();
    } catch {
      this.snackBar.open('Incorrect password', '', { duration: 2500 });
    }
  }

  cancelReauth(): void {
    this.needsReauth.set(false);
    this.pendingAction = null;
    this.reauthPassword = '';
  }

  // --- email ---
  newEmail = '';
  readonly emailChangePending = signal(false);

  async requestEmailChange(): Promise<void> {
    if (!this.newEmail) return;
    await this.withReauth(async () => {
      await this.auth.changeEmailRequest(this.newEmail);
      this.emailChangePending.set(true);
      this.snackBar.open(`Confirmation link sent to ${this.newEmail}`, '', { duration: 3500 });
    });
  }

  async recheckEmailConfirmation(): Promise<void> {
    const changed = await this.auth.syncEmailAfterVerification();
    if (changed) {
      this.emailChangePending.set(false);
      this.newEmail = '';
      this.snackBar.open('Email updated', '', { duration: 2500 });
    } else {
      this.snackBar.open("Not confirmed yet — click the link in the email first", '', { duration: 3000 });
    }
  }

  // --- password ---
  newPassword = '';
  confirmPassword = '';

  async changePassword(): Promise<void> {
    if (!this.newPassword || this.newPassword !== this.confirmPassword) {
      this.snackBar.open("Passwords don't match", '', { duration: 2500 });
      return;
    }
    await this.withReauth(async () => {
      await this.auth.changePassword(this.newPassword);
      this.newPassword = '';
      this.confirmPassword = '';
      this.snackBar.open('Password changed', '', { duration: 2500 });
    });
  }

  // --- "I also personally lead this alliance" self-tag — a superadmin or state_admin's
  // own version of the allianceId field a manager can already set for them (see
  // AccountsService.updateRole()'s doc comment). Superadmin: any alliance, purely a display
  // tag. state_admin: only one in their own state — enforced by firestore.rules, and this
  // plain text field trusts that server-side check rather than pre-validating client-side
  // (keeping this simple rather than building a cascading state+alliance picker for what's
  // a "nice to have" identification tag, not a permission grant). ---
  tagAllianceId = '';

  canTagAlliance(): boolean {
    const rank = this.account()?.rank;
    return rank === RANK.SUPERADMIN || rank === RANK.STATE_ADMIN;
  }

  async saveAllianceTag(): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid || !this.tagAllianceId) return;
    try {
      await this.accounts.setOwnAllianceTag(uid, this.tagAllianceId);
      this.tagAllianceId = '';
      this.snackBar.open('Updated', '', { duration: 2000 });
    } catch (err) {
      this.snackBar.open((err as Error).message ?? "Could not update — for a state_admin this has to be an alliance in your own state", '', { duration: 4000 });
    }
  }

  async clearAllianceTag(): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid) return;
    await this.accounts.setOwnAllianceTag(uid);
    this.snackBar.open('Cleared', '', { duration: 2000 });
  }

  // --- TOTP: set up (none enrolled) or change (replace the existing one) ---
  readonly totpEnrolling = signal(false);
  readonly totpQrDataUrl = signal<string | null>(null);
  readonly totpSecretKey = signal('');
  totpOtp = '';
  private totpSecret: TotpSecret | null = null;

  async startTotpChange(): Promise<void> {
    await this.withReauth(async () => {
      // Firebase only allows one TOTP factor at a time — replacing means unenroll-then-
      // enroll, not a direct "swap". A no-op if nothing's enrolled yet.
      await this.auth.unenrollTotp();
      this.totpSecret = await this.auth.startTotpEnrollment();
      this.totpSecretKey.set(this.totpSecret.secretKey);
      const email = this.auth.user()?.email ?? 'account';
      const otpauthUrl = this.totpSecret.generateQrCodeUrl(email, 'Plannet WOS');
      this.totpQrDataUrl.set(await QRCode.toDataURL(otpauthUrl));
      this.totpEnrolling.set(true);
    });
  }

  async confirmTotpChange(): Promise<void> {
    if (!this.totpSecret || this.totpOtp.length !== 6) return;
    try {
      await this.auth.confirmTotpEnrollment(this.totpSecret, this.totpOtp);
      this.cancelTotpChange();
      this.snackBar.open('Authenticator updated', '', { duration: 2500 });
    } catch {
      this.snackBar.open('Incorrect code — check the time on your device and try again', '', { duration: 3000 });
    }
  }

  cancelTotpChange(): void {
    this.totpEnrolling.set(false);
    this.totpQrDataUrl.set(null);
    this.totpSecretKey.set('');
    this.totpOtp = '';
    this.totpSecret = null;
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
