/**
 * This state's Fortress board: 4 Strongholds (numbered 1-4) and 12 Fortresses (numbered 1-12).
 * Unlike the in-game Fortress Battle event itself, this state doesn't fight over them — who
 * holds each building is decided by a NAP vote instead. This app is just the shared,
 * always-current record of that outcome, kept accurate by the state's own state_admin(s) so the
 * rest of the state doesn't have to ask around. The reward each building pays out while held is
 * NOT stored here — it's fully determined by the fixed per-phase schedule in
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
 * One doc per state (doc ID == stateId) holding just which phase (1-8) of the fixed 8-phase
 * reward schedule the state is currently in — different states can be at different points in
 * their own season, so this isn't a global constant. State_admin-editable, same as the holdings
 * board; everything else about "what does phase N pay out" lives in fortress-rewards.ts, not
 * here.
 */
export interface FortressSettings {
  stateId: string;
  currentPhase: number; // 1-8
  updatedAt: number;
  updatedBy: string;
}
