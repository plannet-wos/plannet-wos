import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RANK, Rank } from '../constants/roles';

/** Any signed-in Firebase Auth user, active or still pending — for the TOTP-enrollment step, which happens before approval. */
export const signedInGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() || router.createUrlTree(['/login']);
};

/**
 * Allows activation if the signed-in account is active and its rank is `maxRank` or more
 * powerful (numerically ≤). This is the *feature-permission* threshold, deliberately looser
 * than the strict "editor rank < target rank" rule the accounts collection itself enforces —
 * see roles.ts's header comment for why those two are different rules.
 */
export function minRankGuard(maxRank: Rank): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const rank = auth.rank();
    if (auth.isActive() && rank !== null && rank <= maxRank) return true;
    return router.createUrlTree(['/login']);
  };
}

/** Superadmin only — the one rank with no scope to additionally check. */
export const superadminGuard: CanActivateFn = minRankGuard(RANK.SUPERADMIN);

/** Any active account at all, regardless of rank — replaces the old, unused authGuard. */
export const authGuard: CanActivateFn = minRankGuard(RANK.R4);

/**
 * State-scoped admin surfaces (the `/:stateId/admin` dashboard): rank must be state_admin or
 * R5, AND the account's own stateId must match the route's `:stateId` — except superadmin,
 * who is global and passes any state. This is the same "scope, not just rank" rule the
 * accounts collection itself enforces (see roles.ts), applied client-side for UX; the real
 * enforcement is still Firestore Rules.
 */
export function stateScopedGuard(maxRank: Rank): CanActivateFn {
  return (route) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const account = auth.account();
    const rank = auth.rank();
    const stateId = route.paramMap.get('stateId');

    if (!auth.isActive() || rank === null || account === null) return router.createUrlTree(['/login']);
    if (rank > maxRank) return router.createUrlTree(['/dashboard']);
    if (rank === RANK.SUPERADMIN) return true;
    return account.stateId === stateId || router.createUrlTree(['/dashboard']);
  };
}
