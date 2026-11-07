// src/scripts/state/userStore.ts
import type { AppUser } from '../models/user.ts';

const USERS_STORAGE_KEY = 'dnd_users_v1';
const CURRENT_USER_ID_KEY = 'dnd_current_user_id_v1';

export const SEED_USERS: AppUser[] = [
  {
    id: 'user-me',
    name: 'Gonzo (Tú)',
    email: 'gonzo@dnd.local',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
    role: 'dm'
  }
];

export const LEGACY_TEST_USERS: AppUser[] = [
  {
    id: 'user-me',
    name: 'Gonzo (Tú)',
    email: 'gonzo@dnd.local',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
    role: 'dm'
  },
  {
    id: 'user-raven',
    name: 'Lord Raven',
    email: 'raven@barovia.local',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    role: 'dm'
  },
  {
    id: 'user-elena',
    name: 'Elena V.',
    email: 'elena@dnd.local',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    role: 'player'
  },
  {
    id: 'user-marcos',
    name: 'Marcos R.',
    email: 'marcos@dnd.local',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    role: 'player'
  },
  {
    id: 'user-sofia',
    name: 'Sofía M.',
    email: 'sofia@dnd.local',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    role: 'player'
  },
  {
    id: 'user-gundren',
    name: 'Gundren Buscarroca',
    email: 'gundren@phandalin.local',
    avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=200&q=80',
    role: 'dm'
  }
];

class UserStoreManager {
  private users: AppUser[] = [];
  private currentUserId: string = 'user-me';

  constructor() {
    this.users = this.loadUsers();
    this.currentUserId = this.loadCurrentUserId();
  }

  private loadUsers(): AppUser[] {
    if (typeof window === 'undefined') return SEED_USERS;
    try {
      const saved = localStorage.getItem(USERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Keep only user-me
          const onlyMe = parsed.filter(u => u.id === 'user-me');
          if (onlyMe.length > 0) {
            this.persistUsers(onlyMe);
            return onlyMe;
          }
        }
      }
    } catch (e) {
      console.warn('[UserStore] Error loading users', e);
    }
    this.persistUsers(SEED_USERS);
    return SEED_USERS;
  }

  public seedLegacyFixtures() {
    this.persistUsers(LEGACY_TEST_USERS);
    this.currentUserId = 'user-me';
  }

  private loadCurrentUserId(): string {
    if (typeof window === 'undefined') return 'user-me';
    try {
      const saved = localStorage.getItem(CURRENT_USER_ID_KEY);
      if (saved && this.users.some(u => u.id === saved)) return saved;
    } catch (_) {}
    return 'user-me';
  }

  private persistUsers(users: AppUser[]) {
    this.users = users;
    if (typeof window !== 'undefined') {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(this.users));
      window.dispatchEvent(new CustomEvent('users-updated', { detail: { users: this.users } }));
    }
  }

  public getUsers(): AppUser[] {
    return this.users;
  }

  public getUser(id: string): AppUser | undefined {
    return this.users.find(u => u.id === id);
  }

  public getCurrentUser(): AppUser {
    return this.getUser(this.currentUserId) || this.users[0] || SEED_USERS[0];
  }

  public setCurrentUser(userId: string) {
    if (!this.users.some(u => u.id === userId)) return;
    this.currentUserId = userId;
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_USER_ID_KEY, userId);
      window.dispatchEvent(new CustomEvent('current-user-changed', {
        detail: {
          userId,
          user: this.getCurrentUser()
        }
      }));
    }
  }

  public createUser(name: string, email?: string): AppUser {
    const slug = (name || 'usuario')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'usuario';

    const id = `user-${slug}-${Math.random().toString(36).substr(2, 4)}`;
    const newUser: AppUser = {
      id,
      name: name.trim(),
      email: email ? email.trim() : `${slug}@dnd.local`,
      avatarUrl: `https://images.unsplash.com/photo-${1535713875002 + Math.floor(Math.random() * 1000)}?auto=format&fit=crop&w=200&q=80`,
      role: 'player'
    };

    const next = [...this.users, newUser];
    this.persistUsers(next);
    return newUser;
  }
}

export const userStore = new UserStoreManager();
