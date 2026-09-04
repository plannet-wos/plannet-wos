import { NapBallot, NapVote, NapVoteOption } from '../models/nap-vote.model';

export interface NapOptionTally {
  option: NapVoteOption;
  /** For 'r5_only' votes: raw ballot count. For 'alliance' votes: number of alliances whose majority pick landed on this option (see tally() below). */
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
 *  - 'alliance': every alliance gets exactly ONE vote regardless of how many of its members cast
 *    a ballot — that vote goes to whichever option got the most picks from that alliance's own
 *    members (a plain plurality among just that alliance's ballots). A tie within an alliance
 *    splits its one vote across every tied option, same as a tie for the overall lead below.
 * Multiple-choice ballots contribute every option they picked to their alliance's per-option
 * count, so "the alliance's vote" for a multi-select question is just whichever option(s) most
 * of its members included among their picks.
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
      const max = Math.max(...perOption.values());
      if (max <= 0) continue;
      for (const [optionId, c] of perOption) {
        if (c === max) counts.set(optionId, counts.get(optionId)! + 1);
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
