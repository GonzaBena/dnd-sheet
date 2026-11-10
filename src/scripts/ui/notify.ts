// src/scripts/ui/notify.ts
// Reemplazos de window.alert / confirm / prompt con el estilo de la app.
// No bloquean: devuelven promesas, así que el código que dependa de la respuesta usa await.
//
//   await showAlert('Listo', { kind: 'success' });
//   if (!(await showConfirm('¿Eliminar?', { danger: true }))) return;
//   const code = await showPrompt('Código:', { placeholder: 'ABC2345' });        // string | null
//   const v = await showForm([{ name: 'hp', label: 'PG', type: 'number' }]);    // Record | null
//   const dmId = await showChoice('Elegí el DM', [{ value: 'u1', label: 'Ana' }]); // string | null

export type AlertKind = 'success' | 'error' | 'warning' | 'info' | 'question';

export interface AlertOptions {
  kind?: AlertKind;
  title?: string;
  buttonText?: string;
}

export interface ConfirmOptions {
  kind?: AlertKind;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** Botón de confirmar en rojo, para acciones destructivas. */
  danger?: boolean;
}

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'url' | 'email' | 'textarea' | 'checkbox' | 'select';
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  readonly?: boolean;
  min?: number;
  hint?: string;
}

export interface FormOptions {
  kind?: AlertKind;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

export interface PromptOptions extends Omit<FormField, 'name' | 'label'> {
  kind?: AlertKind;
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface ChoiceOptions {
  kind?: AlertKind;
  title?: string;
  cancelText?: string;
}

const KIND_STYLES: Record<AlertKind, { icon: string; title: string; iconClass: string }> = {
  success: {
    icon: 'check_circle',
    title: '¡Hecho!',
    iconClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
  },
  error: {
    icon: 'error',
    title: 'No se pudo completar',
    iconClass: 'bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.25)]',
  },
  warning: {
    icon: 'warning',
    title: 'Atención',
    iconClass: 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
  },
  info: {
    icon: 'info',
    title: 'Aviso',
    iconClass: 'bg-sky-500/15 text-sky-400 border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.25)]',
  },
  question: {
    icon: 'help',
    title: '¿Confirmás?',
    iconClass: 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
  },
};

const BUTTON_CLASSES = {
  primary: 'px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-[#0a0d12] text-xs font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)] hover:brightness-110 active:scale-95 transition-all cursor-pointer',
  danger: 'px-5 py-2 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 text-white text-xs font-bold shadow-[0_0_12px_rgba(244,63,94,0.3)] hover:brightness-110 active:scale-95 transition-all cursor-pointer',
  secondary: 'px-4 py-2 rounded-xl bg-[#121721] border border-[#222f42] text-[#94a3b8] hover:text-[#f1f5f9] text-xs font-bold transition-colors cursor-pointer',
};

const INPUT_CLASS = 'w-full p-2.5 rounded-lg bg-[#18202e] border border-[#222f42] text-[#f1f5f9] text-xs focus:border-amber-500 focus:outline-none read-only:text-amber-300 read-only:select-all';

interface DialogButton {
  label: string;
  value: string;
  variant: keyof typeof BUTTON_CLASSES;
  /** Valida y devuelve los campos del formulario. */
  submit?: boolean;
}

interface DialogSpec {
  kind: AlertKind;
  title?: string;
  message?: string;
  fields?: FormField[];
  choices?: ChoiceOption[];
  buttons: DialogButton[];
  /** Valor al cerrar con Escape o tocando el fondo. */
  dismissValue: string;
  /** Foco inicial en el botón secundario (acciones destructivas). */
  focusCancel?: boolean;
}

interface DialogResult {
  value: string;
  values: Record<string, string>;
}

interface QueuedDialog {
  spec: DialogSpec;
  resolve: (result: DialogResult) => void;
}

const queue: QueuedDialog[] = [];
let showing = false;
let root: HTMLDivElement | null = null;

function ensureRoot(): HTMLDivElement {
  if (root && document.body.contains(root)) return root;
  root = document.createElement('div');
  root.id = 'app-dialog';
  // Por encima de los modales (z-50) y debajo del login y los toasts.
  root.className = 'hidden fixed inset-0 z-[85] items-center justify-center p-4 bg-black/70 backdrop-blur-xs';
  document.body.appendChild(root);
  return root;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // textContent siempre: los textos incluyen nombres que escriben los usuarios.
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildDialog(spec: DialogSpec, finish: (value: string) => void) {
  const style = KIND_STYLES[spec.kind];
  const titleId = 'app-dialog-title';
  const messageId = 'app-dialog-message';

  const card = el('form', 'app-dialog-card w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl bg-[#121721] border border-[#222f42] shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-hidden transition-all duration-150 opacity-0 scale-95');
  card.setAttribute('role', spec.buttons.length > 1 || spec.fields || spec.choices ? 'dialog' : 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', titleId);
  if (spec.message) card.setAttribute('aria-describedby', messageId);
  card.noValidate = true;

  const body = el('div', 'p-5 overflow-y-auto custom-scrollbar space-y-4');
  const header = el('div', 'flex gap-3.5');
  const iconBox = el('div', `w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center ${style.iconClass}`);
  iconBox.appendChild(el('span', 'material-symbols-outlined text-[22px]', style.icon));
  const textBox = el('div', 'min-w-0 space-y-1.5 pt-0.5');
  const title = el('h3', 'font-headline font-bold text-base text-[#f1f5f9]', spec.title || style.title);
  title.id = titleId;
  textBox.appendChild(title);
  if (spec.message) {
    const msg = el('p', 'text-xs font-label text-[#cbd5e1] leading-relaxed whitespace-pre-line break-words', spec.message);
    msg.id = messageId;
    textBox.appendChild(msg);
  }
  header.append(iconBox, textBox);
  body.appendChild(header);

  // Campos
  const inputs: (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[] = [];
  if (spec.fields?.length) {
    const fieldsBox = el('div', 'space-y-3 font-label');
    for (const field of spec.fields) {
      if (field.type === 'checkbox') {
        const checkWrap = el('label', 'flex items-center gap-2.5 cursor-pointer select-none py-1.5 px-1 rounded-lg hover:bg-[#18202e] transition-colors');
        const input = el('input', 'w-4 h-4 rounded bg-[#18202e] border border-[#222f42] text-amber-500 focus:ring-amber-500/20 cursor-pointer shrink-0');
        if (input instanceof HTMLInputElement) {
          input.type = 'checkbox';
          input.name = field.name;
          input.checked = field.value === true || field.value === 'true' || field.value === 1 || field.value === '1';
        }
        checkWrap.appendChild(input);
        const textSpan = el('span', 'text-xs font-bold text-[#f1f5f9]', field.label);
        checkWrap.appendChild(textSpan);
        if (field.hint) checkWrap.appendChild(el('span', 'text-[10px] text-[#64748b] ml-1', `(${field.hint})`));
        inputs.push(input);
        fieldsBox.appendChild(checkWrap);
        continue;
      }

      if (field.type === 'select') {
        const wrap = el('label', 'block');
        if (field.label) wrap.appendChild(el('span', 'text-[#94a3b8] block mb-1 text-xs font-bold', field.label));
        const select = el('select', `${INPUT_CLASS} cursor-pointer`);
        select.name = field.name;
        const selectedVal = field.value !== undefined ? String(field.value) : '';
        for (const opt of field.options || []) {
          const optEl = el('option', '', opt.label);
          optEl.value = opt.value;
          if (opt.value === selectedVal) optEl.selected = true;
          select.appendChild(optEl);
        }
        wrap.appendChild(select);
        if (field.hint) wrap.appendChild(el('span', 'text-[10px] text-[#64748b] block mt-1', field.hint));
        inputs.push(select);
        fieldsBox.appendChild(wrap);
        continue;
      }

      const wrap = el('label', 'block');
      if (field.label) wrap.appendChild(el('span', 'text-[#94a3b8] block mb-1 text-xs font-bold', field.label));
      const input = field.type === 'textarea'
        ? el('textarea', `${INPUT_CLASS} resize-none`)
        : el('input', INPUT_CLASS);
      if (input instanceof HTMLInputElement) input.type = field.type || 'text';
      if (input instanceof HTMLTextAreaElement) input.rows = 3;
      input.name = field.name;
      input.value = field.value !== undefined ? String(field.value) : '';
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.required) input.required = true;
      if (field.readonly) input.readOnly = true;
      if (field.min !== undefined && input instanceof HTMLInputElement) input.min = String(field.min);
      wrap.appendChild(input);
      if (field.hint) wrap.appendChild(el('span', 'text-[10px] text-[#64748b] block mt-1', field.hint));
      inputs.push(input);
      fieldsBox.appendChild(wrap);
    }
    body.appendChild(fieldsBox);
  }

  // Opciones
  if (spec.choices?.length) {
    const list = el('div', 'space-y-2');
    for (const choice of spec.choices) {
      const btn = el('button', 'w-full text-left p-3 rounded-xl bg-[#18202e] border border-[#222f42] hover:border-amber-500/60 hover:bg-amber-500/5 focus:border-amber-500 focus:outline-none transition-all cursor-pointer flex items-center gap-3');
      btn.type = 'button';
      if (choice.icon) btn.appendChild(el('span', 'material-symbols-outlined text-[18px] text-amber-400 shrink-0', choice.icon));
      const texts = el('span', 'min-w-0 flex flex-col');
      texts.appendChild(el('span', 'text-xs font-bold text-[#f1f5f9] truncate', choice.label));
      if (choice.description) texts.appendChild(el('span', 'text-[10px] text-[#64748b] truncate', choice.description));
      btn.appendChild(texts);
      btn.addEventListener('click', () => finish(choice.value));
      list.appendChild(btn);
    }
    body.appendChild(list);
  }

  const error = el('p', 'hidden text-[11px] text-rose-300 font-label');
  body.appendChild(error);
  card.appendChild(body);

  // Botones
  const footer = el('div', 'px-5 py-3 bg-[#18202e] border-t border-[#222f42] flex justify-end gap-2.5 shrink-0');
  let primary: HTMLButtonElement | null = null;
  let secondary: HTMLButtonElement | null = null;
  for (const b of spec.buttons) {
    const btn = el('button', BUTTON_CLASSES[b.variant], b.label);
    btn.type = b.submit ? 'submit' : 'button';
    if (!b.submit) btn.addEventListener('click', () => finish(b.value));
    if (b.variant === 'secondary') secondary = btn;
    else primary = btn;
    footer.appendChild(btn);
  }
  card.appendChild(footer);

  const submitButton = spec.buttons.find(b => b.submit);
  card.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!submitButton) return;
    const missing = inputs.find(i => i.required && !i.value.trim());
    if (missing) {
      error.textContent = 'Completá los campos obligatorios.';
      error.classList.remove('hidden');
      missing.focus();
      return;
    }
    finish(submitButton.value);
  });

