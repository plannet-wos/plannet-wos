import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { FortressService } from '../../core/services/fortress.service';
import { AllianceService } from '../../core/services/alliance.service';
import { RANK } from '../../core/constants/roles';
import {
  FortressHolding,
  FortressKind,
  FortressSettings,
  STRONGHOLD_COUNT,
  FORTRESS_COUNT,
  fortressHoldingId,
} from '../../core/models/fortress-holding.model';
import { Alliance } from '../../core/models/alliance.model';
import { PHASE_COUNT, RewardKey, rewardForPhase, STRONGHOLD_REWARD_SCHEDULE, FORTRESS_REWARD_SCHEDULE } from '../../core/constants/fortress-rewards';
import { RewardChipComponent } from '../../shared/reward-chip/reward-chip';

/** One grid cell — a building number paired with whatever holding doc (if any) exists for it, plus its reward for the state's current phase. */
interface BuildingCell {
  kind: FortressKind;
  number: number;
  holding: FortressHolding | undefined;
  reward: RewardKey | undefined;
}

@Component({
  selector: 'app-fortress',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
    MatToolbarModule,
    RewardChipComponent,
  ],
  templateUrl: './fortress.html',
  styleUrl: './fortress.scss',
})
export class FortressComponent {
  private auth = inject(AuthService);
  private fortress = inject(FortressService);
  private allianceService = inject(AllianceService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  readonly stateId = inject(ActivatedRoute).snapshot.paramMap.get('stateId')!;
  readonly account = this.auth.account;
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly phases = Array.from({ length: PHASE_COUNT }, (_, i) => i + 1);

  // Public page — no route guard (see app.routes.ts) — but editing is state_admin/superadmin
  // only, scoped to their own state, same threshold as state-admin.ts's own canManage-style
  // checks. Everyone else (any rank, or nobody signed in at all) gets a read-only board.
  readonly canEdit = computed(() => {
    const account = this.account();
    if (!account || !this.auth.isActive()) return false;
    return account.rank <= RANK.STATE_ADMIN && (account.rank === RANK.SUPERADMIN || account.stateId === this.stateId);
  });

  private readonly holdings = toSignal(this.fortress.listForState$(this.stateId), { initialValue: [] as FortressHolding[] });
  private readonly alliances = toSignal(this.allianceService.listForState$(this.stateId), { initialValue: [] as Alliance[] });
  private readonly settings = toSignal(this.fortress.settings$(this.stateId), { initialValue: undefined as FortressSettings | undefined });

  /** Defaults to phase 1 until a state admin has ever set one for this state. */
  readonly currentPhase = computed(() => this.settings()?.currentPhase ?? 1);

  readonly allianceOptions = computed(() => [...this.alliances()].sort((a, b) => a.name.localeCompare(b.name)));

  private readonly allianceById = computed(() => new Map(this.alliances().map((a) => [a.id, a])));

  /** Alliance display label for a holding cell — falls back to the raw ID if the alliance was since deleted, rather than hiding a real assignment. */
  allianceLabel(allianceId: string | null): string {
    if (!allianceId) return 'Unclaimed';
    return this.allianceById().get(allianceId)?.name ?? allianceId;
  }

  private buildRow(kind: FortressKind, count: number): BuildingCell[] {
    const byNumber = new Map(
      this.holdings()
        .filter((h) => h.kind === kind)
        .map((h) => [h.number, h]),
    );
    const phase = this.currentPhase();
    return Array.from({ length: count }, (_, i) => i + 1).map((number) => ({
      kind,
      number,
      holding: byNumber.get(number),
      reward: rewardForPhase(kind, number, phase),
    }));
  }

  readonly strongholds = computed(() => this.buildRow('stronghold', STRONGHOLD_COUNT));
  readonly fortresses = computed(() => this.buildRow('fortress', FORTRESS_COUNT));

  // The full 8-phase reference table (like the community-made schedule this was transcribed
  // from) — every building's reward across every phase, not just the current one, so admins can
  // plan ahead before the NAP vote for the next phase.
  readonly scheduleRows = computed(() => [
    ...Array.from({ length: STRONGHOLD_COUNT }, (_, i) => ({ kind: 'stronghold' as const, number: i + 1, schedule: STRONGHOLD_REWARD_SCHEDULE[i + 1] })),
    ...Array.from({ length: FORTRESS_COUNT }, (_, i) => ({ kind: 'fortress' as const, number: i + 1, schedule: FORTRESS_REWARD_SCHEDULE[i + 1] })),
  ]);

  trackCell(_index: number, cell: BuildingCell): string {
    return fortressHoldingId(this.stateId, cell.kind, cell.number);
  }

  /** Who the NAP vote assigned this building to — set from the alliance dropdown. */
  async assign(cell: BuildingCell, allianceId: string): Promise<void> {
    const uid = this.account()?.uid;
    if (!uid || !this.canEdit()) return;
    try {
      await this.fortress.setHolder(this.stateId, cell.kind, cell.number, allianceId || null, uid);
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  async setPhase(phase: number): Promise<void> {
    const uid = this.account()?.uid;
    if (!uid || !this.canEdit()) return;
    try {
      await this.fortress.setPhase(this.stateId, phase, uid);
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
