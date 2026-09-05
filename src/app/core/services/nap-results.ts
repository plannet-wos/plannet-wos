import { RANK } from '../constants/roles';
import { NapBallot, NapVote, NapVoteOption } from '../models/nap-vote.model';

export interface NapOptionTally {
  option: NapVoteOption;
  /** For 'r5_only' votes: raw ballot count. For 'alliance' votes: number of alliances where this option won that alliance's own majority — more than half of THAT alliance's own ballots, or exactly half with the alliance's R5 breaking the tie in its favor (see tallyNapVote() below). */
  votes: number;
}

export interface NapTally {
  options: NapOptionTally[];
  /** Total ballots cast (raw people, regardless of voteScope). */
  ballotCount: number;
  /** For 'alliance' votes: how many distinct alliances are represented among the ballots — the real denominator for "majority of the state's alliances", since that's what 'votes' above counts against. Equals ballotCount for 'r5_only' (one alliance per R5). */
  allianceCount: number;
  /** Option id(s) currently in the lead — ties list more than one. Empty until at least one ballot exists. */
  leadingOptionIds: string[];
}

/**
 * Tallies a vote's ballots per its voteScope setting:
 *  - 'r5_only': one ballot == one vote, summed directly per option.
 *  - 'alliance': every alliance gets exactly ONE vote per option, decided independently per
 *    option — an option counts as that alliance's pick only if MORE THAN HALF of that alliance's
 *    own cast ballots included it, or exactly half with the alliance's R5 breaking the tie (see
 *    below) — not "whichever option got the most picks": a plain plurality winner could reflect
 *    a minority of the alliance, e.g. 2 of 5 members picking the same thing while the other 3
 *    are split three ways. No option reaching a real majority (or winning the tie-break) means
 *    that alliance contributes to none this round, rather than crediting a non-majority leader
 *    by default.
 * Because the threshold is checked per option independently, a multiple-choice vote can have an
 * alliance back more than one option at once (each clearing its own >50% bar off that alliance's
 * ballot count) — that's intentional, not a tie: e.g. 4 of an alliance's admins vote, 3 check
 * option A and all 4 check option B too; both options clear "more than half of 4", so that
 * alliance counts toward BOTH A and B, not just B.
 *
 * An option landing at EXACTLY half (only possible when the alliance cast an even number of
 * ballots) doesn't default to a denial — the alliance's own R5 breaks the tie: if any ballot
 * from an R5-equivalent voter (real R5, rank 2 — or a state_admin/superadmin self-tagged as
 * leading this alliance, same "R5 in substance" standing 'r5_only' scope already grants
 * elsewhere in NAP) included that option, the tie resolves in favor; otherwise it's denied like
 * any other non-majority option. (An alliance with more than one such R5-equivalent voter — see
 * "multiple accounts sharing a rank+scope" — breaks the tie if ANY of them backed the option,
 * not all of them; flag if you want different handling for that edge case.)
 */
export function tallyNapVote(vote: Pick<NapVote, 'options' | 'voteScope'>, ballots: NapBallot[]): NapTally {
  const counts = new Map(vote.options.map((o) => [o.id, 0]));

  if (vote.voteScope === 'r5_only') {
    for (const ballot of ballots) {
      for (const sel of ballot.selections) {
        if (counts.has(sel)) counts.set(sel, counts.get(sel)! + 1);
      }
    }
  } else {
    const byAlliance = new Map<string, NapBallot[]>();
    for (const ballot of ballots) {
      const members = byAlliance.get(ballot.allianceId);
      if (members) members.push(ballot);
      else byAlliance.set(ballot.allianceId, [ballot]);
    }
    for (const members of byAlliance.values()) {
      const perOption = new Map(vote.options.map((o) => [o.id, 0]));
      for (const ballot of members) {
        for (const sel of ballot.selections) {
          if (perOption.has(sel)) perOption.set(sel, perOption.get(sel)! + 1);
        }
      }
      const majorityThreshold = members.length / 2;
      const r5Ballots = members.filter((b) => b.rank <= RANK.R5);
      for (const [optionId, c] of perOption) {
        const isTie = c === majorityThreshold;
        const tieBrokenInFavor = isTie && r5Ballots.some((b) => b.selections.includes(optionId));
        if (c > majorityThreshold || tieBrokenInFavor) counts.set(optionId, counts.get(optionId)! + 1);
      }
    }
    return {
      options: vote.options.map((o) => ({ option: o, votes: counts.get(o.id) ?? 0 })),
      ballotCount: ballots.length,
      allianceCount: byAlliance.size,
      leadingOptionIds: leadingIds(counts),
    };
  }

  return {
    options: vote.options.map((o) => ({ option: o, votes: counts.get(o.id) ?? 0 })),
    ballotCount: ballots.length,
    allianceCount: ballots.length,
    leadingOptionIds: leadingIds(counts),
  };
}

function leadingIds(counts: Map<string, number>): string[] {
  const max = Math.max(0, ...counts.values());
  if (max <= 0) return [];
  return [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
}
