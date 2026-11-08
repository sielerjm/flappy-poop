# Flappy Poop — Save Code Spec

Nov 3, 2026 · @Michael

> Updated 2026-11-03 to match v0.5.9 (top 6 with toilet flags, home-screen Save / Load User button); original decisions below.

## Goal and locked decisions

Players keep their name and top 6 scores across browsers and devices by copying a short signed string (the save code) out of the game and pasting it back in elsewhere. No cloud, no accounts, no files.

> 2026-11-03: the "no cloud" line is narrowed by the leaderboard (`2026-11-03-leaderboard.md`). `id` now doubles as the leaderboard identity, and for players who set a username their name, best score and its 🚽 flag are posted to a shared Supabase table. The save code itself still never leaves the device.

- Signed, not encrypted: payload is readable; tampering is detected (HMAC-SHA256 with a key embedded in the game)
- Every code starts with a format-version prefix (`fp1.`) so future versions can read old codes and re-export them in the current format
- Name: 1–16 characters
- Import merges: union of stored and pasted scores, keep the best 6; the pasted name wins
- Export regenerates the code from current state every time the player asks for it
- The random secret token (`id`) rides along for a possible leaderboard later and is never shown to the player
- Not a security feature: the key lives in client JavaScript, so a determined player can forge a code; the goal is tamper-evident, not tamper-proof

## Code format

A code is three dot-separated parts: `fp<version>.<payload>.<signature>`, about 80 characters, no whitespace.

| Part | Content | Example |
| --- | --- | --- |
| Prefix | Literal `fp` + format version integer | `fp1` |
| Payload | base64url (no padding) of minified JSON | `eyJpIjoi...` |
| Signature | base64url of the first 16 bytes of HMAC-SHA256 over `"<prefix>.<payload>"` | `a9Qx...` |

Payload v1 (minified JSON, keys in this order so the bytes are deterministic):

```json
{"i":"<16 random bytes, base64url>","n":"<name, 1–16 chars>","s":[41,37,30],"p":[0,1,0],"t":1762200000}
```

