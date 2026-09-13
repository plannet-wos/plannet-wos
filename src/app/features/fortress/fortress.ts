import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { FortressService } from '../../core/services/fortress.service';
import { AllianceService } from '../../core/services/alliance.service';
import { RANK } from '../../core/constants/roles';
import { FortressHolding, FortressKind, FortressSettings, STRONGHOLD_COUNT, FORTRESS_COUNT } from '../../core/models/fortress-holding.model';
import { Alliance } from '../../core/models/alliance.model';
import {
  DEFAULT_PHASE1_START_MS,
  PHASE_COUNT,
  currentPhaseInfo,
  STRONGHOLD_REWARD_SCHEDULE,
  FORTRESS_REWARD_SCHEDULE,
} from '../../core/constants/fortress-rewards';
import { RewardChipComponent } from '../../shared/reward-chip/reward-chip';
import { AssignEvent, FortressMapComponent, MapMarker } from './fortress-map/fortress-map';

/** One building — a number paired with whatever holding doc (if any) exists for it. Feeds the map's markers; there's no separate grid anymore (see git history). */
interface BuildingCell {
  kind: FortressKind;
  number: number;
  holding: FortressHolding | undefined;
}

@Component({
  selector: 'app-fortress',
  imports: [
    FormsModule,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatToolbarModule,
    RewardChipComponent,
    FortressMapComponent,
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

  // Ticks periodically so the phase (and the schedule's highlighted column) advances on its own
  // across the Friday->Saturday boundary without needing a page reload — same idiom as nap.ts's
  // own nowMs clock, just a much coarser interval since a phase only ever changes once a week.
  private readonly nowMs = signal(Date.now());
  constructor() {
    setInterval(() => this.nowMs.set(Date.now()), 5 * 60_000);
  }

  private readonly phase1StartAt = computed(() => this.settings()?.phase1StartAt ?? DEFAULT_PHASE1_START_MS);

  /** The phase (1-8) live right now — fully computed from the calendar, see fortress-rewards.ts's currentPhaseInfo(). */
  readonly phaseInfo = computed(() => currentPhaseInfo(this.phase1StartAt(), this.nowMs()));
  readonly currentPhase = computed(() => this.phaseInfo().phase);

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
    return Array.from({ length: count }, (_, i) => i + 1).map((number) => ({ kind, number, holding: byNumber.get(number) }));
  }

  readonly strongholds = computed(() => this.buildRow('stronghold', STRONGHOLD_COUNT));
  readonly fortresses = computed(() => this.buildRow('fortress', FORTRESS_COUNT));

  private toMapMarker(cell: BuildingCell): MapMarker {
    const schedule = (cell.kind === 'stronghold' ? STRONGHOLD_REWARD_SCHEDULE : FORTRESS_REWARD_SCHEDULE)[cell.number];
    return {
      number: cell.number,
      allianceId: cell.holding?.allianceId ?? null,
      allianceLabel: this.allianceLabel(cell.holding?.allianceId ?? null),
      schedule,
      currentPhase: this.currentPhase(),
    };
  }

  readonly mapStrongholds = computed(() => this.strongholds().map((c) => this.toMapMarker(c)));
  readonly mapFortresses = computed(() => this.fortresses().map((c) => this.toMapMarker(c)));

  // The full 8-phase reference table (like the community-made schedule this was transcribed
  // from) — every building's reward across every phase, not just the current one, so admins can
  // plan ahead before the next allocation round.
  readonly scheduleRows = computed(() => [
    ...Array.from({ length: STRONGHOLD_COUNT }, (_, i) => ({ kind: 'stronghold' as const, number: i + 1, schedule: STRONGHOLD_REWARD_SCHEDULE[i + 1] })),
    ...Array.from({ length: FORTRESS_COUNT }, (_, i) => ({ kind: 'fortress' as const, number: i + 1, schedule: FORTRESS_REWARD_SCHEDULE[i + 1] })),
  ]);

  /** Handles the map's (assign) output — who this state's own process assigned a building to. */
  async onMapAssign(event: AssignEvent): Promise<void> {
    const uid = this.account()?.uid;
    if (!uid || !this.canEdit()) return;
    try {
      await this.fortress.setHolder(this.stateId, event.kind, event.number, event.allianceId || null, uid);
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  // --- "how this state runs Fortress" blurb (state_admin-authored, see FortressSettings.rulesNote) ---
  readonly rulesNote = computed(() => this.settings()?.rulesNote ?? '');
  showRulesNoteForm = signal(false);
  rulesNoteInput = '';

  openRulesNoteForm(): void {
    this.rulesNoteInput = this.rulesNote();
    this.showRulesNoteForm.set(true);
  }

  async saveRulesNote(): Promise<void> {
    const uid = this.account()?.uid;
    if (!uid || !this.canEdit()) return;
    try {
      await this.fortress.setRulesNote(this.stateId, this.rulesNoteInput.trim(), uid);
      this.showRulesNoteForm.set(false);
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    }
  }

  // --- phase-1 anchor override (advanced, admin-only — see fortress.html's collapsed section) ---
  showAnchorForm = signal(false);
  anchorDateInput = '';

  /** `<input type="date">`'s current value as YYYY-MM-DD, for prefilling the override form when it's opened. */
  private anchorDateString(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  openAnchorForm(): void {
    this.anchorDateInput = this.anchorDateString(this.phase1StartAt());
    this.showAnchorForm.set(true);
  }

  async saveAnchor(): Promise<void> {
    const uid = this.account()?.uid;
    if (!uid || !this.canEdit() || !this.anchorDateInput) return;
    // Parsed as calendar-date components rather than `new Date(str)` so this always lands on
    // that date's UTC midnight regardless of the admin's own browser time zone — the phase
    // system is defined entirely in UTC (see fortress-rewards.ts), and a local-time parse could
    // silently shift the anchor by a day for anyone west of UTC.
    const [year, month, day] = this.anchorDateInput.split('-').map(Number);
    const phase1StartAt = Date.UTC(year, month - 1, day);
    try {
      await this.fortress.setPhase1Start(this.stateId, phase1StartAt, uid);
      this.showAnchorForm.set(false);
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
