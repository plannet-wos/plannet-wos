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
  // True for a real R5 (always has an allianceId), or a state_admin who personally leads an
  // alliance too (see account.model.ts's comment). Used in the template to decide whether
  // the R4 queue section renders at all: state_admin/superadmin always see it (state-wide,
  // via isStateAdminOrAbove() — see pendingR4/activeR4 below and firestore.rules'
  // sameScope()); a real R5 sees it only because of this flag, for their own alliance.
  readonly leadsAlliance = computed(() => !!this.account()?.allianceId);

  // --- state_admin view: alliances + R5 queue ---
  readonly alliances = toSignal(this.allianceService.listForState$(this.stateId), { initialValue: [] as Alliance[] });
  readonly pendingR5 = toSignal(this.accounts.pendingR5ForState$(this.stateId), { initialValue: [] as Account[] });
  readonly activeR5 = toSignal(this.accounts.activeR5ForState$(this.stateId), { initialValue: [] as Account[] });

  // --- R4 queue: state-wide (every alliance in this state) for state_admin/superadmin — see
  // firestore.rules' sameScope() — since they can now approve/revoke any alliance's R4s, not
  // just one they personally lead; a state-wide escalation path for when an R5 is slow to
  // clear their own queue. A real R5 still only ever sees/manages their OWN alliance's R4s.
  // account() loads asynchronously (it's an onSnapshot listener on accounts/{uid}), so this
  // re-derives the query via switchMap whenever it changes rather than reading rank/
  // allianceId once at construction time. ---
  private readonly account$ = toObservable(this.account);

  readonly pendingR4 = toSignal(
    this.account$.pipe(
      switchMap((acc) => {
        if (!acc) return of([]);
        if (acc.rank <= RANK.STATE_ADMIN) return this.accounts.pendingR4ForState$(this.stateId);
        return acc.allianceId ? this.accounts.pendingForApprover$({ rank: RANK.R5, allianceId: acc.allianceId }) : of([]);
      }),
    ),
    { initialValue: [] as Account[] },
  );
  readonly activeR4 = toSignal(
    this.account$.pipe(
      switchMap((acc) => {
        if (!acc) return of([]);
        if (acc.rank <= RANK.STATE_ADMIN) return this.accounts.activeR4ForState$(this.stateId);
        return acc.allianceId ? this.accounts.activeManagedBy$({ rank: RANK.R5, allianceId: acc.allianceId }) : of([]);
      }),
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
  // comment. This form only ever renders inside the isStateAdminOrAbove() section of the
  // template, so both branches below are state-wide by construction: a state_admin (or
  // superadmin) can reassign an R5 to any alliance in the state, and demoting to R4 is
  // likewise valid for any alliance — see firestore.rules' sameScope(), which no longer
  // restricts a state_admin's R4 scope to just their own alliance. ---
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

  // Plain method, not computed() — see signup.ts's needsAlliance doc comment for why: this
  // reads editR5Rank, a plain (non-signal) ngModel-bound field. Both ranks are always
  // offered now — see this section's doc comment above.
  editR5Ranks(): Rank[] {
    return [RANK.R5, RANK.R4];
  }

  editR5AllianceOptions(): Alliance[] {
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
    // Approving without TOTP is allowed (see AccountsService.approve()'s doc comment) but
    // it's the approver's call to make knowingly, not a silent default — a plain confirm()
    // here is enough friction for that without building a whole dialog for it.
    if (!account.mfaEnrolled && !confirm(`${account.email} hasn't set up an authenticator yet. Approve anyway?`)) {
      return;
    }
    try {
      await this.accounts.approve(account, approverUid);
      this.snackBar.open(`${account.email} approved`, '', { duration: 2500 });
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  async revoke(account: Account) {
    if (!confirm(`Revoke ${account.email}? They'll be signed out immediately and lose access.`)) return;
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
