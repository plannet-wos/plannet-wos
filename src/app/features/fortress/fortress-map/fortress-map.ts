import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { RewardKey } from '../../../core/constants/fortress-rewards';
import { RewardChipComponent } from '../../../shared/reward-chip/reward-chip';

export type BuildingKind = 'stronghold' | 'fortress';

/** One marker's worth of display data — deliberately just plain resolved values (not a FortressHolding/Alliance), so this component has no service dependencies of its own; fortress.ts does the resolving. */
export interface MapMarker {
  number: number;
  allianceId: string | null;
  allianceLabel: string;
  /** Short tag (the alliance's slug, uppercased — same convention as display-name.util.ts) for the always-visible on-marker label; `null` while unclaimed. */
  allianceTag: string | null;
  /** This building's reward across all 8 phases, in phase order — index 0 is phase 1. */
  schedule: RewardKey[];
  currentPhase: number;
}

export interface AssignEvent {
  kind: BuildingKind;
  number: number;
  allianceId: string;
}

interface Point {
  x: number; // percent, 0-100
  y: number;
}

/**
 * A schematic overview of the state's Fortress board — NOT a redraw of the real in-game world
 * map (see git history: the state shared an actual map screenshot, but it's covered in facility
 * icons, connector lines and POI labels that only make sense for the unrelated tech-tree event
 * it was captured for). What actually matters for orientation carries over: the center castle,
 * 4 Strongholds clustered near it, and the 12 Fortresses in an outer ring — evenly spaced here
 * rather than at the source image's exact pixel positions, which the state's own screenshot note
 * admitted weren't going to be exact anyway.
 *
 * Positions are fixed design constants (STRONGHOLD_POSITIONS/FORTRESS_POSITIONS below), not
 * computed from real coordinates — there's no per-state layout to vary, every state's board is
 * the same 4+12 shape. This is now the ONE place assignments are viewed AND changed (the
 * separate 16-card grid it used to sit above was dropped as redundant, see fortress.ts's git
 * history) — a claimed building's alliance tag sits right on its marker (no tap needed just to
 * see who holds what), and tapping the marker opens this component's own detail panel with the
 * full 8-phase reward strip, current phase highlighted, and, for a state_admin/superadmin
 * (`canEdit`), an alliance dropdown that emits `assign` for fortress.ts to actually write.
 */
@Component({
  selector: 'app-fortress-map',
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, RewardChipComponent],
  templateUrl: './fortress-map.html',
  styleUrl: './fortress-map.scss',
})
export class FortressMapComponent {
  @Input({ required: true }) strongholds: MapMarker[] = [];
  @Input({ required: true }) fortresses: MapMarker[] = [];
  @Input() canEdit = false;
  @Input() allianceOptions: { id: string; name: string }[] = [];
  @Output() assign = new EventEmitter<AssignEvent>();

  // Clustered around the castle in the same rough diamond arrangement the source screenshot
  // showed (a Stronghold pair above the castle, a pair below) — the source didn't number them,
  // so this ordering (matching buildRow()'s 1..4) is this app's own, not an in-game numbering.
  readonly STRONGHOLD_POSITIONS: Point[] = [
    { x: 38, y: 38 }, // 1: upper-left
    { x: 62, y: 38 }, // 2: upper-right
    { x: 62, y: 62 }, // 3: lower-right
    { x: 38, y: 62 }, // 4: lower-left
  ];

  // Evenly spaced 30° apart around the outer ring, in the same clockwise order (10, 9, 8, ... 1,
  // 12, 11) the source screenshot's numbering ran in, starting just left of the top point.
  private static readonly RING_ORDER = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 12, 11];
  readonly FORTRESS_POSITIONS: Record<number, Point> = (() => {
    const centered = 50;
    const radius = 38;
    const positions: Record<number, Point> = {};
    FortressMapComponent.RING_ORDER.forEach((num, i) => {
      const angleDeg = -75 + 30 * i;
      const angleRad = (angleDeg * Math.PI) / 180;
      positions[num] = {
        x: centered + radius * Math.sin(angleRad),
        y: centered - radius * Math.cos(angleRad),
      };
    });
    return positions;
  })();

  readonly selected = signal<{ kind: BuildingKind; marker: MapMarker } | null>(null);

  select(kind: BuildingKind, marker: MapMarker): void {
    const current = this.selected();
    // Tapping the same marker again closes the panel instead of just re-opening it to itself.
    this.selected.set(current?.kind === kind && current.marker.number === marker.number ? null : { kind, marker });
  }

  isSelected(kind: BuildingKind, number: number): boolean {
    const current = this.selected();
    return current?.kind === kind && current.marker.number === number;
  }

  onAssign(kind: BuildingKind, number: number, allianceId: string): void {
    this.assign.emit({ kind, number, allianceId });
  }
}
