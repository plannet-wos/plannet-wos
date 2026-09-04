import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { AccountsService } from '../../core/services/accounts.service';
import { StatesService } from '../../core/services/states.service';
import { AllianceService } from '../../core/services/alliance.service';
import { Alliance, allianceId as composeAllianceId } from '../../core/models/alliance.model';
import { RANK, Rank, REQUESTABLE_RANKS, ROLE_LABEL, SCOPE_BY_RANK } from '../../core/constants/roles';

@Component({
  selector: 'app-signup',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class SignupComponent {
  private auth = inject(AuthService);
  private accounts = inject(AccountsService);
  private allianceService = inject(AllianceService);
  private router = inject(Router);

  readonly states = toSignal(inject(StatesService).list$(), { initialValue: [] });
  readonly requestableRanks = REQUESTABLE_RANKS;
  readonly roleLabel = ROLE_LABEL;
  readonly RANK = RANK;

  email = '';
  password = '';
  stateId = '';
  rank: Rank | null = null;
  allianceSlug = '';

  // Most real state admins also personally lead one alliance as its R5 — this lets them get
  // both from a single account/login instead of needing two. Opt-in and state_admin-only:
  // never required (a "pure" state_admin with no alliance is completely normal too), and
  // never offered for R5/R4 requests, which already always need an alliance below.
  alsoLeadsAlliance = false;

  readonly alliancesForState = signal<Alliance[]>([]);

  loading = signal(false);
  error = signal('');

  // Plain methods, not computed() — computed() only re-evaluates when a SIGNAL it read
  // changes; rank/alsoLeadsAlliance/allianceSlug etc. here are plain ngModel-bound fields
  // (matching every other form field in this component), so a computed() reading them would
  // compute once against whatever they were at first read (all still their initial empty/
  // null defaults) and then never update again, no matter what the user later picks — a real
  // instance of that exact bug is what "needsAlliance" used to be before this fix. A plain
  // method has no such cache: the template calls it fresh on every check.
  showAllianceOptIn(): boolean {
    return this.rank === RANK.STATE_ADMIN;
  }

  needsAlliance(): boolean {
    return this.rank !== null
      && (SCOPE_BY_RANK[this.rank] === 'alliance' || (this.rank === RANK.STATE_ADMIN && this.alsoLeadsAlliance));
  }

  /** Called on (selectionChange) of the role select — a role switch away from state_admin makes the opt-in moot. */
  onRankChange(): void {
    if (this.rank !== RANK.STATE_ADMIN) this.alsoLeadsAlliance = false;
  }

  /** Called on (selectionChange) of the state select — re-fetches the alliance picker's options. */
  onStateChange(): void {
    this.allianceSlug = '';
    this.alliancesForState.set([]);
    if (!this.stateId) return;
    this.allianceService.listForState$(this.stateId).subscribe((alliances) => this.alliancesForState.set(alliances));
  }

  async onSubmit() {
    if (!this.email || !this.password || !this.stateId || this.rank === null) return;
    if (this.needsAlliance() && !this.allianceSlug) return;

    this.loading.set(true);
    this.error.set('');

    try {
      const user = await this.auth.signUp(this.email, this.password);
      await this.finishRequest(user.uid);
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/email-already-in-use') {
        // Most likely this exact email got signed up before but the accounts/{uid} request
        // doc never got written (a previous attempt died between the two steps — this used
        // to always happen for a state_admin request, see requestRole()'s doc comment).
        // Firebase Auth already has the user; try to pick the signup back up instead of
        // leaving the candidate stuck re-submitting into the same error forever.
        try {
          const user = await this.auth.login(this.email, this.password);
          if (await this.accounts.getAccount(user.uid)) {
            this.error.set('An account already exists for this email — try logging in instead.');
          } else {
            await this.finishRequest(user.uid);
            return;
          }
        } catch {
          this.error.set('An account already exists for this email, and this password doesn\'t match it. Try logging in, or use a different email.');
        }
      } else {
        this.error.set((err as Error).message ?? 'Could not create account');
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async finishRequest(uid: string): Promise<void> {
    await this.accounts.requestRole({
      uid,
      email: this.email,
      rank: this.rank!,
      // state_admin is scoped by stateId directly; r5/r4 get stateId denormalized from
      // their alliance (so state-admin scope checks never need a second lookup) plus
      // their own allianceId.
      stateId: this.stateId,
      allianceId: this.needsAlliance() ? composeAllianceId(this.stateId, this.allianceSlug) : undefined,
    });
    this.router.navigate(['/enroll-totp']);
  }
}
