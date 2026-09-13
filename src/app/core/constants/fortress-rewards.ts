/**
 * This state doesn't fight over Fortresses/Strongholds — NAP votes decide who gets which one
 * (see fortress-holding.model.ts). The only reward that matters here is the control reward: what
 * an alliance's members receive for as long as they hold a given building. There's no fixed
 * catalog wired up yet — CONTROL_REWARDS below is a placeholder until the real ~10-item list
 * (provided by the state, not scraped from a guide — see fortress-holding.model.ts's doc
 * comment on why) is dropped in; fortress.ts currently lets a state admin type a reward label
 * as free text instead of picking from this list, so the app is usable in the meantime.
 *
 * Once the real list lands: fill this in, then switch fortress.ts's reward field from a text
 * input to a `<mat-select>` over CONTROL_REWARDS (same pattern its alliance dropdown already
 * uses), and firestore.rules' `rewardLabel is string` check to `rewardLabel in [...]`.
 */
export interface ControlReward {
  key: string;
  label: string;
}

export const CONTROL_REWARDS: ControlReward[] = [];
