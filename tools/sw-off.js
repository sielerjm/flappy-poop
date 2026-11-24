// FLAPPY_SW_OFF: the service worker's deploy-side kill switch (plan 35, Stage 3, D5; AGENTS.md "Service
// worker"). To pull the worker from every player: copy this file over sw.js at the site root and push.
// `npm run push` leaves a file with the marker above as it is (tools/sw_stamp.mjs), and browsers fetch
// sw.js past the old worker on every launch, so this reaches each online player at their next launch even
// if the old worker's fetch handler is broken.
//
// It deletes our caches (flappy-poop-*, never another), unregisters itself and reloads the pages the old
// worker held, which then load from the network. It never claims a page and has no fetch handler: a page
// that registers it fresh is not reloaded, so there is no reload loop while it stays deployed. To bring
// the worker back, put the real sw.js back and push.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const ours = (await caches.keys()).filter((n) => n.startsWith('flappy-poop-'));
      await Promise.all(ours.map((n) => caches.delete(n)));
      await self.registration.unregister();
      const pages = await self.clients.matchAll({ type: 'window' });
      await Promise.all(pages.map((page) => page.navigate(page.url).catch(() => null)));
    })(),
  );
});
