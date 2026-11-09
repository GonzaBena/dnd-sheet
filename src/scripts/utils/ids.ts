// src/scripts/utils/ids.ts

export function slugify(value: string | undefined, fallback: string): string {
  return (value || fallback)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

export function generateCharacterSyncId(name?: string): string {
  const rand = Math.random().toString(36).substring(2, 6);
  return `${slugify(name, 'personaje')}-${rand}`;
}

// Sin caracteres ambiguos (0/O, 1/I/L) para que se pueda dictar en la mesa.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 7): string {
  let code = '';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return code;
}

export function normalizeInviteCode(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
