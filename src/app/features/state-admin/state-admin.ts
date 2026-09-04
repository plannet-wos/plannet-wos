import { Component, inject, computed, signal } from '@angular/core';
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
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { AccountsService } from '../../core/services/accounts.service';
import { AllianceService } from '../../core/services/alliance.service';
import { RANK, Rank, ROLE_LABEL } from '../../core/constants/roles';
import { Account } from '../../core/models/account.model';
import { Alliance, allianceId as composeAllianceId } from '../../core/models/alliance.model';

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
    MatSelectModule,
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
  // Shows the R4 queue below: true for a real R5, and also for a state_admin who personally
  // leads an alliance too (allianceId set on their own account — see account.model.ts's
  // comment). Rank-agnostic on purpose — the pendingR4/activeR4 queries below already key
  // off allianceId alone, and this route only ever admits rank <= R5 in the first place
  // (see app.routes.ts's stateScopedGuard), so nothing but superadmin (no allianceId) and
  // R4 (never reaches this route) would otherwise fail the check anyway.
  readonly leadsAlliance = computed(() => !!this.account()?.allianceId);

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

  // --- R4 queue for the signed-in account's own alliance (R5, or a state_admin who also
  // leads that alliance — see leadsAlliance() above). account() loads asynchronously (it's
  // an onSnapshot listener on accounts/{uid}), so this re-derives the query via switchMap
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
  readonly roleLabel = ROLE_LABEL;

  newAllianceSlug = '';
  newAllianceName = '';

  // --- editing an active R5's alliance/rank — see AccountsService.updateRole()'s doc
  // comment. Reassigning to a different alliance (staying R5) is always available; demoting
  // to R4 is only offered when this state_admin themselves leads an alliance
  // (leadsAlliance()) — rules require the state_admin's OWN allianceId to match the target's
  // new allianceId for an R4 target, so R4 is only ever a valid destination pointing at that
  // one alliance. ---
  editingR5Uid = signal<string | null>(null);
  editR5Rank: Rank = RANK.R5;
  editR5AllianceSlug = '';

  startEditR5(account: Account): void {
    this.editingR5Uid.set(account.uid);
    this.editR5Rank = account.rank;
    this.editR5AllianceSlug = this.alliances().find((a) => a.id === account.allianceId)?.slug ?? '';
  }

  cancelEditR5(): void {
    this.editingR5Uid.set(null);
  }

  // Plain methods, not computed() — see signup.ts's needsAlliance doc comment for why: these
  // read editR5Rank, a plain (non-signal) ngModel-bound field.
  editR5Ranks(): Rank[] {
    return this.leadsAlliance() ? [RANK.R5, RANK.R4] : [RANK.R5];
  }

  editR5AllianceOptions(): Alliance[] {
    if (this.editR5Rank === RANK.R4) {
      return this.alliances().filter((a) => a.id === this.account()?.allianceId);
    }
    return this.alliances();
  }

  async saveEditR5(account: Account): Promise<void> {
    if (!this.editR5AllianceSlug) return;
    try {
      await this.accounts.updateRole(account, this.editR5Rank, composeAllianceId(this.stateId, this.editR5AllianceSlug));
      this.snackBar.open(`${account.email} updated`, '', { duration: 2500 });
      this.editingR5Uid.set(null);
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

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
