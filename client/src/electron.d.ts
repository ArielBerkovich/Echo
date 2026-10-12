export {};

declare global {
  interface Window {
    echoDesktopNotifications?: {
      showNotification(options: { title: string; body?: string; tag?: string }): string;
      onNotificationClick(handler: (id: string) => void): () => void;
    };
    echoDesktopConfig?: {
      backendUrl?: string;
      appVersion?: string;
      wasUpdated?: boolean;
      saveBackendUrl(value: string): Promise<{ ok: boolean; error?: string }>;
      changeBackendUrl(value: string): Promise<{ ok: boolean; error?: string }>;
      getFullscreen(): Promise<{ ok: boolean; fullScreen: boolean }>;
      toggleFullscreen(): Promise<{ ok: boolean; fullScreen: boolean }>;
      onFullscreenChange(handler: (fullScreen: boolean) => void): () => void;
    };
    echoDesktopAuth?: {
      loadToken(): Promise<string | null>;
      saveToken(token: string): Promise<{ ok: boolean }>;
      clearToken(): Promise<{ ok: boolean }>;
      startRhssoLogin(): Promise<{ ok: boolean; error?: string }>;
    };
  }
}
