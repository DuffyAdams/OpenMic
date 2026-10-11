export type ToastKind = 'info' | 'success' | 'error' | 'gold';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
  timeout: number;
}

class Toasts {
  items = $state<Toast[]>([]);
  private next = 1;

  show(t: Omit<Toast, 'id' | 'timeout' | 'kind'> & { kind?: ToastKind; timeout?: number }) {
    const toast: Toast = { kind: 'info', timeout: 4000, ...t, id: this.next++ };
    this.items = [...this.items.slice(-2), toast];
    if (toast.timeout > 0) setTimeout(() => this.dismiss(toast.id), toast.timeout);
    return toast.id;
  }

  error(title: string, body?: string) {
    return this.show({ kind: 'error', title, body, timeout: 5000 });
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
