import { Component, inject, computed, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, combineLatest, map } from 'rxjs';
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
import { displayName } from '../../core/utils/display-name.util';
import { DisplayNamePipe } from '../../shared/display-name.pipe';

@Component({
  selector: 'app-state-admin',
  imports: [
    FormsModule,
    DisplayNamePipe,
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

  // Real rank-2 R5s, merged with any active state_admin in this state who's self-tagged "I
  // also lead this alliance" (see AccountsService.stateAdminAlliesForState$()'s doc comment) —
  // that state_admin IS that alliance's leader in every way this app cares about (NapVoteCard's
  // canVote(), the R4 queue below), so they belong on this list too, not just invisible above
  // it. roleLabelFor()/RANK distinguish the two kinds of row in the template (only a real R5
  // row gets the edit/revoke actions — a self-tagged state_admin is managed from the
  // Superadmin console, never demoted/revoked from here).
  readonly activeR5 = toSignal(
    combineLatest([
      this.accounts.activeR5ForState$(this.stateId),
      this.accounts.stateAdminAlliesForState$(this.stateId),
    ]).pipe(map(([r5s, taggedAdmins]) => [...r5s, ...taggedAdmins])),
    { initialValue: [] as Account[] },
  );

  roleLabelFor(account: Account): string {
    return this.roleLabel[account.rank === RANK.STATE_ADMIN ? 'state_admin' : 'r5'];
  }

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
  // Active R5s gets its own column set (adds "role") since that table can now hold two kinds
  // of row — see activeR5's doc comment above.
  readonly activeR5Columns = ['email', 'role', 'scope', 'actions'];
  readonly roleLabel = ROLE_LABEL;

  newAllianceSlug = '';
  newAllianceName = '';

  // --- editing an active R5 or R4's alliance/rank — see AccountsService.updateRole()'s doc
  // comment. This form only ever renders inside the isStateAdminOrAbove() section of the
  // template (an R5 gets no edit button for their own R4s — see editable check in the
  // template — since firestore.rules' sameScope() leaves them nothing meaningful to change:
  // an R5's edit of an R4 can't move rank off R4 or alliance off their own, both forced by the
  // rule), so both branches below are state-wide by construction: a state_admin (or
  // superadmin) can reassign an R5/R4 to any alliance in the state, or promote an R4 straight
  // to R5 (making them that alliance's new leader) — see firestore.rules' sameScope(), which
  // doesn't restrict a state_admin's R5/R4 scope to just one alliance. Shared between the
  // Active R5s and Active R4s tables rather than one form per table — same edit, just a
  // different starting row. ---
  editingUid = signal<string | null>(null);
  editRank: Rank = RANK.R5;
  editAllianceSlug = '';

  /** The account editingUid points at — looked up across whichever table it's actually showing in. Plain method, not memoized: called straight from the template. */
  editingAccount(): Account | undefined {
    const uid = this.editingUid();
    if (!uid) return undefined;
    return this.activeR5().find((a) => a.uid === uid) ?? this.activeR4().find((a) => a.uid === uid);
  }

  startEdit(account: Account): void {
    this.editingUid.set(account.uid);
    this.editRank = account.rank;
    this.editAllianceSlug = this.alliances().find((a) => a.id === account.allianceId)?.slug ?? '';
  }

  cancelEdit(): void {
    this.editingUid.set(null);
  }

  // Plain method, not computed() — see signup.ts's needsAlliance doc comment for why: this
  // reads editRank, a plain (non-signal) ngModel-bound field. Both ranks are always offered —
  // see this section's doc comment above.
  editRanks(): Rank[] {
    return [RANK.R5, RANK.R4];
  }

  editAllianceOptions(): Alliance[] {
    return this.alliances();
  }

  async saveEdit(account: Account): Promise<void> {
    if (!this.editAllianceSlug) return;
    try {
      await this.accounts.updateRole(account, this.editRank, composeAllianceId(this.stateId, this.editAllianceSlug));
      this.snackBar.open(`${displayName(account)} updated`, '', { duration: 2500 });
      this.editingUid.set(null);
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
    if (!account.mfaEnrolled && !confirm(`${displayName(account)} hasn't set up an authenticator yet. Approve anyway?`)) {
      return;
    }
    try {
      await this.accounts.approve(account, approverUid);
      this.snackBar.open(`${displayName(account)} approved`, '', { duration: 2500 });
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  async revoke(account: Account) {
    if (!confirm(`Revoke ${displayName(account)}? They'll be signed out immediately and lose access.`)) return;
    await this.accounts.revoke(account);
    this.snackBar.open(`${displayName(account)} revoked`, '', { duration: 2500 });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
