// Share the game-over share card (ui/shareCard.js) as an image: the phone's share sheet when it takes
// files (Web Share API level 2), else a PNG download. No Phaser imports and the
// navigator / document / URL are injected, so Node runs tests/share.test.js.
//
// The one rule that matters on phones: navigator.share() needs transient user
// activation, and iOS Safari only grants it inside the tap itself. So the image
// is made before the tap (Over draws the share card as it opens) and
// shareScoreImage() calls share() synchronously, before its first await. Call
// it straight from the pointer-up handler (on touch, pointerdown does not count
// as activation; pointerup / touchend does).

/**
 * What the share button can do with `file` here: 'share' (the share sheet takes
 * files), 'download' (a document to click a link in), or null (neither).
 */
export function shareMode(nav, file, doc) {
  try {
    if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) return 'share';
  } catch {
    // canShare can throw on odd inputs in some browsers: treat as no share sheet.
  }
  return doc && typeof doc.createElement === 'function' ? 'download' : null;
}

/** Save `file` through a temporary <a download> link. True when the click went out. */
function download(file, doc, urlApi) {
  try {
    const href = urlApi.createObjectURL(file);
    const a = doc.createElement('a');
    a.href = href;
    a.download = file.name;
    a.rel = 'noopener';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => urlApi.revokeObjectURL(href), 10000); // late: some browsers read the URL after click()
    return true;
  } catch {
    return false;
  }
}

/**
 * Share (or download) the panel image. Resolves 'shared', 'cancelled' (the
 * player closed the sheet), 'downloaded', or 'failed'; never rejects. A share
 * error other than the player's cancel falls back to the download.
 */
export function shareScoreImage({ file, title, text, nav = globalThis.navigator, doc = globalThis.document, urlApi = globalThis.URL } = {}) {
  const fallback = () => (download(file, doc, urlApi) ? 'downloaded' : 'failed');
  if (!file) return Promise.resolve('failed');
  const mode = shareMode(nav, file, doc);
  if (mode === 'share') {
    let pending;
    try {
      pending = nav.share({ files: [file], title, text }); // synchronous: still inside the tap
    } catch (err) {
      return Promise.resolve(err?.name === 'AbortError' ? 'cancelled' : fallback());
    }
    return Promise.resolve(pending).then(
      () => 'shared',
      (err) => (err?.name === 'AbortError' ? 'cancelled' : fallback()),
    );
  }
  return Promise.resolve(mode === 'download' ? fallback() : 'failed');
}
