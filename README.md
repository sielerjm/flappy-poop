# Flappy Poop 💩

## ▶️ Play now: **[sielerjm.github.io/flappy-poop](https://sielerjm.github.io/flappy-poop/)**

Open it on your phone and add it to your home screen for a full-screen, app-like launch.

A poop emoji flaps through the gut, dodging pink intestinal folds. A Flappy Bird clone for phone browsers, built on [Phaser 4](https://phaser.io) with no build step. Version **0.5.10**. English and Simplified Chinese in-game.

**Host your own:** fork or push this repo to GitHub, enable Pages (Settings → Pages → Deploy from branch → `main` / root), then open `https://<you>.github.io/<repo>/`.

## How to play

Tap (or press Space / ↑) to flap. Pass a pipe pair for a point. Hit a pipe, the ceiling, or the floor and it's over — the poop swaps to its dead face. From pipe 5, a bean (always at least one by pipe 20, rarer afterwards) bobs through the middle of the screen between pipe pairs; grab one and the poop glows with stink lines — tap it to fart: the fart clip plays, the world speeds up and slows back down with it, five pipes rush past, and nothing can hurt you until it ends. Your best score is saved in the browser. Pipes speed up and the gap narrows until score 30, then it stays hard.

From score 8, pickups can appear in the gap:

- **Fiber** (broccoli): +1.
- **Probiotic** (good bacteria): stays in your inventory for 5 pipes and blocks one bad-bacteria hit.
- **Bacteria** (bad): −3. Score never goes below 0. Does not kill. After score 15.

The probiotic does **not** save you from a pipe.

On iPhone, Silent mode mutes the game — turn it off to hear sound. The pause banner is two centered lines: **PAUSED** / tap anywhere to resume game.

## Controls

- **Ready screen** (top to bottom) — title, the bobbing poop with its "TAP TO FLAP!" speech bubble (any tap starts), the **toilet toggle**, then **How to play**, **Save / Load User**, and your `name · best` button once a username is set. The start tap slides the poop from the centre to its play position on the left before the run begins; taps during the slide are ignored.
- **Tap / Space / ↑** — flap. The first tap also starts the run. After closing Settings or About during a run, tap or Space resumes; that tap does not flap. Unpausing from the pause banner bounces (same lift as a flap) so you can recover.
- **Toilet toggle** (under tap to flap) — switch it on when you are playing on the toilet: the track turns brown and the 🚽 lights up. Runs played that way show a 🚽 beside the score (HUD, game over, High scores, your save code). Off by default on every launch.
- **How to play** (ready screen, also linked from About) — scrollable overlay (drag with a finger or use the mouse wheel) with flap rules, iPhone Silent-mode note, a pipe row (dodge them; each pair passed is a point), what fiber, probiotic, bad bacteria, and beans do, and the toilet toggle. About scrolls the same way.
- **Beans / fart power** — a bean appears from pipe 5, halfway between pairs: 15 % per pair until pipe 20 with one guaranteed in that window, then 6 % per pair (rarer than fiber), bobbing slowly through the middle half of the screen with a ±15° wiggle. One bean readies the power (you carry at most one, and no more spawn until it is used): the poop shows stink lines and a pulsing glow, and a bean button pulsing in step appears in the bottom-centre of the tray; tap it (or the poop) to fire; tap the poop (not elsewhere) to fart. Speed rises and falls with `fart_accelerate.mp3` (4.3 s) so exactly five pipes pass, the poop floats through the middle of the screen (gravity off, taps ignored), blinks between full and half opacity, and cannot die until the clip ends. Towards the end of the clip no new pipes spawn, so the screen is clear when it ends; the next pair then enters from the right edge with its gap at the height you floated at, so you have a full screen and a straight line through. Tapping it does not start the run. Closing How to play that was opened from About also closes About, leaving a paused run if info was opened mid-play. Tap the dimmed area outside Settings, About, or How to play to close (same as X).
- **Bottom-left (i)** — About (credits, author, LLM note, last-updated stamp, How to play and feedback links). Independent of Settings.
- **Bottom-left (🌐)** — language (English / 简体中文). Persists. First visit with no saved choice follows the browser language when it starts with `zh`. Opening Language mid-run pauses.
- **Bottom-left (💬)** — feedback: choose Bug or Feature request to open a GitHub issue form in the browser (needs a GitHub account). Also linked from About and How to play.
- **Bottom-right tray** — 🏆 leaderboard, mute/unmute, settings, with pause sitting directly above the settings cog. Tray taps never flap, and on the game-over screen they never retry.
- **🏆 Leaderboard** (tray or **T**) — the shared online Top 10. Only players who have set a username are on it; your row is highlighted, and if you are below the Top 10 a footer line shows your best and its rank. Runs played on the toilet keep their 🚽. Opening it mid-run pauses. Works offline too: the board just says it cannot be reached and your best is posted the next time it can. See **Leaderboard** below.
- **P** or **Esc** — pause / resume (during a run). Ignored while Settings, About, How to play, Language, Feedback, or the Leaderboard is open; Esc then closes the top overlay.
- **M** — mute / unmute. Persists across reload. Still works while an overlay is open.
- **Save / Load User** (ready-screen button) — set a username (1–16 characters; it is shown on the public leaderboard with your best score) and press Save (the panel confirms "Username saved"), then Copy your `fp1.…` user code and paste it into Load user code on another phone or browser to carry your username and best 6 scores (with their 🚽 flags) across. Codes are signed, so an edited code is refused; loading merges scores (best 6 kept) and the pasted username wins. Once a username is set the ready screen shows a `name · best` button under it; tap that for the High scores overlay (up to 6). The game-over panel reminds you to export after a run that enters the top 6.
- **How to play** and **tap to flap** are drawn as buttons on the ready screen; tapping the second one starts the run like any other tap.
- **S** — settings (sound, haptics, Reload game, About). **Reload game** re-fetches every loaded script with `cache: 'reload'` (so GitHub Pages' 10-minute cache cannot hand back old modules) and then reloads the page with a fresh cache-busting query: the way to pick up a new build straight after a push, and the only way when the game is installed on the home screen and has no address bar. Opening Settings or About mid-run pauses; closing them leaves the pause banner until a new tap or Space.
- **I** — About.
- **F** — Feedback (bug / feature → GitHub).
- **L** — language.
- **T** — leaderboard.
- **B** — fire the bean power-up (same as tapping the poop or the bean button; does nothing unless it is charged).
- **Haptics** — a short buzz on death, Android / Chrome only. iPhone has no `navigator.vibrate` and must not error.

Translation review notes for LLMs / humans: [TRANSLATION_NOTES.md](TRANSLATION_NOTES.md).

## Run locally

```bash
npm start      # serves on 0.0.0.0:8000 and prints laptop + phone URLs
npm test       # Node 22 built-in test runner, zero dependencies
npm run smoke  # with npm start running: drive the real game in headless Chrome
               # (every overlay opens and closes, a run starts, no exceptions)
npm run push   # stamp the About "Updated" time, test, commit the stamp, push main
```

`npm start` prints `http://localhost:8000` for the laptop and `http://<LAN-IP>:8000` for a phone on the same Wi-Fi. Do not open localhost on the phone — that is the phone itself, not this laptop.

## Replacing the art

The player and items are drawings processed by `tools/process_art.py` from `assets/src/`. Drop a new source PNG in `assets/src/` and re-run that script (`uv run --with pillow python3 tools/process_art.py`) to crop, knock out white, and write the 384×384 contract files (drawn at 0.25 scale → 96 logical px on the 720×1280 field). The poop set (alive, dead, stink frames, fart) shares one body scale and centre so texture swaps never move the body.

Pipe, background, ground, and icons are still placeholders from `tools/make_placeholders.py`. That script must **not** overwrite `poop.png`. Overwrite any contract file at the same name and size; `assets/README.md` has the table and `npm test` enforces it.

## Repo layout

```
index.html              viewport/touch setup, loads Phaser + src/main.js
manifest.webmanifest    "Add to Home Screen" metadata
CREDITS.md              Phaser + fart-sample attribution, author/art/LLM note
src/
  main.js               Phaser.Game config: 720x1280, Scale.FIT, roundPixels, [Boot, Play, Over, Settings, About, HowTo, Language, Feedback, Scores, Leaderboard]
  config.js             GAME_WIDTH/HEIGHT, TUNING, and LEADERBOARD (Supabase Data API URL + publishable key, both public)
  logic.js              pure functions: rng, gaps, scoring, items, settings store, tray / ready layout, issueUrl, chromeIntent
  save.js               user codes: fp1.<payload>.<sig> export / import, local best-6 store, merge (Node-testable)
  leaderboard.js        shared leaderboard over the Supabase REST API: submitPlan, submitStore, submitScore, fetchTop, fetchRank (Node-testable, fetch injected)
  i18n.js               en / zh-Hans catalog + t() / initialLocale
  sound.js              WebAudio blips + setMuted (also mutes the Phaser fart sample)
  ui/tray.js            Phaser wrapper for 🏆 / mute / settings, pause above the cog, and bottom-left (i) / 🌐 / 💬
  ui/button.js          rounded-rect button chrome for ready-screen boxes
  ui/toggle.js          toilet toggle (track + knob + 🚽) for the ready screen
  ui/scrollView.js      finger / wheel scrolling for overlay panels (content camera + thumb)
  ui/savePanel.js       DOM user-code panel (Username, Copy, Load) opened from Save / Load User
  scenes/
    Boot.js             preloads images + fart.mp3
    Play.js             ready -> playing -> paused -> dead; items; beans + fart power; tray; locale; ready buttons + profile line
    Over.js             game-over panel; new-top-6 export hint; tray mute still works
    Settings.js         sound / haptics overlay; About link
    About.js            credits, author, LLM note, How to play + feedback links, last-updated
    HowTo.js            How to play overlay (ready screen and About link); feedback link
    Language.js         English / 简体中文 picker
    Feedback.js         Bug / Feature request chooser → GitHub issue forms
    Scores.js           High scores overlay (username + up to 6 scores) from the profile line
    Leaderboard.js      shared Top 10 overlay (🏆 / T): rows with 🚽, own row highlighted, rank footer, join hint
db/schema.sql           Supabase schema (table, RLS + column grant, submit_score / player_rank); run by hand in the SQL editor
assets/                 contract PNGs + README.md (the art contract)
  poop.png poop-dead.png poop-stink1.png poop-stink2.png poop-fart.png poop-speech.png
  fiber.png probiotic.png bacteria.png bean.png
  pipe.png bg.png ground.png icon-192.png icon-512.png
  src/                  original drawings (not in the size table)
  sfx/fart.mp3          death sample
  sfx/fart_accelerate.mp3   fart power-up clip (the power lasts exactly this long)
tools/make_placeholders.py   pipe / bg / ground / icons only (needs Pillow)
tools/process_art.py         crop Michael's sources into contract PNGs
tools/serve.py               npm start: bind 0.0.0.0:8000, print phone URL
tools/headless_check.mjs     npm run smoke: headless Chrome over the DevTools protocol, zero deps
tests/                  node --test: html assets logic state difficulty store smoke
                        settings sound tray items tuning about howto feedback overlay hitbox i18n chrome serve save ready leaderboard scenes tools
.claude/plans/          checkpointed build plans
```

## Tuning

Everything that affects feel lives in `TUNING` in `src/config.js`: gravity, flap impulse, pipe speed, spawn interval, gap height, the difficulty ramp, death/retry timings, tray size/alpha, fart volume, and the `items` block (`startScore`, `hazardStartScore`, `chancePerGap`, `fiberPoints`, `bacteriaPenalty`, `probioticPipes`, `itemRadius`, weights). Change a number, reload.

## Leaderboard

The 🏆 button shows a shared Top 10 hosted on a free-tier [Supabase](https://supabase.com) project. What leaves the phone: your username, your best score, its 🚽 flag, and the random id inside your save code (so the same player keeps one row across browsers). Nothing is posted until you set a username in Save / Load User. The save code itself never leaves the device.

The game talks to the Supabase REST API straight from the browser with the project's public URL and publishable key, both in `LEADERBOARD` in [`src/config.js`](src/config.js). What keeps that safe is the schema in [`db/schema.sql`](db/schema.sql): the key can read only name / score / 🚽 / time, never ids, and can write only through `submit_score()`, which keeps each player's maximum, caps scores, and rate-limits. Cheating is possible, as in any client-side game; a bad row is one `delete` in the dashboard.

To run your own: create a free Supabase project, paste `db/schema.sql` into its SQL editor and run it, then put the project's Data API URL and publishable key into `LEADERBOARD`. Leave either blank to turn the feature off. Free projects pause after a week without traffic; the first request afterwards may time out, and the game just shows "Can't reach the leaderboard".

## Credits

See [`CREDITS.md`](CREDITS.md). Every file under `assets/sfx/` must be listed there with a URL; `npm test` fails if a loaded audio file is missing or uncredited.

## Phaser version

Pinned in `index.html` to `phaser@4.2.1` from jsDelivr. To bump it, change that one tag; `tests/html.test.js` only checks that it stays pinned to an exact version.

## Lineage

Rewritten from scratch, replacing the 2018-tutorial-based joke version at [sielerjm/flappy-poop](https://github.com/sielerjm/flappy-poop).
