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
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { AccountsService } from '../../core/services/accounts.service';
import { StatesService } from '../../core/services/states.service';
import { AllianceService } from '../../core/services/alliance.service';
import { RANK, Rank, ROLE_LABEL } from '../../core/constants/roles';
import { Account } from '../../core/models/account.model';
import { Alliance, allianceId as composeAllianceId } from '../../core/models/alliance.model';

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
    MatSelectModule,
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
  private allianceService = inject(AllianceService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  readonly RANK = RANK;
  readonly roleLabel = ROLE_LABEL;
  readonly pending = toSignal(this.accounts.pendingForApprover$({ rank: RANK.SUPERADMIN }), { initialValue: [] });
  readonly active = toSignal(this.accounts.activeManagedBy$({ rank: RANK.SUPERADMIN }), { initialValue: [] });

  readonly pendingColumns = ['email', 'stateId', 'mfa', 'actions'];
  readonly activeColumns = ['email', 'stateId', 'actions'];

  newStateId = '';
  newStateName = '';

  // --- editing an active state_admin's rank/alliance (grant/revoke alliance leadership, or
  // reassign them to r5/r4 outright) — see AccountsService.updateRole()'s doc comment. Ranks
  // a superadmin may reassign TO here are state_admin/r5/r4 (never superadmin itself — same
  // "strictly lower rank" rule the rules enforce). ---
  editingUid = signal<string | null>(null);
  editRank: Rank = RANK.STATE_ADMIN;
  editAllianceSlug = '';
  readonly editAlliances = signal<Alliance[]>([]);
  readonly editableRanks: Rank[] = [RANK.STATE_ADMIN, RANK.R5, RANK.R4];

  startEdit(account: Account): void {
    this.editingUid.set(account.uid);
    this.editRank = account.rank;
    this.editAlliances.set([]);
    this.editAllianceSlug = '';
    if (account.stateId) {
      this.allianceService.listForState$(account.stateId).subscribe((alliances) => {
        this.editAlliances.set(alliances);
        if (account.allianceId) {
          this.editAllianceSlug = alliances.find((a) => a.id === account.allianceId)?.slug ?? '';
        }
      });
    }
  }

  cancelEdit(): void {
    this.editingUid.set(null);
  }

  // Plain method, not computed() — see signup.ts's needsAlliance doc comment for why: this
  // reads editRank, a plain (non-signal) ngModel-bound field, so a computed() here would only
  // ever evaluate once and never reflect the user's later rank picks.
  editNeedsAlliance(): boolean {
    return this.editRank === RANK.R5 || this.editRank === RANK.R4;
  }

  async saveEdit(account: Account): Promise<void> {
    if (this.editNeedsAlliance() && !this.editAllianceSlug) return;
    try {
      await this.accounts.updateRole(
        account,
        this.editRank,
        this.editAllianceSlug ? composeAllianceId(account.stateId!, this.editAllianceSlug) : undefined,
      );
      this.snackBar.open(`${account.email} updated`, '', { duration: 2500 });
      this.editingUid.set(null);
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

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
