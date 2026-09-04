import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NapService } from '../../../core/services/nap.service';
import { NapOptionTally, tallyNapVote } from '../../../core/services/nap-results';
import { RANK } from '../../../core/constants/roles';
import { NapBallot, NapVote } from '../../../core/models/nap-vote.model';

/**
 * A single vote's card — question, options, live tally, and (self-contained, no parent
 * wiring needed) the ballot-casting and hide/delete controls, each gated by the SAME
 * eligibility rules firestore.rules enforces server-side. Used both by the active-votes list
 * (nap.ts) and the public archive (nap-archive.ts) so that logic only lives in one place.
 */
@Component({
  selector: 'app-nap-vote-card',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './nap-vote-card.html',
  styleUrl: './nap-vote-card.scss',
})
export class NapVoteCardComponent {
  vote = input.required<NapVote>();

  private auth = inject(AuthService);
  private nap = inject(NapService);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);

  private readonly voteId = computed(() => this.vote().id);

  private readonly ballots = toSignal(
    toObservable(this.voteId).pipe(switchMap((id) => this.nap.listBallots$(id))),
    { initialValue: [] as NapBallot[] },
  );

  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  private readonly myBallotKey = computed(() => ({ voteId: this.voteId(), uid: this.uid() }));
  readonly myBallot = toSignal(
    toObservable(this.myBallotKey).pipe(
      switchMap(({ voteId, uid }) => (uid ? this.nap.myBallot$(voteId, uid) : of(undefined))),
    ),
    { initialValue: undefined as NapBallot | undefined },
  );

  // A ticking clock so "is this vote still open" re-evaluates on its own as the deadline
  // passes, instead of only updating on the next unrelated change-detection pass or page
  // reload. 30s resolution is plenty for a deadline measured in hours/days.
  private readonly nowMs = signal(Date.now());
  readonly isOpen = computed(() => this.nowMs() < this.vote().deadline);

  readonly tally = computed(() => tallyNapVote(this.vote(), this.ballots()));
  readonly maxVotes = computed(() => Math.max(1, ...this.tally().options.map((o) => o.votes)));

  readonly signedIn = computed(() => this.auth.isAuthenticated());

  readonly canVote = computed(() => {
    const account = this.auth.account();
    if (!account || !this.auth.isActive()) return false;
    const vote = this.vote();
    if (account.stateId !== vote.stateId) return false;
    return vote.voteScope === 'r5_only' ? account.rank === RANK.R5 : !!account.allianceId;
  });

  readonly canManage = computed(() => {
    const account = this.auth.account();
    if (!account || !this.auth.isActive()) return false;
    return account.rank <= RANK.STATE_ADMIN && (account.rank === RANK.SUPERADMIN || account.stateId === this.vote().stateId);
  });

  readonly selected = signal<string[]>([]);
  readonly submitting = signal(false);

  constructor() {
    const intervalId = setInterval(() => this.nowMs.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(intervalId));

    // Seeds the selection from the viewer's own ballot whenever it (first) loads or changes
    // to a different one (e.g. switching accounts) — keyed off votedAt so re-submitting the
    // SAME ballot doesn't clobber choices the viewer is actively making right now.
    let lastKey = '';
    effect(() => {
      const ballot = this.myBallot();
      const key = ballot?.votedAt ? `${ballot.uid}:${ballot.votedAt}` : '';
      if (key !== lastKey) {
        lastKey = key;
        this.selected.set(ballot?.selections ?? []);
      }
    });
  }

  isSingle(): boolean {
    return this.vote().choiceMode === 'single';
  }

  isSelected(optionId: string): boolean {
    return this.selected().includes(optionId);
  }

  selectSingle(optionId: string): void {
    this.selected.set([optionId]);
  }

  toggleMulti(optionId: string, checked: boolean): void {
    const current = this.selected();
    this.selected.set(checked ? [...current, optionId] : current.filter((id) => id !== optionId));
  }

  tallyFor(optionId: string): NapOptionTally | undefined {
    return this.tally().options.find((o) => o.option.id === optionId);
  }

  isLeading(optionId: string): boolean {
    return this.tally().leadingOptionIds.includes(optionId);
  }

  deadlineLabel(): string {
    return new Date(this.vote().deadline).toLocaleString();
  }

  async submit(): Promise<void> {
    const uid = this.uid();
    const account = this.auth.account();
    if (!uid || !account || this.selected().length === 0) return;
    this.submitting.set(true);
    try {
      await this.nap.castBallot({
        voteId: this.voteId(),
        uid,
        email: account.email,
        rank: account.rank,
        allianceId: account.allianceId ?? '',
        selections: this.selected(),
        votedAt: Date.now(),
      });
      this.snackBar.open('Vote recorded', '', { duration: 2000 });
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    } finally {
      this.submitting.set(false);
    }
  }

  async toggleHidden(): Promise<void> {
    await this.nap.setHidden(this.voteId(), !this.vote().hidden);
  }

  async deleteVote(): Promise<void> {
    if (!confirm(`Permanently delete this vote ("${this.vote().question}") and all its ballots? This cannot be undone.`)) return;
    await this.nap.remove(this.voteId());
    this.snackBar.open('Vote deleted', '', { duration: 2000 });
  }
}
