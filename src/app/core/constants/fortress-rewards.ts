/**
 * This state doesn't fight over Fortresses/Strongholds — NAP votes decide who gets which one
 * (see fortress-holding.model.ts) — but the CONTROL reward each building pays out while held
 * follows a known, fixed 8-phase rotation, identical every season. Provided directly by the
 * state (not scraped from a guide — see git history for the earlier, more hedged attempt at
 * this before the real table was on hand), transcribed verbatim below: a Fortress's reward
 * rotation is fixed for the whole season, a Stronghold's can be revised between seasons, but
 * within one season both just follow this same fixed per-phase table.
 *
 * `icon` is the in-game item icon (provided directly, saved under public/fortress/ — see
 * README's Firebase config section for why checked-in image assets are fine here) for the
 * rewards that have one; the rest fall back to a plain color chip. Colors are a scanning aid
 * only, never the sole way a reward is identified — every place a reward shows up also prints
 * its label — so unlike a real chart's series colors these don't need to individually clear
 * color-vision-deficiency separation for every pair; the color-only set reuses plannet-wos's
 * validated categorical hues (one reward key per hue, fixed mapping, never reassigned).
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
  | 'fire_crystal';

export interface RewardInfo {
  label: string;
  color: string;
  /** Path under public/ to this reward's in-game icon, when we have one — see fortress.html's fallback-to-color-chip rendering for rewards without one. */
  icon?: string;
}

export const REWARD_INFO: Record<RewardKey, RewardInfo> = {
  shards: { label: 'Shards', color: '#2a78d6', icon: 'fortress/shards.jpg' },
  health: { label: 'Health', color: '#e87ba4' },
  speeds: { label: 'Speeds', color: '#1baf7a', icon: 'fortress/speeds.jpg' },
  adv_teleport: { label: 'Adv. Teleport', color: '#4a3aa7', icon: 'fortress/teleport.png' },
  wild_mark: { label: 'Wild Mark', color: '#eda100', icon: 'fortress/wild-mark.png' },
  lethality: { label: 'Lethality', color: '#e34948' },
  gear_xp: { label: 'Gear XP', color: '#eb6834', icon: 'fortress/gear-xp.png' },
  deployment: { label: 'Deployment', color: '#008300' },
  pet_chest: { label: 'Pet Chest', color: '#4fb8a8', icon: 'fortress/pet-chest.jpg' },
  hero_gear: { label: 'Hero Gear', color: '#c9a227', icon: 'fortress/hero-gear.jpg' },
  fire_crystal: { label: 'Fire Crystal', color: '#b5651d', icon: 'fortress/fire-crystal.png' },
};

export const PHASE_COUNT = 8;

/** Each phase is exactly one week, Saturday through Friday (the battle day), UTC. */
const PHASE_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Default "phase 1 started" anchor: Saturday 2026-09-05T00:00:00Z, confirmed against the state
 * being at phase 2 on Sunday 2026-09-13 (see fortress-holding.model.ts's FortressSettings doc
 * comment). Only used until a state sets its own `phase1StartAt` in fortress_settings — a state
 * whose Fortress calendar started on a different Saturday can override it there.
 */
export const DEFAULT_PHASE1_START_MS = Date.UTC(2026, 8, 5); // month is 0-indexed: 8 = September

export interface PhaseInfo {
  phase: number; // 1-8
  phaseStartAt: number; // epoch ms, this phase's Saturday 00:00 UTC
  phaseEndAt: number; // epoch ms, this phase's Friday 23:59:59.999 UTC — the battle day
}

/**
 * Which phase (1-8) is live right now, purely a function of the calendar — no admin has to flip
 * it week to week. Phases repeat forever in an 8-week loop from `phase1StartAt` (the same fixed
 * reward schedule just starts over), and the boundary is UTC midnight Saturday, so this only
 * needs the anchor and the current time, not any stored "which phase are we on" state.
 * `now` defaults to `Date.now()` but takes an override for testing.
 */
export function currentPhaseInfo(phase1StartAt: number, now: number = Date.now()): PhaseInfo {
  const weeksElapsed = Math.floor((now - phase1StartAt) / PHASE_LENGTH_MS);
  // JS '%' can return negative for a negative dividend (now before the anchor) — the second '%
  // PHASE_COUNT' pulls that back into [0, PHASE_COUNT) instead of [-PHASE_COUNT, PHASE_COUNT).
  const phaseIndex = (((weeksElapsed % PHASE_COUNT) + PHASE_COUNT) % PHASE_COUNT);
  const phaseStartAt = phase1StartAt + weeksElapsed * PHASE_LENGTH_MS;
  return { phase: phaseIndex + 1, phaseStartAt, phaseEndAt: phaseStartAt + PHASE_LENGTH_MS - 1 };
}

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

/**
 * Same shape as above, keyed by Stronghold number 1-4. Stronghold 1's phases 4 and 8 were
 * originally (mis)transcribed as a nonexistent "LW shards" reward — confirmed with the state to
 * just be 'shards', same as that row's phases 1 and 5.
 */
export const STRONGHOLD_REWARD_SCHEDULE: Record<number, RewardKey[]> = {
  1: ['shards', 'pet_chest', 'hero_gear', 'shards', 'shards', 'pet_chest', 'hero_gear', 'shards'],
  2: ['fire_crystal', 'shards', 'pet_chest', 'fire_crystal', 'fire_crystal', 'shards', 'pet_chest', 'fire_crystal'],
  3: ['hero_gear', 'fire_crystal', 'shards', 'pet_chest', 'hero_gear', 'fire_crystal', 'fire_crystal', 'pet_chest'],
  4: ['pet_chest', 'hero_gear', 'fire_crystal', 'shards', 'pet_chest', 'hero_gear', 'shards', 'shards'],
};

export function rewardForPhase(kind: 'stronghold' | 'fortress', number: number, phase: number): RewardKey | undefined {
  const schedule = kind === 'stronghold' ? STRONGHOLD_REWARD_SCHEDULE : FORTRESS_REWARD_SCHEDULE;
  return schedule[number]?.[phase - 1];
}
