/**
 * Fortress Battles is a global Whiteout Survival mechanic (identical rules in every state):
 * each state's world map carries 4 Strongholds (numbered 1-4, worth 2 points each) and 12
 * Fortresses (numbered 1-12, worth 1 point each) that alliances fight over during the weekly
 * battle phase. This app doesn't referee the fight — it's just a shared, always-current board
 * of "who holds what right now", kept accurate by each state's own state_admin(s) so the rest
 * of the state doesn't have to ask around or trust a screenshot in Discord.
 *
 * One doc per building per state, doc ID `${stateId}-${kind}-${number}` (same composite-id
 * spirit as alliances' `${stateId}-${slug}` — see alliance.model.ts). `allianceId` is `null`
 * while unclaimed; it's the same composite alliance ID `alliances/{id}` uses, so a viewer can
 * look up the holder's name/tag with a single alliances read (already public, see
 * firestore.rules) rather than this doc denormalizing alliance name/tag itself and risking
 * drift after a rename.
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
