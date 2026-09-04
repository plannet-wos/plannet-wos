import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../../core/services/auth.service';
import { NapService } from '../../../core/services/nap.service';
import { RANK } from '../../../core/constants/roles';
import { NapVote } from '../../../core/models/nap-vote.model';
import { NapVoteCardComponent } from '../nap-vote-card/nap-vote-card';

/**
 * The public NAP archive — "the decisions the NAP made", per this app's brief. Deliberately
 * unguarded (no canActivate): reachable by anyone, signed in or not, same as the alliance-wiki
 * / SvS-assignment public pages elsewhere in this suite. Signed-in state_admin+ additionally
 * gets the hidden-votes section with unhide/delete controls (nap-vote-card handles the actual
 * gating — this page just decides which lists to render).
 */
@Component({
  selector: 'app-nap-archive',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatToolbarModule, NapVoteCardComponent],
  templateUrl: './nap-archive.html',
  styleUrl: './nap-archive.scss',
})
export class NapArchiveComponent {
  private auth = inject(AuthService);
  private nap = inject(NapService);
  private router = inject(Router);

  readonly stateId = inject(ActivatedRoute).snapshot.paramMap.get('stateId')!;
  readonly isAuthenticated = this.auth.isAuthenticated;

  readonly canManage = computed(() => {
    const account = this.auth.account();
    if (!account || !this.auth.isActive()) return false;
    return account.rank <= RANK.STATE_ADMIN && (account.rank === RANK.SUPERADMIN || account.stateId === this.stateId);
  });

  private readonly nowMs = signal(Date.now());
  constructor() {
    setInterval(() => this.nowMs.set(Date.now()), 30_000);
  }

  private readonly allVotes = toSignal(this.nap.listForState$(this.stateId), { initialValue: [] as NapVote[] });

  readonly archivedVotes = computed(() =>
    this.allVotes()
      .filter((v) => !v.hidden && v.deadline <= this.nowMs())
      .sort((a, b) => b.deadline - a.deadline),
  );

  readonly hiddenVotes = computed(() =>
    this.allVotes()
      .filter((v) => v.hidden)
      .sort((a, b) => b.createdAt - a.createdAt),
  );

  goToNap(): void {
    this.router.navigate(['/', this.stateId, 'nap']);
  }
}
