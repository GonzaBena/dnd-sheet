// src/scripts/models/user.ts

export interface AppUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role?: 'dm' | 'player';
}
