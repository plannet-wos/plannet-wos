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
  { path: '**', redirectTo: 'dashboard' },
];
