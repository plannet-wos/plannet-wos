import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../core/services/auth.service';
import { NapService } from '../../core/services/nap.service';
import { RANK } from '../../core/constants/roles';
import { ChoiceMode, NapVote, VoteScope } from '../../core/models/nap-vote.model';
import { EmojiPickerComponent } from '../../shared/emoji-picker/emoji-picker';
import { NapVoteCardComponent } from './nap-vote-card/nap-vote-card';

@Component({
  selector: 'app-nap',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSnackBarModule,
    MatToolbarModule,
    EmojiPickerComponent,
    NapVoteCardComponent,
  ],
  templateUrl: './nap.html',
  styleUrl: './nap.scss',
})
export class NapComponent {
  private auth = inject(AuthService);
  private nap = inject(NapService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  readonly RANK = RANK;
  readonly stateId = inject(ActivatedRoute).snapshot.paramMap.get('stateId')!;
  readonly account = this.auth.account;

  readonly canCreate = computed(() => {
    const account = this.account();
    if (!account || !this.auth.isActive()) return false;
    return account.rank <= RANK.R5 && (account.rank === RANK.SUPERADMIN || account.stateId === this.stateId);
  });

  readonly canManage = computed(() => {
    const account = this.account();
    if (!account || !this.auth.isActive()) return false;
    return account.rank <= RANK.STATE_ADMIN && (account.rank === RANK.SUPERADMIN || account.stateId === this.stateId);
  });

  // Ticks every 30s so "active" re-derives on its own as deadlines pass, same as
  // nap-vote-card's own clock — see that component's doc comment.
  private readonly nowMs = signal(Date.now());
  constructor() {
    setInterval(() => this.nowMs.set(Date.now()), 30_000);
  }

  private readonly allVotes = toSignal(this.nap.listForState$(this.stateId), { initialValue: [] as NapVote[] });

  readonly activeVotes = computed(() =>
    this.allVotes()
      .filter((v) => !v.hidden && v.deadline > this.nowMs())
      .sort((a, b) => a.deadline - b.deadline),
  );

  readonly hiddenVotes = computed(() =>
    this.allVotes()
      .filter((v) => v.hidden)
      .sort((a, b) => b.createdAt - a.createdAt),
  );

  // --- create-vote form (template-driven, same idiom as state-admin.ts) ---
  showCreateForm = signal(false);
  newQuestion = '';
  newOptions: string[] = ['', ''];
  newChoiceMode: ChoiceMode = 'single';
  newVoteScope: VoteScope = 'r5_only';
  newDeadlineLocal = '';
  creating = signal(false);

  addOption(): void {
    if (this.newOptions.length < 20) this.newOptions.push('');
  }

  removeOption(index: number): void {
    if (this.newOptions.length > 2) this.newOptions.splice(index, 1);
  }

  insertEmojiIntoQuestion(emoji: string): void {
    this.newQuestion += emoji;
  }

  insertEmojiIntoOption(index: number, emoji: string): void {
    this.newOptions[index] += emoji;
  }

  canSubmitCreate(): boolean {
    const options = this.newOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    return this.newQuestion.trim().length > 0 && options.length >= 2 && !!this.newDeadlineLocal;
  }

  async createVote(): Promise<void> {
    const account = this.account();
    if (!account || !this.canSubmitCreate()) return;
    const deadline = new Date(this.newDeadlineLocal).getTime();
    if (Number.isNaN(deadline) || deadline <= Date.now()) {
      this.snackBar.open('Pick a deadline in the future', '', { duration: 3000 });
      return;
    }
    this.creating.set(true);
    try {
      await this.nap.create({
        stateId: this.stateId,
        question: this.newQuestion.trim(),
        optionTexts: this.newOptions.map((o) => o.trim()).filter((o) => o.length > 0),
        choiceMode: this.newChoiceMode,
        voteScope: this.newVoteScope,
        deadline,
        createdBy: account.uid,
        createdByEmail: account.email,
      });
      this.snackBar.open('Vote created', '', { duration: 2500 });
      this.newQuestion = '';
      this.newOptions = ['', ''];
      this.newChoiceMode = 'single';
      this.newVoteScope = 'r5_only';
      this.newDeadlineLocal = '';
      this.showCreateForm.set(false);
    } catch (err) {
      this.snackBar.open((err as Error).message, '', { duration: 3000 });
    } finally {
      this.creating.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
