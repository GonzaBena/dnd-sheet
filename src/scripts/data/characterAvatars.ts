// src/scripts/data/characterAvatars.ts

export const CHARACTER_PRESET_IMAGES: readonly string[] = [
  '/characters/ch-1.avif',
  '/characters/ch-2.avif',
  '/characters/ch-3.avif',
  '/characters/ch-4.avif',
  '/characters/ch-5.avif',
] as const;

/**
 * Devuelve de manera aleatoria una imagen de los retratos predeterminados en /characters/.
 */
export function getRandomCharacterAvatar(): string {
  const index = Math.floor(Math.random() * CHARACTER_PRESET_IMAGES.length);
  return CHARACTER_PRESET_IMAGES[index];
}

/**
 * Determina si una URL de avatar es inválida, está rota o pertenece a dominios no disponibles
 * (como las URLs temporales de Google AIDA lh3.googleusercontent.com).
 */
export function isBrokenAvatarUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.includes('lh3.googleusercontent.com/aida/')) return true;
  return false;
}

/**
 * Devuelve una URL de avatar válida. Si la provista está vacía o rota, devuelve una aleatoria.
 */
export function sanitizeAvatarUrl(url?: string | null): string {
  if (isBrokenAvatarUrl(url)) {
    return getRandomCharacterAvatar();
  }
  return url!.trim();
}
