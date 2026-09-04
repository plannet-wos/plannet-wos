import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MultiFactorResolver } from 'firebase/auth';
import { AuthService, MfaRequiredError } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  otp = '';
  hide = signal(true);
  loading = signal(false);
  error = signal('');

  /** Set once login() reports the account has TOTP enrolled — switches the form to the code-entry step. */
  pendingMfaResolver = signal<MultiFactorResolver | null>(null);

  async onLogin() {
    if (!this.email || !this.password) return;

    this.loading.set(true);
    this.error.set('');

    try {
      await this.auth.login(this.email, this.password);
      this.router.navigate(['/dashboard']);
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        this.pendingMfaResolver.set(err.resolver);
      } else {
        this.error.set('Invalid email or password');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmitOtp() {
    const resolver = this.pendingMfaResolver();
    if (!resolver || !this.otp) return;

    this.loading.set(true);
    this.error.set('');

    try {
      await this.auth.completeMfaSignIn(resolver, this.otp);
      this.router.navigate(['/dashboard']);
    } catch {
      this.error.set('Invalid authenticator code');
    } finally {
      this.loading.set(false);
    }
  }

  cancelMfa() {
    this.pendingMfaResolver.set(null);
    this.otp = '';
    this.error.set('');
  }

  // --- forgot password ---
  showForgotPassword = signal(false);
  resetEmail = '';
  resetSent = signal(false);

  openForgotPassword(): void {
    this.resetEmail = this.email;
    this.resetSent.set(false);
    this.error.set('');
    this.showForgotPassword.set(true);
  }

  cancelForgotPassword(): void {
    this.showForgotPassword.set(false);
    this.resetSent.set(false);
  }

  async sendPasswordReset(): Promise<void> {
    if (!this.resetEmail) return;
    this.loading.set(true);
    this.error.set('');
    try {
      // Same "check your inbox" outcome whether or not the address has an account — see
      // AuthService.sendPasswordReset()'s doc comment on why user-not-found is swallowed here.
      await this.auth.sendPasswordReset(this.resetEmail);
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') {
        this.error.set('Something went wrong — try again in a moment');
        this.loading.set(false);
        return;
      }
    }
    this.resetSent.set(true);
    this.loading.set(false);
  }
}
