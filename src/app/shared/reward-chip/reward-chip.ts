import { Component, Input } from '@angular/core';
import { REWARD_INFO, RewardKey } from '../../core/constants/fortress-rewards';

/**
 * One Fortress control reward, shown as its real in-game icon when fortress-rewards.ts has one
 * for this key, falling back to a plain color chip otherwise — used in three places on
 * fortress.html (both board sections plus the full schedule table) so the icon-vs-color
 * fallback logic lives in exactly one spot rather than being copy-pasted three times.
 */
@Component({
  selector: 'app-reward-chip',
  imports: [],
  templateUrl: './reward-chip.html',
  styleUrl: './reward-chip.scss',
})
export class RewardChipComponent {
  @Input({ required: true }) reward!: RewardKey;

  readonly rewardInfo = REWARD_INFO;
}
