import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { Account, ApproverEntry, allianceRankOf } from '../../core/models/account.model';
import { AccountsService } from '../../core/services/accounts.service';
import { RANK } from '../../core/constants/roles';
import { DisplayNamePipe } from '../display-name.pipe';

/**
 * "Who can approve me?" — shown to a still-pending candidate (totp-enroll's done state, and the
 * dashboard whenever a pending account is signed in), so they know who to ping in-game instead
 * of waiting blind. Mirrors firestore.rules' sameScope() approval hierarchy:
 *   • state_admin request → a superadmin (no list: there's only ever the one, hand-provisioned)
 *   • R5 request → any state_admin of their state
 *   • R4 request → their own alliance's R5 (including a state_admin or superadmin tagged in as its R5, never as its R4),
 *     with the state's other state_admins listed as the escalation path rules also allow
 * Names come from approver_directory (see ApproverEntry's doc comment), never from accounts.
 */
@Component({
  selector: 'app-pending-approvers',
  imports: [DisplayNamePipe],
  templateUrl: './pending-approvers.html',
  styleUrl: './pending-approvers.scss',
})
export class PendingApproversComponent {
  private accounts = inject(AccountsService);

  account = input.required<Account>();

  readonly RANK = RANK;

  private readonly approvers = toSignal(
    toObservable(computed(() => this.account().stateId)).pipe(
      switchMap((stateId) => (stateId ? this.accounts.approversForState$(stateId) : of([]))),
    ),
    { initialValue: [] as ApproverEntry[] },
  );

  /** R4 requests only: whoever leads the candidate's own alliance — a real R5, or a state_admin tagged in as its R5 (one tagged in as its R4 is just listed under stateAdmins). */
  readonly allianceLeaders = computed(() => {
    const allianceId = this.account().allianceId;
    return this.approvers().filter((a) => !!allianceId && a.allianceId === allianceId && allianceRankOf(a) === RANK.R5);
  });

  /** State admins of the candidate's state — the approvers for an R5, the fallback for an R4 (minus anyone already listed as their alliance's leader). */
  readonly stateAdmins = computed(() => {
    const leaders = new Set(this.allianceLeaders().map((a) => a.uid));
    return this.approvers().filter((a) => a.rank === RANK.STATE_ADMIN && !leaders.has(a.uid));
  });
}
