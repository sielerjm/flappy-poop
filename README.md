# Flappy Poop

<p align="center">
  <img src="assets/icon-192.png" alt="Flappy Poop" width="96" height="96" />
</p>

A Flappy Bird–style game for phone browsers: flap a poop through the gut, dodge pink intestinal folds, grab fiber and beans, and try to make it out the other end.

**Play now → [sielerjm.github.io/flappy-poop](https://sielerjm.github.io/flappy-poop/)**

Works best on your phone — add it to your home screen for a full-screen, app-like launch. On a desktop or landscape window the gut widens to fill the screen. English and Simplified Chinese in-game. Version **0.8.4 beta**.

Tip: on iPhone, turn **Silent mode off** to hear sound.

| | |
| --- | --- |
| [How to play](#how-to-play) | [Pickups & power-ups](#pickups--power-ups) |
| [Levels & shop](#levels--shop) | [Controls](#controls) |
| [Two players](#two-players) | [Save codes & leaderboard](#save-codes--leaderboard) |
| [For developers](#for-developers) | |

![Finish line](docs/finish-divider.svg)

## How to play

- **Tap** (or press **Space** / **↑**) to flap.
- Fly through gaps in the pink pipe pairs — each pair you pass is **+1**.
- Hit a pipe, the ceiling, or the floor and the run ends.
- Each gut segment ends at a **checkered finish line**. Cross it for a short break, then keep going.
- Level 7 (the rectum) is the last: clear it and you win — **YOU MADE IT OUT!**

Open the round **?** on the ready screen anytime for the in-game guide (pickups, toilet mode, controls, sound).

![Finish line](docs/finish-divider.svg)

## Pickups & power-ups

From early in a run, helpful (and not-so-helpful) things appear between the pipes.

### Fiber, probiotic, postbiotic, bacteria

| | What it does |
| --- | --- |
| **Fiber** (broccoli) | **+3** score |
| **Probiotic** | Blocks **one** bad-bacteria hit for the next **5** pipes |
| **Postbiotic** | Eat fiber while a probiotic is up: pipes and fiber score **×2** until the probiotic runs out (farts included; kernels count double too). Another probiotic extends it; a bacteria hit still blocks but ends the ×2 |
| **Bacteria** | **−3** score (never below 0). Does **not** kill. Never in level 1; from level 2, pair 5 on |

A probiotic does **not** save you from a pipe.

### Beans & fart

- Grab a **bean** between pipe pairs (from level 2). Beans stack up to **3**.
- When charged, the poop shows stink lines and a soft glow — tap the poop, the bean button, or press **B** to **fart**.
- A normal fart spends **one** bean: the world surges so **five** pipes rush past (~2.5 s). You cannot die while farting.
- With **three** beans, the glow turns rainbow: a **super fart** spends all three and rockets you past **twenty** pipes.

### Mystery box

A spinning brown box with a question mark. The first is guaranteed early in **level 3**; after that they show up about half as often as fiber.

Open one for a random reward — usually fiber, or a probiotic, beans, coins, a ready-made postbiotic, or (rarely) a skip to the end of the level. Details below under [Odds & details](#odds--details).

### Coins (golden corn kernels)

- Spend them in the **shop** at each level break.
- **One kernel is guaranteed per level**; extras can appear from level 2, and boxes can pay coins too.
- Every finish line pays coins equal to the **level number** (and in two-player, **+3** more if you didn’t crash that level).
- Coins last **one run only** — a new game starts at 0; a single-player death clears the purse.

![Finish line](docs/finish-divider.svg)

## Levels & shop

### Levels

The gut is cut into seven segments (stomach → rectum). You advance by **pipe pairs passed**, not by score.

| Level | Pairs in level | Ends at pair |
| --- | ---: | ---: |
| 1 Stomach | 10 | 10 |
| 2 Duodenum | 25 | 35 |
| 3–7 | 50 each | 85 … 285 |

- **Level 1** is a scripted intro: probiotic at pair 3, fiber after pairs 4 and 7, a bean after pair 9 — no bad bacteria, no random rolls.
- From **level 4**, some pipe pairs slowly drift up and down.
- A fart never carries you past a finish line: if the line is closer than the burst, the fart ends at the line and the break starts.

### The shop

At every level break, tap **💰** under the banner (dimmed when empty).

| Item | Cost |
| --- | ---: |
| Fiber | 1 |
| Mystery box | 5 |
| One bean | 6 |
| Super fart (fill bag to 3) | 16 |

A bought mystery box spins a little slot machine before the reward lands. Close the shop with ✕, a tap outside, Esc, or your fart button — closing never starts the next level.

### Odds & details

Mystery-box draws (fiber takes the leftover ~33%):

| Reward | Chance |
| --- | ---: |
| Probiotic | 20% |
| One bean | 20% |
| 5 coins | 10% |
| Postbiotic (5 pipes, ×2 on) | 5% |
| Three beans | 5% |
| 10 coins | 5% |
| Skip to finish | 1% |
| 15 coins | 1% |

A bean draw with a full bag, or a skip once the finish line is already out, becomes fiber instead.

![Finish line](docs/finish-divider.svg)

## Controls

### Ready screen

Top to bottom: title, bobbing poop (“TAP TO FLAP!”), **toilet toggle**, **Save / Load User**, and your profile button (`Enter username` until you set a name, then `name · best`). The **?** opens How to play.

### During a run

| Input | Action |
| --- | --- |
| Tap / Space / ↑ | Flap (first tap also starts) |
| **B** / bean button / tap poop | Fire fart when charged; in a level break, open/close the shop |
| **P** / Esc / ⏸ | Pause / resume |
| **M** | Mute / unmute |
| **S** | Settings |
| **I** | About |
| **L** | Language |
| **F** | Feedback |
| **T** | Leaderboard |

### Tray

- **Bottom-left:** About (i), language (🌐), feedback (💬)
- **Bottom-right:** Leaderboard (🏆), mute, settings, with pause above the cog

### Toilet mode

Flip the toilet toggle when you’re playing on the toilet. Those runs show a 🚽 beside the score and on the leaderboard. Off by default each launch.

### Controller

Xbox-style pads work in desktop browsers and iPhone Safari (press any button once so the browser sees the pad).

| Button | Action |
| --- | --- |
| **A** | Flap / confirm |
| **RT** | Fart / shop toggle in a break |
| **Menu** | Pause |
| **B** | Back / close overlay |
| **Y** | Mute |
| D-pad / stick | Move the pink focus ring |

The ring only appears after a pad press; a tap or click hides it again.

![Finish line](docs/finish-divider.svg)

## Two players

On a window wide and tall enough for two phone-width halves (desktop or tablet landscape — not a phone in portrait), a **👥** toggle appears under the toilet switch.

1. Turn it on and tap to start → **join screen** (P1 left, P2 right).
2. Claim a half: tap your side, use a keyboard group, or a controller. Keyboard groups: **W / Space + E / Left Shift** vs **↑ / Enter + Right Shift / Numpad 0**.
3. After both claim, a **3-2-1-GO** starts the race (toilet flush on GO). A flap right on GO can give a short head start.

**Same course, separate luck.** Both players see the same pipes and pickups; what a mystery box *gives* is each player’s own roll. The other poop appears as a faded **ghost** nearby, and as a marker on your progress bar.

**Levels stay in sync.** Cross the finish line and wait for the other player; both must tap **ready** before the next countdown. An open shop holds the start.

**Crashes don’t end the match.** You tumble, lose **2 × level** points and **10%** of your coins (keep 90%, rounded down), clear power-ups, then respawn with a clear screen.

**Scoring.** First over each finish line gets **+25** (second gets none). Both still get the level’s coins. When both clear the rectum, higher score wins; ties go to fewer crashes. Trailing players get friendlier mystery draws. Matches are never saved to the leaderboard.

![Finish line](docs/finish-divider.svg)

## Save codes & leaderboard

### Username & save code

1. Open **Save / Load User** (or **Enter username**) on the ready screen.
2. Pick a username (1–16 characters) and press **Save** — it appears on the public leaderboard with your best.
3. **Copy** your `fp1.…` user code and keep it somewhere safe.
4. On another phone or browser, **Load** that code to bring your name and best 6 scores with you.

A username belongs to one player on the board: if a name is taken, paste your code instead (or pick another name). **Clear** (two taps) signs this device out only — the board keeps your rows; the code brings them back.

### Leaderboard

The 🏆 tray button (or **T**) shows a shared **Top 25**. You need a username to appear. Toilet runs keep their 🚽. Offline, the board says it can’t be reached and posts your best next time it can.

![Finish line](docs/finish-divider.svg)

## For developers

Plain ES modules, no bundler, no npm dependencies. [Phaser 4.2.1](https://phaser.io) from a CDN, deployed to GitHub Pages from `main`.

### Run locally

```bash
npm start      # serves on 0.0.0.0:8000 and prints laptop + phone URLs
npm test       # Node 22 built-in test runner, zero dependencies
npm run smoke  # with npm start running: drive the real game in headless Chrome
npm run smoke -- --list           # named smoke sections
npm run smoke -- --only=wide,pad  # subset while iterating
npm run push   # stamp About "Updated" time, test, commit the stamp, push main
```

`npm start` prints `http://localhost:8000` for the laptop and `http://<LAN-IP>:8000` for a phone on the same Wi-Fi. Do not open localhost on the phone — that is the phone itself.

### Host your own

Fork or push this repo to GitHub, enable Pages (Settings → Pages → Deploy from branch → `main` / root), then open `https://<you>.github.io/<repo>/`.

### Art, tuning, layout

- Art contract and sizes: [`assets/README.md`](assets/README.md). Player/item redraws go through `assets/src/` + `tools/process_art.py`.
- Feel numbers live in `TUNING` in [`src/config.js`](src/config.js) — change a number, reload.
- Full repo map and agent rules: [`AGENTS.md`](AGENTS.md).

### Leaderboard (self-host)

The board is a free-tier [Supabase](https://supabase.com) project. The browser talks to the REST API with the public URL and publishable key in `LEADERBOARD` in [`src/config.js`](src/config.js). Safety comes from [`db/schema.sql`](db/schema.sql): the key can read name / score / toilet / level / time (not ids) and write only through `submit_score()` and `merge_players()`.

To run your own: create a free Supabase project, run `db/schema.sql` in the SQL editor, then put the Data API URL and publishable key into `LEADERBOARD`. Leave either blank to turn the feature off.

What leaves the phone: username, best scores with level, and the random id inside your save code. The save code itself never leaves the device.

### Credits & lineage

- Credits and sound attribution: [`CREDITS.md`](CREDITS.md)
- Translation notes: [`TRANSLATION_NOTES.md`](TRANSLATION_NOTES.md)
- Phaser is pinned in `index.html` to `phaser@4.2.1` from jsDelivr
- Rewritten from scratch, replacing the older joke version at [sielerjm/flappy-poop](https://github.com/sielerjm/flappy-poop)
