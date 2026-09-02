import { Component, inject, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
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
import { AllianceService } from '../../core/services/alliance.service';
import { RANK } from '../../core/constants/roles';
import { Account } from '../../core/models/account.model';
import { Alliance } from '../../core/models/alliance.model';

@Component({
  selector: 'app-state-admin',
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
  templateUrl: './state-admin.html',
  styleUrl: './state-admin.scss',
})
export class StateAdminComponent {
  private auth = inject(AuthService);
  private accounts = inject(AccountsService);
  private allianceService = inject(AllianceService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  readonly RANK = RANK;
  readonly stateId = inject(ActivatedRoute).snapshot.paramMap.get('stateId')!;
  readonly account = this.auth.account;
  readonly isStateAdminOrAbove = computed(() => (this.account()?.rank ?? 99) <= RANK.STATE_ADMIN);
  readonly isR5 = computed(() => this.account()?.rank === RANK.R5);

  // --- state_admin view: alliances + R5 queue ---
  readonly alliances = toSignal(this.allianceService.listForState$(this.stateId), { initialValue: [] as Alliance[] });
  readonly pendingR5 = toSignal(
    this.accounts.pendingForApprover$({ rank: RANK.STATE_ADMIN, stateId: this.stateId }),
    { initialValue: [] as Account[] },
  );
  readonly activeR5 = toSignal(
    this.accounts.activeManagedBy$({ rank: RANK.STATE_ADMIN, stateId: this.stateId }),
    { initialValue: [] as Account[] },
  );

  // --- R5 view: R4 queue for their own alliance. account() loads asynchronously (it's an
  // onSnapshot listener on accounts/{uid}), so this re-derives the query via switchMap
  // whenever it changes rather than reading allianceId once at construction time. ---
  private readonly account$ = toObservable(this.account);

  readonly pendingR4 = toSignal(
    this.account$.pipe(
      switchMap((acc) =>
        acc?.allianceId ? this.accounts.pendingForApprover$({ rank: RANK.R5, allianceId: acc.allianceId }) : of([]),
      ),
    ),
    { initialValue: [] as Account[] },
  );
  readonly activeR4 = toSignal(
    this.account$.pipe(
      switchMap((acc) =>
        acc?.allianceId ? this.accounts.activeManagedBy$({ rank: RANK.R5, allianceId: acc.allianceId }) : of([]),
      ),
    ),
    { initialValue: [] as Account[] },
  );

  readonly allianceColumns = ['name', 'slug', 'actions'];
  readonly pendingColumns = ['email', 'scope', 'mfa', 'actions'];
  readonly activeColumns = ['email', 'scope', 'actions'];

  newAllianceSlug = '';
  newAllianceName = '';

  async addAlliance() {
    if (!this.newAllianceSlug || !this.newAllianceName) return;
    try {
      await this.allianceService.create(this.stateId, this.newAllianceSlug, this.newAllianceName);
      this.snackBar.open('Alliance created', '', { duration: 2000 });
      this.newAllianceSlug = '';
      this.newAllianceName = '';
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  async removeAlliance(alliance: Alliance) {
    await this.allianceService.remove(alliance.stateId, alliance.slug);
    this.snackBar.open('Alliance deleted', '', { duration: 2000 });
  }

  async approve(account: Account) {
    const approverUid = this.auth.user()?.uid;
    if (!approverUid) return;
    try {
      await this.accounts.approve(account, approverUid);
      this.snackBar.open(`${account.email} approved`, '', { duration: 2500 });
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  async revoke(account: Account) {
    await this.accounts.revoke(account);
    this.snackBar.open(`${account.email} revoked`, '', { duration: 2500 });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
