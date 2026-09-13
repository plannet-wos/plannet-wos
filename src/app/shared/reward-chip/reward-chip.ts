import { Component, Input } from '@angular/core';
import { REWARD_INFO, RewardKey } from '../../core/constants/fortress-rewards';

/**
 * One Fortress control reward, shown as its real in-game icon when fortress-rewards.ts has one
 * for this key, falling back to a plain color chip otherwise — used across fortress.html (both
 * board sections, the full schedule table, and each building's 8-phase reward strip) so the
 * icon-vs-color fallback logic lives in exactly one spot rather than being copy-pasted.
 *
 * `compact` drops the always-visible text label — icon shrunk to a small swatch, color-only
 * rewards shrunk to a plain dot — for the reward strip, where 8 of these sit in a row per
 * building and a full label on each would never fit. The label doesn't disappear, just moves to
 * a hover/long-press `title` tooltip: acceptable here (unlike a real chart, see fortress-
 * rewards.ts's doc comment) because every strip sits directly beside the SAME reward shown at
 * full size with its label front and center — compact mode is a redundant preview, never the
 * only way to identify a reward on the page.
 */
@Component({
  selector: 'app-reward-chip',
  imports: [],
  templateUrl: './reward-chip.html',
  styleUrl: './reward-chip.scss',
})
export class RewardChipComponent {
  @Input({ required: true }) reward!: RewardKey;
  @Input() compact = false;

  readonly rewardInfo = REWARD_INFO;
}
