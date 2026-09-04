import { Rank } from '../constants/roles';

/**
 * NAP ("Non-Aggression Pact" council) — the state-admins' voting tool. R5 and up create votes;
 * who may CAST a ballot is governed by `voteScope` (see below), enforced both here (UI) and in
 * firestore.rules (the real gate). A vote is "active" while `Date.now() < deadline` and moves
 * into the public archive the moment that flips — there's no separate `status` field to keep in
 * sync with the deadline; every screen just compares `deadline` against the current time, same
 * spirit as svs_forms' submissionsCloseAt.
 */
export type VoteScope = 'r5_only' | 'alliance';
export type ChoiceMode = 'single' | 'multiple';

export interface NapVoteOption {
  id: string;
  text: string;
}

export interface NapVote {
  id: string;
  stateId: string;
  question: string;
  options: NapVoteOption[];
  /** Denormalized `options[].id` list — lets firestore.rules validate a ballot's selections without re-deriving them from `options`. */
  optionIds: string[];
  choiceMode: ChoiceMode;
  voteScope: VoteScope;
  /** Epoch ms after which no more ballots are accepted — the vote then reads as archived everywhere. */
  deadline: number;
  createdBy: string;
  createdByEmail: string;
  createdAt: number;
  /** Soft-hide by state_admin+ — excluded from the active list and the public archive, but not deleted. */
  hidden: boolean;
}

/**
 * One account's ballot — doc ID is `${voteId}_${uid}` in the flat `nap_ballots` collection
 * (same composite-id shape svs_submissions uses for its one-per-round-per-player rows), so
 * casting again overwrites the previous choice — changing your mind before the deadline is
 * allowed, there's no "final answer" lock. `allianceId`/`rank` are denormalized from the
 * voter's own account AT THE TIME OF VOTING (not looked up later) so results stay stable even
 * if someone's later reassigned — and so firestore.rules can check who's allowed to vote
 * without a second lookup.
 */
export interface NapBallot {
  voteId: string;
  uid: string;
  email: string;
  rank: Rank;
  allianceId: string;
  selections: string[];
  votedAt: number;
}
