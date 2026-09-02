import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { TotpSecret } from 'firebase/auth';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { AccountsService } from '../../core/services/accounts.service';

@Component({
  selector: 'app-totp-enroll',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './totp-enroll.html',
  styleUrl: './totp-enroll.scss',
})
export class TotpEnrollComponent implements OnInit {
  private auth = inject(AuthService);
  private accounts = inject(AccountsService);
  private router = inject(Router);

  private secret: TotpSecret | null = null;
  readonly qrDataUrl = signal<string | null>(null);
  readonly secretKey = signal('');
  readonly otp = signal('');
  readonly loading = signal(true);
  readonly confirming = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  async ngOnInit() {
    try {
      this.secret = await this.auth.startTotpEnrollment();
      this.secretKey.set(this.secret.secretKey);
      const email = this.auth.user()?.email ?? 'account';
      const otpauthUrl = this.secret.generateQrCodeUrl(email, 'Plannet WOS');
      this.qrDataUrl.set(await QRCode.toDataURL(otpauthUrl));
    } catch (err) {
      this.error.set((err as Error).message ?? 'Could not start TOTP enrollment');
    } finally {
      this.loading.set(false);
    }
  }

  async onConfirm() {
    const secret = this.secret;
    const uid = this.auth.user()?.uid;
    if (!secret || !uid || !this.otp()) return;

    this.confirming.set(true);
    this.error.set('');

    try {
      await this.auth.confirmTotpEnrollment(secret, this.otp());
      await this.accounts.markMfaEnrolled(uid);
      this.done.set(true);
    } catch {
      this.error.set('Incorrect code — check the time on your device and try again');
    } finally {
      this.confirming.set(false);
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
