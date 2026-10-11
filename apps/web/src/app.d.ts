// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}

  interface OpenMicNativeBridge {
    exitApp(): void;
    appVersion(): string;
    openSettings(): void;
    reload(): void;
  }

  interface Window {
    /** Injected by the Fire TV app (Android WebView JavascriptInterface). */
    OpenMicNative?: OpenMicNativeBridge;
    /** Called by the Fire TV app for every remote key press; returns true when handled. */
    __tvKey?: (key: string) => boolean;
    onYouTubeIframeAPIReady?: () => void;
    YT?: unknown;
  }
}

export {};
