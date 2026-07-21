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
    };
  }
}
