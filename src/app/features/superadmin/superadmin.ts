import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  Firestore, collection, collectionData, doc, setDoc, deleteDoc,
} from '@angular/fire/firestore';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { Account, Alliance, FeedbackItem } from '../../core/models/account.model';

@Component({
  selector: 'app-superadmin',
  imports: [
    FormsModule,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatTabsModule,
    MatDialogModule,
    MatSnackBarModule,
    DatePipe,
  ],
  templateUrl: './superadmin.html',
  styleUrl: './superadmin.scss',
})
export class SuperadminComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  readonly accounts = signal<Account[]>([]);
  readonly alliances = signal<Alliance[]>([]);
  readonly feedback = signal<FeedbackItem[]>([]);

  // New account form
  newUsername = '';
  newPassword = '';
  newAllianceId = '';

  // New alliance form
  newAllianceName = '';
  newAllianceServer = '';

  readonly accountColumns = ['username', 'allianceId', 'actions'];
  readonly allianceColumns = ['name', 'server', 'actions'];
  readonly feedbackColumns = ['app', 'message', 'username', 'date', 'actions'];

  ngOnInit() {
    collectionData(collection(this.firestore, 'accounts'), { idField: 'id' })
      .subscribe(data => this.accounts.set(data as Account[]));

    collectionData(collection(this.firestore, 'alliances'), { idField: 'id' })
      .subscribe(data => this.alliances.set(data as Alliance[]));

    collectionData(collection(this.firestore, 'feedback'), { idField: 'id' })
      .subscribe(data => {
        const sorted = (data as FeedbackItem[]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        this.feedback.set(sorted);
      });
  }

  async addAccount() {
    if (!this.newUsername || !this.newPassword || !this.newAllianceId) return;
    const id = this.newUsername.toLowerCase().replace(/\s/g, '_');
    await setDoc(doc(this.firestore, 'accounts', id), {
      username: this.newUsername,
      password: this.newPassword,
      allianceId: this.newAllianceId,
      role: 'admin',
    });
    this.newUsername = '';
    this.newPassword = '';
    this.newAllianceId = '';
    this.snackBar.open('Account created', '', { duration: 2000 });
  }

  async deleteAccount(account: Account) {
    await deleteDoc(doc(this.firestore, 'accounts', account.id));
    this.snackBar.open('Account deleted', '', { duration: 2000 });
  }

  async addAlliance() {
    if (!this.newAllianceName) return;
    const id = this.newAllianceName.toLowerCase().replace(/\s/g, '_');
    await setDoc(doc(this.firestore, 'alliances', id), {
      name: this.newAllianceName,
      server: this.newAllianceServer || '',
    });
    this.newAllianceName = '';
    this.newAllianceServer = '';
    this.snackBar.open('Alliance created', '', { duration: 2000 });
  }

  async deleteAlliance(alliance: Alliance) {
    await deleteDoc(doc(this.firestore, 'alliances', alliance.id));
    this.snackBar.open('Alliance deleted', '', { duration: 2000 });
  }

  async deleteFeedback(item: FeedbackItem) {
    await deleteDoc(doc(this.firestore, 'feedback', item.id));
    this.snackBar.open('Feedback deleted', '', { duration: 2000 });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
