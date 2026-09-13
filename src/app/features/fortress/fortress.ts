import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { FortressService } from '../../core/services/fortress.service';
import { AllianceService } from '../../core/services/alliance.service';
import { RANK } from '../../core/constants/roles';
import { FortressHolding, FortressKind, STRONGHOLD_COUNT, FORTRESS_COUNT, fortressHoldingId } from '../../core/models/fortress-holding.model';
import { Alliance } from '../../core/models/alliance.model';

/** One grid cell — a building number paired with whatever holding doc (if any) exists for it. */
interface BuildingCell {
  kind: FortressKind;
  number: number;
  holding: FortressHolding | undefined;
}

@Component({
  selector: 'app-fortress',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatToolbarModule,
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

  /**
   * The control reward this building currently pays out — a free-text field for now (there's no
   * fixed reward catalog wired up yet, see fortress-rewards.ts), saved on blur rather than on
   * every keystroke so a state admin can type a whole label before it round-trips to Firestore.
   */
  async saveReward(cell: BuildingCell, value: string): Promise<void> {
    const uid = this.account()?.uid;
    if (!uid || !this.canEdit()) return;
    const trimmed = value.trim();
    if (trimmed === (cell.holding?.rewardLabel ?? '')) return; // unchanged — skip the write
    try {
      await this.fortress.setReward(this.stateId, cell.kind, cell.number, trimmed || null, uid);
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
