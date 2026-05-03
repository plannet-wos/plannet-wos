import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superadminGuard } from './core/guards/superadmin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent),
  },
  {
    path: 'superadmin',
    loadComponent: () => import('./features/superadmin/superadmin').then(m => m.SuperadminComponent),
    canActivate: [superadminGuard],
  },
  { path: '**', redirectTo: 'dashboard' },
];
