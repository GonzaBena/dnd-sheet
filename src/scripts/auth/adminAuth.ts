// src/scripts/auth/adminAuth.ts
// Gestión de permisos y roles de administrador para Crónicas del Aventurero.

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

export const ADMIN_EMAIL: string = (env.PUBLIC_ADMIN_EMAIL || 'elgonzatron@gmail.com').trim().toLowerCase();

/**
 * Determina si un usuario o email tiene privilegios de administrador.
 */
export function isAdmin(userOrEmail: string | { email?: string | null } | null | undefined): boolean {
  if (!userOrEmail) return false;
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email;
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}
