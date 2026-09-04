import { Routes } from '@angular/router';
import { signedInGuard, superadminGuard, stateScopedGuard } from './core/guards/rank.guard';
import { RANK } from './core/constants/roles';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/signup/signup').then((m) => m.SignupComponent),
  },
  {
    path: 'enroll-totp',
    loadComponent: () => import('./features/totp-enroll/totp-enroll').then((m) => m.TotpEnrollComponent),
    canActivate: [signedInGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile').then((m) => m.ProfileComponent),
    canActivate: [signedInGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardComponent),
  },
  {
    path: 'superadmin',
    loadComponent: () => import('./features/superadmin/superadmin').then((m) => m.SuperadminComponent),
    canActivate: [superadminGuard],
  },
  {
    path: ':stateId/admin',
    loadComponent: () => import('./features/state-admin/state-admin').then((m) => m.StateAdminComponent),
    canActivate: [stateScopedGuard(RANK.R5)],
  },
  {
    // Public — no guard. "The decisions the NAP made" are meant to be visible to anyone, see
    // nap-archive.ts's doc comment. Registered separately from ':stateId/nap' below (rather
    // than a child route) since one is guarded and the other deliberately isn't.
    path: ':stateId/nap/archive',
    loadComponent: () => import('./features/nap/archive/nap-archive').then((m) => m.NapArchiveComponent),
  },
  {
    // R4 and up, scoped to their own state (superadmin bypasses) — any admin the NAP council
    // is for, not just state_admin/R5 like the console above.
    path: ':stateId/nap',
    loadComponent: () => import('./features/nap/nap').then((m) => m.NapComponent),
    canActivate: [stateScopedGuard(RANK.R4)],
  },
  { path: '**', redirectTo: 'dashboard' },
];
