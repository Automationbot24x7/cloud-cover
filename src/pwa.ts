/** Register the offline service worker in production builds. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    void navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch {
    // Registration is optional when the browser cannot use service workers.
  }
}