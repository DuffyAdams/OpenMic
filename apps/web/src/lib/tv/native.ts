/** Bridge to the Fire TV shell (absent in a regular browser). */
export const native = {
  get available(): boolean {
    return typeof window !== 'undefined' && !!window.OpenMicNative;
  },
  get version(): string {
    try {
      return window.OpenMicNative?.appVersion() ?? '';
    } catch {
      return '';
    }
  },
  exit(): void {
    window.OpenMicNative?.exitApp();
  },
  openSettings(): void {
    window.OpenMicNative?.openSettings();
  },
  reload(): void {
    if (window.OpenMicNative) window.OpenMicNative.reload();
    else location.reload();
  }
};
