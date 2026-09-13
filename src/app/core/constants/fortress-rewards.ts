/**
 * Reference info for Fortress Battles' 8-week season structure — game mechanics, not
 * state-specific data, so unlike the holdings board itself this is a hardcoded constant, not a
 * Firestore collection: nothing here is meant to be edited per-state.
 *
 * Sourced from third-party WoS guides (in-game help text isn't fetchable from outside the
 * game) as of September 2026: Whiteout Survival Wiki's Fortress Battles page, wostools.net's
 * Fortress Battles guide, and One Chilled Gamer's Fortress Battles guide. Century Games has
 * reportedly revised the exact per-tier loot (gems/speedups/Fire Crystals/hero shards) more
 * than once, including a pass guides describe as landing around Season 3 (~March 2026) — none
 * of these sources agree closely enough on the current precise numbers to reprint them here as
 * fact, so this deliberately sticks to the structural rules, which have stayed stable: point
 * values, the weekly registration cap, and the three reward types. For the exact current loot
 * at a given point total, tap the building in-game — it shows a live rewards popup.
 */
export const STRONGHOLD_POINTS = 2;
export const FORTRESS_POINTS = 1;

/** Continuous hold time (minutes) within the 2-hour weekly battle phase needed to secure a building. */
export const CAPTURE_HOLD_MINUTES = 30;

export interface FortressWeekCap {
  week: number;
  /** Max buildings of each kind an alliance can hold at once by this week, if it keeps winning every phase — auto-registration of already-held buildings plus that week's newly opened slot. Stronghold caps out at 4 (there are only 4 in total). */
  maxStrongholds: number;
  maxFortresses: number;
}

export const FORTRESS_WEEK_CAPS: FortressWeekCap[] = [
  { week: 1, maxStrongholds: 1, maxFortresses: 1 },
  { week: 2, maxStrongholds: 2, maxFortresses: 2 },
  { week: 3, maxStrongholds: 3, maxFortresses: 3 },
  { week: 4, maxStrongholds: 4, maxFortresses: 4 },
  { week: 5, maxStrongholds: 4, maxFortresses: 5 },
  { week: 6, maxStrongholds: 4, maxFortresses: 6 },
  { week: 7, maxStrongholds: 4, maxFortresses: 7 },
  { week: 8, maxStrongholds: 4, maxFortresses: 7 },
];

export interface FortressRewardKind {
  name: string;
  description: string;
}

export const FORTRESS_REWARD_KINDS: FortressRewardKind[] = [
  {
    name: 'First-occupation reward',
    description: 'One-time payout to the first alliance to clear the building’s defending mercenaries and enter it.',
  },
  {
    name: 'Control reward',
    description: `Paid to every member of whichever alliance holds the building when its 2-hour weekly battle phase ends (needs ${CAPTURE_HOLD_MINUTES} continuous minutes held to count).`,
  },
  {
    name: 'Season-end ranking reward',
    description:
      `Based on an alliance’s total accumulated points across all 8 weeks (Stronghold = ${STRONGHOLD_POINTS}pts, Fortress = ${FORTRESS_POINTS}pt) versus every other alliance in the state — higher point totals and finishing position both add gems, speedups, Fire Crystals, hero shards and exclusive avatar frames.`,
  },
];