  const readValues = () =>
    Object.fromEntries(
      inputs.map((i) => [
        i.name,
        i instanceof HTMLInputElement && i.type === 'checkbox'
          ? (i.checked ? 'true' : '')
          : i.value,
      ])
    );
  let firstFocus: HTMLElement | null;
  if (inputs.length) firstFocus = inputs.find(i => !('readOnly' in i && i.readOnly)) || inputs[0];
  else if (spec.choices?.length) firstFocus = body.querySelector<HTMLElement>('button');
  else firstFocus = (spec.focusCancel ? secondary : primary) || secondary;

  return { card, readValues, firstFocus, inputs };
}

function showNext() {
  const next = queue.shift();
  if (!next) {
    showing = false;
    return;
  }
  showing = true;

  const overlay = ensureRoot();
  overlay.innerHTML = '';
  const previousFocus = document.activeElement as HTMLElement | null;
  let closed = false;

  const finish = (value: string) => {
    if (closed) return;
    closed = true;
    const values = readValues();
    document.removeEventListener('keydown', onKey, true);
    overlay.removeEventListener('click', onBackdrop);
    card.classList.remove('opacity-100', 'scale-100');
    card.classList.add('opacity-0', 'scale-95');
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
      overlay.innerHTML = '';
      previousFocus?.focus?.();
      next.resolve({ value, values });
      showNext();
    }, 150);
  };

  const { card, readValues, firstFocus, inputs } = buildDialog(next.spec, finish);
  overlay.appendChild(card);

  const onBackdrop = (e: MouseEvent) => {
    if (e.target === overlay) finish(next.spec.dismissValue);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(next.spec.dismissValue);
      return;
    }
    if (e.key === 'Enter' && !next.spec.fields?.length && !(e.target instanceof HTMLButtonElement && card.contains(e.target))) {
      // Sin campos y con el foco fuera de un botón, Enter equivale al botón principal.
      // Con el foco en un botón, Enter activa ese botón (p.ej. "Cancelar" en acciones destructivas).
      e.preventDefault();
      e.stopPropagation();
      const main = next.spec.buttons.find(b => b.variant !== 'secondary') || next.spec.buttons[0];
      finish(main.value);
      return;
    }
    if (e.key === 'Tab') {
      // Mantener el foco dentro del diálogo.
      const focusables = Array.from(card.querySelectorAll<HTMLElement>('input, textarea, select, button')).filter(n => !n.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!card.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  requestAnimationFrame(() => {
    card.classList.remove('opacity-0', 'scale-95');
    card.classList.add('opacity-100', 'scale-100');
  });
  firstFocus?.focus();
  const readonlyInput = inputs.find((i): i is HTMLInputElement | HTMLTextAreaElement => 'readOnly' in i && i.readOnly);
  if (readonlyInput && firstFocus === readonlyInput) readonlyInput.select();

  overlay.addEventListener('click', onBackdrop);
  document.addEventListener('keydown', onKey, true);
}

function openDialog(spec: DialogSpec): Promise<DialogResult> {
  if (typeof document === 'undefined') return Promise.resolve({ value: spec.dismissValue, values: {} });
  return new Promise(resolve => {
    queue.push({ spec, resolve });
    if (!showing) showNext();
  });
}

function toText(message: unknown): string {
  return typeof message === 'string' ? message : String((message as any)?.message ?? message);
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function showAlert(message: unknown, options: AlertOptions = {}): Promise<void> {
  await openDialog({
    kind: options.kind || 'info',
    title: options.title,
    message: toText(message),
    buttons: [{ label: options.buttonText || 'Entendido', value: 'ok', variant: 'primary' }],
    dismissValue: 'ok',
  });
}

export async function showConfirm(message: unknown, options: ConfirmOptions = {}): Promise<boolean> {
  const result = await openDialog({
    kind: options.kind || (options.danger ? 'warning' : 'question'),
    title: options.title,
    message: toText(message),
    buttons: [
      { label: options.cancelText || 'Cancelar', value: 'cancel', variant: 'secondary' },
      { label: options.confirmText || 'Confirmar', value: 'ok', variant: options.danger ? 'danger' : 'primary' },
    ],
    dismissValue: 'cancel',
    focusCancel: options.danger,
  });
  return result.value === 'ok';
}

export async function showForm(fields: FormField[], options: FormOptions = {}): Promise<Record<string, string> | null> {
  const result = await openDialog({
    kind: options.kind || 'question',
    title: options.title,
    message: options.message,
    fields,
    buttons: [
      { label: options.cancelText || 'Cancelar', value: 'cancel', variant: 'secondary' },
      { label: options.confirmText || 'Aceptar', value: 'ok', variant: 'primary', submit: true },
    ],
    dismissValue: 'cancel',
  });
  return result.value === 'ok' ? result.values : null;
}

export async function showPrompt(message: string, options: PromptOptions = {}): Promise<string | null> {
  const { kind, title, confirmText, cancelText, ...field } = options;
  // Sin título propio, la pregunta es el título y el campo va sin etiqueta.
  const values = await showForm(
    [{ ...field, name: 'value', label: title ? message : '' }],
    { kind: kind || 'question', title: title || message, confirmText, cancelText }
  );
  return values ? values.value : null;
}

export async function showChoice(message: string, choices: ChoiceOption[], options: ChoiceOptions = {}): Promise<string | null> {
  const result = await openDialog({
    kind: options.kind || 'question',
    title: options.title,
    message,
    choices,
    buttons: [{ label: options.cancelText || 'Cancelar', value: '__cancel__', variant: 'secondary' }],
    dismissValue: '__cancel__',
  });
  return result.value === '__cancel__' ? null : result.value;
}
