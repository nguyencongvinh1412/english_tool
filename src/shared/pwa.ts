/**
 * Progressive web app: registers the service worker (production only) and tells the app when a new version waits
 */
export const UPDATE_EVENT = 'app:update-ready';

let waiting: ServiceWorker | null = null;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const announce = (worker: ServiceWorker | null) => {
          // A first install has no controller: nothing to update
          if (!worker || !navigator.serviceWorker.controller) return;
          waiting = worker;
          window.dispatchEvent(new Event(UPDATE_EVENT));
        };
        announce(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => worker.state === 'installed' && announce(worker));
        });
      })
      .catch(() => undefined);
  });
}

/** Lets the waiting version take over and reloads the page */
export function applyUpdate(): void {
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting?.postMessage('skip-waiting');
}
