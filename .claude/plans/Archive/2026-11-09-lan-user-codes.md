# Plan: User codes work on the LAN dev server (no Web Crypto on plain http)
- Created: 2026-11-09
- Status: complete (committed; push on Michael's word)
- Baseline: `5d3652f` on `main` (0.8.5 committed, 4 commits not pushed, including Michael's README icons `d204131`), tree clean.
- Whole-suite verification: `npm test` (407 pass); `npm run smoke`.
- Repo plan copy: `.claude/plans/2026-11-09-lan-user-codes.md` (`git add -f`), archived when done.

## Context
Michael pasted his user code on his phone at `http://10.195.57.144` (`npm start`'s LAN URL) and got "Unrecognised save code". On the live https site the same code loads.

- **Both of his codes are valid and the same player.** I checked with `importCode` in Node: same id, name GutMichaelBiome, scores 160/143/136/134/116/111. They differ only in `t`, the export time (6 Nov vs 9 Nov), and the signature over it; the panel makes a fresh code each time it opens.
- **Cause.** `src/save.js` signs and checks codes with `crypto.subtle` (HMAC-SHA-256). Browsers expose it only in secure contexts (https, localhost). On a plain-http LAN address it is undefined:
  - `importCode` throws, so the panel says "Unrecognised";
  - `exportCode` fails too, so no code can be shown there.

## Approach
A pure-JS HMAC-SHA-256 (`src/sha256.js`), used by `save.js` only when `globalThis.crypto?.subtle` is missing. Where Web Crypto exists, nothing changes. Michael approved on 9 Nov.

## Step 1/2 — Fallback signer  [done]
- **`src/sha256.js`**: `hmacSha256(keyBytes, messageBytes)` → `Uint8Array(32)`.
- **`src/save.js`**: `tag()` uses Web Crypto when present, else `hmacSha256`; comment on line 3.
- **`src/ui/savePanel.js`**: the onLoad comment no longer names the LAN case.
- **Tests** (`tests/sha256.test.js`):
  - RFC 4231 vectors (cases 1, 2, 3, 6); SHA-256 of "abc", "" and a long message via HMAC parity;
  - parity: 200 random messages against `crypto.subtle`;
  - with `crypto.subtle` hidden: `exportCode` → `importCode` round-trips, and Michael's two real codes import as GutMichaelBiome.
- **Verify**:
  - `npm test`;
  - `npm run smoke -- --only=home`;
  - Michael on the phone at the LAN URL: Load works and the code field shows a code.
- **Commit**: `fix(save, step 1/2): user codes sign and load without Web Crypto (plain-http LAN dev server)`
- Result: done. tests/sha256.test.js: FIPS / RFC 4231 vectors, parity with Node's hash and HMAC (padding boundaries, 200 random cases), and with crypto.subtle hidden a code signs byte for byte like Web Crypto, loads, and an edited signature is still refused. Deviation: Michael's real codes are not in the committed test (they hold his secret id; the repo is public); checked once locally instead: both load as GutMichaelBiome without Web Crypto. Headless Chrome at the Mac's LAN URL (http://10.20.206.10:8000, isSecureContext false, no subtle): his code loads ('Welcome back, GutMichaelBiome — 160 · …') and the code field shows a code. Side effect: that page's sync posted his 160 to the live board (it keeps 197; only the row's updated_at moved). npm test 411/411; smoke home 15.

## Step 2/2 — Docs  [done]
- **`AGENTS.md`**: the `save.js` entry, the `src/` tree (`sha256.js`), and the `npm start` phone-URL note.
- No version bump (the live game is unchanged).
- **Verify**: `npm test`.
- **Commit**: `docs(step 2/2): user codes on the LAN dev server`
- Result: done. AGENTS: the save.js entry names the fallback, a new sha256.js entry, and the npm start phone-URL note says codes work there. npm test 411/411. Step 1 commit `d6ed983`.
- **Push**: `npm run push` on Michael's word.
