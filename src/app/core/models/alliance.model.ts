/**
 * Minimal shape of a shared `alliances/{stateId}-{slug}` document — the full model (with
 * foundry-planner-specific fields like finalTime/isCrossAlliance) lives in that repo; this
 * repo only needs enough to list/create/delete alliances from the state-admin dashboard and
 * let signup requests pick one.
 */
export interface Alliance {
  id: string;        // "{stateId}-{slug}", e.g. "3038-eagle"
  stateId: string;
  slug: string;       // the bare, human-readable part used in URLs, e.g. "eagle"
  name: string;
  createdAt: number;
}

export function allianceId(stateId: string, slug: string): string {
  return `${stateId}-${slug}`;
}
