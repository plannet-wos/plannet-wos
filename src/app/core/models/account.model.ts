export interface Account {
  id: string;
  username: string;
  password: string;
  allianceId: string;
  role: 'admin';
}

export interface AdminSession {
  role: 'superadmin' | 'admin';
  allianceId?: string;
  username: string;
}

export interface Alliance {
  id: string;
  name: string;
  server?: string;
}

export interface FeedbackItem {
  id: string;
  app: string;
  message: string;
  username?: string;
  allianceId?: string;
  createdAt: number;
}
