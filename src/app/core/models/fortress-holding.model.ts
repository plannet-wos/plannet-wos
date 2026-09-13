/**
 * This state's Fortress board: 4 Strongholds (numbered 1-4) and 12 Fortresses (numbered 1-12).
 * How each one gets assigned is entirely up to the state — a NAP vote, actual in-game fighting,
 * some mix, whatever house rules it runs (see FortressSettings.rulesNote below, which is where
 * that process gets described to players) — this app doesn't referee any of it, it's just the
 * shared, always-current record of the outcome, kept accurate by the state's own state_admin(s)
 * so the rest of the state doesn't have to ask around. The reward each building pays out while
 * held is NOT stored here — it's fully determined by the fixed per-phase schedule in
 * core/constants/fortress-rewards.ts plus this state's current phase (see FortressSettings
 * below), so there's nothing to keep in sync.
 *
 * One doc per building per state, doc ID `${stateId}-${kind}-${number}` (same composite-id
 * spirit as alliances' `${stateId}-${slug}` — see alliance.model.ts). `allianceId` is the
 * composite alliance ID `alliances/{id}` uses (or `null` while unclaimed), so a viewer can look
 * up the holder's name/tag with a single (already public) alliances read rather than this doc
 * denormalizing it and risking drift after a rename.
 */
export type FortressKind = 'stronghold' | 'fortress';

export const STRONGHOLD_COUNT = 4;
export const FORTRESS_COUNT = 12;

export interface FortressHolding {
  id: string; // "{stateId}-{kind}-{number}"
  stateId: string;
  kind: FortressKind;
  number: number; // 1-4 for a stronghold, 1-12 for a fortress
  allianceId: string | null;
  updatedAt: number;
  updatedBy: string; // uid of the state_admin/superadmin who last set it
}

export function fortressHoldingId(stateId: string, kind: FortressKind, number: number): string {
  return `${stateId}-${kind}-${number}`;
}

/**
 * One doc per state (doc ID == stateId) holding this state's own Fortress settings.
 *
 * `phase1StartAt` is the one thing needed to compute which phase this state is on: the epoch-ms
 * UTC midnight of the Saturday its current 8-phase cycle began. Everything else is derived — see
 * fortress-rewards.ts's currentPhaseInfo(), which loops forever in 8-phase (8-week) blocks from
 * this anchor, phases always running Saturday through Friday (the battle day) UTC. No admin has
 * to flip a phase number week to week anymore; this only needs to be set once, and only touched
 * again if a state's Fortress calendar ever gets out of sync with the computed value (e.g. it
 * started on a different Saturday than fortress-rewards.ts's DEFAULT_PHASE1_START_MS assumes).
 *
 * `rulesNote` is free text, state_admin-authored: how THIS state decides who gets which building
 * and how often that changes (a NAP vote every phase, open fighting, something else entirely).
 * Deliberately prose rather than a fixed set of options — every state's actual process is a
 * social/political arrangement, not something a handful of enum values could capture without
 * either constraining states to a process that doesn't fit or ballooning into a config schema
 * nobody wants to fill out. Shown verbatim near the top of fortress.html for any viewer; empty
 * until a state_admin sets one.
 */
export interface FortressSettings {
  stateId: string;
  phase1StartAt: number;
  /** Optional (and independently written, see FortressService.setRulesNote()) — absent until a state_admin sets one; fortress.ts treats a missing value the same as ''. */
  rulesNote?: string;
  updatedAt: number;
  updatedBy: string;
}
