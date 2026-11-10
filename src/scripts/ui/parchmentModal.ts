// src/scripts/ui/parchmentModal.ts
// Función centralizada para invocar la animación del Sobre y Papiro Épico.
// Devuelve una Promise<boolean> que se resuelve cuando el usuario cierra o acepta el pergamino.
//
// Ejemplo de uso básico:
//   await showParchment({
//     title: "Mensaje Real",
//     sender: "Lord Neverember",
//     message: "Reúnanse en el castillo al amanecer.",
//     date: "Neverwinter"
//   });
//
// Con objetos/recompensas adjuntas:
//   await showParchment({
//     title: "Botín de la Guarida",
//     sender: "Dungeon Master",
//     message: "Entre los escombros encuentran un cofre con los siguientes pertrechos:",
//     items: [
//       { name: "Poción de Curación Mayor", quantity: 2, icon: "science", rarity: "uncommon" },
//       { name: "Llave de Cripta Grabada", icon: "key", rarity: "rare" },
//       { name: "Bolsa de 150 PO", icon: "monetization_on", rarity: "common" }
//     ],
//     buttonText: "Reclamar Botín"
//   });

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary';

export interface ParchmentItem {
  name: string;
  quantity?: number;
  icon?: string; // Material Symbol o texto
  rarity?: ItemRarity;
  description?: string;
}

export interface ParchmentOptions {
  title?: string;
  sender?: string;
  date?: string;
  /** Puede ir vacío (p. ej. handout de imagen sin pie). */
  message: string;
  /** Imagen https opcional mostrada sobre el texto. */
  imageUrl?: string;
  items?: ParchmentItem[];
  buttonText?: string;
  onClose?: () => void;
}

/**
 * Abre el sobre interactivo con animación 3D y desenrollado de papiro.
 * Devuelve una Promise que se resuelve (true) cuando el jugador pulsa "Guardar" o cierra el papiro.
 */
export function showParchment(options: ParchmentOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const handleClose = () => {
      if (options.onClose) options.onClose();
      resolve(true);
    };

    if (window.dndEnvelope) {
      const opened = window.dndEnvelope.open({
        ...options,
        onClose: handleClose,
      });
      // Sobre ocupado (ya hay uno abierto): no se abrió, así que no habrá onClose.
      if (!opened) resolve(false);
      return;
    }

    // Respaldo mediante evento personalizado
    const onEventClose = () => {
      window.removeEventListener('dnd:envelope-closed', onEventClose);
      handleClose();
    };

    window.addEventListener('dnd:envelope-closed', onEventClose, { once: true });
    window.dispatchEvent(new CustomEvent('dnd:open-envelope', {
      detail: {
        ...options,
        onClose: handleClose,
      }
    }));
  });
}

/**
 * Cierra manualmente el papiro si estuviese abierto.
 */
export function closeParchment(): void {
  if (typeof window === 'undefined') return;
  if (window.dndEnvelope) {
    window.dndEnvelope.close();
  } else {
    window.dispatchEvent(new CustomEvent('dnd:close-envelope'));
  }
}
