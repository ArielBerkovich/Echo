export {};

declare global {
  interface Window {
    echoDesktopNotifications?: {
      showNotification(options: { title: string; body?: string; tag?: string }): string;
      onNotificationClick(handler: (id: string) => void): () => void;
    };
    echoDesktopConfig?: {
      backendUrl?: string;
      saveBackendUrl(value: string): Promise<{ ok: boolean; error?: string }>;
    };
  }
}
