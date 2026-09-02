import { Component, inject, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth.service';
import { StatesService } from '../../core/services/states.service';
import { RANK } from '../../core/constants/roles';
import { environment } from '../../../environments/environment';

interface AppTile {
  name: string;
  description: string;
  /** Material icon name — ignored when `logo` is set. */
  icon: string;
  url: string;
  color: string;
  /** Optional app-specific logo image, shown instead of `icon` when present. */
  logo?: string;
  /** True for apps that live behind state selection — their URL gets `/{stateId}` appended. */
  stateScoped: boolean;
}

const APPS: AppTile[] = [
  {
    name: 'Foundry Planner',
    description: 'Organize alliance Foundry Battle strategies, sign-ups, and battle plans',
    icon: 'construction',
    url: environment.sisterApps.foundryPlanner,
    color: '#ef6c00',
    stateScoped: true,
  },
  {
    name: 'SvS Preparation',
    description: 'Sign up your availability and speedups ahead of the Survivor vs Survivor battle',
    icon: 'military_tech',
    logo: 'svs-prep-logo.png',
    url: environment.sisterApps.svsPrep,
    color: '#8e0000',
    stateScoped: true,
  },
  {
    name: 'Alliance Wiki',
    description: 'Shared knowledge base for alliance guides, tips, and resources',
    icon: 'menu_book',
    url: environment.sisterApps.allianceWiki,
    color: '#2e7d32',
    stateScoped: true,
  },
  {
    name: 'Battle Calculator',
    description: 'Scan gear, heroes, and stats to simulate battle outcomes',
    icon: 'calculate',
    url: 'https://wos-battle-calculator.web.app',
    color: '#1565c0',
    stateScoped: false,
  },
  {
    name: 'Furnace Calculator',
    description: 'Plan your FC5 → FC8 upgrade path with optimal refinement strategies',
    icon: 'local_fire_department',
    url: 'https://furnace-calculator.web.app',
    color: '#e65100',
    stateScoped: false,
  },
];

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  private auth = inject(AuthService);
  private statesService = inject(StatesService);
  private router = inject(Router);

  readonly isLoggedIn = this.auth.isAuthenticated;
  readonly account = this.auth.account;
  readonly isSuperAdmin = computed(() => this.auth.rank() === RANK.SUPERADMIN);
  readonly isStateAdminOrR5 = computed(() => {
    const rank = this.auth.rank();
    return rank !== null && rank <= RANK.R5 && this.auth.isActive();
  });
  // state_admin/R5 are tied to their own account.stateId. Superadmin isn't tied to any
  // state (their account has no stateId at all — that's why the button silently did
  // nothing for a superadmin before this fix) but can administer any state per the
  // stateScopedGuard bypass, so fall back to whichever state is currently picked here.
  readonly myAdminStateId = computed(() => this.account()?.stateId ?? this.selectedStateId());

  readonly apps = APPS;
  readonly globalApps = APPS.filter((a) => !a.stateScoped);
  readonly stateApps = APPS.filter((a) => a.stateScoped);

  readonly states = toSignal(this.statesService.list$(), { initialValue: [] });
  readonly selectedStateId = this.statesService.selectedStateId;
  readonly manualStateEntry = signal('');

  selectState(stateId: string): void {
    this.statesService.selectState(stateId);
  }

  confirmManualState(): void {
    const id = this.manualStateEntry().trim();
    if (id) this.selectState(id);
    this.manualStateEntry.set('');
  }

  changeState(): void {
    this.statesService.clearSelection();
  }

  openApp(app: AppTile): void {
    if (app.stateScoped) {
      const stateId = this.selectedStateId();
      if (!stateId) return; // picker is shown instead — see dashboard.html
      window.open(`${app.url}/${stateId}`, '_self');
    } else {
      window.open(app.url, '_self');
    }
  }

  goToStateAdmin(): void {
    const stateId = this.myAdminStateId();
    if (stateId) this.router.navigate([stateId, 'admin']);
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  goToSuperadmin(): void {
    this.router.navigate(['/superadmin']);
  }

  logout(): void {
    this.auth.logout();
  }
}
