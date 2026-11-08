# Plan: Coins and the level-break shop

- Status: complete
- Created: 2026-11-08; re-audited 2026-11-08 against `1d756f5` (after the versus respawn 0.7.0 and shared-levels 0.7.1 plans landed)
- Baseline: `main` at `1d756f5`, tree clean apart from Michael's untracked `assets/sfx/Coin_Pickup.mp3`, `Coin_Spend.mp3`, `ShopOpenClose.mp3`, `ToiletFlush_Win.mp3`, `assets/src/Kernel_0.png`
- Repo plan copy: `.claude/plans/2026-11-08-coins-and-shop.md` (gitignored; `git add -f` it in step 1, as the versus plans were)
- Version: **0.8.0** (a new mechanic, like two-player's 0.6.0); `VERSION` in `src/logic.js` **and** `package.json` (the versus plans bump both)
- Whole-suite verification: `npm test` (baseline 352 pass / 1 fail: `every file under assets/sfx/ is named in CREDITS.md`, from the untracked ToiletFlush file; stays red by Michael's choice) + `npm run smoke` after every scene step (`npm start` on :8000)

## Context

Michael wants **coins**: golden corn kernels that turn up now and then as a pickup, collect in a per-run purse (a HUD counter next to the beans), and are spent in a **shop** at the level break. Mystery boxes gain three coin draws. The shop opens from a 💰 button under the "LEVEL n" banner; a tap anywhere else continues the level (single player) and keeps the coins.

| Shop row | Price | Effect |
|---|---|---|
| Fiber | 2 | `eatFiber()`: +3 points (×2 under a postbiotic, like the pickup) |
| Bean | 6 | one bean (greyed with a full bag) |
| Super bean | 16 | fills the bag to `beans.superBeans` = a super fart ready (greyed at 3) |
| Mystery box | 5 | one box opened on the plain draw table |

Box draws become: probiotic 20 %, bean 20 %, postbiotic 5 %, three beans 5 %, skip 1 %, **5 coins 10 %, 10 coins 5 %, 15 coins 1 %**, fiber the rest (33 %).

**Decisions from Michael (AskUserQuestion, 2026-11-08):**
- Art: `assets/src/Kernel_0.png` (683×674, kernel on white) is the placeholder; a spin GIF replaces it later (then `process_sheet`, like the box).
- Spawn: coins join the item roll from level 2 as a band item (between pairs, bobbing like fiber) at **half the mystery box's weight** (0.75).
- Two players: the shared course spawns identical coins on both halves, each player collects their own, and **each half opens the shop in its own level break**. So the shop is a **Play-owned panel inside the half's strip**, not an overlay scene (an overlay dims the whole canvas and `chromeArgs().overlay` turns both halves' taps into `ignore`).
- Sounds: `Coin_Pickup.mp3`, `Coin_Spend.mp3`, `ShopOpenClose.mp3` (on disk, untracked). `ToiletFlush_Win.mp3` stays untracked and uncredited: never credit, load, stage or delete it. `npm run push` ignores untracked files.

**What changed since the first draft (audit):**
- A match's level break is now **shared** (0.7.1): the first player at the line waits under `Waiting for P2…` with **no shade** and the poop idling mid-screen; once both are at the line the hints hide for `versus.levelSyncDelayMs`, then both read `Tap to continue` (`Versus.levelStage` `'arming'` → `'tap'`), and a tap from either half (`Play.applyChrome` `'resume'` → `Versus.onLevelTap`) runs the 3-2-1-GO (`runCountdown`, holding under an overlay) → `Versus.beginLevel` → each half's `beginLevel()` → `resumePlay()` → `endLevelBreak()`. A tap on a waiting half never ends its own break.
- `chromeState()` (Play.js ~939) derives a match half's chrome state: `'paused'` in its own break or under the shared pause, `'playing'` while any half is live. `chromeArgs` uses it; `padIntent` gets it too.
- `onPadAction` `'resume'` (pad B) in a match calls `applyChrome({ do: 'resume' })` directly, bypassing `chromeIntent` (so B never pauses the other player from a waiting half).
- `haltRun` is gone; `endRun()` is the one end-of-run path (`die` only in single player, `win` everywhere). `'respawn'` is a fifth state (`tests/chrome.test.js` / `tests/gamepad.test.js` `STATES` have five).
- `pauseEffects` / `resumeEffects` also cover `deathTween`; `scorePopup` gained `'death'` / `'levelClear'` and a `level` arg (unaffected).
- The shop's two-player section below was rewritten for the shared break; everything else held.

**Decisions made here (overrule any):**
- Over summary and share card are **not** touched (rows are hard-coded 3 columns with pinned tests); `collected.coin` is counted for a later row.
- Coin HUD shows only while coins > 0 (like the bean counter); level 1 can never produce a coin.
- A coin pickup shows no score popup; the counter stepping up plus the sound is the feedback.
- A box bought in the shop resolves with `pairsLeft: 0` (a skip in the break becomes fiber) on the **plain** table even in a match (same deal for both players).
- The 💰 button shows at 0 coins too, dimmed (`T.trayAlpha`), and still opens the shop with every row greyed, so players learn what coins buy. In single player the banner hint mentions 💰 only when coins > 0; in a match the hints stay the versus ones (`Waiting for P2…` / `Tap to continue`), the pill with its coin count is the affordance.
- The whole row is the buy target (Settings' hand-row pattern). A tap outside the panel closes the shop and arms the resume lockout; it never continues the level or starts the shared count. A pointer-less tap (Space / ↑, pad A without a ring, a key-group flap routed to P2) closes it. Esc / P / ⏸ / Menu / B close **this half's** shop before reaching the shared pause.
- The **power input** (B key, the bean key of a versus group, pad RT, the bean button / poop tap) during a break toggles the shop, so a keyboard or pad P2 can open it without a pointer.
- **Match: a shop open on either half blocks the shared start.** `Versus.onLevelTap` is ignored while any half has `shopOpen`; the other half's hint reads `Waiting for Pn…` (the existing `versusWaiting` string, no new key) until the shopper closes, then flips back to `Tap to continue`. The shopper's own tap-outside only closes the shop; the next tap from either half starts the count. Alternative rejected: letting the count run and closing the shop on GO would let one player rush the other's purchases.
- Rewards bought in the shop animate while paused (the reveal gets a `run` option; nothing calls `pauseEffects()` after a purchase).
- No coin button in `TEST_POWERS`: the 600 px Settings panel fits six 88 px buttons, not seven. `grantTest('coin5')` works from the console; an Invincible test run collects coins from level 2.
- Economy for the record: a coin lands on about 2 % of pairs from level 3 (0.3 × 0.75 / 11.25), plus 1.15 coins per box on average; a full run yields roughly 15–20 coins. Retune by `coin.weight` and `shop.prices` only.

## Design

### Art and sounds
- `tools/process_art.py`: `process_item(SRC / "Kernel_0.png", "coin.png")` after the mystery icon in `__main__` (~line 281); add `Kernel_0` / `coin` to the docstring lists (8–16). Run `uv run --with pillow python3 tools/process_art.py`; `git status` must show only `assets/coin.png` new (the script rewrites the set; nothing else may change).
- `assets/README.md`: a `coin.png | 384x384` row after `bean.png` (line 24: same hitbox, bobs between pairs from level 2, placeholder until a spin GIF, source `assets/src/Kernel_0.png`); Sounds table (37–44): add the missing `NewLevel.mp3` row plus the three new files.
- `CREDITS.md` "## Sounds": one bullet each in the existing shape (file, title/author from the Pixabay page, URL, Pixabay Content License, what it plays for, bundled-only note):
  - `Coin_Pickup.mp3` https://pixabay.com/sound-effects/film-special-effects-drop-coin-384921/ (a coin picked up, a box paying coins)
  - `Coin_Spend.mp3` https://pixabay.com/sound-effects/film-special-effects-coin-drop-229314/ (a purchase)
  - `ShopOpenClose.mp3` https://pixabay.com/sound-effects/film-special-effects-money-bag-82960/ (the shop opening and closing)
- `src/scenes/Boot.js`: `this.load.image('coin', 'assets/coin.png' + V)` after `bean`; `this.load.audio('coin', 'assets/sfx/Coin_Pickup.mp3' + V)`, `'coin-spend'` → `Coin_Spend.mp3`, `'shop'` → `ShopOpenClose.mp3` after `level-up`.
- Stage new files **by name**: `git add assets/coin.png assets/src/Kernel_0.png assets/sfx/Coin_Pickup.mp3 assets/sfx/Coin_Spend.mp3 assets/sfx/ShopOpenClose.mp3`. Never `git add assets/sfx` or `-A`.

### Config (`src/config.js`)
```js
coinVolume: 0.6,      // 0–1 volume of a coin pickup / a box paying coins (Coin_Pickup.mp3)
coinSpendVolume: 0.6, // 0–1 volume of a shop purchase (Coin_Spend.mp3)
shopVolume: 0.6,      // 0–1 volume of the shop opening / closing (ShopOpenClose.mp3)
hudCoin: { y: 216, iconX: 72, textX: 108, iconPx: 56, fontPx: 36 }, // px from the chrome column's left edge: the purse row under the bean row (y 156, 56 px icon)
coin: {
  weight: 0.75, // share of the item roll = mystery.weight / 2 (a band item like fiber, from level 2, bobbing at items.fiberPeriodMs)
},
mystery.draws: { probiotic: 0.2, bean1: 0.2, postbiotic: 0.05, bean3: 0.05, skip: 0.01, coin5: 0.1, coin10: 0.05, coin15: 0.01 }, // comment: fiber takes the rest (0.33)
shop: {
  prices: { fiber: 2, bean: 6, superBean: 16, mystery: 5 }, // coins; superBean fills the bag to beans.superBeans; mystery rolls the plain draw table
  disabledAlpha: 0.35, // 0–1 alpha of a row you cannot afford or whose bag is full
  panelInMs: 180,      // ms the panel scales in
},
```

### Logic (`src/logic.js`, pure, tested)
- `rollItem` (~445): weights gain `coin: t.coin.weight` (always on; the roll only runs from level 2), kinds `[...ITEM_KINDS, 'mystery', 'coin']`. `ITEM_KINDS` unchanged. New `export const BAND_ITEMS = ['fiber', 'mystery', 'coin']`.
- `MYSTERY_DRAWS` (~488) → `[..., 'skip', 'coin5', 'coin10', 'coin15']`: coins **append after skip** so every existing band edge holds (0.2 / 0.4 / 0.45 / 0.5 / 0.51; the smoke's pinned 0.25 and 0.505 still land). New `export const MYSTERY_COINS = { coin5: 5, coin10: 10, coin15: 15 }`. `rollMystery` / `resolveMystery` unchanged (a coin draw is always usable).
- `createEffects` (~938): `addCoins(n)` (ignores n ≤ 0, returns the purse), `spendCoins(n)` (false and nothing taken when short), `coins()`. The purse resets with the effects on `create()` (Home / rematch restart the scene); `start()` needs nothing.
- Shop helpers, after `skipPairs`:
  - `export const SHOP_ITEMS = ['fiber', 'bean', 'superBean', 'mystery']` (panel order).
  - `buyBlocker(item, { coins, beans }, t)` → `'price'` (not a shop item) | `'coins'` | `'full'` (bean at `beans.maxBeans`, superBean at `beans.superBeans`) | `null`; `canBuy(item, state, t)` = blocker is null.
  - `shopButtonLayout(width, height, t, x0 = 0)` → `{ id: 'shop', x: x0 + width / 2, y: 720, width: 240, height: t.trayHitMin }` (under the banner hint at 584, above the bean button's top ~962, clear of the break's poop at x ≤ 228 and of the tray). `shopButtonHit(x, y, box)` → `'shop' | null` (`inBox`).
  - `shopLayout(width, height, t, x0 = 0)` → `{ panel: { x: cx, y: 620, width: 600, height: 620 }, close: { id: 'close', x: cx + 256, y: 364, width: 88, height: 88 }, title: { x: cx, y: 374 }, coins: { x: cx, y: 440 }, rows: SHOP_ITEMS.map((id, i) => ({ id, x: cx, y: 540 + i * 104, width: 520, height: 88, iconX: cx - 210, nameX: cx - 150, priceX: cx + 230, icon: 72 })) }` (panel spans 310–930: clears the ceiling strip, the bean button and ⏸; the 💰 box lies inside it). `shopHit(x, y, layout)` → `'close' | <row id> | null`; outside-the-panel is the caller's `overlayOutsideHit(x, y, layout.panel)`.
- `chromeIntent` gains `shop = false` (this half's panel is open) and `breaking = false` (this half's own level break) and the input `'shop'`; `chromeArgs` passes `shop: this.shopOpen, breaking: this.levelBreak` beside `state: this.chromeState()` (a match half in its own break reads `'paused'`, so the rows below hold there too). Rows (no overlay; `mute` stays first; the overlay branch returns `ignore` for `'shop'`):

| state | shop | breaking | input | result |
|---|---|---|---|---|
| paused | false | true | shop | `{ do: 'openShop' }` |
| paused | false | false | shop | `ignore` (a plain pause has no shop) |
| ready / playing / respawn / dead | any | any | shop | `ignore` |
| paused | true | true | shop | `ignore` |
| paused | true | true | tap / esc / pause | `{ do: 'closeShop', armResumeLockout: true }` (resumeLocked irrelevant) |
| paused | true | true | settings … leaderboard | unchanged (`open…`, `pause: false`) |

  `padIntent` needs no new rows (paused + top play: A → tap / activate, B → resume, Menu → pause, nav → move; the rows above and the `onPadAction` tweak below turn them into open / buy / close); note it in the JSDoc.
- `src/versus.js` `catchUpDraws`: the hard-coded super table becomes `Object.fromEntries(MYSTERY_DRAWS.map((k) => [k, k === 'bean3' ? 1 : 0]))` so no new draw slips into a guaranteed-bean3 box; the beans tier spreads base (sum 0.92, still ≤ 1).

### Strings (`src/i18n.js`, `TRANSLATION_NOTES.md`)
- `itemCoinName` / `itemCoinDetail` (both locales); `howToItems` gains `{ key: 'coin', … }` between `bean` and `mystery-icon` (HowTo.js draws any non-emoji key as its texture). `itemMysteryDetail` mentions the coin draws in both locales.
  - en: "Coins" / "A golden corn kernel that turns up now and then between the pipes from level 2 (mystery boxes can hold some too). Coins go into your purse for the run, counted beside your beans; at the level break, open the shop and spend them on fiber, a bean, a super fart or a mystery box."
  - zh: 金币 / "金黄的玉米粒，从第 2 关起偶尔出现在管道之间（神秘盒子里有时也有）。本局收集的金币存进钱袋，显示在豆子计数旁；过关休息时打开商店，可以用来买纤维、豆子、超级屁或神秘盒子。"
- `levelBannerText(locale, level, levels, { shop = false } = {})` uses `levelShopHint` when `shop`, else `levelContinue` (default unchanged; `tests/levels.test.js:136` keeps passing). `coinLabel(n)` → `'💰 ' + n` (locale-free, like `formatScore`).
- New keys: `levelShopHint` "Tap to continue · 💰 to shop" / "点击继续 · 💰 进商店"; `shopTitle` SHOP / 商店; `shopCoins` "Your coins" / 你的金币; `shopFiber` "Fiber · +3 points" / "纤维 · +3 分"; `shopBean` "One bean" / 一颗豆子; `shopSuperBean` "Super fart · fills the bag" / "超级屁 · 装满豆袋"; `shopMystery` "Mystery box" / 神秘盒子; `shopFull` "Bag full" / 豆袋已满. No new versus key: the shop-wait hint reuses `versusWaiting`.
- `TRANSLATION_NOTES.md`: glossary rows Coin | 金币 and Shop | 商店, a product-context sentence (incl. the match rule: a shop open on either half holds the shared start), a row per new key, the updated `itemMysteryDetail` row.

### Play (`src/scenes/Play.js`)
- Imports: `BAND_ITEMS`, `MYSTERY_COINS`, `SHOP_ITEMS`, `canBuy`, `buyBlocker`, `shopButtonLayout`, `shopButtonHit`, `shopLayout`, `shopHit`, `coinLabel` (`createButton`, `TEXT_STYLE`, `overlayOutsideHit` already there or imported).
- `playSample(key, volume, fallback = null)`: `if (this.cache.audio.exists(key)) this.sound.play(key, { volume }); else fallback?.();` (replaces the inline copies at `onFinishCrossed` and `die`; not a `Phaser.Scene` property name).
- `collected.coin: 0` in both inits (`create` and `start`, ~550). HUD: `coinIcon` / `coinText` at `T.hudCoin` offsets from `this.col.x`, depth 20, hidden; `refreshCoinHud()` shows `×n` while coins > 0.
- Spawn: `spawnPipePair` (~1442) band test becomes `BAND_ITEMS.includes(kind)`; a coin takes fiber's path (still rule, yields to a bean rolled for the same pair). `spawnBandItem` (~1535) needs nothing (period = fiber's for anything but a box; texture key = kind; `finishItem` sets the body and `kind`).
- `collectItem` (~1893): `else if (kind === 'coin') this.takeCoins(1)`. `takeCoins(n)`: `effects.addCoins(n)`, `collected.coin += n`, `refreshCoinHud()`, `playSample('coin', T.coinVolume, sfx.pickup)`.
- `giveBeans(n)` lifts the `MYSTERY_BEANS` branch of `openMystery` (addBean × n, count what fit, `refreshBeanHud`, `sfx.pickup`, `setCharged(true)` when ready; returns the beans added). `openMystery(draw, x, y, opts)` (~1964) gains `else if (MYSTERY_COINS[draw]) this.takeCoins(MYSTERY_COINS[draw])` and forwards `opts` to `revealMystery(draw, x, y, { depth = 12, run = false })` (~1988): key map gains `coin5/10/15 → 'coin'`, the "×N" text covers `MYSTERY_COINS` too (the smoke reads the parts as `['coin', '×5']`), `run` skips the pause-when-paused line.
- `buyItem(id, opts = {})`: `if (!canBuy(id, { coins, beans }, T)) return false; effects.spendCoins(T.shop.prices[id]);` fiber → `eatFiber()`; bean → `giveBeans(1)`; superBean → `giveBeans(T.beans.superBeans)`; mystery → `openMystery(resolveMystery(rollMystery(this.match ? this.rngDraw : this.course.rng, T), { beans, pairsLeft: 0 }, T), opts.x, opts.y, opts)`; then `refreshCoinHud()`, `playSample('coin-spend', T.coinSpendVolume, sfx.pickup)`, return true. No `pauseEffects()` call.
- Shop state: `shopOpen = false`, `shop = null`, `shopButtonBox = shopButtonLayout(col.width, GAME_HEIGHT, T, col.x)`, `shopBoxes = shopLayout(…)` in `create()`; `shopButton = createButton(this, shopButtonBox, coinLabel(0), { ...TEXT_STYLE, fontSize: '40px' }, { depth: 27 })` hidden (shade 25 where shown, banner 26, tray 30).
  - `refreshShopButton()`: visible = `levelBreak && !shopOpen && state === 'paused'`; text `coinLabel(coins)`; alpha 1 or `T.trayAlpha` at 0 coins. Called from `setPauseBanner`, `openShop`, `closeShop`, `shopBuy`.
  - `refreshLevelBanner()` (~642): `levelBannerText(locale, level, LEVELS, { shop: !this.match && this.effects.coins() > 0 })`; the match `waiting` condition becomes `this.match && this.levelBreak && (host.levelStage !== 'tap' || host.shopOpenElsewhere(this))` (`Waiting for Pn…` while the other half shops). Also called from `closeShop` / `shopBuy` (the single-player hint flips when the coins run out).
  - `openShop()`: guard (`shopOpen || !levelBreak || state !== 'paused'`); build `this.shop = { panel, closeText, title, coins, rows: { id: { button, icon, extra, name, price } } }` from `shopBoxes` (panel `add.rectangle(…, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96)` depth 27 scaling in over `shop.panelInMs`; texts depth 28; rows `createButton(…, { depth: 28 })` with icon `fiber` / `bean` / `bean` + "×3" / `mystery-icon` at depth 29); `refreshShop()`; `playSample('shop', T.shopVolume, sfx.pickup)`; `refreshShopButton()`; `versusHost()?.onShopChanged?.()`; ring index → `shopClose` if shown.
  - `refreshShop()`: per row `canBuy` → alpha 1 or `T.shop.disabledAlpha` on every part; price `coinLabel(price)` or `t('shopFull')` on the two bean rows with a full bag; title / names / coins line from `t()` (so `applyLocale` just calls it).
  - `shopBuy(id)`: `if (!shopOpen) return false; const row = …; const ok = buyItem(id, { x: row.iconX, y: row.y, depth: 29.5, run: true }); refreshShop(); refreshShopButton(); refreshLevelBanner(); return ok`.
  - `closeShop({ silent = false } = {})`: guard; destroy every object in `this.shop` (stop the scale tween); `shop = null; shopOpen = false`; sound unless silent; `refreshLevelBanner(); refreshShopButton()`; `versusHost()?.onShopChanged?.()`; ring index → `shop` if shown.
- `flap(pointer)` (~707): after the tray check and the ready block, before the power-tap check:
  ```js
  if (this.shopOpen) {
    if (pointer) {
      const hit = shopHit(pointer.x, pointer.y, this.shopBoxes);
      if (hit === 'close') { this.handleChrome('esc'); return; }
      if (hit) { this.shopBuy(hit); return; }                                    // a greyed row: refused, the tap is spent
      if (!overlayOutsideHit(pointer.x, pointer.y, this.shopBoxes.panel)) return; // inside, on nothing
    }
    this.handleChrome('tap');                                                    // outside or pointer-less → closeShop
    return;
  }
  if (pointer && this.levelBreak && shopButtonHit(pointer.x, pointer.y, this.shopButtonBox)) { this.handleChrome('shop'); return; }
  ```
  The power-tap check stays `state === 'playing'`-guarded, so the bean button is dead in a break except through `activatePower` below.
- `activatePower()` (~1715): first line `if (this.levelBreak && this.state === 'paused') { this.handleChrome(this.shopOpen ? 'esc' : 'shop'); return; }` (B key, versus power keys, pad RT via `versusInput`, the bean button / poop tap all reach it).
- `handleChrome` (~992): the match pre-check gains `&& !this.shopOpen` so Esc / P / ⏸ / Menu close this half's shop before the shared pause. `applyChrome`: `case 'openShop': this.openShop()`; `case 'closeShop': this.closeShop(); if (result.armResumeLockout) this.armResumeLockout()`. The `'resume'` case is untouched (`chromeIntent` returns `closeShop` first while the shop is open, so `onLevelTap` is never reached from a shopper's tap).
- `onPadAction` `'resume'` (~1140): `if (this.match) { if (this.shopOpen) this.handleChrome('esc'); else this.applyChrome({ do: 'resume' }); } else this.handleChrome('esc');` (B is P1's global button; it closes P1's shop. P2 closes its own with A or RT through its claimed pad, or a tap on its half.)
- Hooks: `endRun()` (~2059) starts with `this.closeShop({ silent: true })`; `start()` sets `shopOpen = false` and nulls `shop`; `endLevelBreak()` calls `closeShop({ silent: true })` as a belt (`beginLevel` → `resumePlay` → `endLevelBreak` in a match; unreachable with a shop open given the `onLevelTap` gate, but cheap); the shutdown handler nulls `shop`; `applyLocale` calls `refreshShop()` when open.
- Focus ring (P1 / single): items `{ id: 'shop', box: shopButtonBox, depth: 27, visible: () => levelBreak && !shopOpen, activate: () => handleChrome('shop') }`, `{ id: 'shopClose', box: shopBoxes.close, depth: 28, visible: () => shopOpen, activate: () => handleChrome('esc') }`, one `shop:<id>` item per row (`activate: () => shopBuy(id)`). Nav walks ✕ and the rows down the column (`focusNearest`).

### Versus (`src/scenes/Versus.js`)
- `shopOpenElsewhere(half)` → `this.halves().some((h) => h && h !== half && h.shopOpen)`; `anyShopOpen()` → any half.
- `onLevelTap()` (~198): add `|| this.anyShopOpen()` to the early return (a shop open on either half holds the shared start; the hints already say who we are waiting for).
- `onShopChanged()`: `if (this.match.status === 'playing' && this.levelStage === 'tap') for (const half of this.halves()) half?.refreshLevelBanner();` (the other half's hint flips between `Waiting for Pn…` and `Tap to continue`).
- `setPaused`, `runCountdown`, `beginLevel`, `onRunEnded`: unchanged. A waiting half (first at the line, `levelStage` null or `'arming'`) can shop while the other plays; nothing there reads the shop.

### Smoke (`tools/headless_check.mjs`)
- `rolledBox` (~534): `[0.1, 0.95]` → `[0.1, 0.85]` (0.85 × 11.25 = 9.56 falls in the box band [9, 10.5); 0.95 would now be a coin). Add `rolledCoin` with `[0.1, 0.97]`.
- Versus catch-up `cu3` (~1524): `rngDraw = () => 0.55` at level pegging now draws `coin5` on the plain table; update the expectation (draw `coin5`, coins +5, beans unchanged).
- New coin checks (single player, next to the mystery block): spawned coin (texture, `bob === 'band'`, period = fiber's, y inside the band, moving on level 4); collect → coins +1, `collected.coin` +1, score unchanged, HUD `×1`; forced `openMystery('coin5')` → coins +5, reveal parts `['coin', '×5']`; real path `course.rng = () => 0.55` on a box → coin5; `buyItem` matrix with a full bag (fiber true, bean / superBean false, mystery with 0.25 → fiber, unknown id false, empty purse false); after the super fart `buyItem('superBean')` with 16 → beans 3, charged, coins 0, HUD hidden; after Home → start, coins 0.
- Shop, single player (after `stillBreak` ~485, before the resume tap): `addCoins(20)` → hint contains 💰, button `💰 20`; tap it → `shopOpen`, 4 rows, still `'paused' && levelBreak`; buy fiber (+3, 18, popup playing), bean (beans +1, 12, charged), super-bean row at `disabledAlpha` and a tap leaves 12; mystery with `course.rng = () => 0.25` → reveal `bean1`, `revealTween.isPlaying()` while paused, reveal depth > panel depth; ✕ → closed, button `💰 7`; reopen, tap outside (360, 1000) → closed, still in the break; an immediate `chrome('tap')` within the lockout stays paused; RT (`padDown(G.power)`) toggles it; pad: ring to `shop`, A opens on `shopClose`, nav → a row, B closes. At the level-4 break: purse emptied → button at `T.trayAlpha`, hint without 💰, open → every row greyed, B closes.
- Shop, versus section B: **(i)** right after `brk3` (P1 waiting on level 2, P2 playing on 1): `P1.effects.addCoins(10)`, `P1.flap({ x: btn.x, y: btn.y })` → `P1.shopOpen`, `P1.levelHint.text === 'Waiting for P2…'`; `P2.distance` grows over 300 ms and `P2.state === 'playing'`; a `tapAt` inside P2's strip at P1's fiber-row coordinates leaves `P1.shopOpen` and P1's coins alone; `P1.padDown(G.back)` → `!P1.shopOpen`, `P1.levelBreak`, `P2.state === 'playing'`, `pausedHalves` empty; `sleep(400)`. **(ii)** after the existing `until(levelStage === 'tap')` check (~1491): P1 opens its shop (`flap` on the pill) → `P2.levelHint.text === 'Waiting for P1…'`, `P1.shopOpen`; `P2.flap({ x, y })` outside everything → `levelStage` still `'tap'`, no count; `P1` buys fiber (coins −2, score +3); `P1.padDown(G.power)` (RT) → closed, `P2.levelHint.text === 'Tap to continue'`; then the existing idle / tapped / GO assertions run unchanged.
- Mutation check: break one new assertion (e.g. `closeShop` without `onShopChanged`) to prove it fails, then revert.

### Docs
- `AGENTS.md`: "What this is" (coins, the purse, the box's coin draws, the shop and its prices; in a match each half shops in its own break and a shop open on either half holds the shared start), repo map rows (config, logic, versus.js, Versus.js, i18n, Boot, Play, HowTo, assets, process_art, tests incl. `shop.test.js`, the smoke paragraph).
- `README.md`: a Coins bullet in the pickups list, the box odds line, the shop paragraph in How to play (prices, 💰, tap elsewhere to keep the coins; two players: shop while you wait at the line, the start waits for an open shop), Controls (B / RT / the bean key toggle the shop in a break; A opens, the ring walks ✕ and the rows, B closes), asset lists, the `coin` / `shop` / `hudCoin` tuning blocks and volumes.
- `src/changelog.js` 0.8.0 (en + zh, 2–3 bullets: coins + box coin draws; the shop), `VERSION` 0.8.0 in `src/logic.js` and `package.json`.

## Order of work (one commit each; every step ends in `npm test` = 352+ pass, the ToiletFlush CREDITS assertion the only failure; `npm run smoke` after scene steps)

1. `feat(art, step 1/6): coin kernel sprite; coin and shop sounds` — process_art + run it, README rows, CREDITS bullets, Boot loads, the three volume knobs; `git add -f .claude/plans/2026-11-08-coins-and-shop.md`; stage the five new files by name.
2. `feat(logic, step 2/6): coins in the item roll, coin box draws, the purse, shop prices and layout` — config, logic (`rollItem`, `BAND_ITEMS`, `MYSTERY_DRAWS` / `MYSTERY_COINS`, effects coins, `SHOP_ITEMS` / `buyBlocker` / `canBuy`, `shopButtonLayout` / `shopButtonHit` / `shopLayout` / `shopHit`, `chromeIntent` args + rows), versus super table, i18n (`levelBannerText({ shop })`, `coinLabel`, every key), TRANSLATION_NOTES; tests: items, tuning, versus, new `tests/shop.test.js`, chrome, levels, i18n, overlay, gamepad, howto.
3. `feat(play, step 3/6): coins spawn, collect and count; box coin draws; buyItem` — Play.js part A (`playSample`, HUD, spawn, `takeCoins`, `giveBeans`, `openMystery` / `revealMystery` options, `buyItem`), smoke `rolledBox` fix, `cu3` update, coin checks. `npm run smoke`.
4. `feat(play, step 4/6): the 💰 button and the shop panel in the level break` — Play.js part B (`openShop` / `closeShop` / `refreshShop` / `refreshShopButton` / `shopBuy`, `flap` routing, `activatePower` toggle, `chromeArgs` / `handleChrome` / `applyChrome` / `onPadAction`, hooks, ring items), Versus.js (`shopOpenElsewhere` / `anyShopOpen` / `onShopChanged`, the `onLevelTap` gate), smoke shop blocks (single + versus (i) and (ii)). `npm run smoke`.
5. `feat(howto, step 5/6): the coin row and the box's coin odds` — `howToItems` order, HowTo copy; `npm run smoke` (opens every overlay).
6. `docs(step 6/6): coins and the shop; 0.8.0` — AGENTS, README, changelog, VERSION + package.json.

## Tests (new / changed assertions)
- `tests/items.test.js`: the weights test counts `coin`; coins ≈ half the box's rate (100k seeded rolls, 0.5 ± 0.05) and roll without the `mystery` flag; `BAND_ITEMS` = `['fiber','mystery','coin']`; `MYSTERY_DRAWS` ends `skip, coin5, coin10, coin15`; band-edge walk and 100k frequencies unchanged in code (fiber now 0.33); `MYSTERY_COINS` keys ⊂ draws, 5 < 10 < 15; `resolveMystery('coin15', { full bag, pairsLeft 0 })` passes through; effects coins (add / ignore ≤ 0 / spend short false / spend exact / spend 0); `buyBlocker` / `canBuy` matrix; `SHOP_ITEMS` ↔ `shop.prices` keys.
- `tests/tuning.test.js`: the locked table with the three coin draws, sum 0.67, fiber still the largest share; `coin15 < coin10 < coin5`; `coin.weight === mystery.weight / 2`; prices locked, `bean < superBean <= bean × superBeans`; volumes in (0, 1]; `hudCoin` clear of the bean row; `shop.disabledAlpha` in (0, 1), `panelInMs` in [60, 600].
- `tests/versus.test.js`: `0.55` plain → `coin5`, `0.95` → fiber; beans tier `0.8` → `coin5`, coin keys equal base; super table built from `MYSTERY_DRAWS` (bean3 1, rest 0).
- `tests/shop.test.js` (new): button inside the column, below the hint, above the bean button, a tray miss at its centre, clear of the break's poop, `x0` shift; `shopButtonHit` edges; panel inside the strips, rows = `SHOP_ITEMS`, ≥ `trayHitMin` tall, non-overlapping, inside the panel, clear of ⏸ and the bean button, the 💰 box inside the panel; `shopHit` ✕ / rows / gaps / outside / null layout.
- `tests/chrome.test.js`: every row of the shop table (loop the five `STATES` for the `ignore` rows and the overlays for `'shop'`); `tap` with `shop` and `resumeLocked` still `closeShop`; `settings` with `shop` → `openSettings, pause: false`; helper defaults gain `shop: false, breaking: false`.
- `tests/levels.test.js`: `levelBannerText` with `{ shop: true }` in both locales; the default unchanged. `tests/i18n.test.js`: `coinLabel(12) === '💰 12'`; howto order with `coin` (also `tests/howto.test.js`). `tests/overlay.test.js`: `overlayOutsideHit` on the shop panel. `tests/gamepad.test.js`: `focusNearest` from `pause` going up lands on `shop` in a break geometry.
- `tests/testmode.test.js`, `tests/sound.test.js`, `tests/assets.test.js`: pass unchanged (the ToiletFlush assertion excepted).

## Verification
- `npm test` after every step; `npm run smoke` after steps 3, 4, 5.
- Headless screenshots from scratchpad scripts: a coin bobbing on level 2; the purse row under the beans with the probiotic HUD up and a "+3" popup (no overlap); a "×10" coin reveal; the 💰 pill under the banner at 0 and 20 coins; the open shop with one greyed row; a match with P1's shop open while P2 scrolls, and P2's `Waiting for P1…` prompt at the line.
- Phone check (report as untested unless done): the kernel reads as a coin at 96 px; the pill and rows are thumb-sized; the three samples' volumes against the blips; the panel over the bobbing poop; the shared start held by a shopping partner feels right.

## Risks and notes
- A popup / reveal tween started while paused is later `resume()`d by `resumeEffects` after it has finished; confirm Phaser 4 tolerates `resume()` on a completed tween (the existing `?.resume()` calls suggest it does) or null the handles on complete.
- `setCharged(true)` from a bean bought in the break starts the stink timer and glow pulse while paused: intended feedback; `resumeEffects` resuming an unpaused timer is a no-op.
- Single player: the coin HUD and the "+3" popup sit at depth 20 under the shade (25), dimmed like the score. A match's break has no shade, so they show plainly.
- A shopper holds the shared start indefinitely; the other player's hint names them. If that stalls play tests, the fallback is to drop the `onLevelTap` gate and let `endLevelBreak`'s belt close the shop on GO (one line each).
- Pad B in a match closes P1's shop only (B is routed by P1's `onPadAction`); P2's claimed pad uses A (pointer-less tap) or RT.

## Completion summary (2026-11-08)
- Status: complete. Commits on `main` since `1d756f5`: step 1 `092d62e` (art, sounds), step 2 `1481498` (logic, strings, tests), step 3 `170ada0` (coins in Play, buyItem), step 4 `5d99c6e` (the shop panel), step 5 `41272f0` (How to play), step 6 (docs, 0.8.0; this commit). Nothing pushed.
- Verified: `npm test` 366 / 367 at every step (the one failure is the untracked, uncredited `ToiletFlush_Win.mp3`, left alone as asked); `npm run smoke` all checks passed after steps 3, 4, 5 and 6 (269 at the end). Mutation check: dropping `onShopChanged` from `closeShop` fails the match's "open shop holds the start" check.
- Deviations: the shop's bean rows read "Bag full" whenever the bag is, even with the purse short (buyBlocker still names coins first); the overlay check guards shop-row taps so a tap on Settings over the shop never buys; the 💰 pill and openShop are refused once a match's shared count runs; the controls copy names the fart button as the shop toggle. CREDITS carry each sound's real title, author and date from its Pixabay page.
- Unverified: phone feel (pill and row size, the panel over the bobbing poop, the three samples' volumes), the Chinese strings (drafts).
