// The Supabase client for online play (plan 39, 0.2), loaded only when online play (🌐) asks for it:
// never at boot, never in single-player, daily or tournament, and never from a CDN. The file is the
// official UMD browser bundle of @supabase/supabase-js (its dist/umd/supabase.js, byte for byte), vendored
// in assets/vendor/ with its MIT notice; it sets the global `supabase`. One script tag per page. A failure
// (a load error, a stall, or a file with no client in it) rejects with `messageKey: 'onlineLoadFailed'`
// for the UI to show, removes the tag, and lets the next call try again. The tag carries data-own-error,
// so index.html's boot trap leaves its error here instead of showing the error card.
// tests/supabaseLoader.test.js pins the version, the file's hash and these rules.

export const SUPABASE_JS_VERSION = '2.119.0';
const FILE = 'assets/vendor/supabase.js';
const STALL_MS = 15000;

const pending = new WeakMap(); // window → the load in flight (or done)

const failure = (why) => Object.assign(new Error(`supabase-js ${SUPABASE_JS_VERSION}: ${why}`), { messageKey: 'onlineLoadFailed' });

/**
 * The `supabase` namespace (its createClient and the rest), loading the vendored file on the first call.
 * @param {{ win?: Window, doc?: Document, waitMs?: number }} [env] the page (tests pass fakes)
 * @returns {Promise<{ createClient: Function }>}
 */
export function loadSupabase({ win = globalThis.window, doc = globalThis.document, waitMs = STALL_MS } = {}) {
  const loaded = () => (typeof win?.supabase?.createClient === 'function' ? win.supabase : null);
  if (loaded()) return Promise.resolve(loaded());
  if (!win || !doc?.createElement || !doc.head) return Promise.reject(failure('no document'));
  if (pending.has(win)) return pending.get(win);
  const load = new Promise((resolve, reject) => {
    const tag = doc.createElement('script');
    let settled = false;
    const settle = (lib, why) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      tag.onload = tag.onerror = null;
      if (lib) return resolve(lib);
      tag.remove();
      pending.delete(win);
      reject(failure(why));
    };
    tag.setAttribute('data-own-error', '');
    tag.onload = () => settle(loaded(), `no supabase client in ${FILE}`);
    tag.onerror = () => settle(null, `could not load ${FILE}`);
    tag.src = `${FILE}?v=${SUPABASE_JS_VERSION}`;
    const timer = win.setTimeout(() => settle(loaded(), `stalled: ${FILE} neither loaded nor failed in ${waitMs} ms`), waitMs);
    doc.head.appendChild(tag);
  });
  pending.set(win, load);
  return load;
}
