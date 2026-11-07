// src/scripts/ui/congratulationBanner.ts
import { journalStore } from '../state/journalStore';
import { characterStore } from '../state/characterStore';

export interface CongratulationBannerOptions {
  bannerText?: string;      // Text inside the ribbon (default: "¡FELICIDADES!")
  tag?: string;             // Tag for journal (default: "#Hito")
  saveToJournal?: boolean;  // Automatically save to journal (default: true)
  icon?: string;            // Material icon (default: "military_tech")
  sessionNumber?: number;   // Session number context
  subtitle?: string;        // Small subtitle above title
}

export interface MilestoneEventDetail {
  texto: string;
  desc: string;
  options: CongratulationBannerOptions;
}

/**
 * Displays the celebratory heraldic ribbon alert and optionally records the milestone to the journal.
 * Can be called as: congratulationBanner("¡Nivel 6 Alcanzado!", "Has desbloqueado nuevos hechizos...")
 */
export function congratulationBanner(
  texto: string,
  desc: string,
  options: CongratulationBannerOptions = {}
): void {
  const finalOptions: CongratulationBannerOptions = {
    bannerText: options.bannerText || '¡FELICIDADES!',
    tag: options.tag || '#Hito',
    saveToJournal: options.saveToJournal !== false,
    icon: options.icon || 'military_tech',
    subtitle: options.subtitle || 'Hito de Campaña Conseguido',
    sessionNumber: options.sessionNumber
  };

  // If sessionNumber not provided, fetch current session from characterStore
  if (!finalOptions.sessionNumber && typeof window !== 'undefined') {
    try {
      const char = characterStore.get();
      if (char?.sessionContext?.sessionNumber) {
        finalOptions.sessionNumber = char.sessionContext.sessionNumber;
      }
    } catch (_) {
      finalOptions.sessionNumber = 15;
    }
  }

  // 1. Optionally save to Journal
  if (finalOptions.saveToJournal && typeof window !== 'undefined') {
    try {
      journalStore.addEntry({
        sessionNumber: finalOptions.sessionNumber || 15,
        title: `🏆 Hito: ${texto}`,
        content: desc,
        tags: [finalOptions.tag || '#Hito'],
      });
    } catch (err) {
      console.warn('Could not auto-save milestone to journal:', err);
    }
  }

  // 2. Dispatch event for the MilestoneCelebrationModal component
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<MilestoneEventDetail>('show-milestone-alert', {
        detail: {
          texto,
          desc,
          options: finalOptions
        }
      })
    );
  }
}

// Bind to window so it can be called anywhere (DevTools, client scripts, inline handlers)
if (typeof window !== 'undefined') {
  (window as any).congratulationBanner = congratulationBanner;
}
