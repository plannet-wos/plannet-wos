import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
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

  readonly alliancesForState = signal<Alliance[]>([]);
  readonly needsAlliance = computed(() => this.rank !== null && SCOPE_BY_RANK[this.rank] === 'alliance');

  loading = signal(false);
  error = signal('');

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
      await this.accounts.requestRole({
        uid: user.uid,
        email: this.email,
        rank: this.rank,
        // state_admin is scoped by stateId directly; r5/r4 get stateId denormalized from
        // their alliance (so state-admin scope checks never need a second lookup) plus
        // their own allianceId.
        stateId: this.stateId,
        allianceId: this.needsAlliance() ? composeAllianceId(this.stateId, this.allianceSlug) : undefined,
      });
      this.router.navigate(['/enroll-totp']);
    } catch (err) {
      this.error.set((err as Error).message ?? 'Could not create account');
    } finally {
      this.loading.set(false);
    }
  }
}
