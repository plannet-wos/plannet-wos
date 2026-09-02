import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { AccountsService } from '../../core/services/accounts.service';
import { StatesService } from '../../core/services/states.service';
import { RANK } from '../../core/constants/roles';
import { Account } from '../../core/models/account.model';

@Component({
  selector: 'app-superadmin',
  imports: [
    FormsModule,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './superadmin.html',
  styleUrl: './superadmin.scss',
})
export class SuperadminComponent {
  private auth = inject(AuthService);
  private accounts = inject(AccountsService);
  private states = inject(StatesService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  readonly pending = toSignal(this.accounts.pendingForApprover$({ rank: RANK.SUPERADMIN }), { initialValue: [] });
  readonly active = toSignal(this.accounts.activeManagedBy$({ rank: RANK.SUPERADMIN }), { initialValue: [] });

  readonly pendingColumns = ['email', 'stateId', 'mfa', 'actions'];
  readonly activeColumns = ['email', 'stateId', 'actions'];

  newStateId = '';
  newStateName = '';

  async approve(account: Account) {
    const approverUid = this.auth.user()?.uid;
    if (!approverUid) return;
    try {
      await this.accounts.approve(account, approverUid);
      this.snackBar.open(`${account.email} approved as state admin`, '', { duration: 2500 });
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  async revoke(account: Account) {
    await this.accounts.revoke(account);
    this.snackBar.open(`${account.email} revoked`, '', { duration: 2500 });
  }

  async addState() {
    if (!this.newStateId) return;
    await this.states.create(this.newStateId, this.newStateName || undefined);
    this.snackBar.open(`State ${this.newStateId} registered`, '', { duration: 2000 });
    this.newStateId = '';
    this.newStateName = '';
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
