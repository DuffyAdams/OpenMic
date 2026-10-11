/**
 * D-pad spatial navigation.
 *
 * Focusable controls carry `data-focus`. Layers (screen, menu, dialog) register as scopes with
 * `use:focusScope`; arrows only move within the top-most scope, so a dialog traps focus.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

const scopes: HTMLElement[] = [];

function visible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function activeScope(): HTMLElement | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].isConnected) return scopes[i];
  }
  return null;
}

function candidates(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-focus]')).filter(visible);
}

export function focusDefault(scope = activeScope()): void {
  if (!scope) return;
  const list = candidates(scope);
  const target = list.find((el) => el.hasAttribute('data-autofocus')) ?? list[0];
  target?.focus({ preventScroll: true });
  target?.scrollIntoView?.({ block: 'nearest' });
}

export function ensureFocus(): void {
  const scope = activeScope();
  if (!scope) return;
  const current = document.activeElement as HTMLElement | null;
  if (!current || !scope.contains(current) || !current.hasAttribute('data-focus')) focusDefault(scope);
}

export function moveFocus(dir: Direction): boolean {
  const scope = activeScope();
  if (!scope) return false;
  const current = document.activeElement as HTMLElement | null;
  if (!current || !scope.contains(current) || !current.hasAttribute('data-focus')) {
    focusDefault(scope);
    return true;
  }
  const from = current.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates(scope)) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let primary: number;
    let cross: number;
    switch (dir) {
      case 'up':
        if (r.bottom > from.top + 1 && cy >= fy) continue;
        primary = fy - cy;
        cross = Math.abs(cx - fx);
        break;
      case 'down':
        if (r.top < from.bottom - 1 && cy <= fy) continue;
        primary = cy - fy;
        cross = Math.abs(cx - fx);
        break;
      case 'left':
        if (r.right > from.left + 1 && cx >= fx) continue;
        primary = fx - cx;
        cross = Math.abs(cy - fy);
        break;
      case 'right':
        if (r.left < from.right - 1 && cx <= fx) continue;
        primary = cx - fx;
        cross = Math.abs(cy - fy);
        break;
    }
    if (primary <= 0) continue;
    const score = primary + cross * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    return true;
  }
  return false;
}

export function activateFocused(): boolean {
  const scope = activeScope();
  const el = document.activeElement as HTMLElement | null;
  if (scope && el && scope.contains(el) && el.hasAttribute('data-focus')) {
    el.click();
    return true;
  }
  focusDefault(scope);
  return false;
}

/** Svelte action: register a focus layer and focus its default control. */
export function focusScope(node: HTMLElement) {
  scopes.push(node);
  requestAnimationFrame(() => {
    if (activeScope() === node) focusDefault(node);
  });
  return {
    destroy() {
      const i = scopes.lastIndexOf(node);
      if (i >= 0) scopes.splice(i, 1);
      requestAnimationFrame(() => ensureFocus());
    }
  };
}
