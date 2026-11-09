// src/scripts/vtt/conditions.ts
// Las 15 condiciones estándar de D&D 5e con sus identificadores en inglés y etiquetas en español.

export interface ConditionInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const DND_CONDITIONS: ConditionInfo[] = [
  { id: 'blinded', name: 'Cegado', icon: 'visibility_off', color: 'bg-zinc-700/30 text-zinc-300 border-zinc-600/40' },
  { id: 'charmed', name: 'Hechizado', icon: 'favorite', color: 'bg-pink-900/30 text-pink-300 border-pink-700/40' },
  { id: 'deafened', name: 'Ensordecido', icon: 'hearing_disabled', color: 'bg-slate-700/30 text-slate-300 border-slate-600/40' },
  { id: 'frightened', name: 'Asustado', icon: 'sentiment_very_dissatisfied', color: 'bg-amber-900/30 text-amber-300 border-amber-700/40' },
  { id: 'grappled', name: 'Agarrado', icon: 'sports_kabaddi', color: 'bg-orange-900/30 text-orange-300 border-orange-700/40' },
  { id: 'incapacitated', name: 'Incapacitado', icon: 'block', color: 'bg-red-950/40 text-red-300 border-red-800/40' },
  { id: 'invisible', name: 'Invisible', icon: 'blur_on', color: 'bg-sky-900/30 text-sky-300 border-sky-700/40' },
  { id: 'paralyzed', name: 'Paralizado', icon: 'flash_off', color: 'bg-yellow-950/40 text-yellow-300 border-yellow-700/40' },
  { id: 'petrified', name: 'Petrificado', icon: 'landscape', color: 'bg-stone-800/40 text-stone-300 border-stone-600/40' },
  { id: 'poisoned', name: 'Envenenado', icon: 'coronavirus', color: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/40' },
  { id: 'prone', name: 'Derribado', icon: 'airline_seat_flat', color: 'bg-indigo-950/30 text-indigo-300 border-indigo-700/40' },
  { id: 'restrained', name: 'Restringido', icon: 'lock', color: 'bg-teal-950/30 text-teal-300 border-teal-700/40' },
  { id: 'stunned', name: 'Aturdido', icon: 'psychology', color: 'bg-purple-950/40 text-purple-300 border-purple-700/40' },
  { id: 'unconscious', name: 'Inconsciente', icon: 'bedtime', color: 'bg-rose-950/50 text-rose-300 border-rose-800/50' },
  { id: 'exhaustion', name: 'Agotamiento', icon: 'battery_alert', color: 'bg-neutral-800/40 text-neutral-300 border-neutral-600/40' },
];

export function getConditionInfo(id: string): ConditionInfo {
  return DND_CONDITIONS.find(c => c.id === id) || {
    id,
    name: id,
    icon: 'info',
    color: 'bg-[#18202e] text-[#94a3b8] border-[#222f42]',
  };
}
