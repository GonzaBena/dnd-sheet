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
  /** En modo nube el usuario actual es el de Firebase Auth y `users` es un cache de perfiles. */
  private cloudMode = false;

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
          const legacyUsersCleanKey = 'dnd_legacy_users_cleaned_v2';
          if (!localStorage.getItem(legacyUsersCleanKey)) {
            const legacyUserIds = new Set(['user-raven', 'user-elena', 'user-marcos', 'user-sofia', 'user-gundren']);
            let cleaned = parsed.filter((u: any) => !legacyUserIds.has(u.id));
            if (!cleaned.some(u => u.id === 'user-me')) {
              cleaned = [...SEED_USERS, ...cleaned];
            }
            localStorage.setItem(legacyUsersCleanKey, 'true');
            this.persistUsers(cleaned);
            return cleaned;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[UserStore] Error loading users', e);
    }
    return SEED_USERS;
  }

  public seedLegacyFixtures() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dnd_legacy_users_cleaned_v2', 'true');
    }
    this.persistUsers(LEGACY_TEST_USERS);
    this.currentUserId = 'user-me';
  }

  // ---- Modo nube ----

  public isCloudMode(): boolean {
    return this.cloudMode;
  }

  public enterCloudMode(me: AppUser) {
    this.cloudMode = true;
    this.users = [me];
    this.currentUserId = me.id;
    this.notifyUsers();
    this.notifyCurrentUser();
  }

  public exitCloudMode() {
    this.cloudMode = false;
    this.users = this.loadUsers();
    this.currentUserId = this.loadCurrentUserId();
    this.notifyUsers();
    this.notifyCurrentUser();
  }

  /** Perfiles de `users/{uid}` de los miembros de mis campañas. */
  public upsertProfiles(profiles: AppUser[]) {
    if (!this.cloudMode || profiles.length === 0) return;
    const byId = new Map(this.users.map(u => [u.id, u]));
    let changed = false;
    for (const p of profiles) {
      const prev = byId.get(p.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify({ ...prev, ...p })) {
        byId.set(p.id, { ...prev, ...p });
        changed = true;
      }
    }
    if (!changed) return;
    this.users = Array.from(byId.values());
    this.notifyUsers();
    if (profiles.some(p => p.id === this.currentUserId)) this.notifyCurrentUser();
  }

  private notifyUsers() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('users-updated', { detail: { users: this.users } }));
    }
  }

  private notifyCurrentUser() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('current-user-changed', {
        detail: { userId: this.currentUserId, user: this.getCurrentUser() }
      }));
    }
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
    if (typeof window !== 'undefined' && !this.cloudMode) {
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
    if (this.cloudMode) return; // la sesión la define Firebase Auth
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
    if (this.cloudMode) {
      throw new Error('Con cuentas reales los jugadores se suman con el código de invitación de la campaña.');
    }
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