| Key | Type | Meaning |
| --- | --- | --- |
| `i` | string | Secret token, generated once with `crypto.getRandomValues` and never regenerated |
| `n` | string | Player name, 1–16 characters, trimmed |
| `s` | int\[\] | Top scores, descending, 0–6 entries |
| `p` | int\[\] | Optional; 0/1 toilet flags parallel to `s` (🚽 runs). Older codes without it read as all 0 |
| `l` | int\[\] | Optional (2026-11-04); the level (≥ 1) each score was set at, parallel to `s`. Written only when some level is above 1; older codes read as all 1 |
| `h` | string | Optional (2026-11-07); `"l"` when the bean button sits by the left thumb (Settings' 👈 👉 row), `"r"` accepted. Written only for left, so right-handed codes stay byte-identical. Not part of `SaveState`: `importCode` hands it back as `hand` and the panel applies it to the device's settings |
| `c` | int | Optional (2026-11-08); the saved coin balance, 0–99 999. Written only when above 0, so coinless codes stay byte-identical. On import the larger of the code's and the device's balance is kept |
| `t` | int | Unix seconds at export, informational only |

The signature covers the prefix too, so a `fp1.` payload cannot be relabelled `fp2.` without failing verification.

## Versioning and migration

The game reads every format version it has ever shipped and writes only the current one. A player who pastes an old code gets it upgraded in memory; their next export is in the newest format.

Rules:

1. `CURRENT_VERSION` is a single constant. Bumping it is the only step needed to start emitting the new prefix.
2. Each shipped version has a parser in a `PARSERS` map: `{1: parseV1, 2: parseV2, ...}`. A parser turns that version's payload JSON into the in-memory `SaveState` and fills defaults for fields that version did not have.
3. Import reads the prefix, looks up the parser, verifies the signature, then parses. Unknown version (newer than the game, or malformed) is rejected with "Unrecognised save code".
4. Export always serialises `SaveState` with the current version's serialiser and signs it with the current prefix.
5. Bump the version only when the payload schema changes in a way the old parser cannot handle (a renamed or re-typed key). Adding an optional key with a default does not need a bump (`p`, `l`, `h` and `c` joined v1 this way).
6. Never delete a parser once shipped; codes live in players' notes apps indefinitely.

In-memory `SaveState` (the game's own shape, independent of any wire version):

```js
{ id: string, name: string, top: { score: number, toilet: boolean }[], exportedAt: number|null }
```

Example: v2 adds unlocked power-ups as `"u":["turbo"]`. `parseV1` returns `SaveState` with `unlocks: []`; `parseV2` reads `u`. A player pasting `fp1....` sees their scores, plays, exports, and gets `fp2....`.

## Import

Import accepts a pasted string, validates it, merges it into the local state, and shows the result on the start screen. It never writes to local storage until every check passes.

1. Trim whitespace; tolerate a surrounding URL or quotes by extracting the first match of `/fp\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/`.
2. Split on `.`; require exactly 3 parts and a known version.
3. Verify the HMAC over `"<prefix>.<payload>"` using `crypto.subtle.verify` (constant-time). Fail → "Save code is damaged or was edited".
4. Decode and parse the payload with that version's parser. Validate: `n` is 1–16 chars after trim, `s` is 0–6 non-negative integers (and `p`, if present, is 0/1 of the same length), `i` is 16 bytes. Fail → "Unrecognised save code".
5. Merge into local state:
   - `name` ← pasted name
   - `id` ← pasted id (the pasted identity wins; the local one is discarded)
   - `top` ← union of local and pasted scores, sorted descending, deduplicated by score, first 6
6. Write local storage, show "Welcome back, `<name>` — 41 · 37 · 30".

The merge is deliberately score-additive: a player who played on two browsers before syncing loses nothing.

## Export

Export builds a fresh code from current state each time the player taps it; nothing is cached.

1. Require a name; if none is set, prompt for one first (1–16 chars).
2. Ensure `id` exists; generate it on first export and store it.
3. Set `t` to now, serialise with the current version, sign, assemble `fp<v>.<payload>.<sig>`.
4. Show the code in a read-only field with a Copy button (`navigator.clipboard.writeText`, must run inside the tap handler for iOS). Confirm with "Copied" for 2 s.
5. Fallback if clipboard write fails: select the field's text so the player can long-press and copy.

After any run that enters the top 6, show a small hint on the game-over screen: "New high score! Press Save / Load User on the home screen to save it."

## Local storage and UI

Between exports the game keeps `SaveState` in `localStorage` under one key, `flappyPoop.save`, as JSON with its own `schema: 2` field (schema 1 stored bare numbers and is still read). Every read is wrapped in try/catch and falls back to an empty state, because iOS Safari can clear storage for sites unused for 7 days.

UI lives behind the **Save / Load User** button on the home (ready) screen, as a DOM panel over the canvas:

| Element | Behaviour |
| --- | --- |
| Username field | 12-char max, saved on blur |
| Save user code | Read-only field + Copy button; regenerated on each open of the panel |
| Load user code | Text field + Load button; shows the error or welcome message inline |
| Start screen | Shows a `<name> · best` button under Save / Load User when a name is set; tapping it opens the High scores overlay (up to 6, 🚽 on toilet runs) |

Keep the Phaser game scene untouched. Whether the panel is plain DOM over the canvas or built with Phaser UI is left to Claude Code: match however the existing bottom tray is built, and prefer DOM if text input on mobile proves awkward in Phaser.

## Implementation notes for Claude Code

Put all save logic in one module, `src/save.js`, with no Phaser imports, so it can be unit-tested in Node.

Public API:

```js
export const CURRENT_VERSION = 1;
export function loadLocal()                 // SaveState (empty state on any error)
export function saveLocal(state)
export function recordScore(state, score)   // returns new state with top updated
export async function exportCode(state)     // -> "fp1.<payload>.<sig>"
export async function importCode(text)      // -> { ok: true, state } | { ok: false, error }
export function merge(local, incoming)      // pure; used by importCode
```

Internals:

- `PARSERS = { 1: parseV1 }` and `serialize(state)` for the current version only
- `SECRET` is a constant string in the module. Changing it invalidates every code ever issued, so treat it as permanent once v1 ships
- Use Web Crypto only (`crypto.subtle`, `crypto.getRandomValues`); no dependencies
- base64url helpers: encode with `btoa` then replace `+/` → `-_` and strip `=`; decode the reverse. Payload JSON is UTF-8, so encode via `TextEncoder` before `btoa`
- Keep the signed string as `prefix + "." + payload` exactly; a stray newline breaks every signature

Suggested order of work:

1. `save.js` with local storage and `recordScore`, wired to the existing game-over score
2. `exportCode` / `importCode` with tests (next section)
3. Save / Load User panel in DOM (home screen)
4. Start-screen name + scores line and the game-over export hint

## Test cases

Run these as unit tests on `save.js`; the first four are the ones most likely to regress.

| # | Case | Expected |
| --- | --- | --- |
| 1 | Export then import the same code | Identical state back |
| 2 | Flip one character in the payload | Rejected: damaged or edited |
| 3 | Change `fp1.` to `fp2.` on a valid v1 code | Rejected: unrecognised |
| 4 | Import a v1 code after `CURRENT_VERSION` is bumped to 2 (with a stub `parseV2`) | Accepted; re-export starts with `fp2.` |
| 5 | Local `[41, 30]`, pasted `[37, 30, 12]` | `top` = `[41, 37, 30, 12]` (best 6 kept) |
| 6 | Local name "A", pasted name "B" | Name = "B" |
| 7 | Pasted code wrapped in a URL fragment or quotes | Extracted and accepted |
| 8 | Name of 17 characters | Rejected at both export prompt and import |
| 9 | Empty `s` array | Accepted; start screen shows name only |
| 10 | `localStorage` throws (storage disabled) | Game still starts with empty state |

Manual check on iPhone Safari and Chrome: Copy button puts the code on the clipboard; pasting into Notes and back into the game restores the name and scores.
