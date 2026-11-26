// The service worker's page side (plan 35, Stage 3; sw.js at the site root, AGENTS.md "Service worker").
// The decisions live in logic.js (swMode, localHost, removeWorker); this file only calls the browser.
//
// registerWorker: once per page load, from Play once its lazy sounds have arrived (Play.loadLazyAudio), so
// the install never competes with a cold load and finds the page's files in the HTTP cache; with a worker
// already in, it asks for an update check there (registration.update()). A new build
// installs in the background and takes over at once; the running page keeps the build it started with,
// and the next launch runs the new one. No "update ready" prompt (Michael's call, 24 Nov).
// stopWorkerIfAsked: main.js's first call. ?nosw, or a local host without ?sw, removes this scope's
// worker and our caches.
import { swMode, workerScope, removeWorker } from './logic.js';

const registered = new WeakSet(); // the pages (window objects) that asked already

/**
 * Register sw.js for this page's folder, once per page load. Resolves the registration, or null: asked
 * before, swMode is 'off' (?nosw, a local host without ?sw), no service worker API (an http LAN page, an
 * old browser), or the browser refused. Never rejects.
 */
export async function registerWorker(api = globalThis) {
  if (!api || registered.has(api)) return null;
  registered.add(api);
  const sw = api.navigator?.serviceWorker;
  if (swMode(api.location) !== 'register' || typeof sw?.register !== 'function') return null;
  try {
    const scope = workerScope(api.location.href);
    // updateViaCache 'none': every check fetches sw.js past GitHub Pages' 10 min cache.
    const reg = await sw.register(new URL('sw.js', scope).href, { scope, updateViaCache: 'none' });
    // register() with an unchanged script URL checks nothing (the spec), and a browser's own check at a
    // navigation is not certain (tools/sw_check.mjs saw Chrome skip it): one check per page load, here,
    // unless a first install is already running. Offline it fails quietly; the next launch tries again.
    if (reg?.active && !reg.installing && !reg.waiting && typeof reg.update === 'function') {
      Promise.resolve()
        .then(() => reg.update())
        .catch(() => {});
    }
    return reg;
  } catch {
    return null;
  }
}

/** ?nosw or a local host without ?sw: remove this scope's worker and our caches (true when it removed something). */
export async function stopWorkerIfAsked(api = globalThis) {
  if (swMode(api?.location) !== 'off') return false;
  return removeWorker(api);
}
