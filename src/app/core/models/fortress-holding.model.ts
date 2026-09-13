/**
 * This state's Fortress board: 4 Strongholds (numbered 1-4) and 12 Fortresses (numbered 1-12).
 * Unlike the in-game Fortress Battle event itself, this state doesn't fight over them — who
 * holds each building is decided by a NAP vote instead, and there's no points/ranking angle to
 * track. This app is just the shared, always-current record of that outcome, kept accurate by
 * the state's own state_admin(s) so the rest of the state doesn't have to ask around.
 *
 * One doc per building per state, doc ID `${stateId}-${kind}-${number}` (same composite-id
 * spirit as alliances' `${stateId}-${slug}` — see alliance.model.ts). Two independent things
 * live on each doc:
 *  - `allianceId` — who the NAP vote assigned this building to. The same composite alliance ID
 *    `alliances/{id}` uses, so a viewer can look up the holder's name/tag with a single (already
 *    public) alliances read rather than this doc denormalizing it and risking drift after a
 *    rename.
 *  - `rewardLabel` — the control reward this building currently pays out while held. Per the
 *    state: a Fortress's reward is fixed for the whole 8-week season, while a Stronghold's can
 *    change mid-season, but both are just plain admin-editable fields here — nothing in the
 *    software needs to enforce that difference, it's just how often each tends to get touched.
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
  rewardLabel: string | null;
  updatedAt: number;
  updatedBy: string; // uid of the state_admin/superadmin who last set it
}

export function fortressHoldingId(stateId: string, kind: FortressKind, number: number): string {
  return `${stateId}-${kind}-${number}`;
}
