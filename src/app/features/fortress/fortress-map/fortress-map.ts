import { Component, Input, signal } from '@angular/core';
import { RewardKey } from '../../../core/constants/fortress-rewards';
import { RewardChipComponent } from '../../../shared/reward-chip/reward-chip';

/** One marker's worth of display data — deliberately just plain resolved values (not a FortressHolding/Alliance), so this component has no service dependencies of its own; fortress.ts does the resolving. */
export interface MapMarker {
  number: number;
  allianceLabel: string;
  /** This building's reward across all 8 phases, in phase order — index 0 is phase 1. */
  schedule: RewardKey[];
  currentPhase: number;
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
 * the same 4+12 shape. Purely a read-only overview: tapping a marker opens this component's own
 * detail panel (alliance + the full 8-phase reward strip, current phase highlighted) rather than
 * anything editable — the existing board cards below stay the one place assignments get changed.
 */
@Component({
  selector: 'app-fortress-map',
  imports: [RewardChipComponent],
  templateUrl: './fortress-map.html',
  styleUrl: './fortress-map.scss',
})
export class FortressMapComponent {
  @Input({ required: true }) strongholds: MapMarker[] = [];
  @Input({ required: true }) fortresses: MapMarker[] = [];

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

  readonly selected = signal<{ kind: 'stronghold' | 'fortress'; marker: MapMarker } | null>(null);

  select(kind: 'stronghold' | 'fortress', marker: MapMarker): void {
    const current = this.selected();
    // Tapping the same marker again closes the panel instead of just re-opening it to itself.
    this.selected.set(current?.kind === kind && current.marker.number === marker.number ? null : { kind, marker });
  }

  isSelected(kind: 'stronghold' | 'fortress', number: number): boolean {
    const current = this.selected();
    return current?.kind === kind && current.marker.number === number;
  }
}
