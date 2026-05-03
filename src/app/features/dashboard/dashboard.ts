import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../core/services/auth.service';

interface AppTile {
  name: string;
  description: string;
  icon: string;
  url: string;
  color: string;
}

const APPS: AppTile[] = [
  {
    name: 'Foundry Planner',
    description: 'Organize alliance Foundry Battle strategies, sign-ups, and battle plans',
    icon: 'construction',
    url: 'https://foundry-planner.web.app',
    color: '#ef6c00',
  },
  {
    name: 'Battle Calculator',
    description: 'Scan gear, heroes, and stats to simulate battle outcomes',
    icon: 'calculate',
    url: 'https://wos-battle-calculator.web.app',
    color: '#1565c0',
  },
  {
    name: 'Alliance Wiki',
    description: 'Shared knowledge base for alliance guides, tips, and resources',
    icon: 'menu_book',
    url: 'https://alliance-wiki.web.app',
    color: '#2e7d32',
  },
  {
    name: 'Furnace Calculator',
    description: 'Plan your FC5 → FC8 upgrade path with optimal refinement strategies',
    icon: 'local_fire_department',
    url: 'https://furnace-calculator.web.app',
    color: '#e65100',
  },
];

@Component({
  selector: 'app-dashboard',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatMenuModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly session = this.auth.session;
  readonly isLoggedIn = this.auth.isAuthenticated;
  readonly isSuperAdmin = this.auth.isSuperAdmin;
  readonly apps = APPS;

  openApp(app: AppTile) {
    const s = this.session();
    if (s) {
      const token = btoa(JSON.stringify(s));
      window.open(`${app.url}?token=${encodeURIComponent(token)}`, '_self');
    } else {
      window.open(app.url, '_self');
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToSuperadmin() {
    this.router.navigate(['/superadmin']);
  }

  logout() {
    this.auth.logout();
  }
}
