/**
 * This state doesn't fight over Fortresses/Strongholds — NAP votes decide who gets which one
 * (see fortress-holding.model.ts) — but the CONTROL reward each building pays out while held
 * follows a known, fixed 8-phase rotation, identical every season. Provided directly by the
 * state (not scraped from a guide — see git history for the earlier, more hedged attempt at
 * this before the real table was on hand), transcribed verbatim below: a Fortress's reward
 * rotation is fixed for the whole season, a Stronghold's can be revised between seasons, but
 * within one season both just follow this same fixed per-phase table.
 *
 * Colors are a scanning aid only, never the sole way a reward is identified — every place a
 * reward shows up also prints its label — so unlike a real chart's series colors these don't
 * need to individually clear color-vision-deficiency separation for every pair; the fortress
 * set below happens to reuse plannet-wos's 8 validated categorical hues 1:1 (one reward key
 * per hue, fixed mapping, never reassigned), and the 4 stronghold-only extras were picked to
 * stay visually distinct from those 8 and from each other.
 */
export type RewardKey =
  | 'shards'
  | 'health'
  | 'speeds'
  | 'adv_teleport'
  | 'wild_mark'
  | 'lethality'
  | 'gear_xp'
  | 'deployment'
  | 'pet_chest'
  | 'hero_gear'
  | 'lw_shards'
  | 'fire_crystal';

export interface RewardInfo {
  label: string;
  color: string;
}

export const REWARD_INFO: Record<RewardKey, RewardInfo> = {
  shards: { label: 'Shards', color: '#2a78d6' },
  health: { label: 'Health', color: '#e87ba4' },
  speeds: { label: 'Speeds', color: '#1baf7a' },
  adv_teleport: { label: 'Adv. Teleport', color: '#4a3aa7' },
  wild_mark: { label: 'Wild Mark', color: '#eda100' },
  lethality: { label: 'Lethality', color: '#e34948' },
  gear_xp: { label: 'Gear XP', color: '#eb6834' },
  deployment: { label: 'Deployment', color: '#008300' },
  pet_chest: { label: 'Pet Chest', color: '#4fb8a8' },
  hero_gear: { label: 'Hero Gear', color: '#c9a227' },
  lw_shards: { label: 'LW Shards', color: '#7d93a6' },
  fire_crystal: { label: 'Fire Crystal', color: '#b5651d' },
};

export const PHASE_COUNT = 8;

/** Reward for each phase (index 0 = phase 1 ... index 7 = phase 8), keyed by Fortress number 1-12. */
export const FORTRESS_REWARD_SCHEDULE: Record<number, RewardKey[]> = {
  1: ['shards', 'health', 'speeds', 'adv_teleport', 'wild_mark', 'health', 'speeds', 'gear_xp'],
  2: ['adv_teleport', 'shards', 'health', 'gear_xp', 'gear_xp', 'wild_mark', 'health', 'speeds'],
  3: ['speeds', 'adv_teleport', 'shards', 'health', 'speeds', 'gear_xp', 'wild_mark', 'health'],
  4: ['health', 'speeds', 'adv_teleport', 'wild_mark', 'adv_teleport', 'speeds', 'gear_xp', 'wild_mark'],
  5: ['shards', 'lethality', 'speeds', 'gear_xp', 'wild_mark', 'lethality', 'speeds', 'gear_xp'],
  6: ['adv_teleport', 'shards', 'lethality', 'speeds', 'gear_xp', 'wild_mark', 'lethality', 'speeds'],
  7: ['speeds', 'adv_teleport', 'shards', 'adv_teleport', 'speeds', 'gear_xp', 'wild_mark', 'lethality'],
  8: ['lethality', 'speeds', 'adv_teleport', 'wild_mark', 'adv_teleport', 'speeds', 'gear_xp', 'wild_mark'],
  9: ['shards', 'deployment', 'speeds', 'gear_xp', 'wild_mark', 'deployment', 'speeds', 'gear_xp'],
  10: ['adv_teleport', 'shards', 'deployment', 'lethality', 'gear_xp', 'wild_mark', 'deployment', 'speeds'],
  11: ['speeds', 'adv_teleport', 'shards', 'wild_mark', 'speeds', 'gear_xp', 'wild_mark', 'deployment'],
  12: ['deployment', 'speeds', 'adv_teleport', 'speeds', 'adv_teleport', 'speeds', 'gear_xp', 'wild_mark'],
};

/** Same shape as above, keyed by Stronghold number 1-4. */
export const STRONGHOLD_REWARD_SCHEDULE: Record<number, RewardKey[]> = {
  1: ['shards', 'pet_chest', 'hero_gear', 'lw_shards', 'shards', 'pet_chest', 'hero_gear', 'lw_shards'],
  2: ['fire_crystal', 'shards', 'pet_chest', 'fire_crystal', 'fire_crystal', 'shards', 'pet_chest', 'fire_crystal'],
  3: ['hero_gear', 'fire_crystal', 'shards', 'pet_chest', 'hero_gear', 'fire_crystal', 'fire_crystal', 'pet_chest'],
  4: ['pet_chest', 'hero_gear', 'fire_crystal', 'shards', 'pet_chest', 'hero_gear', 'shards', 'shards'],
};

export function rewardForPhase(kind: 'stronghold' | 'fortress', number: number, phase: number): RewardKey | undefined {
  const schedule = kind === 'stronghold' ? STRONGHOLD_REWARD_SCHEDULE : FORTRESS_REWARD_SCHEDULE;
  return schedule[number]?.[phase - 1];
}
